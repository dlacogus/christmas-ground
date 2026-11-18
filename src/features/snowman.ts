// 눈덩이와 눈사람 (규칙과 목록 — DOM 없음, 테스트 가능).
//   눈 위에서 눈덩이를 굴리면 걷은 눈만큼 커진다 (처음엔 빨리, 클수록 천천히, 최대 지름 64px).
//   굴리던 눈덩이를 놓여 있는 눈덩이에 대고 놓으면 작은 쪽이 큰 쪽 위로 올라가 눈사람이 된다 (최대 3단).
//   눈사람은 전체 높이에 따라 미니 / 중간 / 엄청 큰 눈사람으로 나뉘고, 시드로 얼굴·팔·장식이 조금씩 다르다.
// 눈덩이·눈사람 목록(위치, 크기들, 시드, 만든 사람)은 createSnowWorld 한 곳에 모은다 — 나중에 서버로 공유하면
// 친구 눈사람도 보이고, 친구가 굴린 눈덩이에 내가 올릴 수도 있다 (눈덩이의 pushers = 같이 미는 사람 수만큼 빨리 굴러간다).
// 그리기는 snowmanDraw.ts, 조작은 snowmanPlay.ts.

import { COPUSH, SNOWBALL as B, SNOWMAN as M } from '../constants';
import type { Maker } from '../shared/protocol';
import { OBSTACLES, WALK_AREA, rectsOverlap, type Rect } from '../world';

// ───────────── 눈덩이 ─────────────

export type SizeTier = 'small' | 'medium' | 'large';

/** 지름에 따른 크기 구간 */
export function sizeTier(d: number): SizeTier {
  return d <= B.smallMax ? 'small' : d <= B.mediumMax ? 'medium' : 'large';
}

/** 굴리는 속도 (px/초): 작음 50, 중간 30, 큼은 최대 크기에서 15까지 느려진다. pushers명이 같이 밀면 그만큼 빨라진다 */
export function rollSpeed(d: number, pushers = 1): number {
  const tier = sizeTier(d);
  const base =
    tier === 'small'
      ? B.smallSpeed
      : tier === 'medium'
        ? B.mediumSpeed
        : B.mediumSpeed - ((B.mediumSpeed - B.largeMinSpeed) * (d - B.mediumMax)) / (B.maxSize - B.mediumMax);
  return base * Math.max(1, pushers);
}

/**
 * 눈을 걷은 넓이(px²)만큼 커진 지름. 걷은 눈이 부피에 더해지는 식이라 클수록 천천히 커진다.
 * boost = 지붕 눈 더미 위에서는 2. 최대 지름을 넘지 않는다.
 */
export function grow(d: number, area: number, boost = 1): number {
  if (area <= 0) return d;
  return Math.min(B.maxSize, Math.sqrt(d * d + (B.growth * area * boost) / d));
}

/** 눈덩이가 바닥에서 눈을 걷는 자국의 반폭과 반깊이 */
export function footprint(d: number): { halfW: number; halfD: number } {
  return { halfW: Math.max(1, (d * B.footprintWidth) / 2), halfD: Math.max(B.minDepth, d * B.clearDepth) / 2 };
}

/** 눈덩이가 바닥을 차지하는 상자 (발밑 기준: (x, y) = 바닥에 닿은 맨 아래 가운데) */
export function ballRect(x: number, y: number, d: number): Rect {
  const depth = Math.max(B.minDepth, d * B.footprintDepth);
  return { x: x - d * 0.4, y: y - depth, w: d * 0.8, h: depth };
}

export interface Ball {
  kind: 'ball';
  id: number;
  /** 바닥에 닿은 맨 아래 가운데 */
  x: number;
  y: number;
  /** 지름 */
  d: number;
  /** 굴러간 각도 (라디안) — 표면 얼룩이 이만큼 돌아간다 */
  roll: number;
  seed: number;
  /** 만든 사람 */
  owner: string;
  /** 놓여 있던 시간 (굴리는 동안은 0) */
  idle: number;
  /** 같이 미는 사람 수 (나중에 친구와 함께 밀면 2) */
  pushers: number;
  /** 서버와 주고받는 id */
  netId: string;
  /** 다른 사람이 굴리는 중이면 그 사람 id (내가 이어 굴릴 수 없다) */
  heldBy: string | null;
  /** 서버에 알렸나 (놓았거나, 서버에서 받은 것) */
  synced: boolean;
  /** 처음 만든 사람 + 이어서 굴린 사람들 */
  makers: Maker[];
  /** 지금 밀고 있는 사람들의 접속 id (먼저 잡은 순서, 최대 2명) */
  holders: string[];
}

