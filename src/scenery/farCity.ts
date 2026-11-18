// 먼 건물 (레이어 0.3): 지붕선이 들쭉날쭉한 어두운 실루엣 한 줄 + 창문 불빛 몇 개

import { FAR_CITY } from '../constants';
import { randInt, type Rng } from '../random';
import { STREET_LINE_Y } from '../world';
import { drawSlice, lazyBuffer } from './buffer';

export type FarRoof = 'flat' | 'gable' | 'stepped';

export interface FarBuilding {
  x: number;
  w: number;
  h: number;
  roof: FarRoof;
  /** 굴뚝 x (건물 왼쪽 기준), 없으면 null */
  chimney: number | null;
  /** 창문 위치 (건물 왼쪽·위 기준) */
  windows: { x: number; y: number }[];
}

export function generateFarSkyline(rng: Rng, width: number): FarBuilding[] {
  const row: FarBuilding[] = [];
  for (let x = 0; x < width; ) {
    const w = randInt(rng, FAR_CITY.minWidth, FAR_CITY.maxWidth);
    const h = randInt(rng, FAR_CITY.minHeight, FAR_CITY.maxHeight);
    const r = rng();
    const roof: FarRoof =
      r < FAR_CITY.gableChance ? 'gable' : r < FAR_CITY.gableChance + FAR_CITY.steppedChance ? 'stepped' : 'flat';
    const chimney =
      rng() < FAR_CITY.chimneyChance
        ? randInt(rng, FAR_CITY.windowMarginX, w - FAR_CITY.windowMarginX - FAR_CITY.chimneyWidth)
        : null;
    const windows = Array.from({ length: randInt(rng, 0, FAR_CITY.maxWindows) }, () => ({
      x: randInt(rng, FAR_CITY.windowMarginX, w - FAR_CITY.windowMarginX - FAR_CITY.windowWidth),
      y: randInt(rng, FAR_CITY.windowMarginTop, h - FAR_CITY.windowMarginBottom),
    }));
    row.push({ x, w, h, roof, chimney, windows });
    x += w + randInt(rng, 0, FAR_CITY.maxGap);
  }
  return row;
}

function paintFarCity(ctx: CanvasRenderingContext2D, row: readonly FarBuilding[]): void {
  for (const b of row) {
    const top = STREET_LINE_Y - b.h;
    ctx.fillStyle = FAR_CITY.silhouette;
    ctx.fillRect(b.x, top, b.w, b.h);
    if (b.roof === 'gable') {
      const rise = Math.min(Math.floor(b.w / 2), FAR_CITY.gableMaxHeight);
      for (let k = 1; k <= rise; k++) ctx.fillRect(b.x + k, top - k, b.w - k * 2, 1);
    } else if (b.roof === 'stepped') {
      const quarter = Math.floor(b.w / 4);
      ctx.fillRect(b.x + quarter, top - FAR_CITY.steppedHeight, b.w - quarter * 2, FAR_CITY.steppedHeight);
    }
    if (b.chimney !== null) {
      ctx.fillRect(b.x + b.chimney, top - FAR_CITY.chimneyHeight, FAR_CITY.chimneyWidth, FAR_CITY.chimneyHeight);
    }
    ctx.fillStyle = FAR_CITY.window;
    for (const w of b.windows) ctx.fillRect(b.x + w.x, top + w.y, FAR_CITY.windowWidth, FAR_CITY.windowHeight);
  }
}

export function createFarCity(rng: Rng, width: number) {
  const row = generateFarSkyline(rng, width);
  const getBuffer = lazyBuffer(width, STREET_LINE_Y, (ctx) => paintFarCity(ctx, row));
  return {
    row,
    draw(ctx: CanvasRenderingContext2D, offsetX: number) {
      drawSlice(ctx, getBuffer().canvas, offsetX);
    },
  };
}
