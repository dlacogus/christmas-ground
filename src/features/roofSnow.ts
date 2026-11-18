// 지붕에 쌓인 눈이 실제처럼 떨어진다.
//
// 지붕 눈은 가로 1px 칸마다 두께를 갖는 높이 지도다. 가득 차면(쌓인 양 level = 1) 지붕 폭의 30~70% 구간이
// 한 덩어리 눈 판으로 경사를 따라 미끄러진다: 처음엔 느리게 들썩이다 → 경사만큼 가속 → 처마를 넘은 앞부분이 아래로 휘어지다
// → 덩어리로 끊어져 → 가루를 날리며 떨어지고 → 바닥에서 퍼지며 더미(이것도 칸별 높이)가 된다.
// 처마 밑에 6초 가만히 서 있으면 머리 위 눈이 한 덩어리 '툭' 떨어진다.
// 눈 모자·눈사람은 '범위 안에 있었나'가 아니라 실제 덩어리가 캐릭터 몸에 닿았을 때, 닿은 눈의 양으로 정한다.
//
// createRoofSnow — 시뮬레이션(순수 계산, 테스트 가능) + 그리기. 일어난 일은 RoofEvent로 내보낸다 (소리·맞은 캐릭터가 받는다).
//   나중에 서버가 시간을 알려주면 startSlide(지붕 번호)를 그때 부르면 된다 (지금은 level이 차면 스스로 부른다).
// createSnowHits — 맞은 캐릭터: 눈 모자, 눈사람, 털어내기.

import { layerOffsetX, type Camera } from '../camera';
import { CHARACTER, LAYER_FACTORS, MARKET_HUT as M, ROOF_SNOW as R, ROOF_SNOW_COLORS as C, SCENERY_SEED, SCREEN_WIDTH } from '../constants';
import { HUT_BASE_Y, hutRoofHeight } from '../props/marketHut';
import { fillPixelEllipse } from '../props/pixel';
import { createRng, randInt, randRange } from '../random';
import { HUTS, SNOW_ROOF_HUTS, eaveZone, type Rect } from '../world';
import type { DepthDrawable } from '../zones/zone';

// ───────────── 지붕 모양 ─────────────

type Hut = (typeof HUTS)[number];

/** 처마 양 끝 x와 처마 높이 y */
export function eaveLine(hut: Hut): { left: number; right: number; y: number } {
  const wallTop = HUT_BASE_Y - hut.wall;
  const left = Math.round(hut.x - hut.w / 2);
  if (hut.kind === 'kiosk') {
    const roofTop = wallTop - hutRoofHeight(hut);
    return { left: left - 2, right: left + hut.w + 2, y: roofTop + M.snowThickness - 1 };
  }
  const half = Math.round(hut.w / 2 + M.roofOverhang);
  return { left: hut.x - half, right: hut.x + half, y: wallTop - 1 };
}

/** x 열에서 지붕(그려 둔 눈) 윗면 y (지붕 밖이면 null) */
export function roofTopAt(hut: Hut, x: number): number | null {
  const e = eaveLine(hut);
  if (x < e.left || x >= e.right) return null;
  const wallTop = HUT_BASE_Y - hut.wall;
  const roof = hutRoofHeight(hut);
  const apex = wallTop - roof;
  const halfE = hut.w / 2 + M.roofOverhang;
  const d = Math.abs(x + 0.5 - hut.x) / halfE;
  if (hut.kind === 'gable') return apex + Math.max(0, Math.ceil(d * roof) - 1);
  if (hut.kind === 'pavilion') return apex + Math.max(0, Math.ceil(roof * d ** (1 / 1.6)) - 1);
  return apex - 2;
}

/** 지붕 경사의 sin, cos (꼭대기에서 처마까지 평균). 평평한 지붕도 조금은 미끄러진다 */
export function roofSlope(hut: Hut): { sin: number; cos: number } {
  const rise = hut.kind === 'gable' || hut.kind === 'pavilion' ? hutRoofHeight(hut) : 0;
  const run = hut.w / 2 + M.roofOverhang;
  const len = Math.hypot(rise, run);
  const sin = Math.max(R.minSlope, rise / len);
  return { sin, cos: Math.sqrt(1 - sin * sin) };
}

/** 눈의 양(px²) → 덩어리 크기(px) */
export function chunkSize(mass: number): number {
  return Math.max(R.chunkMinSize, Math.min(R.chunkMaxSize, Math.round(Math.sqrt(mass) * R.sizePerRootMass)));
}

// ───────────── 덩어리 모양 (미리 만들어 둔다) ─────────────

/** 울퉁불퉁한 눈 뭉치: [dx, dy, 그늘(1)·윗면(0)] 묶음. 크기별·각도별 */
const SHAPES = new Map<number, Int8Array>();