// ───────────── 둘이 같이 밀기 ─────────────

export interface PushDir {
  x: number;
  y: number;
}

/**
 * 두 사람의 방향 입력을 더한다. 같은 쪽으로 밀면 2배, 한 사람만 밀면 1배, 서로 반대면 제자리에서 버틴다(stuck).
 * 돌려주는 (x, y)는 굴러갈 방향(단위 벡터), factor는 속도 배율 (0~2).
 */
export function combinePush(a: PushDir | null, b: PushDir | null): { x: number; y: number; factor: number; stuck: boolean } {
  const unit = (d: PushDir | null) => {
    const len = d ? Math.hypot(d.x, d.y) : 0;
    return len > 0 ? { x: d!.x / len, y: d!.y / len } : null;
  };
  const ua = unit(a);
  const ub = unit(b);
  const sx = (ua?.x ?? 0) + (ub?.x ?? 0);
  const sy = (ua?.y ?? 0) + (ub?.y ?? 0);
  const size = Math.hypot(sx, sy);
  if (size < COPUSH.stuckBelow) return { x: 0, y: 0, factor: 0, stuck: ua !== null && ub !== null };
  return { x: sx / size, y: sy / size, factor: Math.min(COPUSH.maxPushers, size), stuck: false };
}

/** 만든 사람을 적는다 (같은 닉네임은 한 번만, 최대 4명). 새로 적었으면 true */
export function addMaker(makers: Maker[], maker: Maker): boolean {
  if (makers.some((m) => m.name === maker.name) || makers.length >= COPUSH.maxMakers) return false;
  makers.push({ name: maker.name, scarf: maker.scarf });
  return true;
}

/** 합쳐진 눈덩이들의 만든 사람을 모은다 */
export function mergeMakers(...lists: readonly (readonly Maker[])[]): Maker[] {
  const out: Maker[] = [];
  for (const list of lists) for (const m of list) addMaker(out, m);
  return out;
}

// ───────────── 눈사람 ─────────────

export type SnowmanKind = 'mini' | 'medium' | 'giant';

/** 전체 높이: 위 단은 제 지름의 sink만큼 아래 단에 파묻힌다 */
export function snowmanHeight(tiers: readonly number[]): number {
  return tiers.reduce((h, d, i) => h + (i === 0 ? d : d * (1 - M.sink)), 0);
}

/** i번째 단의 바닥(맨 아래)이 눈사람 발밑에서 얼마나 위에 있나 */
export function tierBase(tiers: readonly number[], i: number): number {
  let h = 0;
  for (let k = 0; k < i; k++) h += k === 0 ? tiers[0] : tiers[k] * (1 - M.sink);
  return i === 0 ? 0 : h - tiers[i] * M.sink;
}

/** 전체 높이로 나눈 종류: 미니(24px 미만) / 중간 / 엄청 큼(64px 넘게) */
export function snowmanKind(height: number): SnowmanKind {
  return height < M.miniBelow ? 'mini' : height > M.giantFrom ? 'giant' : 'medium';
}

/** 발밑 y에 세웠을 때 화면 위로 잘리지 않나 */
export function fitsScreen(baseY: number, tiers: readonly number[]): boolean {
  return baseY - snowmanHeight(tiers) >= M.topMargin;
}

/** 눈덩이 둘을 합친다: 작은 쪽이 위로 (같으면 굴리던 쪽이 위). [아래, 위] */
export function stackBalls(rolling: number, lying: number): number[] {
  return rolling > lying ? [rolling, lying] : [lying, rolling];
}

