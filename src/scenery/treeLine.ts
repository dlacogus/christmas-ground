// 나무 줄과 시계탑 (레이어 0.6): 광장 뒤 배경. 눈 덮인 나무들(잎 진 큰 나무·전나무)과 그 사이로 솟은 시계탑뿐이다.
// (마켓 오두막은 배경이 아니라 걷는 바닥 맨 뒤에 선다 — src/props/marketHut.ts)
// 한 번 그려 두고, 시계 바늘만 매 프레임 그린다.

import { CLOCK_TOWER, TREE_LINE as M, TREE_LINE_COLORS as C } from '../constants';
import { createRng, randInt, randRange, type Rng } from '../random';
import { STREET_LINE_Y } from '../world';
import { lazyBuffer } from './buffer';
import { drawClockHands, paintClockTower } from './clockTower';

export interface BackTree {
  x: number;
  height: number;
  kind: 'bare' | 'fir';
}

/** 잎 진 큰 나무 사이사이 전나무 */
export function generateBackTrees(rng: Rng, totalWidth: number): BackTree[] {
  const trees: BackTree[] = [];
  for (let x = randInt(rng, 0, M.treeMaxGap); x < totalWidth; x += randInt(rng, M.treeMinGap, M.treeMaxGap)) {
    const fir = rng() < M.firChance;
    trees.push({
      x,
      kind: fir ? 'fir' : 'bare',
      height: fir ? randInt(rng, M.firMinHeight, M.firMaxHeight) : randInt(rng, M.bareMinHeight, M.bareMaxHeight),
    });
  }
  return trees;
}

function paintBranch(ctx: CanvasRenderingContext2D, rng: Rng, x: number, y: number, angle: number, length: number, depth: number): void {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  for (let i = 0; i < length; i++) {
    const px = Math.round(x + sin * i);
    const py = Math.round(y - cos * i);
    ctx.fillStyle = depth < 2 ? C.barkDark : C.bark;
    ctx.fillRect(px, py, depth === 0 ? 2 : 1, 1);
    // 누운 가지 위에는 눈이 얹힌다
    if (depth > 0 && Math.abs(sin) > 0.3 && rng() < M.branchSnowChance) {
      ctx.fillStyle = C.branchSnow;
      ctx.fillRect(px, py - 1, 1, 1);
    }
  }
  const next = length * M.branchShrink;
  if (depth >= M.branchDepth || next < 3) return;
  const ex = x + sin * length;
  const ey = y - cos * length;
  const children = depth === 0 ? 3 : 2;
  for (let c = 0; c < children; c++) {
    const side = children === 3 ? c - 1 : c * 2 - 1;
    const spread = randRange(rng, M.branchMinSpread, M.branchMaxSpread);
    paintBranch(ctx, rng, ex, ey, angle * 0.6 + side * spread, next * randRange(rng, 0.8, 1.15), depth + 1);
  }
}

function paintFir(ctx: CanvasRenderingContext2D, x: number, base: number, height: number): void {
  for (let r = 0; r < height; r++) {
    const inTier = r % M.firTierHeight;
    const half = Math.max(1, Math.round((height - r) * M.firHalfWidthRatio + (M.firTierHeight - inTier) * 0.5));
    const y = base - 1 - r;
    ctx.fillStyle = inTier === 0 ? C.needle : C.needleLight;
    ctx.fillRect(x - half, y, half * 2, 1);
    if (inTier === M.firTierHeight - 1 || r === height - 1) {
      ctx.fillStyle = C.firSnow;
      ctx.fillRect(x - half, y, Math.max(1, Math.round(half * 1.3)), 1);
    }
  }
}

/** 나무 밑동을 덮는 낮은 눈 둔덕 (높이가 천천히 오르내린다) */
function paintSnowBank(ctx: CanvasRenderingContext2D, rng: Rng, width: number): void {
  let h: number = M.bankMinHeight;
  for (let x = 0; x < width; x++) {
    if (rng() < 0.3) h = Math.max(M.bankMinHeight, Math.min(M.bankMaxHeight, h + (rng() < 0.5 ? -1 : 1)));
    ctx.fillStyle = C.bank;
    ctx.fillRect(x, STREET_LINE_Y - h, 1, h);
    ctx.fillStyle = C.bankShade;
    ctx.fillRect(x, STREET_LINE_Y - 1, 1, 1);
  }
}

export function createTreeLine(rng: Rng, width: number) {
  const trees = generateBackTrees(rng, width);
  const paintSeed = Math.floor(rng() * 1e9);
  const getBuffer = lazyBuffer(width, STREET_LINE_Y, (ctx) => {
    const paintRng = createRng(paintSeed);
    // 뒤에서 앞으로: 잎 진 나무 → 시계탑 → 전나무 → 눈 둔덕
    for (const t of trees) {
      if (t.kind === 'bare') paintBranch(ctx, paintRng, t.x, STREET_LINE_Y, randRange(paintRng, -0.08, 0.08), t.height * M.trunkFraction, 0);
    }
    paintClockTower(ctx, CLOCK_TOWER.x);
    for (const t of trees) {
      // 전나무는 탑 앞에 서되, 탑 몸통을 가리지는 않게 비켜 둔다
      if (t.kind === 'fir' && Math.abs(t.x - CLOCK_TOWER.x) > CLOCK_TOWER.shaftWidth) paintFir(ctx, t.x, STREET_LINE_Y, t.height);
    }
    paintSnowBank(ctx, paintRng, width);
  });

  return {
    trees,
    draw(ctx: CanvasRenderingContext2D, offsetX: number) {
      ctx.drawImage(getBuffer().canvas, -offsetX, 0);
      drawClockHands(ctx, CLOCK_TOWER.x - offsetX, new Date());
    },
  };
}
