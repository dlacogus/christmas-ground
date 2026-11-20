// 루돌프 썰매 규칙 — DOM 없음, 화면과 서버(plazaCore)가 같이 쓴다.
// 썰매 1대: 끄는 자리 1(루돌프 바디슈트) + 타는 자리 2(앞 → 뒤). 썰매는 옆에서 본 모습이라 앞(밧줄)이 오른쪽(f = 1) 또는 왼쪽(-1).
// 좌표: (x, y) = 날이 바닥에 닿는 줄의 가운데 (발밑과 같은 기준).

import type { HatState } from '../character/state';
import { CHARACTER, SLEIGH as K } from '../constants';
import { CAROUSEL_DEPTH, CAROUSEL_GATE, CAROUSEL_SETBACK, CAROUSEL_X, OBSTACLES, SLEIGH_HOME, WALK_AREA, rectsOverlap, type Point, type Rect } from '../world';

export type SleighFacing = 1 | -1;

export interface SleighPos {
  x: number;
  y: number;
  f: SleighFacing;
}

/** 아무도 끌지 않을 때 썰매가 놓인 자리와, 아무도 안 쓰기 시작한 때 (서버 시각 ms) */
export interface SleighRest {
  x: number;
  y: number;
  f: 0 | 1;
  since: number;
}

export const SLEIGH_HOME_POS: SleighPos = { x: SLEIGH_HOME.x, y: SLEIGH_HOME.y, f: SLEIGH_HOME.f };
export const SLEIGH_HOME_REST: SleighRest = { x: SLEIGH_HOME.x, y: SLEIGH_HOME.y, f: SLEIGH_HOME.f > 0 ? 1 : 0, since: 0 };

export const toWireFacing = (f: SleighFacing): 0 | 1 => (f > 0 ? 1 : 0);
export const fromWireFacing = (f: 0 | 1): SleighFacing => (f === 1 ? 1 : -1);

// ───────────── 자리 ─────────────

/** 썰매 앞 끝 (밧줄을 맨 곳) */
export function hitchOf(p: SleighPos): Point {
  return { x: p.x + p.f * K.halfLength, y: p.y };
}

/** 타는 자리 0 = 앞, 1 = 뒤 (앉은 사람의 발밑) */
export function seatPos(p: SleighPos, seat: number): Point {
  return { x: p.x + p.f * (seat === 0 ? K.seatFront : K.seatBack), y: p.y };
}

/** 놓여 있는 썰매의 밧줄 끝 (여기서 Space = 끌기) */
export function ropeEnd(p: SleighPos): Point {
  return { x: p.x + p.f * (K.halfLength + K.ropeRestReach), y: p.y + 1 };
}

/** 썰매 옆 바닥 (여기서 Space = 타기) */
export function rideSpot(p: SleighPos): Point {
  return { x: p.x + p.f * K.rideFront, y: p.y + K.getOffFront / 2 };
}

/** 썰매가 바닥을 차지하는 사각형 (발밑 기준) */
export function sleighRect(x: number, y: number): Rect {
  return { x: x - K.halfLength, y: y - K.depth, w: K.length, h: K.depth };
}

/** 회전목마 입구 빨간 카펫 (썰매는 못 들어간다) */
const CARPET: Rect = (() => {
  const top = WALK_AREA.y + CAROUSEL_SETBACK + CAROUSEL_DEPTH;
  return { x: CAROUSEL_X - CAROUSEL_GATE.carpetHalfWidth, y: top, w: CAROUSEL_GATE.carpetHalfWidth * 2, h: CAROUSEL_GATE.stepsDepth + CAROUSEL_GATE.carpetLength };
})();

/** 썰매가 여기 있을 수 있나: 돌바닥 띠 안, 장애물(스케이트 링크·회전목마·트리 화단·가로등…)과 카펫 밖 */
export function sleighFits(x: number, y: number): boolean {
  const r = sleighRect(x, y);
  if (r.x < WALK_AREA.x || r.x + r.w > WALK_AREA.x + WALK_AREA.w || r.y < WALK_AREA.y || r.y + r.h > WALK_AREA.y + WALK_AREA.h) return false;
  if (rectsOverlap(r, CARPET)) return false;
  return !OBSTACLES.some((o) => rectsOverlap(r, o));
}