/** 눈사람 위에 d를 올린 단들. 올릴 수 없으면 null (이미 3단, 맨 위보다 작지 않음, 화면을 넘음) */
export function stackOnSnowman(tiers: readonly number[], d: number, baseY: number): number[] | null {
  if (tiers.length >= M.maxTiers) return null;
  if (d >= tiers[tiers.length - 1]) return null;
  const next = [...tiers, d];
  return fitsScreen(baseY, next) ? next : null;
}

export interface Snowman {
  kind: 'snowman';
  id: number;
  /** 발밑 (맨 아래 눈덩이가 바닥에 닿은 가운데) */
  x: number;
  y: number;
  /** 아래 → 위 눈덩이 지름 */
  tiers: number[];
  seed: number;
  owner: string;
  /** 만들어진 순서 (작을수록 오래됨) */
  order: number;
  /** 녹는 중이면 0~1 진행, 아니면 -1 */
  melt: number;
  /** 맨 위 눈덩이가 흔들흔들하는 남은 시간 */
  wobble: number;
  /** 지붕 눈이 머리에 얹혔나 */
  capped: boolean;
  /** 살아 있던 시간 (새가 앉는 박자) */
  age: number;
  netId: string;
  synced: boolean;
  /** 눈덩이를 굴린 사람들 (2명 이상이면 줄무늬 목도리를 두른다) */
  makers: Maker[];
}

/** 시드로 정해지는 생김새 (눈사람마다 조금씩 다르다) */
export interface SnowmanLook {
  /** 코가 향하는 쪽 */
  face: -1 | 1;
  /** 눈 간격 배율 (0.8~1.2), 코 길이 배율, 팔이 올라간 각도(라디안) */
  eyeGap: number;
  nose: number;
  armAngle: number;
  scarf: number | null;
  /** 같이 만든 눈사람: 만든 사람들 목도리 색 줄무늬 (없으면 null) */
  stripes: number[] | null;
  bucket: boolean;
  buttons: number;
}