function chunkShape(size: number, angle: number): Int8Array {
  const key = size * 16 + angle;
  const cached = SHAPES.get(key);
  if (cached) return cached;
  const rot = (Math.PI * 2 * angle) / R.angles;
  const half = size / 2;
  const cells: number[] = [];
  for (let px = 0; px < size; px++) {
    const rows: number[] = [];
    for (let py = 0; py < size; py++) {
      const u = px + 0.5 - half;
      const v = py + 0.5 - half;
      // 돌린 좌표에서 살짝 납작하고 가장자리가 들쭉날쭉한 덩이
      const a = Math.atan2(v, u) - rot;
      const dist = Math.hypot(u, v);
      const squash = Math.hypot(Math.cos(a), Math.sin(a) / 0.78);
      const lump = 1 + 0.16 * Math.sin(3 * a + size) + 0.1 * Math.sin(5 * a + size * 2.3);
      if (dist * squash <= half * lump) rows.push(py);
    }
    // 열마다 아래쪽 40%는 그늘
    const shadeFrom = rows.length - Math.max(1, Math.round(rows.length * 0.4));
    rows.forEach((py, k) => cells.push(px - Math.floor(half), py - Math.floor(half), rows.length > 1 && k >= shadeFrom ? 1 : 0));
  }
  const shape = Int8Array.from(cells);
  SHAPES.set(key, shape);
  return shape;
}

// ───────────── 시뮬레이션 ─────────────

/** 지붕 아래를 지나는 사람 (지금은 내 캐릭터 하나) */
export interface Person {
  id: string;
  /** 발밑 */
  x: number;
  y: number;
  moving: boolean;
  /** 맞을 수 있나 (회전목마·스케이트 중이면 false) */
  canBeHit: boolean;
}

export type RoofEvent =
  /** 눈 판이 미끄러지기 시작했다 */
  | { type: 'slide'; roof: number }
  /** 덩어리가 바닥에 닿았다 */
  | { type: 'land'; roof: number; x: number; y: number; size: number }
  /** 처마 밑에 오래 서 있어서 머리 위 눈이 흔들리기 시작했다 */
  | { type: 'drip'; roof: number; id: string; x: number; y: number }
  /** 덩어리가 몸에 닿았다: 눈 모자 */
  | { type: 'hat'; id: string; x: number; y: number }
  /** 닿은 눈이 많다: 눈사람 (afterHat = 이번에 이미 눈 모자를 쓴 뒤) */
  | { type: 'snowman'; id: string; x: number; y: number; afterHat: boolean };

/** 미끄러지는 눈 판 */
export interface Slab {
  /** 미끄러지는 쪽 (-1 왼쪽 처마로, 1 오른쪽 처마로) */
  dir: -1 | 1;
  /** 그쪽 처마 끝 칸의 x */
  edge: number;
  /** 칸별 두께 (0번 = 처마 끝에 있던 칸) */
  th: number[];
  /** 아직 붙어 있는 첫 칸 (앞쪽은 끊어져 떨어졌다) */
  lead: number;
  /** 가로로 밀려난 거리 (px) */
  s: number;
  /** 경사를 따라 미끄러지는 속도 (px/초) */
  v: number;
  age: number;
  /** 처마 밖으로 이만큼 나오면 끊어진다 */
  breakLen: number;
  dustTimer: number;
}

export interface Roof {
  hut: Hut;
  zone: Rect;
  /** 지붕 칸: left = 0번 칸의 x */
  left: number;
  eaveY: number;
  /** 칸별 지붕 윗면 y, 가득 찼을 때 두께, 지금 두께 */
  top: Int16Array;
  cap: Float32Array;
  depth: Float32Array;
  /** 쌓인 양 0~1 (가득 차면 미끄러진다) */
  level: number;
  fillSeconds: number;
  slope: { sin: number; cos: number };
  slabs: Slab[];
  /** '툭' 떨어지기 전 흔들리는 자리 */
  wobble: { x: number; left: number; landY: number } | null;
  /** 바닥 더미: pileLeft = 0번 칸의 x, 칸별 높이, 초당 낮아지는 높이 */
  pileLeft: number;
  pile: Float32Array;
  meltRate: number;
}

type Kind = 'chunk' | 'dust' | 'grain' | 'cloud';

