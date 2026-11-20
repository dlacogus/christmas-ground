// 회전목마 자리 관리와 타고 내리기. DOM을 쓰지 않아 테스트에서 바로 돌릴 수 있다.
//
// 자리: 탈 것마다 자리 배열이 있다 — 말은 1자리, 마차는 2자리(0 = 뒷자리, 1 = 앞자리).
//       각 자리에 누가 앉았는지 적는다 (지금은 나와 가짜 친구, 나중에는 진짜 친구).
// 타기: 입구에서 타겠다고 하면(requestBoard) 빈 자리가 있는 탈 것 가운데 가장 먼저 앞으로 오는 것을 기다렸다가,
//       그 탈 것이 입구 앞에 왔을 때 올라탄다. 친구가 앉아 있는 마차에 빈 자리가 있으면 그 마차를 먼저 고른다.
// 내리기: 내 탈 것이 앞에 있을 때만 내린다. 아니면 표시만 해 두고(exitRequested) 앞에 오면 저절로 내린다.

import { CAROUSEL as K, type OutfitName } from '../constants';
import { mountAngle, mountKind, seatPosition, type Facing, type RiderView } from '../props/carousel';

/** 자리에 앉은 사람 */
export interface Occupant {
  id: string;
  outfit: OutfitName;
  /** 손 흔들기가 끝날 때까지 남은 시간 (0이면 안 흔듦) */
  waveLeft: number;
  /** 모자가 벗겨져 대머리인가 */
  bald?: boolean;
  /** 털모자 색 (없으면 기본 빨강) */
  hatColor?: number | null;
  /** 그 위로 겹쳐 쓴 남의 모자 색 (아래 → 위) */
  stack?: readonly number[];
}

/** seats[탈 것 번호][자리 번호] = 앉은 사람 또는 null */
export type Seats = (Occupant | null)[][];

export function createSeats(): Seats {
  return Array.from({ length: K.horseCount }, (_, i) => (mountKind(i) === 'carriage' ? [null, null] : [null]));
}

export function findSeat(seats: Seats, id: string): { mount: number; slot: number } | null {
  for (let mount = 0; mount < seats.length; mount++) {
    const slot = seats[mount].findIndex((o) => o?.id === id);
    if (slot >= 0) return { mount, slot };
  }
  return null;
}

/** 이 탈 것의 첫 빈 자리 (없으면 -1) */
export function freeSlot(seats: Seats, mount: number): number {
  return seats[mount].indexOf(null);
}

/** 자리에 앉힌다. 이미 누가 있으면 실패 */
export function sit(seats: Seats, mount: number, slot: number, who: Occupant): boolean {
  if (seats[mount][slot] !== null) return false;
  seats[mount][slot] = who;
  return true;
}

/** 이 사람을 자리에서 내보낸다 (다른 사람은 그대로) */
export function leave(seats: Seats, id: string): void {
  const at = findSeat(seats, id);
  if (at) seats[at.mount][at.slot] = null;
}

/** 다른 사람이 앉아 있고 옆자리가 비어 있는 탈 것인가 (친구와 같이 탈 수 있는 마차) */
export function hasCompanionSeat(seats: Seats, mount: number, id: string): boolean {
  return freeSlot(seats, mount) >= 0 && seats[mount].some((o) => o !== null && o.id !== id);
}

/** 같은 탈 것에 앉은 다른 사람의 자리 번호 (없으면 -1) */
export function companionSlot(seats: Seats, id: string): number {
  const at = findSeat(seats, id);
  if (!at) return -1;
  return seats[at.mount].findIndex((o) => o !== null && o.id !== id);
}

// ───────────── 앞쪽 판정 ─────────────

/** 탈 것이 입구 앞(타고 내릴 수 있는 곳)에 있는가 */
export function atFront(angle: number): boolean {
  return Math.abs(angle) <= K.boardWindow;
}

/** 탈 것이 입구 앞에 올 때까지 남은 시간 (이미 앞이면 0) */
export function timeToFront(angle: number): number {
  if (atFront(angle)) return 0;
  const ahead = angle < 0 ? -angle : Math.PI * 2 - angle;
  return (ahead - K.boardWindow) / ((Math.PI * 2) / K.rotationPeriod);
}

/**
 * 탈 탈 것을 고른다 (없으면 -1): 빈 자리가 있는 것 가운데 가장 먼저 앞으로 오는 것.
 * 친구가 앉아 있고 옆자리가 빈 마차가 있으면 그것을 먼저 고른다. carriageOnly면 마차만 본다.
 */
