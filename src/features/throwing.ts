// 눈덩이 던져 머리 맞히기 — 규칙 (DOM 없음, 테스트 가능). 조작과 그림은 throwPlay.ts.
//
// - 던지기: 주저앉아 한 줌 뭉치고(0.25초) 바라보는 쪽으로 던진다. ↑↓를 누르고 있으면 대각선. 0.6초에 한 번
// - 눈덩이는 포물선으로 최대 120px 날아간다. 시작 자리·방향·시간만 알면 어느 화면에서나 같은 자리를 지난다 (flightAt)
// - 눈사람 머리(맨 위 눈덩이): 작으면 1번, 중간 2번, 크면 5번 맞아야 떨어진다. 30초 동안 안 맞으면 다시 0부터
// - 머리가 떨어지면 얼굴·머리 소품·모자가 붙은 눈덩이가 되어 굴러가고, 몸통은 머리 없이 남는다 (3단은 맨 위만 떨어진다)
// - 떨어진 머리를 눈 위로 굴리면 얼굴이 묻히고, 눈 없는 데로만 굴려 다른 몸통에 올리면 그 얼굴 그대로 눈사람이 된다

import { SNOWMAN, THROW as T, type PropId } from '../constants';
import type { AttachedProp, BallFace, SnowmanHat } from '../shared/protocol';
import { PROP_SLOT } from './props';
import { sizeTier, snowmanHeight, tierBase } from './snowman';

export interface Vec {
  x: number;
  y: number;
}

/** 던지는 방향 (단위 벡터): 바라보는 쪽, ↑↓를 누르고 있으면 대각선 */
export function throwDir(facing: 'left' | 'right', vertical: number): Vec {
  const fx = facing === 'right' ? 1 : -1;
  const vy = Math.sign(vertical);
  if (vy === 0) return { x: fx, y: 0 };
  return { x: fx * Math.SQRT1_2, y: vy * Math.SQRT1_2 };
}

/** 던진 지 t초 뒤 눈덩이 자리: 바닥 위 (x, y)와 떠 있는 높이 z. done = 땅에 닿았다 */
export function flightAt(start: Vec, dir: Vec, t: number, peak: number = T.peak): { x: number; y: number; z: number; done: boolean } {
  const u = Math.min(1, Math.max(0, t / T.flightSeconds));
  return {
    x: start.x + dir.x * T.range * u,
    // 깊이 쪽(위아래)은 화면에서 납작하게 보이므로 덜 간다
    y: start.y + dir.y * T.range * T.depthRatio * u,
    z: T.handHeight * (1 - u) + 4 * peak * u * (1 - u),
    done: u >= 1,
  };
}

/**
 * 얼마나 높이 던질까: 던지는 쪽 앞에 (깊이가 비슷한) 눈사람이 있으면 그 머리를 지나는 포물선으로 던진다.
 * 없으면 보통 높이. 너무 가깝거나 멀면 맞출 수 없다.
 */
export function aimPeak(start: Vec, dir: Vec, snowmen: readonly { x: number; y: number; tiers: readonly number[]; headless?: boolean; melt?: number }[]): number {
  let best: number = T.peak;
  let bestU = Infinity;
  for (const s of snowmen) {
    if (s.headless || (s.melt ?? -1) >= 0) continue;
    const u = dir.x === 0 ? -1 : (s.x - start.x) / (dir.x * T.range);
    if (u < 0.12 || u > 0.92 || u >= bestU) continue;
    const yThere = start.y + dir.y * T.range * T.depthRatio * u;
    if (Math.abs(yThere - s.y) > T.depthReach) continue;
    const peak = (headOf(s).z - T.handHeight * (1 - u)) / (4 * u * (1 - u));
    if (peak > T.maxPeak) continue;
    best = Math.max(T.peak * 0.5, peak);
    bestU = u;
  }
  return best;
}

/** 스페이스를 누른 시간으로: 짧게 = 던지기, 꾹 = 굴리기 (지금 조작은 F = 던지기, Space = 굴리기 — 길게 누르는 모바일에서 쓴다) */
export function pressKind(seconds: number): 'throw' | 'roll' {
  return seconds < T.shortPress ? 'throw' : 'roll';
}

/** 머리 크기별로 떨어뜨리는 데 필요한 맞힌 횟수: 작음 1, 중간 2, 큼 5 */
export function hitsNeeded(headD: number): number {
  return T.hits[sizeTier(headD)];
}

/** 한 번 맞았다: 마지막으로 맞은 지 30초가 넘었으면 다시 1부터. (now = 초) */
export function registerHit(state: { hits: number; hitAt: number }, now: number): number {
  const hits = now - state.hitAt > T.resetSeconds ? 1 : state.hits + 1;
  state.hits = hits;
  state.hitAt = now;
  return hits;
}