function hash(seed: number, k: number): number {
  const n = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function snowmanLook(seed: number, kind: SnowmanKind, makers: readonly Maker[] = []): SnowmanLook {
  const chance = kind === 'giant' ? M.giantAccessoryChance : kind === 'mini' ? 0 : M.accessoryChance;
  const scarf = hash(seed, 5) < chance;
  return {
    face: hash(seed, 1) < 0.5 ? -1 : 1,
    eyeGap: 0.8 + hash(seed, 2) * 0.4,
    nose: 0.8 + hash(seed, 3) * 0.4,
    armAngle: 0.2 + hash(seed, 4) * 0.6,
    scarf: scarf ? Math.floor(hash(seed, 6) * 3) : null,
    // 굴린 사람이 2명 이상이면 목도리를 꼭 두르고, 그 목도리는 만든 사람들 목도리 색 줄무늬다
    stripes: makers.length >= 2 ? makers.map((m) => m.scarf) : null,
    // 엄청 큰 눈사람은 목도리나 양동이 모자 (둘 다일 수도)
    bucket: hash(seed, 7) < chance,
    buttons: kind === 'giant' ? 3 : kind === 'medium' ? 2 : 0,
  };
}

/** 눈사람이 바닥을 차지하는 상자 */
export function snowmanRect(s: { x: number; y: number; tiers: readonly number[] }): Rect {
  return ballRect(s.x, s.y, s.tiers[0]);
}

// ───────────── 목록 ─────────────

export type SnowThing = Ball | Snowman;

/** 저장하는 모양 (localStorage, 나중에는 서버) */
export interface SavedSnowman {
  x: number;
  y: number;
  tiers: number[];
  seed: number;
  owner: string;
  makers?: Maker[];
}

export interface SnowWorld {
  readonly balls: Ball[];
  readonly snowmen: Snowman[];
  addBall(x: number, y: number, d: number, owner: string, roll?: number): Ball;
  removeBall(ball: Ball): void;
  /** 새 눈사람을 세운다. 12개를 넘으면 가장 오래된 것이 녹기 시작한다 */
  addSnowman(x: number, y: number, tiers: number[], owner: string, seed?: number): Snowman;
  /** 놓아둔 눈덩이는 5분 뒤 녹고, 녹는 눈사람은 10초에 걸쳐 사라진다. rolling = 지금 굴리는 눈덩이 (안 늙는다) */
  update(dt: number, rolling?: Ball | null): void;
  /** 걸어서 못 지나가는 상자들 (지름 12px 넘는 눈덩이, 눈사람). except = 지금 굴리는 눈덩이 */
  obstacles(except?: Ball | null): Rect[];
  /** 이 상자와 겹치는 눈덩이·눈사람 (except 빼고) */
  touching(rect: Rect, except?: SnowThing | null): SnowThing | null;
  /** owner가 만든 눈사람들 (저장용) */
  saved(owner: string): SavedSnowman[];
  load(list: readonly SavedSnowman[]): void;
  /** 서버 id로 찾는다 */
  findNet(netId: string): SnowThing | null;
  /** 서버에서 받은 눈덩이를 넣거나 고친다. heldBy = 굴리는 사람 (놓인 것이면 null), idle = 놓여 있던 시간(초) */
  upsertBall(netId: string, data: { x: number; y: number; d: number; roll: number; seed: number; owner: string; makers?: Maker[] }, heldBy: string | null, idle?: number): Ball;
  /** 서버에서 받은 눈사람을 넣거나 고친다 */
  upsertSnowman(netId: string, data: SavedSnowman): Snowman;
  /** 서버에서 없어졌다: 눈덩이는 바로, 눈사람은 녹기 시작한다 */
  removeNet(netId: string): void;
}

export function createSnowWorld(random: () => number = Math.random): SnowWorld {
  const balls: Ball[] = [];
  const snowmen: Snowman[] = [];
  let nextId = 1;
  let order = 0;
  /** 이 접속에서 만든 것들의 id 앞머리 (다른 사람 것과 겹치지 않게) */
  const prefix = Math.floor(random() * 0xffffff).toString(36) + Date.now().toString(36).slice(-4);

  const world: SnowWorld = {
    balls,
    snowmen,
    addBall(x, y, d, owner, roll = 0) {
      const id = nextId++;
      const ball: Ball = { kind: 'ball', id, x, y, d, roll, seed: Math.floor(random() * 1e6), owner, idle: 0, pushers: 1, netId: `${prefix}-${id}`, heldBy: null, synced: false, makers: [], holders: [] };
      balls.push(ball);
      return ball;
    },
    removeBall(ball) {
      const i = balls.indexOf(ball);
      if (i >= 0) balls.splice(i, 1);
    },
    addSnowman(x, y, tiers, owner, seed = Math.floor(random() * 1e6)) {
      const id = nextId++;
      const snowman: Snowman = { kind: 'snowman', id, x, y, tiers, seed, owner, order: order++, melt: -1, wobble: 0, capped: false, age: 0, netId: `${prefix}-${id}`, synced: false, makers: [] };
      snowmen.push(snowman);
      // 상한을 넘으면 (아직 안 녹는 것 가운데) 가장 오래된 것부터 녹는다
      const standing = snowmen.filter((s) => s.melt < 0);
      const over = standing.length - M.maxCount;
      if (over > 0) {
        standing.sort((a, b) => a.order - b.order);
        for (let k = 0; k < over; k++) standing[k].melt = 0;
      }
      return snowman;
    },
    update(dt, rolling = null) {
      for (let k = balls.length - 1; k >= 0; k--) {
        const ball = balls[k];
        if (ball === rolling || ball.heldBy) {
          ball.idle = 0;
          continue;
        }
        ball.idle += dt;
        // 5분 지나면 녹아 작아지다 사라진다
        if (ball.idle > B.idleSeconds) {
          ball.d -= (B.maxSize / B.meltSeconds) * dt * Math.max(0.2, ball.d / B.maxSize);
          if (ball.d < 2) balls.splice(k, 1);
        }
      }
      for (let k = snowmen.length - 1; k >= 0; k--) {
        const s = snowmen[k];
        s.age += dt;
        s.wobble = Math.max(0, s.wobble - dt);
        if (s.melt < 0) continue;
        s.melt += dt / M.meltSeconds;
        if (s.melt >= 1) snowmen.splice(k, 1);
      }
    },
    obstacles(except = null) {
      const rects: Rect[] = [];
      for (const b of balls) if (b !== except && b.d > B.obstacleSize) rects.push(ballRect(b.x, b.y, b.d));
      for (const s of snowmen) if (s.melt < 0.6) rects.push(snowmanRect(s));
      return rects;
    },
    touching(rect, except = null) {
      for (const b of balls) if (b !== except && rectsOverlap(rect, ballRect(b.x, b.y, b.d))) return b;
      for (const s of snowmen) if (s !== except && s.melt < 0 && rectsOverlap(rect, snowmanRect(s))) return s;
      return null;
    },
    saved(owner) {
      return snowmen.filter((s) => s.owner === owner && s.melt < 0).map((s) => ({ x: s.x, y: s.y, tiers: [...s.tiers], seed: s.seed, owner: s.owner }));
    },
    findNet(netId) {
      return balls.find((b) => b.netId === netId) ?? snowmen.find((s) => s.netId === netId) ?? null;
    },
    upsertBall(netId, data, heldBy, idle = 0) {
      let ball = balls.find((b) => b.netId === netId);
      if (!ball) {
        ball = world.addBall(data.x, data.y, data.d, data.owner, data.roll);
        ball.netId = netId;
      }
      Object.assign(ball, { x: data.x, y: data.y, d: data.d, roll: data.roll, seed: data.seed, owner: data.owner, heldBy, idle, synced: true });
      if (data.makers) ball.makers = data.makers.map((m) => ({ ...m }));
      if (!heldBy) ball.holders = [];
      return ball;
    },
    upsertSnowman(netId, data) {
      let snowman = snowmen.find((s) => s.netId === netId);
      if (!snowman) {
        snowman = world.addSnowman(data.x, data.y, [...data.tiers], data.owner, data.seed);
        snowman.netId = netId;
      }
      Object.assign(snowman, { x: data.x, y: data.y, tiers: [...data.tiers], seed: data.seed, owner: data.owner, synced: true });
      if (data.makers) snowman.makers = data.makers.map((m) => ({ ...m }));
      return snowman;
    },
    removeNet(netId) {
      const i = balls.findIndex((b) => b.netId === netId);
      if (i >= 0) balls.splice(i, 1);
      const snowman = snowmen.find((s) => s.netId === netId);
      if (snowman && snowman.melt < 0) snowman.melt = 0;
    },
    load(list) {
      for (const item of list) {
        const ok =
          Number.isFinite(item.x) &&
          Number.isFinite(item.y) &&
          Array.isArray(item.tiers) &&
          item.tiers.length >= 2 &&
          item.tiers.length <= M.maxTiers &&
          item.tiers.every((d) => Number.isFinite(d) && d >= 2 && d <= B.maxSize);
        if (ok) world.addSnowman(item.x, item.y, [...item.tiers], String(item.owner), Number(item.seed) || 0);
      }
    },
  };
  return world;
}

/** 이 자리에 눈덩이가 놓일 수 있나: 바닥 띠 안이고 장애물과 겹치지 않는다 (다른 눈덩이·눈사람은 따로 본다) */
export function ballFits(x: number, y: number, d: number): boolean {
  const r = ballRect(x, y, d);
  if (r.x < WALK_AREA.x || r.x + r.w > WALK_AREA.x + WALK_AREA.w || r.y < WALK_AREA.y || r.y + r.h > WALK_AREA.y + WALK_AREA.h) return false;
  return !OBSTACLES.some((o) => rectsOverlap(r, o));
}

// ───────────── 저장 ─────────────

/** 내 눈사람을 저장한다 (저장소를 못 쓰면 이번 접속 동안만 남는다) */
export function saveSnowmen(list: readonly SavedSnowman[]): void {
  try {
    localStorage.setItem(M.storageKey, JSON.stringify(list));
  } catch {
    // 저장하지 못해도 그대로 동작한다
  }
}

export function loadSnowmen(): SavedSnowman[] {
  try {
    const raw = localStorage.getItem(M.storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedSnowman[]) : [];
  } catch {
    return [];
  }
}
