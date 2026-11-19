// 광장 서버의 규칙 (순수 계산 — Cloudflare API 없이 테스트할 수 있다).
// 서버는 잠들었다 깨어나므로 기억을 따로 두지 않는다: 접속자 정보는 접속(WebSocket)마다 붙여 둔 Seat에서,
// 눈덩이·눈사람은 저장소(SQLite)에서 그때그때 읽어 와 이 함수들에 넘긴다.

import { COPUSH, GIFT, NET, SNOWBALL, SNOWMAN, type OrnamentKind } from '../constants';
import { canUnhang, checkHang, giftIndexOf, giftOfPass, giftOpenable } from '../features/treeDecor';
import { emptySeats, seatCount, type BallData, type WireGift, type WireObject, type WirePlayer, type WireSeats } from './protocol';

/** 접속 하나에 붙여 두는 정보 (serializeAttachment) */
export interface Session {
  /** 입장하기 전이면 null */
  player: WirePlayer | null;
  /** 앉아 있는 회전목마 자리 */
  seat: { mount: number; slot: number } | null;
  /** 잡고 있는 눈덩이와 잡은 순서 (작을수록 먼저). 먼저 잡은 사람이 눈덩이를 움직인다 */
  holding: { id: string; at: number } | null;
  /** 굴리고 있는 눈덩이 (저장하지 않은 마지막 모습) */
  rolling: { id: string; x: number; y: number; d: number; roll: number; seed: number } | null;
  /** 초당 메시지 수 세기: 이 초(windowStart, ms)에 받은 개수 */
  windowStart: number;
  count: number;
}

export function newSession(): Session {
  return { player: null, seat: null, holding: null, rolling: null, windowStart: 0, count: 0 };
}

/** 지금 들어와 있는 사람 수가 상한(8명)에 닿았나 */
export function isFull(sessions: readonly Session[]): boolean {
  return sessions.filter((s) => s.player !== null).length >= NET.maxPlayers;
}

/** 한 사람이 초당 20개 넘게 보내면 그 초의 나머지는 무시한다. 받아도 되면 true (세는 값은 session에 적는다) */
export function allowMessage(session: Session, now: number): boolean {
  if (now - session.windowStart >= 1000) {
    session.windowStart = now;
    session.count = 0;
  }
  session.count++;
  return session.count <= NET.maxMessagesPerSecond;
}

/** 지금 회전목마 자리 배열 */
export function seatsOf(sessions: readonly Session[]): WireSeats {
  const seats = emptySeats();
  for (const s of sessions) {
    if (s.player && s.seat && seats[s.seat.mount]?.[s.seat.slot] === null) seats[s.seat.mount][s.seat.slot] = s.player.id;
  }
  return seats;
}

/**
 * 자리에 앉겠다는 요청: 서버가 빈자리인지 확인해 허락한다. 동시에 같은 자리를 요청해도 먼저 처리된 한 명만 앉는다.
 * 허락하면 session.seat을 바꾸고 true (앉아 있던 자리는 비운다).
 */
export function trySit(sessions: readonly Session[], session: Session, mount: number, slot: number): boolean {
  if (!session.player || slot < 0 || slot >= seatCount(mount)) return false;
  const taken = sessions.some((s) => s !== session && s.player && s.seat && s.seat.mount === mount && s.seat.slot === slot);
  if (taken) return false;
  session.seat = { mount, slot };
  return true;
}

/** 이 눈덩이를 지금 밀고 있는 사람들의 id (먼저 잡은 순서) */
export function holdersOf(sessions: readonly Session[], ballId: string): string[] {
  return sessions
    .filter((s) => s.player && s.holding?.id === ballId)
    .sort((a, b) => a.holding!.at - b.holding!.at)
    .map((s) => s.player!.id);
}

/**
 * 눈덩이를 잡겠다는 요청: 서버가 허락한다. 한 눈덩이는 최대 2명까지만 밀 수 있다.
 * 허락하면 session.holding을 바꾸고 true (이미 잡고 있었으면 그대로 true).
 */
export function tryGrab(sessions: readonly Session[], session: Session, ballId: string, order: number): boolean {
  if (!session.player) return false;
  if (session.holding?.id === ballId) return true;
  const others = sessions.filter((s) => s !== session && s.player && s.holding?.id === ballId).length;
  if (others >= COPUSH.maxPushers) return false;
  session.holding = { id: ballId, at: order };
  return true;
}

/** 손을 뗐다. 남은 사람이 있으면 그 사람이 이어받는다 (holdersOf의 맨 앞) */
export function releaseHold(session: Session, ballId: string): boolean {
  if (session.holding?.id !== ballId) return false;
  session.holding = null;
  return true;
}

/**
 * 누군가 나갔을 때 뒤처리: 회전목마 자리를 비우고, 굴리던 눈덩이는 그 자리에 놓인 것으로 한다.
 * 놓인 것으로 저장할 눈덩이(있으면)와, 자리가 바뀌었는지를 돌려준다.
 */
export function leavePlaza(
  session: Session,
  now: number,
  others: readonly Session[] = [],
): { seatFreed: boolean; dropped: WireObject | null; released: string | null } {
  const seatFreed = session.seat !== null;
  session.seat = null;
  const released = session.holding?.id ?? null;
  session.holding = null;
  // 같이 밀던 사람이 남아 있으면 그 사람이 이어받는다 (바닥에 놓지 않는다)
  const takenOver = released !== null && others.some((s) => s !== session && s.player && s.holding?.id === released);
  let dropped: WireObject | null = null;
  if (session.player && session.rolling && !takenOver) {
    const r = session.rolling;
    const data: BallData = { x: r.x, y: r.y, d: r.d, roll: r.roll, seed: r.seed, owner: session.player.id };
    dropped = { id: r.id, kind: 'ball', data, updatedAt: now };
  }
  session.rolling = null;
  return { seatFreed, dropped, released };
}