/** 썰매를 (dx, dy)만큼 옮긴다: 축마다 잘게 나눠, 막히면 그 바로 앞에서 멈춘다. 실제로 옮긴 양을 돌려준다 */
export function moveSleigh(p: SleighPos, dx: number, dy: number): { dx: number; dy: number } {
  const x0 = p.x;
  const y0 = p.y;
  for (const axis of ['x', 'y'] as const) {
    const amount = axis === 'x' ? dx : dy;
    if (amount === 0) continue;
    const steps = Math.ceil(Math.abs(amount) / CHARACTER.collisionStep);
    const step = amount / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === 'x' ? p.x + step : p.x;
      const ny = axis === 'y' ? p.y + step : p.y;
      if (!sleighFits(nx, ny)) break;
      p.x = nx;
      p.y = ny;
    }
  }
  return { dx: p.x - x0, dy: p.y - y0 };
}

// ───────────── 끌기 ─────────────

/** 끄는 사람의 걸음 배율: 처음엔 평소보다 조금 느리게, 방향키를 계속 누르면 달리기(최대 1.6배)까지. 탄 사람 한 명당 -10% */
export function sleighSpeedFactor(ramp: number, riders: number): number {
  const t = Math.min(1, Math.max(0, ramp));
  return (K.startSpeed + (K.maxSpeed - K.startSpeed) * t) * Math.max(0, 1 - K.perRider * riders);
}

/** 속도 단계 (0~1): 누르고 있으면 서서히 올라가고, 떼면 빨리 내려간다 */
export function nextRamp(ramp: number, pressing: boolean, dt: number): number {
  return pressing ? Math.min(1, ramp + dt / K.rampSeconds) : Math.max(0, ramp - dt * K.rampFall);
}

/**
 * 급회전인가: 최대 속도로 달리던 방향(lastRun, 그때 lastRunAt초)과 반대쪽(내적 ≤ -0.5)을 지금 누른다.
 * 손을 떼고 반대쪽을 누르는 짧은 틈(sharpTurnGrace)은 봐준다.
 */
export function isSharpTurn(lastRun: Point | null, lastRunAt: number, dir: Point, now: number): boolean {
  if (!lastRun || now - lastRunAt > K.sharpTurnGrace) return false;
  const a = Math.hypot(lastRun.x, lastRun.y);
  const b = Math.hypot(dir.x, dir.y);
  if (a === 0 || b === 0) return false;
  return (lastRun.x * dir.x + lastRun.y * dir.y) / (a * b) <= K.sharpTurnDot;
}

/** 급회전 때 튕겨 나갈 자리: 뒷자리부터. 10초 안에 이미 튕겨 나간 사람은 건너뛴다. 없으면 null */
export function throwVictim(seats: readonly (string | null)[], thrownAt: Readonly<Record<string, number>>, now: number): number | null {
  for (const seat of [1, 0]) {
    const who = seats[seat];
    if (!who) continue;
    const last = thrownAt[who];
    if (last !== undefined && now - last < K.throwCooldown * 1000) continue;
    return seat;
  }
  return null;
}

/**
 * 밧줄 따라가기 (끄는 사람 화면이 매 프레임): 끄는 사람이 밧줄 길이보다 멀어지면 썰매 앞 끝이 그만큼 끌려온다.
 * 밧줄이 느슨하면 썰매는 가던 속도로 미끄러지다 마찰로 멈추고, 밧줄이 많이 느슨해지면 멈춘다.
 * 썰매가 막혀 못 따라오면 끄는 사람을 밧줄 길이 안으로 되돌릴 자리(pullBack)를 준다.
 * 끄는 사람이 썰매 앞 끝보다 뒤쪽으로 걸어가면(오른쪽으로 가다가 왼쪽으로) 썰매가 앞 끝을 축으로 빙 돌아선다 —
 * 몸통이 반대편으로 넘어가 끄는 사람 뒤를 따라온다. 돌아설 자리가 막혀 있으면 끄는 사람이 썰매 가운데를 넘어갈 때 제자리에서 돌아선다.
 */