/** 덩어리·알갱이·가루 (풀에서 꺼내 쓴다) */
export interface Particle {
  active: boolean;
  kind: Kind;
  roof: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 바닥에 닿는 y (떨어지는 깊이) */
  landY: number;
  age: number;
  life: number;
  mass: number;
  size: number;
  /** 기울기 (각도 단계, 소수) */
  angle: number;
  spin: number;
  /** 이 나이에 갈라진다 (-1 = 안 갈라짐) */
  splitAt: number;
  bounced: boolean;
  phase: number;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** 캐릭터 머리 꼭대기 y (발밑 y 기준) */
const headTop = (y: number) => y - CHARACTER.spriteHeight + 1;

export interface RoofSnow {
  readonly roofs: readonly Roof[];
  readonly particles: readonly Particle[];
  /** 눈의 양 장부 (px²): 지붕에서 떨어져 나간 양, 바닥에 닿은 양, 사람에게 닿은 양 */
  readonly stats: { removed: number; landed: number; hit: number };
  /** dt초 지나게 하고, 그동안 일어난 일을 돌려준다 */
  update(dt: number, persons: readonly Person[]): RoofEvent[];
  /** 이 지붕의 눈 판을 미끄러뜨리기 시작한다 (가득 차면 스스로 부른다. 나중에는 서버가 알려준 때에) */
  startSlide(roof: number): void;
  /** ?debug=1: 눈을 가득 채워 바로 떨어뜨린다 */
  fillAndDrop(roof: number): void;
  /** 지금 가장 빠르게 미끄러지는 눈 판 (소리용). 없으면 null */
  sliding(): { speed: number; x: number; y: number } | null;
  /** 지붕 눈(오두막 바로 앞)과 떠 있는 것들(깊이 띠별)을 y 정렬해 그린다 */
  readonly drawables: readonly DepthDrawable[];
  /** 바닥 눈 더미 (바닥 바로 위) */
  drawFloor(ctx: CanvasRenderingContext2D, offsetX: number): void;
  /** ?debug=1: 처마 밑 영역과 쌓인 양 */
  drawDebug(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

export function createRoofSnow(seed = SCENERY_SEED + R.seedOffset): RoofSnow {
  const rng = createRng(seed);
  const stats = { removed: 0, landed: 0, hit: 0 };
  let clock = 0;
  let events: RoofEvent[] = [];

  const roofs: Roof[] = SNOW_ROOF_HUTS.map((hutIndex) => {
    const hut = HUTS[hutIndex];
    const e = eaveLine(hut);
    const n = e.right - e.left;
    const level = randRange(rng, R.startMinLevel, R.startMaxLevel);
    const top = Int16Array.from({ length: n }, (_, i) => roofTopAt(hut, e.left + i)!);
    // 칸마다 조금씩 다르게 쌓여 윗면이 살짝 울퉁불퉁하다. 양 끝은 얇다
    const cap = Float32Array.from({ length: n }, (_, i) => {
      const taper = Math.min(1, (Math.min(i, n - 1 - i) + 1) / R.taperColumns);
      return R.maxDepth * taper * (1 + (rng() * 2 - 1) * R.depthVariation);
    });
    return {
      hut,
      zone: eaveZone(hutIndex),
      left: e.left,
      eaveY: e.y,
      top,
      cap,
      depth: cap.map((c) => c * level),
      level,
      fillSeconds: randRange(rng, R.fillMinSeconds, R.fillMaxSeconds),
      slope: roofSlope(hut),
      slabs: [],
      wobble: null,
      pileLeft: e.left - R.pileSide,
      pile: new Float32Array(n + R.pileSide * 2),
      meltRate: 0,
    };
  });

  // ── 풀
  const pool: Particle[] = Array.from({ length: R.poolSize }, () => ({
    active: false,
    kind: 'dust' as Kind,
    roof: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    landY: 0,
    age: 0,
    life: 0,
    mass: 0,
    size: 1,
    angle: 0,
    spin: 0,
    splitAt: -1,
    bounced: false,
    phase: 0,
  }));
  let cursor = 0;
  let activeCount = 0;

  /** 빈 자리를 꺼낸다. 꽉 찼으면 덩어리만 가루 자리를 빼앗는다 */
  const alloc = (kind: Kind, roof: number, x: number, y: number, vx: number, vy: number, landY: number, life: number): Particle | null => {
    let p: Particle | null = null;
    for (let k = 0; k < pool.length; k++) {
      const q = pool[(cursor + k) % pool.length];
      if (!q.active) {
        p = q;
        cursor = (cursor + k + 1) % pool.length;
        activeCount++;
        break;
      }
    }
    if (!p && kind === 'chunk') p = pool.find((q) => q.kind === 'dust' || q.kind === 'grain') ?? null;
    if (!p) return null;
    p.active = true;
    p.kind = kind;
    p.roof = roof;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.landY = landY;
    p.age = 0;
    p.life = life;
    p.mass = 0;
    p.size = 1;
    p.angle = 0;
    p.spin = 0;
    p.splitAt = -1;
    p.bounced = false;
    p.phase = rng() * Math.PI * 2;
    return p;
  };

  const free = (p: Particle) => {
    p.active = false;
    activeCount--;
  };

  const spawnChunk = (roof: number, mass: number, x: number, y: number, vx: number, vy: number, landY: number, canSplit: boolean) => {
    const p = alloc('chunk', roof, x, y, vx, vy, landY, Infinity);
    if (!p) return;
    p.mass = mass;
    p.size = chunkSize(mass);
    p.angle = rng() * R.angles;
    p.spin = (rng() * 2 - 1) * R.maxSpin;
    if (canSplit && p.size >= R.splitMinSize && rng() < R.splitChance) p.splitAt = randRange(rng, R.splitMinDelay, R.splitMaxDelay);
  };

  const spawnDust = (roof: number, x: number, y: number, landY: number) => {
    alloc('dust', roof, x, y, 0, R.dustFallSpeed * (0.7 + rng() * 0.6), landY, R.dustLife);
  };

  /** 닿은 자리에서 퍼진다: 양옆으로 낮게 튀는 알갱이 + 눈가루 구름 */
  const splash = (roof: number, x: number, y: number, size: number, landY: number, grains: number) => {
    for (let i = 0; i < grains; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      alloc('grain', roof, x, y - 1, side * R.grainSpeed * (0.3 + rng() * 0.7), -R.grainLift * (0.3 + rng() * 0.7), landY, R.grainLife);
    }
    const cloud = alloc('cloud', roof, x, y - 1, 0, -3, landY, R.cloudLife);
    if (cloud) cloud.size = size;
  };

  /** 더미에 언덕을 더한다: 닿은 자리를 가운데로 세모꼴로 퍼진다 */
  const addToPile = (roof: Roof, x: number, mass: number, size: number) => {
    const half = Math.max(2, Math.round((size * R.moundWidthPerSize) / 2));
    const weightSum = (half + 1) * (half + 1);
    const center = Math.round(x) - roof.pileLeft;
    for (let k = -half; k <= half; k++) {
      const i = Math.min(roof.pile.length - 1, Math.max(0, center + k));
      roof.pile[i] += (mass * (half + 1 - Math.abs(k))) / weightSum;
    }
    // 지금 가장 높은 곳이 pileMeltSeconds 뒤에 다 녹게 — 낮은 가장자리부터 사라진다
    let peak = 0;
    for (const h of roof.pile) peak = Math.max(peak, h);
    roof.meltRate = peak / R.pileMeltSeconds;
  };

  // ── 미끄러지기
  const makeSlab = (roof: Roof, dir: -1 | 1, length: number): Slab | null => {
    const n = roof.depth.length;
    const th: number[] = [];
    let total = 0;
    for (let j = 0; j < length; j++) {
      const i = dir < 0 ? j : n - 1 - j;
      const t = Math.max(0, roof.depth[i] - R.residue);
      roof.depth[i] = Math.min(roof.depth[i], R.residue);
      th.push(t);
      total += t;
    }
    if (total <= 0) return null;
    stats.removed += total;
    const count = randInt(rng, R.breakMinCount, R.breakMaxCount);
    return {
      dir,
      edge: dir < 0 ? roof.left : roof.left + n - 1,
      th,
      lead: 0,
      s: 0,
      v: R.creepSpeed,
      age: 0,
      breakLen: Math.max(R.breakMinLength, Math.min(R.breakMaxLength, Math.round(length / count))),
      dustTimer: 0,
    };
  };

  const startSlide = (index: number) => {
    const roof = roofs[index];
    if (roof.slabs.length > 0) return;
    const n = roof.depth.length;
    const half = Math.floor(n / 2);
    // 지붕 폭의 30~70%: 한쪽 경사를 처마에서부터, 절반을 넘는 만큼은 반대쪽 경사 아랫부분
    const ratio = randRange(rng, R.slideMinRatio, R.slideMaxRatio);
    const dir: -1 | 1 = rng() < 0.5 ? -1 : 1;
    const primary = makeSlab(roof, dir, Math.min(half, Math.round(n * Math.min(ratio, 0.5))));
    if (primary) roof.slabs.push(primary);
    if (ratio > 0.5) {
      const other = makeSlab(roof, dir < 0 ? 1 : -1, Math.min(half, Math.round(n * (ratio - 0.5))));
      if (other) roof.slabs.push(other);
    }
    roof.level = 0;
    if (roof.slabs.length > 0) events.push({ type: 'slide', roof: index });
  };

  const landDepth = (roof: Roof) => roof.zone.y + randRange(rng, R.landMinDepth, R.landMaxDepth);

  const updateSlab = (roof: Roof, index: number, slab: Slab, dt: number): boolean => {
    slab.age += dt;
    // 처음에는 느리게 들썩이다가, 경사만큼 가속한다
    if (slab.age >= R.creepSeconds) slab.v += R.gravity * roof.slope.sin * R.slideFactor * dt;
    slab.s += slab.v * roof.slope.cos * dt;
    const surface = roof.top[slab.dir < 0 ? 0 : roof.top.length - 1];
    // 처마 밖으로 나온 칸 수 (d = s - j ≥ 1인 칸)
    const over = Math.min(slab.th.length, Math.floor(slab.s)) - slab.lead;
    const remaining = slab.th.length - slab.lead;
    if (over > 0 && over >= Math.min(slab.breakLen, remaining)) {
      // 휘어진 앞부분이 덩어리로 끊어진다: 미끄러지던 속도를 이어받아 처마 바깥으로 살짝 날아간다
      let mass = 0;
      for (let j = slab.lead; j < slab.lead + over; j++) mass += slab.th[j];
      const mid = slab.s - (slab.lead + over / 2);
      if (mass > 0) {
        spawnChunk(
          index,
          mass,
          slab.edge + slab.dir * mid,
          surface + R.sag * mid * mid - 1,
          slab.dir * slab.v * roof.slope.cos * R.inherit,
          slab.v * roof.slope.sin * R.inherit,
          landDepth(roof),
          true,
        );
      }
      slab.lead += over;
      slab.breakLen = Math.max(R.breakMinLength, Math.min(R.breakMaxLength, slab.breakLen + randInt(rng, -1, 1)));
    }
    // 처마 끝에서 흘러내리는 눈가루
    slab.dustTimer -= dt;
    if (slab.dustTimer <= 0) {
      slab.dustTimer = R.slideDustEvery;
      const tip = Math.max(0, slab.s - slab.lead);
      spawnDust(index, slab.edge + slab.dir * tip, surface + R.sag * tip * tip + 1, landDepth(roof));
    }
    return slab.lead < slab.th.length;
  };

  // ── 사람
  /** 사람마다: 처마 밑에 가만히 서 있던 시간, 마지막 '툭', 이번에 닿은 눈의 양 */
  const still = new Map<string, { roof: number; time: number }>();
  const lastDrip = new Map<string, number>();
  const tally = new Map<string, { mass: number; last: number; stage: 0 | 1 | 2 }>();

  const absorb = (person: Person, chunk: Particle) => {
    stats.hit += chunk.mass;
    let t = tally.get(person.id);
    if (!t || clock - t.last > R.hitWindow) {
      t = { mass: 0, last: clock, stage: 0 };
      tally.set(person.id, t);
    }
    t.mass += chunk.mass;
    t.last = clock;
    if (t.stage < 2 && t.mass >= R.snowmanMass) {
      events.push({ type: 'snowman', id: person.id, x: person.x, y: person.y, afterHat: t.stage === 1 });
      t.stage = 2;
    } else if (t.stage === 0) {
      events.push({ type: 'hat', id: person.id, x: person.x, y: person.y });
      t.stage = 1;
    }
    // 닿은 자리에서 퍼지며 사라진다
    splash(chunk.roof, chunk.x, chunk.y, chunk.size, person.y, 4);
    free(chunk);
  };

  const touches = (p: Person, c: Particle) =>
    p.canBeHit &&
    Math.abs(c.landY - p.y) <= R.hitDepth &&
    Math.abs(c.x - p.x) <= R.hitHalfWidth + c.size / 2 &&
    c.y + c.size / 2 >= headTop(p.y) &&
    c.y <= p.y;

  const updateStanding = (dt: number, persons: readonly Person[]) => {
    for (const p of persons) {
      // 처마 바로 밑 (지붕 칸 아래)에 가만히 서 있나
      const index =
        p.canBeHit && !p.moving
          ? roofs.findIndex((r) => inRect(r.zone, p.x, p.y) && p.x >= r.left && p.x < r.left + r.depth.length)
          : -1;
      if (index < 0) {
        still.delete(p.id);
        continue;
      }
      const s = still.get(p.id);
      const time = s && s.roof === index ? s.time + dt : dt;
      const last = lastDrip.get(p.id);
      // 한 번 맞은 사람은 20초 동안 안 맞는다 (그동안 계속 서 있으면 20초가 지나자마자)
      if (time < R.standSeconds || (last !== undefined && clock - last < R.dripCooldown) || roofs[index].wobble) {
        still.set(p.id, { roof: index, time });
        continue;
      }
      still.set(p.id, { roof: index, time: 0 });
      lastDrip.set(p.id, clock);
      const roof = roofs[index];
      roof.level = Math.max(0, roof.level - R.dripLevelDrop);
      // 머리 바로 위 눈이 잠깐 흔들리다 떨어진다
      roof.wobble = { x: Math.round(p.x), left: R.dripWobbleSeconds, landY: p.y };
      events.push({ type: 'drip', roof: index, id: p.id, x: p.x, y: p.y });
    }
  };

  /** 흔들리던 자리의 눈이 실제로 줄어들며 한 덩어리로 떨어진다 */
  const releaseDrip = (roof: Roof, index: number) => {
    const w = roof.wobble!;
    roof.wobble = null;
    const center = w.x - roof.left;
    let mass = 0;
    for (let k = -R.dripHalfWidth; k <= R.dripHalfWidth && mass < R.dripMaxMass; k++) {
      const i = center + k;
      if (i < 0 || i >= roof.depth.length) continue;
      const take = Math.min(roof.depth[i], R.dripMaxMass - mass);
      roof.depth[i] -= take;
      mass += take;
    }
    stats.removed += mass;
    // 쌓인 양과 상관없이 한 덩어리는 떨어진다
    const ci = Math.min(roof.top.length - 1, Math.max(0, center));
    spawnChunk(index, Math.max(R.dripMinMass, mass), w.x, roof.top[ci] - 1, 0, 0, w.landY, false);
  };

  const updateParticle = (p: Particle, dt: number, persons: readonly Person[]) => {
    p.age += dt;
    if (p.kind === 'dust') {
      p.y += p.vy * dt;
      if (p.age >= p.life || p.y >= p.landY) free(p);
      return;
    }
    if (p.kind === 'cloud') {
      p.y += p.vy * dt;
      if (p.age >= p.life) free(p);
      return;
    }
    if (p.kind === 'grain') {
      p.vy += R.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life || (p.vy > 0 && p.y >= p.landY)) free(p);
      return;
    }
    // 덩어리: 중력 + 공기 저항, 천천히 기울어진다
    const roof = roofs[p.roof];
    p.vy += R.gravity * dt;
    const keep = Math.max(0, 1 - R.drag * dt);
    p.vx *= keep;
    p.vy *= keep;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;
    // 뒤로 눈가루 꼬리
    if (Math.floor(p.age / R.trailEvery) !== Math.floor((p.age - dt) / R.trailEvery)) spawnDust(p.roof, p.x, p.y - p.size / 2, p.landY);
    // 큰 덩어리는 떨어지는 도중 갈라지기도 한다
    if (p.splitAt >= 0 && p.age >= p.splitAt) {
      const pieces = randInt(rng, 2, 3);
      for (let k = 0; k < pieces; k++) {
        const spread = ((k + 0.5) / pieces - 0.5) * 2 * R.splitSpread;
        spawnChunk(p.roof, p.mass / pieces, p.x + spread * 0.1, p.y, p.vx + spread, p.vy * (0.9 + rng() * 0.2), p.landY + randRange(rng, -1, 1), false);
      }
      free(p);
      return;
    }
    // 실제로 몸에 닿았나
    for (const person of persons) {
      if (touches(person, p)) {
        absorb(person, p);
        return;
      }
    }
    if (p.y + p.size / 2 < p.landY) return;
    // 작은 덩어리는 한 번 낮게 튀었다 멈춘다
    if (p.size <= R.bounceMaxSize && !p.bounced) {
      p.bounced = true;
      p.y = p.landY - p.size / 2;
      p.vy = -Math.abs(p.vy) * R.bounce;
      p.vx *= 0.5;
      p.spin *= 0.5;
      splash(p.roof, p.x, p.landY, p.size, p.landY, 3);
      return;
    }
    // 바닥에서 퍼지며 더미에 더해진다
    stats.landed += p.mass;
    addToPile(roof, p.x, p.mass, p.size);
    const grains = Math.round(R.grainMin + ((R.grainMax - R.grainMin) * (p.size - R.chunkMinSize)) / (R.chunkMaxSize - R.chunkMinSize));
    splash(p.roof, p.x, p.landY, p.size, p.landY, p.bounced ? 2 : grains);
    events.push({ type: 'land', roof: p.roof, x: p.x, y: p.landY, size: p.size });
    free(p);
  };

  // ───────────── 그리기 ─────────────

  const visible = (roof: Roof, ox: number) =>
    roof.pileLeft + roof.pile.length - ox > 0 && roof.pileLeft - ox < SCREEN_WIDTH;

  const drawRoof = (ctx: CanvasRenderingContext2D, roof: Roof, ox: number) => {
    const n = roof.depth.length;
    const wobbleX = roof.wobble ? roof.wobble.x - roof.left : -99;
    const wobbleShift = roof.wobble && Math.floor(roof.wobble.left / 0.05) % 2 === 0 ? 1 : 0;
    ctx.fillStyle = C.top;
    for (let i = 0; i < n; i++) {
      const d = Math.round(roof.depth[i]);
      if (d <= 0) continue;
      const shift = Math.abs(i - wobbleX) <= R.dripHalfWidth ? wobbleShift : 0;
      ctx.fillRect(roof.left + i - ox + shift, roof.top[i] - d, 1, d);
    }
    // 처마 눈 차양: 끝 칸이 많이 쌓이면 지붕 밖으로 둥글게 나온다
    for (const [i, side] of [
      [0, -1],
      [n - 1, 1],
    ] as const) {
      const fill = roof.depth[i] / roof.cap[i];
      if (fill <= R.corniceFrom) continue;
      const r = Math.round(1 + ((R.corniceMaxRadius - 1) * (fill - R.corniceFrom)) / (1 - R.corniceFrom));
      const cx = roof.left + i - ox + side * Math.floor(r / 2);
      ctx.fillStyle = C.shade;
      fillPixelEllipse(ctx, cx, roof.eaveY + 2, r, r);
      ctx.fillStyle = C.top;
      fillPixelEllipse(ctx, cx, roof.eaveY + 1, r, r);
    }
    // 미끄러지는 눈 판: 지붕 위에서는 경사를 따라, 처마를 넘은 부분은 아래로 휘어진다
    for (const slab of roof.slabs) {
      const edgeIndex = slab.dir < 0 ? 0 : n - 1;
      const surface = roof.top[edgeIndex];
      const lift = slab.age < R.creepSeconds && Math.floor(slab.age / R.creepJitterEvery) % 2 === 0 ? 1 : 0;
      for (let j = slab.lead; j < slab.th.length; j++) {
        const t = Math.max(1, Math.round(slab.th[j]));
        const d = slab.s - j;
        const x = Math.round(slab.edge + slab.dir * d);
        if (d < 1) {
          const i = Math.min(n - 1, Math.max(0, x - roof.left));
          const base = roof.top[i] - Math.round(roof.depth[i]);
          ctx.fillStyle = C.top;
          ctx.fillRect(x - ox, base - t - lift, 1, t);
        } else {
          const y = surface + Math.round(R.sag * d * d) - t;
          const white = Math.max(1, Math.ceil(t / 2));
          ctx.fillStyle = C.top;
          ctx.fillRect(x - ox, y, 1, white);
          ctx.fillStyle = C.shade;
          ctx.fillRect(x - ox, y + white, 1, t - white + 1);
        }
      }
    }
  };

  const drawParticle = (ctx: CanvasRenderingContext2D, p: Particle, ox: number) => {
    const x = Math.round(p.x) - ox;
    if (x < -12 || x > SCREEN_WIDTH + 12) return;
    const y = Math.round(p.y);
    if (p.kind === 'chunk') {
      const steps = R.angles;
      const shape = chunkShape(p.size, ((Math.floor(p.angle) % steps) + steps) % steps);
      for (let k = 0; k < shape.length; k += 3) {
        ctx.fillStyle = shape[k + 2] ? C.shade : C.top;
        ctx.fillRect(x + shape[k], y + shape[k + 1], 1, 1);
      }
      return;
    }
    if (p.kind === 'cloud') {
      // 부풀었다가 픽셀 계단으로 엷어진다
      const grow = Math.min(1, p.age / R.cloudGrowSeconds);
      const r = Math.max(1, Math.round(p.size * R.cloudRadiusPerSize * (0.4 + 0.6 * grow)));
      const step = Math.min(R.cloudAlphas.length - 1, Math.floor((p.age / p.life) * R.cloudAlphas.length));
      ctx.globalAlpha = R.cloudAlphas[step];
      ctx.fillStyle = C.cloud;
      fillPixelEllipse(ctx, x, y - Math.round(r / 3), r, Math.max(1, Math.round(r * 0.6)));
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'dust') {
      // 내리는 눈처럼 바람에 좌우로 흔들린다
      const sway = Math.round(Math.sin(clock * R.windHz * Math.PI * 2 + p.phase) * R.windSway * (p.age / p.life));
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = C.dust;
      ctx.fillRect(x + sway, y, 1, 1);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = C.top;
    ctx.fillRect(x, y, 1, 1);
  };

  const roofLayers: DepthDrawable[] = roofs.map((roof) => ({
    footY: HUT_BASE_Y + 0.5,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      if (visible(roof, ox)) drawRoof(ctx, roof, ox);
    },
  }));

  // 떠 있는 것들은 떨어지는 깊이별 띠로 나눠, 그 깊이의 캐릭터와 앞뒤가 맞게 그린다
  const BAND = 4;
  const zoneTop = roofs[0].zone.y;
  const bandCount = Math.ceil(roofs[0].zone.h / BAND) + 1;
  const airLayers: DepthDrawable[] = Array.from({ length: bandCount }, (_, band) => ({
    footY: zoneTop + (band + 1) * BAND - 0.01,
    draw(ctx, camera) {
      if (activeCount === 0) return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      for (const p of pool) {
        if (!p.active) continue;
        const b = Math.min(bandCount - 1, Math.max(0, Math.floor((p.landY - zoneTop) / BAND)));
        if (b === band) drawParticle(ctx, p, ox);
      }
    },
  }));

  return {
    roofs,
    particles: pool,
    stats,
    startSlide,
    fillAndDrop(index) {
      const roof = roofs[index];
      roof.depth.set(roof.cap);
      roof.level = 1;
    },
    sliding() {
      let best: { speed: number; x: number; y: number } | null = null;
      for (const roof of roofs) {
        for (const slab of roof.slabs) {
          if (!best || slab.v > best.speed) best = { speed: slab.v, x: slab.edge, y: roof.eaveY };
        }
      }
      return best;
    },
    update(dt, persons) {
      clock += dt;
      events = [];
      roofs.forEach((roof, index) => {
        // 쌓이기: 칸마다 제 두께까지
        roof.level = Math.min(1, roof.level + dt / roof.fillSeconds);
        for (let i = 0; i < roof.depth.length; i++) {
          if (roof.depth[i] < roof.cap[i]) roof.depth[i] = Math.min(roof.cap[i], roof.depth[i] + (roof.cap[i] * dt) / roof.fillSeconds);
        }
        if (roof.level >= 1 && roof.slabs.length === 0) startSlide(index);
        for (let k = roof.slabs.length - 1; k >= 0; k--) {
          if (!updateSlab(roof, index, roof.slabs[k], dt)) roof.slabs.splice(k, 1);
        }
        if (roof.wobble) {
          roof.wobble.left -= dt;
          if (roof.wobble.left <= 0) releaseDrip(roof, index);
        }
        // 더미는 가장자리(낮은 곳)부터 녹는다
        if (roof.meltRate > 0) {
          let any = false;
          for (let i = 0; i < roof.pile.length; i++) {
            if (roof.pile[i] <= 0) continue;
            roof.pile[i] = Math.max(0, roof.pile[i] - roof.meltRate * dt);
            any ||= roof.pile[i] > 0;
          }
          if (!any) roof.meltRate = 0;
        }
      });
      updateStanding(dt, persons);
      if (activeCount > 0) {
        for (const p of pool) if (p.active) updateParticle(p, dt, persons);
      }
      return events;
    },
    drawables: [...roofLayers, ...airLayers],
    drawFloor(ctx, ox) {
      for (const roof of roofs) {
        if (roof.meltRate <= 0 || !visible(roof, ox)) continue;
        const base = roof.zone.y + Math.round((R.landMinDepth + R.landMaxDepth) / 2);
        for (let i = 0; i < roof.pile.length; i++) {
          const h = Math.round(roof.pile[i]);
          if (h <= 0) continue;
          const x = roof.pileLeft + i - ox;
          const skirt = Math.min(R.pileSkirt, h);
          // 눈밭 위에서도 보이게: 위 테두리, 밝은 몸, 아래 그늘과 그림자
          ctx.fillStyle = C.pileEdge;
          ctx.fillRect(x, base - h - 1, 1, 1);
          ctx.fillStyle = C.top;
          ctx.fillRect(x, base - h, 1, h + skirt);
          ctx.fillStyle = C.shade;
          ctx.fillRect(x, base + skirt, 1, 1);
          ctx.fillStyle = C.pileShadow;
          ctx.fillRect(x + 1, base + skirt + 1, 1, 1);
        }
      }
    },
    drawDebug(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.save();
      ctx.strokeStyle = C.debug;
      ctx.fillStyle = C.debug;
      ctx.font = '7px monospace';
      ctx.textBaseline = 'top';
      roofs.forEach((roof, i) => {
        const z = roof.zone;
        ctx.strokeRect(z.x - ox + 0.5, z.y + 0.5, z.w - 1, z.h - 1);
        ctx.fillText(`EAVE ${i} ${roof.level.toFixed(2)}${roof.slabs.length > 0 ? '!' : ''}`, z.x - ox + 1, z.y + z.h + 1);
      });
      ctx.fillText(`snow bits ${activeCount}/${pool.length}`, 4, 262);
      ctx.restore();
    },
  };
}

// ───────────── 맞은 캐릭터 ─────────────

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface SnowHits {
  /** 눈사람이 되어 못 움직이는 중 */
  readonly frozen: boolean;
  readonly snowman: boolean;
  readonly hat: boolean;
  /** 내 캐릭터가 맞은 일을 받는다. 맞으면 추위 증가량을 알려 준다 */
  handle(events: readonly RoofEvent[], myId: string, onCold?: (amount: number) => void): void;
  update(dt: number): void;
  /** 매 프레임 캐릭터 발밑 (털어낸 눈가루가 튀는 자리) */
  follow(x: number, y: number): void;
  /** 방향키 연타: 눈사람에서 더 빨리 빠져나온다 */
  struggle(taps: number): void;
  /** 몸을 터는 중이면 윗몸을 좌우로 흔드는 px */
  shakeLean(): number;
  /** 눈사람 (캐릭터 대신 그린다) */
  drawSnowman(ctx: CanvasRenderingContext2D, footX: number, footY: number): void;
  /** 캐릭터 위에 얹는 것: 눈 모자, 튀는 눈가루 */
  drawOver(ctx: CanvasRenderingContext2D, footX: number, footY: number, offsetX: number): void;
}

export function createSnowHits(random: () => number = Math.random): SnowHits {
  let hatLeft = 0;
  let snowmanLeft = 0;
  let shakeLeft = 0;
  let time = 0;
  let where = { x: 0, y: 0 };
  const bits: Bit[] = [];

  const burst = (count: number, x: number, y: number, height: number) => {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const speed = R.burstSpeed * (0.4 + random() * 0.6);
      bits.push({ x: x + (random() - 0.5) * 10, y: y - random() * height, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 15, age: 0 });
    }
  };