/**
 * 녹아 없어질 것들의 id. 타이머 없이, 누군가 들어오거나 뭔가를 놓을 때 updatedAt을 보고 정리한다:
 * 놓아둔 지 5분 넘은 눈덩이, 만든 지 10분 넘은 눈사람, 12개를 넘는 오래된 눈사람.
 */
export function expiredObjects(objects: readonly WireObject[], now: number): string[] {
  const gone: string[] = [];
  for (const o of objects) {
    if (o.kind === 'ball' && now - o.updatedAt > SNOWBALL.idleSeconds * 1000) gone.push(o.id);
  }
  // 눈사람: 처음 만든 때(born)부터 10분. 소품을 달아 updatedAt이 바뀌어도 born은 그대로다
  const bornAt = (o: WireObject) => (o.kind === 'snowman' && typeof o.data.born === 'number' ? o.data.born : o.updatedAt);
  const snowmen: WireObject[] = [];
  for (const o of objects) {
    if (o.kind !== 'snowman') continue;
    if (now - bornAt(o) > SNOWMAN.lifeSeconds * 1000) gone.push(o.id);
    else snowmen.push(o);
  }
  snowmen.sort((a, b) => bornAt(a) - bornAt(b));
  for (let i = 0; i < snowmen.length - SNOWMAN.maxCount; i++) gone.push(snowmen[i].id);
  return gone;
}

// ───────────── 선물 상자와 트리 장식 ─────────────

/**
 * 저장된 장식 한 줄 (SQLite 테이블 tree_ornaments). 장식의 id는 그 장식이 나온 선물 상자의 id와 같다 —
 * 그래서 줄이 있으면 그 상자는 이미 열린 것이고, 상자 하나에서 장식은 하나만 나온다.
 * x, y가 null이면 열기만 하고 아직 달지 않았다 (연 사람 손에 있다).
 */
export interface OrnamentRow {
  id: string;
  kind: OrnamentKind;
  x: number | null;
  y: number | null;
  /** 연 사람(= 다는 사람) 닉네임, 연 때 또는 단 때 (서버 시각 ms) */
  by: string;
  at: number;
}

/** 개발용 선물 상자의 id: 떨어뜨린 때·자리·색을 id에 적어 둔다 (서버가 따로 기억하지 않아도 되게) */
export function debugGiftId(gift: { at: number; x: number; y: number; color: number }): string {
  return `d${Math.round(gift.at)}x${Math.round(gift.x)}y${Math.round(gift.y)}c${gift.color}`;
}

export function parseDebugGift(id: string): WireGift | null {
  const m = /^d(\d{1,15})x(\d{1,4})y(\d{1,3})c([0-3])$/.exec(id);
  return m ? { id, at: Number(m[1]), x: Number(m[2]), y: Number(m[3]), color: Number(m[4]) } : null;
}

/** 개발용 상자를 열 수 있는 시간 (떨어뜨린 뒤, ms) */
const DEBUG_GIFT_LIFE_MS = 30 * 60 * 1000;

/**
 * 선물 상자를 열겠다는 요청: 한 상자는 한 사람만 연다. 동시에 눌러도 먼저 처리된 한 명만 받는다 (row = 이미 누가 열었으면 그 줄).
 * 상자는 바닥에 닿아 있어야 하고 (산타 선물은 최근 3개까지), 여는 사람(at)이 상자 곁에 있어야 한다.
 * allowDebug = 개발 서버 (개발용 상자도 받아 준다).
 */
export function canOpenGift(id: string, nowMs: number, at: { x: number; y: number }, row: OrnamentRow | null, allowDebug = false): boolean {
  if (row) return false;
  let spot: { x: number; y: number } | null = null;
  const index = giftIndexOf(id);
  if (index !== null) {
    if (giftOpenable(id, nowMs / 1000)) spot = giftOfPass(index);
  } else if (allowDebug) {
    const debug = parseDebugGift(id);
    if (debug && nowMs >= debug.at && nowMs - debug.at < DEBUG_GIFT_LIFE_MS) spot = debug;
  }
  return spot !== null && Math.hypot(spot.x - at.x, spot.y - at.y) <= GIFT.serverReach;
}

/**
 * 장식을 달겠다는 요청: 상자에서 나온 장식만 (row가 있고 아직 달지 않았다), 연 사람만,
 * 자리는 잎 영역 안이고 달려 있는 것들(hung)과 겹치지 않으며 150개 미만일 때.
 */
export function canHangOrnament(row: OrnamentRow | null, nick: string, x: number, y: number, hung: readonly { x: number; y: number }[]): boolean {
  if (!row || row.x !== null || row.by !== nick) return false;
  return checkHang(x, y, hung) === 'ok';
}

/** 장식을 떼겠다는 요청: 내가 단 것이고 단 지 1분이 안 됐을 때만 */
export function canUnhangOrnament(row: OrnamentRow | null, nick: string, nowMs: number): boolean {
  return row !== null && row.x !== null && canUnhang(row, nick, nowMs);
}