/** 눈사람 머리(맨 위 눈덩이)의 화면 자리: 가운데 (x, 바닥에서 높이 z)와 반지름 */
export function headOf(s: { x: number; y: number; tiers: readonly number[] }): { x: number; y: number; z: number; r: number } {
  const top = s.tiers.length - 1;
  const r = s.tiers[top] / 2;
  return { x: s.x, y: s.y, z: tierBase(s.tiers, top) + r, r };
}

/** 눈덩이(바닥 x·y, 높이 z)가 눈사람의 어디에 맞았나: 머리 / 몸통 / 안 맞음. 깊이(위아래)가 비슷할 때만 맞는다 */
export function hitPart(ball: { x: number; y: number; z: number }, s: { x: number; y: number; tiers: readonly number[]; headless?: boolean }): 'head' | 'body' | null {
  if (Math.abs(ball.y - s.y) > T.depthReach) return null;
  const head = headOf(s);
  if (!s.headless && Math.hypot(ball.x - head.x, ball.z - head.z) <= head.r + T.ballSize / 2) return 'head';
  // 몸통: 아래 단들의 원
  for (let i = 0; i < s.tiers.length - (s.headless ? 0 : 1); i++) {
    const r = s.tiers[i] / 2;
    if (Math.hypot(ball.x - s.x, ball.z - (tierBase(s.tiers, i) + r)) <= r) return 'body';
  }
  return null;
}

/** 눈덩이가 캐릭터(발밑 x·y, 키 32)의 어디에 맞았나 */
export function hitPerson(ball: { x: number; y: number; z: number }, p: { x: number; y: number }, lift = 0): 'head' | 'body' | null {
  if (Math.abs(ball.y - p.y) > T.depthReach || Math.abs(ball.x - p.x) > T.personHalfWidth) return null;
  const z = ball.z - lift;
  if (z < 0 || z > T.personHeight) return null;
  return z >= T.personHeadFrom ? 'head' : 'body';
}

export interface KnockResult {
  /** 남은 몸통: 단들과 몸통에 남는 소품 (목·몸통·팔) */
  tiers: number[];
  props: AttachedProp[];
  /** 떨어진 머리 눈덩이: 지름과 얼굴 (머리·얼굴 소품, 모자가 그대로 붙어 간다) */
  head: { d: number; face: BallFace };
  /** 머리가 굴러가는 쪽(1 / -1)과 거리 (크기에 따라 10~40px) */
  dir: number;
  distance: number;
}

const hash = (seed: number, n: number): number => {
  const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * 머리가 떨어진다. 3단 눈사람은 맨 위만 떨어진다. 굴러가는 쪽·거리·엎어지는지는 눈사람 시드로 정해져
 * 어느 화면에서나 같다.
 */
export function knockOff(s: { tiers: readonly number[]; seed: number; props: readonly AttachedProp[]; hat: SnowmanHat | null }, fromDir: number): KnockResult {
  const d = s.tiers[s.tiers.length - 1];
  const goes = (p: PropId) => PROP_SLOT[p] === 'head' || PROP_SLOT[p] === 'face';
  const size = Math.min(1, d / T.bigHead);
  return {
    tiers: s.tiers.slice(0, -1),
    props: s.props.filter((a) => !goes(a.p)).map((a) => ({ ...a })),
    head: {
      d,
      face: {
        seed: s.seed,
        props: s.props.filter((a) => goes(a.p)).map((a) => ({ ...a })),
        hat: s.hat ? { ...s.hat } : null,
        // 얼굴이 땅을 보고 멈출 수도 있다
        down: hash(s.seed, 77 + s.tiers.length) < T.faceDownChance,
      },
    },
    // 맞은 반대쪽으로 굴러간다
    dir: fromDir >= 0 ? 1 : -1,
    distance: Math.round(T.rollMin + (T.rollMax - T.rollMin) * size),
  };
}

/** 얼굴이 붙은 머리를 몸통에 다시 올리면: 그 얼굴(시드)·소품·모자가 그대로 돌아온다 */
export function restoreFace(body: { props: readonly AttachedProp[] }, face: BallFace): { seed: number; props: AttachedProp[]; hat: SnowmanHat | null } {
  const taken = new Set(face.props?.map((a) => PROP_SLOT[a.p]) ?? []);
  const kept = body.props.filter((a) => !taken.has(PROP_SLOT[a.p])).map((a) => ({ ...a }));
  return { seed: face.seed, props: [...kept, ...(face.props ?? []).map((a) => ({ ...a }))].slice(0, 5), hat: face.hat ? { ...face.hat } : null };
}

/** 몸통만 남은 눈사람의 높이 (머리 없는 채) — 그림·힌트 자리에 쓴다 */
export function bodyHeight(tiers: readonly number[]): number {
  return tiers.length === 1 ? tiers[0] : snowmanHeight(tiers);
}

/** 머리 없는 눈사람도 한 단이면 눈사람으로 남을 수 있다 */
export const MIN_BODY_TIERS = 1;
export const MAX_TIERS = SNOWMAN.maxTiers;
