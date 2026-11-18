// 바닥 (레이어 1): 눈 덮인 연석 + 어긋나게 깐 판석 (멀리 작게, 가까이 크게) + 구석의 눈

import { GROUND, GROUND_COLORS as G, SCREEN_HEIGHT } from '../constants';
import { pick, randInt, type Rng } from '../random';
import { STREET_LINE_Y, WALK_AREA } from '../world';
import { drawSlice, lazyBuffer } from './buffer';

export interface SlabRow {
  y: number;
  h: number;
  slabWidth: number;
}

export interface Slab {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** 왼쪽 아래 이음매에 눈이 끼었나 */
  jointSnow: boolean;
}

/** 쌓인 눈 (위쪽 연석 밑 또는 아래쪽 눈둑 위) */
export interface Drift {
  x: number;
  w: number;
  h: number;
  edge: 'top' | 'bottom';
}

export function slabRows(): SlabRow[] {
  let y = WALK_AREA.y;
  return GROUND.rowHeights.map((h) => {
    const row = { y, h, slabWidth: h * GROUND.slabAspect + GROUND.slabExtra };
    y += h;
    return row;
  });
}

export function generateSlabs(rng: Rng, width: number): Slab[] {
  const slabs: Slab[] = [];
  slabRows().forEach((row, i) => {
    // 한 줄 걸러 반 장씩 어긋나게
    const start = i % 2 === 0 ? 0 : -Math.floor(row.slabWidth / 2);
    for (let x = start; x < width; x += row.slabWidth) {
      slabs.push({
        x,
        y: row.y,
        w: row.slabWidth,
        h: row.h,
        color: pick(rng, G.stones),
        jointSnow: rng() < GROUND.jointSnowChance,
      });
    }
  });
  return slabs;
}

export function generateDrifts(rng: Rng, width: number): Drift[] {
  const drifts: Drift[] = [];
  for (const edge of ['top', 'bottom'] as const) {
    for (let x = randInt(rng, 0, GROUND.driftMaxGap); x < width; ) {
      const w = randInt(rng, GROUND.driftMinWidth, GROUND.driftMaxWidth);
      drifts.push({ x, w, h: randInt(rng, 1, GROUND.driftMaxHeight), edge });
      x += w + randInt(rng, GROUND.driftMinGap, GROUND.driftMaxGap);
    }
  }
  return drifts;
}

function paintGround(ctx: CanvasRenderingContext2D, width: number, slabs: readonly Slab[], drifts: readonly Drift[]): void {
  const top = STREET_LINE_Y;
  const walkTop = WALK_AREA.y - top;
  const walkBottom = WALK_AREA.y + WALK_AREA.h - top;

  // 연석: 맨 위 눈 한 줄, 돌, 그림자
  ctx.fillStyle = G.snow;
  ctx.fillRect(0, 0, width, 1);
  ctx.fillStyle = G.curb;
  ctx.fillRect(0, 1, width, walkTop - 2);
  ctx.fillStyle = G.curbShadow;
  ctx.fillRect(0, walkTop - 1, width, 1);

  // 판석: 이음매 색을 깔고 그 위에 한 장씩 (오른쪽·아래 1px은 이음매로 남김)
  ctx.fillStyle = G.joint;
  ctx.fillRect(0, walkTop, width, WALK_AREA.h);
  for (const s of slabs) {
    const y = s.y - top;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, y, s.w - 1, s.h - 1);
    if (s.h >= GROUND.highlightMinHeight) {
      ctx.fillStyle = G.highlight;
      ctx.fillRect(s.x, y, s.w - 1, 1);
    }
    if (s.jointSnow) {
      ctx.fillStyle = G.snow;
      ctx.fillRect(s.x - 1, y + s.h - 1, 2, 1);
    }
  }

  // 아래쪽 눈둑
  ctx.fillStyle = G.snowShade;
  ctx.fillRect(0, walkBottom, width, 1);
  ctx.fillStyle = G.snow;
  ctx.fillRect(0, walkBottom + 1, width, SCREEN_HEIGHT - top - walkBottom - 1);

  // 구석에 살짝 쌓인 눈: 위는 연석 밑에서 아래로 좁아지고, 아래는 눈둑에서 위로 좁아진다
  for (const d of drifts) {
    for (let k = 0; k < d.h; k++) {
      const inset = k * GROUND.driftRowInset;
      const w = d.w - inset * 2;
      if (w <= 0) break;
      const y = d.edge === 'top' ? walkTop + k : walkBottom - 1 - k;
      ctx.fillStyle = k === d.h - 1 ? G.snowShade : G.snow;
      ctx.fillRect(d.x + inset, y, w, 1);
    }
  }
}

export function createGround(rng: Rng, width: number) {
  const slabs = generateSlabs(rng, width);
  const drifts = generateDrifts(rng, width);
  const getBuffer = lazyBuffer(width, SCREEN_HEIGHT - STREET_LINE_Y, (ctx) => paintGround(ctx, width, slabs, drifts));
  return {
    slabs,
    drifts,
    draw(ctx: CanvasRenderingContext2D, offsetX: number) {
      drawSlice(ctx, getBuffer().canvas, offsetX, STREET_LINE_Y);
    },
  };
}