export function pickMount(seats: Seats, time: number, id: string, carriageOnly: boolean): number {
  const open = seats
    .map((_, mount) => mount)
    .filter((mount) => freeSlot(seats, mount) >= 0 && (!carriageOnly || mountKind(mount) === 'carriage'));
  const withFriend = open.filter((mount) => hasCompanionSeat(seats, mount, id));
  const pool = withFriend.length > 0 ? withFriend : open;
  let best = -1;
  let bestWait = Infinity;
  for (const mount of pool) {
    const wait = timeToFront(mountAngle(mount, time));
    if (wait < bestWait) {
      best = mount;
      bestWait = wait;
    }
  }
  return best;
}

// ───────────── 타고 내리기 ─────────────

export interface Boarding {
  /** none = 걸어 다님, waiting = 입구에서 기다림, riding = 타는 중 */
  phase: 'none' | 'waiting' | 'riding';
  /** 기다리는 탈 것 (waiting일 때) */
  target: number;
  carriageOnly: boolean;
  /** 내리겠다고 해 두었는가 (앞에 오면 내린다) */
  exitRequested: boolean;
}

export function createBoarding(): Boarding {
  return { phase: 'none', target: -1, carriageOnly: false, exitRequested: false };
}

/** 타겠다고 한다. 탈 수 있는 것이 하나도 없으면(예: 마차 두 대가 꽉 참) false */
export function requestBoard(b: Boarding, seats: Seats, time: number, id: string, carriageOnly: boolean): boolean {
  if (b.phase !== 'none') return false;
  const target = pickMount(seats, time, id, carriageOnly);
  if (target < 0) return false;
  b.phase = 'waiting';
  b.target = target;
  b.carriageOnly = carriageOnly;
  b.exitRequested = false;
  return true;
}

/** 기다리다 그만둔다 */
export function cancelBoard(b: Boarding): void {
  if (b.phase === 'waiting') {
    b.phase = 'none';
    b.target = -1;
  }
}

/** 내리겠다고 한다 (실제로 내리는 것은 탈 것이 앞에 왔을 때) */
export function requestExit(b: Boarding): void {
  if (b.phase === 'riding') b.exitRequested = true;
}

export type BoardingEvent = 'boarded' | 'alighted' | null;

/** 매 프레임: 기다리던 탈 것이 앞에 오면 올라타고, 내리겠다고 한 뒤 앞에 오면 내린다 */
export function updateBoarding(b: Boarding, seats: Seats, time: number, me: Occupant): BoardingEvent {
  if (b.phase === 'waiting') {
    // 기다리는 사이 자리가 차거나 친구가 다른 마차에 앉을 수 있으니 매번 다시 고른다
    b.target = pickMount(seats, time, me.id, b.carriageOnly);
    if (b.target < 0) {
      b.phase = 'none';
      return null;
    }
    if (!atFront(mountAngle(b.target, time))) return null;
    sit(seats, b.target, freeSlot(seats, b.target), me);
    b.phase = 'riding';
    return 'boarded';
  }
  if (b.phase === 'riding' && b.exitRequested) {
    const at = findSeat(seats, me.id);
    if (at && !atFront(mountAngle(at.mount, time))) return null;
    leave(seats, me.id);
    b.phase = 'none';
    b.target = -1;
    b.exitRequested = false;
    return 'alighted';
  }
  return null;
}

/** 타는 동안 캐릭터 위치 = 자기 자리 위치 */
export function syncToSeat(target: { x: number; y: number }, seats: Seats, id: string, time: number): boolean {
  const at = findSeat(seats, id);
  if (!at) return false;
  const seat = seatPosition(at.mount, at.slot, time);
  target.x = seat.x;
  target.y = seat.y;
  return true;
}

// ───────────── 손 흔들기, 그리기용 목록 ─────────────

export function startWave(who: Occupant): void {
  who.waveLeft = K.waveSeconds;
}

export function updateWaves(seats: Seats, dt: number): void {
  for (const mount of seats) for (const o of mount) if (o && o.waveLeft > 0) o.waveLeft = Math.max(0, o.waveLeft - dt);
}

/** 지금 앉아 있는 사람들을 그리기용 목록으로. 같이 탄 사람이 있으면 손 흔들 때 그쪽을 본다 */
export function riderViews(seats: Seats, time: number): RiderView[] {
  const views: RiderView[] = [];
  seats.forEach((slots, mount) => {
    slots.forEach((who, slot) => {
      if (!who) return;
      const other = slots.findIndex((o, i) => o !== null && i !== slot);
      let lookAt: Facing | null = null;
      if (other >= 0) lookAt = seatPosition(mount, other, time).x > seatPosition(mount, slot, time).x ? 'right' : 'left';
      views.push({ mount, slot, outfit: who.outfit, waving: who.waveLeft > 0, lookAt, bald: who.bald === true, hatColor: who.hatColor ?? null, stack: who.stack });
    });
  });
  return views;
}