export function followRope(s: SleighPos & { vx: number; vy: number }, puller: Point, dt: number): { pullBack: Point | null } {
  const front = hitchOf(s);
  if ((puller.x - front.x) * s.f < -K.turnMargin) {
    const f: SleighFacing = s.f > 0 ? -1 : 1;
    // 앞 끝은 그 자리에 두고 몸통을 반대편으로
    const x = front.x - f * K.halfLength;
    if (sleighFits(x, s.y)) {
      s.x = x;
      s.f = f;
      s.vx = 0;
      s.vy = 0;
    } else if ((puller.x - s.x) * s.f < -K.halfLength * 0.25) s.f = f;
  }
  const hitch = hitchOf(s);
  const dx = puller.x - hitch.x;
  const dy = puller.y - hitch.y;
  const d = Math.hypot(dx, dy);
  let moved = { dx: 0, dy: 0 };
  if (d > K.ropeLength) {
    // 팽팽: 넘친 만큼 끌려온다
    const over = d - K.ropeLength;
    moved = moveSleigh(s, (dx / d) * over, (dy / d) * over);
    if (dt > 0) {
      s.vx = moved.dx / dt;
      s.vy = moved.dy / dt;
    }
  } else if (d > K.ropeLength * K.slackStop && (s.vx !== 0 || s.vy !== 0)) {
    // 느슨: 가던 대로 조금 더 미끄러진다
    const k = Math.exp(-K.friction * dt);
    s.vx *= k;
    s.vy *= k;
    moved = moveSleigh(s, s.vx * dt, s.vy * dt);
    if (Math.hypot(s.vx, s.vy) < 1) s.vx = s.vy = 0;
  } else {
    s.vx = 0;
    s.vy = 0;
  }
  // 썰매가 막혀 못 따라왔으면 끄는 사람이 밧줄 길이 밖으로 못 나간다
  const h2 = hitchOf(s);
  const ex = puller.x - h2.x;
  const ey = puller.y - h2.y;
  const e = Math.hypot(ex, ey);
  if (e > K.ropeLength + 0.5) return { pullBack: { x: h2.x + (ex / e) * K.ropeLength, y: h2.y + (ey / e) * K.ropeLength } };
  return { pullBack: null };
}

/** 놓았을 때 썰매가 미끄러져 멈출 자리 (지금 속도, 마찰, 장애물) */
export function predictStop(p: SleighPos, vx: number, vy: number): SleighPos {
  const out = { ...p };
  moveSleigh(out, vx / K.friction, vy / K.friction);
  return out;
}

/** 밧줄이 처지는 정도 (0 = 팽팽 ~ 1 = 바닥까지 느슨): 끄는 사람과 썰매 앞 끝 사이 거리로 */
export function ropeSlack(distance: number): number {
  return Math.min(1, Math.max(0, 1 - distance / K.ropeLength));
}

// ───────────── 놓여 있는 썰매 ─────────────

/** 서서히 → 빨리 → 서서히 */
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * 아무도 안 쓰는 썰매가 지금 있는 자리: 놓인 자리에 가만히 있다가, 2분 뒤 제자리로 천천히 미끄러져 돌아간다.
 * since = null이면 누가 쓰고 있다 (놓인 자리 그대로). 모든 화면과 서버가 같은 식으로 계산한다.
 */
export function restingPos(rest: SleighRest, since: number | null, now: number): SleighPos {
  const at: SleighPos = { x: rest.x, y: rest.y, f: fromWireFacing(rest.f) };
  if (since === null) return at;
  const t = (now - since) / 1000 - K.idleReturnSeconds;
  if (t <= 0) return at;
  const k = smooth(Math.min(1, t / K.returnSeconds));
  return { x: at.x + (SLEIGH_HOME_POS.x - at.x) * k, y: at.y + (SLEIGH_HOME_POS.y - at.y) * k, f: k >= 1 ? SLEIGH_HOME_POS.f : at.f };
}

// ───────────── 루돌프 바디슈트와 털모자 ─────────────

/** 바디슈트를 입을 때 털모자: 머리에 쓰고 있었으면 썰매 뒤에 싣는다 (벗으면 다시 쓴다). 이미 대머리였으면 그대로 */
export interface StowedHat {
  /** 썰매에 실렸나 (뒤에 그린다) */
  onSleigh: boolean;
  /** 벗은 뒤 돌아갈 모자 상태 */
  restore: HatState;
}

export function stowHat(hat: HatState): StowedHat {
  return { onSleigh: hat === 'on', restore: hat };
}

/** 바디슈트를 벗으면: 실어 둔 모자를 다시 쓴다. 대머리였으면 그대로 대머리 (그동안 바닥에 떨어진 모자는 그 자리에) */
export function unstowHat(stowed: StowedHat, now: HatState): HatState {
  return stowed.onSleigh ? 'on' : now;
}
