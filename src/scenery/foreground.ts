// 앞 눈 더미 (레이어 1.3): 화면 맨 아래를 스치는 낮은 눈 둔덕과 작은 상록 나무

import { FOREGROUND as F, FOREGROUND_COLORS as C, SCREEN_HEIGHT } from '../constants';
import { randInt, type Rng } from '../random';
import { drawSlice, lazyBuffer } from './buffer';

export interface Mound {
  /** 가운데 x */
  x: number;
  w: number;
  h: number;
}

export interface Shrub {
  /** 가운데 x */
  x: number;
  h: number;
}

/** 칸을 고르게 나눈 뒤 칸 안에서 흩뜨린다 */
function spread(rng: Rng, width: number, count: number): number[] {
  const cell = width / count;
  const jitter = Math.floor(cell * F.jitterFraction);
  return Array.from({ length: count }, (_, i) => Math.round(cell * (i + 0.5)) + randInt(rng, -jitter, jitter));
}

export function generateForeground(rng: Rng, width: number): { mounds: Mound[]; shrubs: Shrub[] } {
  const mounds = spread(rng, width, F.moundCount).map((x) => ({
    x,
    w: randInt(rng, F.moundMinWidth, F.moundMaxWidth),
    h: randInt(rng, F.moundMinHeight, F.moundMaxHeight),
  }));
  const shrubs = spread(rng, width, F.shrubCount).map((x) => ({ x, h: randInt(rng, F.shrubMinHeight, F.shrubMaxHeight) }));
  return { mounds, shrubs };
}

function moundHalfWidth(m: Mound, r: number): number {
  return Math.round((m.w / 2) * Math.sqrt(1 - (r / m.h) ** 2));
}

/** 그늘색 테두리(1px)를 먼저 깔고 안쪽을 눈색으로 — 아래 흰 눈둑 위에서도 모양이 읽힌다 */
function paintMound(ctx: CanvasRenderingContext2D, m: Mound): void {
  ctx.fillStyle = C.snowShade;
  for (let r = 0; r <= m.h; r++) {
    const half = moundHalfWidth(m, Math.min(r, m.h - 1)) + 1;
    ctx.fillRect(m.x - half, F.height - 1 - r, half * 2, 1);
  }
  for (let r = 0; r < m.h; r++) {
    const half = moundHalfWidth(m, r);
    if (half <= 0) continue;
    const y = F.height - 1 - r;
    ctx.fillStyle = C.snow;
    ctx.fillRect(m.x - half, y, Math.max(1, Math.round(half * 2 * (1 - F.moundShadeFraction))), 1);
  }
}

/** 층층이 좁아지는 작은 나무, 층마다 꼭대기에 눈 */
function paintShrub(ctx: CanvasRenderingContext2D, s: Shrub): void {
  const bottom = F.height;
  ctx.fillStyle = C.trunk;
  ctx.fillRect(s.x - 1, bottom - F.shrubTrunkHeight, 2, F.shrubTrunkHeight);
  const foliage = s.h - F.shrubTrunkHeight;
  for (let r = 0; r < foliage; r++) {
    const tier = Math.floor(r / F.shrubTierHeight);
    const inTier = r % F.shrubTierHeight;
    const half = Math.max(1, F.shrubMaxHalfWidth - tier - inTier);
    const y = bottom - F.shrubTrunkHeight - 1 - r;
    const isCap = inTier === F.shrubTierHeight - 1 || r === foliage - 1;
    ctx.fillStyle = isCap ? C.snow : inTier === 0 ? C.needle : C.needleLight;
    ctx.fillRect(s.x - half, y, half * 2, 1);
  }
}

export function createForeground(rng: Rng, width: number) {
  const { mounds, shrubs } = generateForeground(rng, width);
  const getBuffer = lazyBuffer(width, F.height, (ctx) => {
    for (const s of shrubs) paintShrub(ctx, s);
    for (const m of mounds) paintMound(ctx, m);
  });
  return {
    mounds,
    shrubs,
    draw(ctx: CanvasRenderingContext2D, offsetX: number) {
      drawSlice(ctx, getBuffer().canvas, offsetX, SCREEN_HEIGHT - F.height);
    },
  };
}