  return {
    get frozen() {
      return snowmanLeft > 0;
    },
    get snowman() {
      return snowmanLeft > 0;
    },
    get hat() {
      return hatLeft > 0;
    },
    handle(events, myId, onCold) {
      for (const ev of events) {
        if (ev.type === 'hat' && ev.id === myId) {
          // 닿고 남은 눈이 머리 위에 얹힌다
          if (snowmanLeft <= 0) hatLeft = R.hatSeconds;
          onCold?.(R.cold.drip);
        }
        if (ev.type === 'snowman' && ev.id === myId) {
          snowmanLeft = R.snowmanSeconds;
          hatLeft = 0;
          onCold?.(ev.afterHat ? R.cold.fall - R.cold.drip : R.cold.fall);
        }
      }
    },
    update(dt) {
      time += dt;
      if (hatLeft > 0) {
        hatLeft -= dt;
        // 스스로 털어낸다
        if (hatLeft <= 0) {
          shakeLeft = R.shakeSeconds;
          burst(R.burstHat, where.x, where.y - CHARACTER.spriteHeight + 2, 3);
        }
      }
      if (snowmanLeft > 0) {
        snowmanLeft -= dt;
        // 빠져나오며 몸을 부르르
        if (snowmanLeft <= 0) {
          shakeLeft = R.shakeSeconds;
          burst(R.burstSnowman, where.x, where.y, CHARACTER.spriteHeight);
        }
      }
      shakeLeft = Math.max(0, shakeLeft - dt);
      for (let k = bits.length - 1; k >= 0; k--) {
        const b = bits[k];
        b.age += dt;
        b.vy += R.gravity * 0.4 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.age >= R.burstLife) bits.splice(k, 1);
      }
    },
    follow(x, y) {
      where = { x, y };
    },
    struggle(taps) {
      if (snowmanLeft <= 0 || taps <= 0) return;
      snowmanLeft = Math.max(0.0001, snowmanLeft - taps * R.struggleCut);
    },
    shakeLean() {
      if (shakeLeft <= 0) return 0;
      return Math.floor(time / R.shakeEvery) % 2 === 0 ? 1 : -1;
    },
    drawSnowman(ctx, x, y) {
      // 아래 큰 덩이, 위 작은 덩이 (그림자 쪽은 푸르게)
      ctx.fillStyle = C.shade;
      fillPixelEllipse(ctx, x + 1, y - 7, 8, 7);
      fillPixelEllipse(ctx, x + 1, y - 19, 6, 6);
      ctx.fillStyle = C.top;
      fillPixelEllipse(ctx, x, y - 8, 8, 7);
      fillPixelEllipse(ctx, x, y - 20, 6, 6);
      // 눈 두 개만 깜빡
      const blink = time % R.blinkEvery < R.blinkSeconds;
      ctx.fillStyle = C.eye;
      ctx.fillRect(x - 3, y - 21 + (blink ? 1 : 0), 1, blink ? 1 : 2);
      ctx.fillRect(x + 2, y - 21 + (blink ? 1 : 0), 1, blink ? 1 : 2);
    },
    drawOver(ctx, x, y, offsetX) {
      if (hatLeft > 0) {
        const top = headTop(y);
        ctx.fillStyle = C.shade;
        fillPixelEllipse(ctx, x, top + 2, 6, 2);
        ctx.fillStyle = C.top;
        fillPixelEllipse(ctx, x, top + 1, 6, 2);
        fillPixelEllipse(ctx, x - 1, top - 1, 3, 1);
      }
      if (bits.length > 0) {
        ctx.fillStyle = C.dust;
        for (const b of bits) {
          ctx.globalAlpha = Math.max(0, 1 - b.age / R.burstLife);
          ctx.fillRect(Math.round(b.x) - offsetX, Math.round(b.y), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
    },
  };
}
