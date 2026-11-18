// 실시간 서버 접속: /ws로 WebSocket을 열어 입장하고, 끊기면 1→2→4→8초 간격으로 다시 붙는다.
// 접속이 없어도 게임은 혼자 그대로 돌아간다 (보내는 것은 조용히 버린다).

import { NET } from '../constants';
import type { ClientMessage, ServerMessage, SnowmanData } from '../shared/protocol';

export type NetStatus =
  /** 아직 입장하지 않았다 */
  | 'offline'
  | 'connecting'
  | 'online'
  /** 끊겨서 다시 붙는 중 */
  | 'reconnecting'
  /** 광장이 꽉 찼다 (8명) */
  | 'full'
  /** 오래 입력이 없어 끊었다 ('다시 들어가기'로 돌아온다) */
  | 'idle';

export interface Profile {
  name: string;
  scarf: number;
}

export interface Net {
  readonly status: NetStatus;
  /** 서버가 준 내 id (입장 전이면 null) */
  readonly id: string | null;
  /** 서버 시각 (ms). 입장 때 받은 서버 시각과의 차이를 보정한다. 입장 전이면 내 시계 */
  serverNow(): number;
  /** 입장한다 (legacy = 예전에 이 브라우저에만 저장해 둔 눈사람) */
  connect(profile: Profile, legacy?: SnowmanData[]): void;
  /** 연결을 끊는다 (idle = 오래 입력이 없어서) */
  close(reason: 'idle'): void;
  send(message: ClientMessage): void;
  /** 다시 붙을 때를 센다. 매 프레임 부른다 */
  tick(dt: number): void;
  /** 지난 1초 동안 보낸/받은 메시지 수 */
  stats(): { sent: number; received: number };
}

export function netUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

export function createNet(onMessage: (message: ServerMessage) => void, onStatus: (status: NetStatus) => void, url = netUrl()): Net {
  let ws: WebSocket | null = null;
  let status: NetStatus = 'offline';
  let id: string | null = null;
  let offset = 0;
  let profile: Profile | null = null;
  let legacy: SnowmanData[] | undefined;
  let retryIn = -1;
  let attempt = 0;
  let sent = 0;
  let received = 0;
  let lastSent = 0;
  let lastReceived = 0;
  let statClock = 0;

  const setStatus = (next: NetStatus) => {
    if (next === status) return;
    status = next;
    onStatus(next);
  };

  const open = () => {
    if (!profile) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      retryIn = NET.reconnectSeconds[Math.min(attempt++, NET.reconnectSeconds.length - 1)];
      return;
    }
    ws = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify({ t: 'join', name: profile!.name, scarf: profile!.scarf, legacy } satisfies ClientMessage));
    };
    socket.onmessage = (event) => {
      if (socket !== ws) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      received++;
      if (message.t === 'welcome') {
        id = message.id;
        offset = message.now - Date.now();
        attempt = 0;
        // 옮긴 눈사람은 다시 보내지 않는다
        legacy = undefined;
        setStatus('online');
      } else if (message.t === 'full') {
        setStatus('full');
      }
      onMessage(message);
    };
    socket.onclose = () => {
      if (socket !== ws) return;
      ws = null;
      if (status === 'full' || status === 'idle') return;
      // 끊겼다: 1 → 2 → 4 → 8초 간격으로 다시 붙는다
      setStatus('reconnecting');
      retryIn = NET.reconnectSeconds[Math.min(attempt++, NET.reconnectSeconds.length - 1)];
    };
    socket.onerror = () => {
      // onclose가 이어서 불린다
    };
  };

  return {
    get status() {
      return status;
    },
    get id() {
      return status === 'online' ? id : null;
    },
    serverNow() {
      return Date.now() + offset;
    },
    connect(p, old) {
      profile = p;
      legacy = old && old.length > 0 ? old : undefined;
      attempt = 0;
      retryIn = -1;
      if (ws) {
        const previous = ws;
        ws = null;
        previous.close();
      }
      setStatus('connecting');
      open();
    },
    close(reason) {
      setStatus(reason);
      retryIn = -1;
      if (ws) {
        const previous = ws;
        ws = null;
        previous.close();
      }
    },
    send(message) {
      if (status !== 'online' || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(message));
      sent++;
    },
    tick(dt) {
      statClock += dt;
      if (statClock >= 1) {
        statClock = 0;
        lastSent = sent;
        lastReceived = received;
        sent = 0;
        received = 0;
      }
      if (retryIn < 0) return;
      retryIn -= dt;
      if (retryIn <= 0) {
        retryIn = -1;
        open();
      }
    },
    stats() {
      return { sent: lastSent, received: lastReceived };
    },
  };
}

/** 저장해 둔 닉네임·목도리 색 (없으면 null) */
export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(NET.storageKey);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (typeof p.name !== 'string' || typeof p.scarf !== 'number') return null;
    return { name: p.name, scarf: p.scarf };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(NET.storageKey, JSON.stringify(profile));
  } catch {
    // 저장하지 못해도 이번 접속은 그대로 들어간다
  }
}
