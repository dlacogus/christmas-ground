// 바닥 (레이어 1): 눈 덮인 연석 + 어긋나게 깐 판석 (멀리 작게, 가까이 크게) + 구석의 눈

import { GROUND, GROUND_COLORS as G, SCENERY_SEED, SCREEN_HEIGHT } from '../constants';
import { createRng, pick, randInt, type Rng } from '../random';
import { MAP_WIDTH, STREET_LINE_Y, WALK_AREA } from '../world';
import { drawSlice, lazyBuffer } from './buffer';
import { paintSnowWriting } from './snowWriting';

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

/** 부드럽게 이어지는 무작위 값 (격자 사이를 매끄럽게 잇는다). 0~1 */
function smoothNoise(rng: Rng, width: number, height: number, cellX: number, cellY: number): Float32Array {
  const cols = Math.ceil(width / cellX) + 2;
  const rows = Math.ceil(height / cellY) + 2;
  const lattice = Float32Array.from({ length: cols * rows }, () => rng());
  const out = new Float32Array(width * height);
  const ease = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / cellY);
    const ty = ease(y / cellY - gy);
    for (let x = 0; x < width; x++) {
      const gx = Math.floor(x / cellX);
      const tx = ease(x / cellX - gx);
      const i = gy * cols + gx;
      const a = lattice[i] + (lattice[i + 1] - lattice[i]) * tx;
      const b = lattice[i + cols] + (lattice[i + cols + 1] - lattice[i + cols]) * tx;
      out[y * width + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** values 가운데 ratio만큼이 그 아래에 놓이는 값 */
function quantile(values: Float32Array, ratio: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

/**
 * 판석 위에 쌓인 눈 지도 (width x height). 0 = 벽돌이 드러난 곳, 1 = 눈, 2 = 눈 위 밝은 결.
 * 눈이 덮는 넓이는 정확히 GROUND.snowCoverRatio — 드러난 벽돌은 덩어리져 군데군데 남는다.
 */
export function generateSnowCover(rng: Rng, width: number, height: number): Uint8Array {
  const big = smoothNoise(rng, width, height, GROUND.snowCellX, GROUND.snowCellY);
  const small = smoothNoise(rng, width, height, Math.ceil(GROUND.snowCellX / 4), Math.ceil(GROUND.snowCellY / 3));
  const value = big.map((v, i) => v + small[i] * GROUND.snowDetail);
  const bare = quantile(value, 1 - GROUND.snowCoverRatio);
  const light = quantile(small, 1 - GROUND.snowLightRatio);
  const cover = new Uint8Array(width * height);
  for (let i = 0; i < cover.length; i++) cover[i] = value[i] < bare ? 0 : GROUND.snowLightRatio > 0 && small[i] >= light ? 2 : 1;
  return cover;
}

let cachedCover: Uint8Array | null = null;

/** 맵 전체 바닥의 눈 지도 (한 번만 만든다) */
function snowCover(): Uint8Array {
  cachedCover ??= generateSnowCover(createRng(SCENERY_SEED + GROUND.snowSeedOffset), MAP_WIDTH, WALK_AREA.h);
  return cachedCover;
}

/** 월드 좌표 (x, y) 바닥에 눈이 쌓여 있나 (벽돌이 드러난 곳과 바닥 밖은 false) */
export function isSnowAt(x: number, y: number): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y) - WALK_AREA.y;
  if (px < 0 || px >= MAP_WIDTH || py < 0 || py >= WALK_AREA.h) return false;
  return snowCover()[py * MAP_WIDTH + px] > 0;
}

/** 눈 지도를 판석 위에 찍는다. 눈이 끝나는 아래 가장자리는 그늘 한 줄 */
function paintSnowCover(ctx: CanvasRenderingContext2D, top: number): void {
  const width = MAP_WIDTH;
  const height = WALK_AREA.h;
  const cover = snowCover();
  const colors = [G.snowCoverEdge, G.snowCover, G.snowCoverLight];
  for (let y = 0; y < height; y++) {
    let runStart = 0;
    let runKind = -1;
    for (let x = 0; x <= width; x++) {
      let kind = -1;
      if (x < width && cover[y * width + x] > 0) {
        const below = y + 1 < height ? cover[(y + 1) * width + x] : 1;
        kind = below === 0 ? 0 : cover[y * width + x];
      }
      if (kind === runKind) continue;
      if (runKind >= 0) {
        ctx.fillStyle = colors[runKind];
        ctx.fillRect(runStart, top + y, x - runStart, 1);
      }
      runStart = x;
      runKind = kind;
    }
  }
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

  // 판석 위에 쌓인 눈
  paintSnowCover(ctx, walkTop);
  // 눈 위에 쓴 글씨
  paintSnowWriting(ctx, top);

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
