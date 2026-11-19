// Cloudflare Worker 'christmas-square': 정적 파일(assets)은 그대로 내보내고, /ws만 실시간 서버(Durable Object 'Plaza')로 보낸다.
//
// Plaza는 하나뿐이다 (idFromName('main')) — 모두 같은 광장에 들어온다.
// - WebSocket은 Hibernation API로 받는다: 아무도 메시지를 보내지 않으면 서버가 잠들 수 있다. 매 프레임 도는 루프도, 타이머도 두지 않는다.
// - 서버는 받은 것을 확인(shared/protocol.ts)하고 다른 사람들에게 전달만 한다. 규칙(자리 배정·정리)은 shared/plazaCore.ts.
// - 접속자 정보는 접속마다 serializeAttachment로 붙여 둔다 (잠들었다 깨어나도 남는다).
// - 눈덩이·눈사람은 SQLite 테이블 objects(id, kind, data JSON, updated_at)에, 결과가 바뀔 때만 쓴다.
// - 트리 장식은 tree_ornaments(id, kind, x, y, by_nick, created_at)에: 상자를 열 때 한 줄(x, y = NULL), 달 때·뗄 때 그 줄을 고친다.
//   선물 상자 자체는 어디에도 두지 않는다 — 떨어지는 때와 자리는 서버 시각 + 고정 시드로 계산하고 (features/treeDecor.ts),
//   장식 id = 상자 id라서 줄이 있으면 '이미 열린 상자'다 (서버가 잠들었다 깨어나도 한 상자는 한 번만 열린다).

import { DurableObject } from 'cloudflare:workers';
import { ORNAMENT, type OrnamentKind } from '../constants';
import { milestoneAt, openableGiftIds, rollOrnament } from '../features/treeDecor';
import {
  allowMessage,
  canHangOrnament,
  canOpenGift,
  canUnhangOrnament,
  debugGiftId,
  expiredObjects,
  holdersOf,
  isFull,
  leavePlaza,
  newSession,
  releaseHold,
  seatsOf,
  trySit,
  tryGrab,
  type OrnamentRow,
  type Session,
} from '../shared/plazaCore';
import { parseClientMessage, type ServerMessage, type WireObject, type WireOrnament } from '../shared/protocol';

