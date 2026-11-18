// Cloudflare Worker 'christmas-square': 정적 파일(assets)은 그대로 내보내고, /ws만 실시간 서버(Durable Object 'Plaza')로 보낸다.
//
// Plaza는 하나뿐이다 (idFromName('main')) — 모두 같은 광장에 들어온다.
// - WebSocket은 Hibernation API로 받는다: 아무도 메시지를 보내지 않으면 서버가 잠들 수 있다. 매 프레임 도는 루프도, 타이머도 두지 않는다.
// - 서버는 받은 것을 확인(shared/protocol.ts)하고 다른 사람들에게 전달만 한다. 규칙(자리 배정·정리)은 shared/plazaCore.ts.
// - 접속자 정보는 접속마다 serializeAttachment로 붙여 둔다 (잠들었다 깨어나도 남는다).
// - 눈덩이·눈사람은 SQLite 테이블 objects(id, kind, data JSON, updated_at)에, 결과가 바뀔 때만 쓴다.

import { DurableObject } from 'cloudflare:workers';
import { allowMessage, expiredObjects, holdersOf, isFull, leavePlaza, newSession, releaseHold, seatsOf, trySit, tryGrab, type Session } from '../shared/plazaCore';
import { parseClientMessage, type ServerMessage, type WireObject } from '../shared/protocol';

interface Env {
  ASSETS: Fetcher;
  PLAZA: DurableObjectNamespace<Plaza>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
      return env.PLAZA.get(env.PLAZA.idFromName('main')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Plaza extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  }

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(newSession());
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ── 접속자

  private sessions(): { ws: WebSocket; session: Session }[] {
    return this.ctx.getWebSockets().map((ws) => ({ ws, session: (ws.deserializeAttachment() as Session | null) ?? newSession() }));
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // 이미 끊긴 접속
    }
  }

  /** 입장한 모든 사람에게 (except 빼고) */
  private broadcast(message: ServerMessage, except: WebSocket | null = null): void {
    const text = JSON.stringify(message);
    for (const { ws, session } of this.sessions()) {
      if (ws === except || !session.player) continue;
      try {
        ws.send(text);
      } catch {
        // 이미 끊긴 접속
      }
    }
  }

  // ── 눈덩이·눈사람 저장소

  private objects(): WireObject[] {
    const rows = this.ctx.storage.sql.exec('SELECT id, kind, data, updated_at FROM objects').toArray();
    return rows.map((r) => ({ id: String(r.id), kind: r.kind, data: JSON.parse(String(r.data)), updatedAt: Number(r.updated_at) }) as WireObject);
  }

  private put(object: WireObject): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO objects (id, kind, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, updated_at = excluded.updated_at',
      object.id,
      object.kind,
      JSON.stringify(object.data),
      object.updatedAt,
    );
  }

  private remove(id: string): void {
    this.ctx.storage.sql.exec('DELETE FROM objects WHERE id = ?', id);
  }

  /** 녹아 없어질 것을 정리한다 (타이머 없이: 누군가 들어오거나 뭔가를 놓을 때만). 남은 목록을 돌려준다 */
  private cleanup(now: number): WireObject[] {
    const all = this.objects();
    const gone = new Set(expiredObjects(all, now));
    for (const id of gone) {
      this.remove(id);
      this.broadcast({ t: 'del', id });
    }
    return all.filter((o) => !gone.has(o.id));
  }

  // ── 메시지

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const session = (ws.deserializeAttachment() as Session | null) ?? newSession();
    const now = Date.now();
    const allowed = allowMessage(session, now);
    const message = allowed ? parseClientMessage(raw) : null;
    if (!message) {
      ws.serializeAttachment(session);
      return;
    }

    if (message.t === 'join') {
      if (session.player) return;
      const others = this.sessions().filter((s) => s.ws !== ws);
      if (isFull(others.map((s) => s.session))) {
        this.send(ws, { t: 'full' });
        ws.close(1000, 'full');
        return;
      }
      const id = crypto.randomUUID().slice(0, 8);
      session.player = { id, name: message.name, scarf: message.scarf, x: 720, y: 244, f: 1, state: { kind: 'walk' }, hat: 'on' };
      ws.serializeAttachment(session);
      // 예전에 브라우저에만 저장해 둔 내 눈사람을 서버로 옮긴다
      (message.legacy ?? []).forEach((data, i) => this.put({ id: `${id}-old${i}`, kind: 'snowman', data: { ...data, owner: id }, updatedAt: now - 1000 + i }));
      const objects = this.cleanup(now);
      this.send(ws, {
        t: 'welcome',
        id,
        now,
        players: others.flatMap((s) => (s.session.player ? [s.session.player] : [])),
        seats: seatsOf(others.map((s) => s.session)),
        objects,
        rolling: others.flatMap((s) => (s.session.player && s.session.rolling ? [{ owner: s.session.player.id, ...s.session.rolling }] : [])),
      });
      this.broadcast({ t: 'joined', player: session.player }, ws);
      // 옮겨 온 눈사람은 다른 사람에게도 알린다
      if (message.legacy?.length) for (const o of objects) if (o.id.startsWith(`${id}-old`)) this.broadcast({ t: 'put', object: o }, ws);
      return;
    }

    const me = session.player;
    if (!me) return;
    switch (message.t) {
      case 'pos':
        me.x = message.x;
        me.y = message.y;
        me.f = message.f;
        this.broadcast({ ...message, id: me.id }, ws);
        break;
      case 'state':
        me.state = message.state;
        me.hat = message.hat;
        this.broadcast({ t: 'state', id: me.id, state: message.state, hat: message.hat }, ws);
        break;
      case 'act':
        this.broadcast({ t: 'act', id: me.id, a: message.a }, ws);
        break;
      case 'sit': {
        // 자리는 서버가 정한다: 빈자리일 때만 앉힌다
        const all = this.sessions().map((s) => (s.ws === ws ? session : s.session));
        if (trySit(all, session, message.mount, message.slot)) {
          ws.serializeAttachment(session);
          this.broadcast({ t: 'seats', seats: seatsOf(all) });
        } else this.send(ws, { t: 'seatDenied' });
        break;
      }
      case 'stand':
        if (session.seat) {
          session.seat = null;
          ws.serializeAttachment(session);
          this.broadcast({ t: 'seats', seats: seatsOf(this.sessions().map((s) => s.session)) });
        }
        break;
      case 'grab': {
        // 잡기는 서버가 허락한다 (한 눈덩이에 최대 2명). 잡힌 눈덩이는 저장소에서 빼 둔다 — 놓일 때 다시 쓴다 (녹는 시계도 그때부터)
        const all = this.sessions().map((s) => (s.ws === ws ? session : s.session));
        if (tryGrab(all, session, message.id, now)) {
          ws.serializeAttachment(session);
          this.remove(message.id);
          this.broadcast({ t: 'holders', id: message.id, holders: holdersOf(all, message.id) });
        } else this.send(ws, { t: 'grabDenied', id: message.id });
        break;
      }
      case 'drop':
        if (releaseHold(session, message.id)) {
          session.rolling = null;
          ws.serializeAttachment(session);
          this.broadcast({ t: 'holders', id: message.id, holders: holdersOf(this.sessions().map((s) => s.session), message.id) });
        }
        break;
      case 'push':
        // 같이 미는 사람의 방향 입력은 전달만 한다
        if (session.holding?.id === message.id) this.broadcast({ t: 'push', id: message.id, from: me.id, dx: message.dx, dy: message.dy }, ws);
        break;
      case 'ball':
        // 눈덩이를 움직이는 것은 먼저 잡은 사람뿐
        if (holdersOf(this.sessions().map((s) => (s.ws === ws ? session : s.session)), message.id)[0] !== me.id) break;
        // 굴리는 동안은 전달만 하고 저장하지 않는다 (나가면 이 모습으로 놓인다)
        session.rolling = { id: message.id, x: message.x, y: message.y, d: message.d, roll: message.roll, seed: message.seed };
        this.broadcast({ ...message, owner: me.id }, ws);
        break;
      case 'put': {
        const object = { id: message.id, kind: message.kind, data: message.data, updatedAt: now } as WireObject;
        this.put(object);
        if (session.rolling?.id === message.id) session.rolling = null;
        // 놓였다: 잡고 있던 사람은 모두 손을 뗀 것으로
        for (const s of this.sessions()) {
          const other = s.ws === ws ? session : s.session;
          if (other.holding?.id !== message.id) continue;
          other.holding = null;
          if (s.ws !== ws) s.ws.serializeAttachment(other);
        }
        this.broadcast({ t: 'holders', id: message.id, holders: [] });
        this.broadcast({ t: 'put', object }, ws);
        this.cleanup(now);
        break;
      }
      case 'del':
        this.remove(message.id);
        if (session.rolling?.id === message.id) session.rolling = null;
        this.broadcast({ t: 'del', id: message.id }, ws);
        break;
    }
    ws.serializeAttachment(session);
  }

  // ── 끊김·나감

  private leave(ws: WebSocket): void {
    const session = ws.deserializeAttachment() as Session | null;
    if (!session?.player) return;
    const id = session.player.id;
    const others = this.sessions().filter((s) => s.ws !== ws).map((s) => s.session);
    const { seatFreed, dropped, released } = leavePlaza(session, Date.now(), others);
    session.player = null;
    ws.serializeAttachment(session);
    // 같이 밀던 눈덩이: 남은 사람이 이어받는다
    if (released) this.broadcast({ t: 'holders', id: released, holders: holdersOf(others, released) }, ws);
    // 굴리던 눈덩이는 그 자리에 놓인 것으로
    if (dropped) {
      this.put(dropped);
      this.broadcast({ t: 'put', object: dropped }, ws);
    }
    this.broadcast({ t: 'left', id }, ws);
    if (seatFreed) this.broadcast({ t: 'seats', seats: seatsOf(this.sessions().map((s) => s.session)) }, ws);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }
}