interface Env {
  ASSETS: Fetcher;
  PLAZA: DurableObjectNamespace<Plaza>;
  /** 개발 서버(npm run dev)에서만 '1': 개발용 선물 상자(?debug=1의 P)를 받아 준다 */
  DEBUG_GIFTS?: string;
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
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tree_ornaments (id TEXT PRIMARY KEY, kind TEXT NOT NULL, x INTEGER, y INTEGER, by_nick TEXT NOT NULL, created_at INTEGER NOT NULL)');
    // 지금까지 축하한 가장 큰 장식 수 (25·50·100) 한 줄 — 뗐다 다시 달아도 같은 축하는 한 번뿐이게
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)');
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

  /** 저장된 눈사람이 처음 만들어진 때 (없으면 null) */
  private bornOf(id: string): number | null {
    const rows = this.ctx.storage.sql.exec("SELECT data FROM objects WHERE id = ? AND kind = 'snowman' LIMIT 1", id).toArray();
    if (rows.length === 0) return null;
    const born = (JSON.parse(String(rows[0].data)) as { born?: unknown }).born;
    return typeof born === 'number' ? born : null;
  }

  /** 그 눈사람이 있나 (전체를 읽지 않고 한 줄만 조회한다) */
  private hasSnowman(id: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM objects WHERE id = ? AND kind = 'snowman' LIMIT 1", id).toArray().length > 0;
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

  // ── 트리 장식 저장소

  private ornamentRow(id: string): OrnamentRow | null {
    const rows = this.ctx.storage.sql.exec('SELECT id, kind, x, y, by_nick, created_at FROM tree_ornaments WHERE id = ? LIMIT 1', id).toArray();
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: String(r.id), kind: r.kind as OrnamentKind, x: r.x === null ? null : Number(r.x), y: r.y === null ? null : Number(r.y), by: String(r.by_nick), at: Number(r.created_at) };
  }

  /** 트리에 달려 있는 장식 전부 */
  private hungOrnaments(): WireOrnament[] {
    const rows = this.ctx.storage.sql.exec('SELECT id, kind, x, y, by_nick, created_at FROM tree_ornaments WHERE x IS NOT NULL').toArray();
    return rows.map((r) => ({ id: String(r.id), kind: r.kind as OrnamentKind, x: Number(r.x), y: Number(r.y), by: String(r.by_nick), at: Number(r.created_at) }));
  }

  /** 지금 바닥에 있을 수 있는 산타 선물 가운데 이미 열린 것 */
  private openedGifts(now: number): string[] {
    const ids = openableGiftIds(now / 1000);
    const rows = this.ctx.storage.sql.exec(`SELECT id FROM tree_ornaments WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids).toArray();
    return rows.map((r) => String(r.id));
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
      (message.legacy ?? []).forEach((data, i) => this.put({ id: `${id}-old${i}`, kind: 'snowman', data: { ...data, owner: id, born: now }, updatedAt: now - 1000 + i }));
      const objects = this.cleanup(now);
      // 열어 놓고 오래 달지 않은 장식은 잊는다 (타이머 없이, 누가 들어올 때만)
      this.ctx.storage.sql.exec('DELETE FROM tree_ornaments WHERE x IS NULL AND created_at < ?', now - ORNAMENT.unhungKeepSeconds * 1000);
      const mine = this.ctx.storage.sql.exec('SELECT id, kind FROM tree_ornaments WHERE x IS NULL AND by_nick = ?', message.name).toArray();
      this.send(ws, {
        t: 'welcome',
        id,
        now,
        players: others.flatMap((s) => (s.session.player ? [s.session.player] : [])),
        seats: seatsOf(others.map((s) => s.session)),
        objects,
        rolling: others.flatMap((s) => (s.session.player && s.session.rolling ? [{ owner: s.session.player.id, ...s.session.rolling }] : [])),
        tree: this.hungOrnaments(),
        opened: this.openedGifts(now),
        mine: mine.map((r) => ({ id: String(r.id), kind: r.kind as OrnamentKind })),
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
        me.hold = message.hold ?? null;
        me.hc = message.hc ?? null;
        me.ho = message.ho ?? null;
        this.broadcast({ t: 'state', id: me.id, state: message.state, hat: message.hat, hold: me.hold, hc: me.hc, ho: me.ho }, ws);
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
        // 눈사람은 처음 만든 때를 서버가 적어 둔다 (나중에 소품을 달거나 머리가 떨어져도 그대로) — 10분 뒤 녹는다
        if (object.kind === 'snowman') object.data.born = this.bornOf(object.id) ?? now;
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
      case 'throw':
        this.broadcast({ t: 'throw', id: me.id, x: message.x, y: message.y, dx: message.dx, dy: message.dy, p: message.p }, ws);
        break;
      case 'hit':
        // 그 눈사람이 있을 때만 모두에게 알린다 (던진 사람에게도 — 확인)
        if (this.hasSnowman(message.id)) this.broadcast({ t: 'hit', id: message.id, by: me.id, n: message.n, dir: message.dir });
        break;
      case 'splat':
        this.broadcast({ t: 'splat', from: me.id, to: message.to, head: message.head, dir: message.dir });
        break;
      case 'open': {
        // 한 상자는 한 사람만: 줄이 이미 있으면(누가 먼저 열었다) 거절한다. 어떤 장식이 나올지는 서버가 고른다
        if (!canOpenGift(message.id, now, me, this.ornamentRow(message.id), this.env.DEBUG_GIFTS === '1')) {
          this.send(ws, { t: 'openDenied', id: message.id });
          break;
        }
        const kind = rollOrnament(Math.random(), Math.random());
        this.ctx.storage.sql.exec('INSERT INTO tree_ornaments (id, kind, x, y, by_nick, created_at) VALUES (?, ?, NULL, NULL, ?, ?)', message.id, kind, me.name, now);
        this.broadcast({ t: 'opened', id: message.id, by: me.id, kind });
        break;
      }
      case 'hang': {
        // 상자에서 나온 장식만, 잎 영역 안에, 다른 장식과 겹치지 않게
        const row = this.ornamentRow(message.id);
        const hung = this.hungOrnaments();
        if (!row || !canHangOrnament(row, me.name, message.x, message.y, hung)) {
          this.send(ws, { t: 'hangDenied', id: message.id });
          break;
        }
        this.ctx.storage.sql.exec('UPDATE tree_ornaments SET x = ?, y = ?, created_at = ? WHERE id = ?', message.x, message.y, now, message.id);
        const count = hung.length + 1;
        // 25·50·100개에 처음 닿았을 때만 축하한다
        const celebrated = this.ctx.storage.sql.exec("SELECT value FROM meta WHERE key = 'milestone'").toArray();
        const milestone = milestoneAt(count, celebrated.length > 0 ? Number(celebrated[0].value) : 0);
        if (milestone !== null) this.ctx.storage.sql.exec("INSERT INTO meta (key, value) VALUES ('milestone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", milestone);
        const o: WireOrnament = { id: row.id, kind: row.kind, x: message.x, y: message.y, by: me.name, at: now };
        this.broadcast(milestone !== null ? { t: 'hung', o, by: me.id, count, milestone } : { t: 'hung', o, by: me.id, count });
        break;
      }
      case 'unhang':
        // 내가 단 장식만, 단 지 1분 안에만 뗄 수 있다 (장식은 내 손으로 돌아온다)
        if (canUnhangOrnament(this.ornamentRow(message.id), me.name, now)) {
          this.ctx.storage.sql.exec('UPDATE tree_ornaments SET x = NULL, y = NULL WHERE id = ?', message.id);
          this.broadcast({ t: 'unhung', id: message.id, by: me.id });
        }
        break;
      case 'debugGift': {
        // 개발 서버에서만: 그 자리에 선물 상자를 바로 떨어뜨린다 (저장하지 않는다 — 자리와 때는 id에 적혀 있다)
        if (this.env.DEBUG_GIFTS !== '1') break;
        const gift = { at: now, x: message.x, y: message.y, color: Math.floor(Math.random() * 4) };
        this.broadcast({ t: 'gift', gift: { ...gift, id: debugGiftId(gift) } });
        break;
      }
      case 'del':
        this.remove(message.id);
        if (session.rolling?.id === message.id) session.rolling = null;
        // 없어진 눈덩이(눈사람이 됐다)를 잡고 있던 사람들의 손을 푼다
        for (const peer of this.ctx.getWebSockets()) {
          const other = peer.deserializeAttachment() as Session | null;
          if (!other || other.holding?.id !== message.id) continue;
          other.holding = null;
          if (other.rolling?.id === message.id) other.rolling = null;
          peer.serializeAttachment(other);
        }
        if (session.holding?.id === message.id) session.holding = null;
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
