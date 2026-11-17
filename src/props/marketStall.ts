// 나무 오두막 마켓 노점: 눈 쌓인 삼각 지붕, 지붕 테두리 전구, 따뜻한 빛 속 선반의 작은 물건들.
// 글자 간판은 없다. 처음 한 번 그려 두고 찍어 쓴다.

import { layerOffsetX, type Camera } from '../camera';
import { GARLAND, LAYER_FACTORS, MARKET_STALL as S, STALL_COLORS as C } from '../constants';
import { pick, type Rng } from '../random';
import { lazyBuffer } from '../scenery/buffer';
import type { Rect } from '../world';
import type { DepthDrawable } from '../zones/zone';

const PAD_X = S.roofOverhang + 1;

/** 지붕 r번째 줄(위에서 0)의 반폭 */
function roofHalfAt(width: number, r: number): number {
  return Math.round(((r + 1) / S.roofHeight) * (width / 2 + S.roofOverhang));
}

function paintItems(ctx: CanvasRenderingContext2D, rng: Rng, left: number, right: number, shelfY: number): void {
  for (let x = left + 1; x + 2 <= right; x += S.itemSpacing) {
    if (rng() < S.candleChance) {
      ctx.fillStyle = C.candle;
      ctx.fillRect(x, shelfY - S.candleHeight, 2, S.candleHeight);
      ctx.fillStyle = C.flame;
      ctx.fillRect(x, shelfY - S.candleHeight - 1, 1, 1);
    } else {
      ctx.fillStyle = pick(rng, C.items);
      ctx.fillRect(x, shelfY - 2, 2, 2);
      ctx.fillStyle = C.itemShine;
      ctx.fillRect(x, shelfY - 2, 1, 1);
    }
  }
}

export type StallRoof = keyof typeof C.roofs;

function paintStall(ctx: CanvasRenderingContext2D, width: number, bufH: number, rng: Rng, roof: StallRoof): void {
  const roofColors = C.roofs[roof];
  const left = PAD_X;
  const right = PAD_X + width;
  const center = PAD_X + width / 2;
  const wallTop = bufH - S.wallHeight;
  const counterTop = bufH - S.counterHeight;

  // 벽: 가로 판자
  ctx.fillStyle = C.wood;
  ctx.fillRect(left, wallTop, width, S.wallHeight);
  ctx.fillStyle = C.woodDark;
  for (let y = wallTop + S.plankEvery; y < bufH; y += S.plankEvery) ctx.fillRect(left, y, width, 1);

  // 열린 창: 어두운 안쪽, 아래로 갈수록 따뜻하게 밝은 빛, 선반과 물건
  const openLeft = left + S.postWidth;
  const openRight = right - S.postWidth;
  const openTop = wallTop + S.openingTopGap;
  const openH = counterTop - openTop;
  ctx.fillStyle = C.interior;
  ctx.fillRect(openLeft, openTop, openRight - openLeft, openH);
  ctx.save();
  ctx.fillStyle = C.warmGlow;
  for (let y = 0; y < openH; y++) {
    ctx.globalAlpha = S.warmGlowMaxAlpha * (y / openH);
    ctx.fillRect(openLeft, openTop + y, openRight - openLeft, 1);
  }
  ctx.restore();
  for (let k = 1; k <= S.shelfCount; k++) {
    const shelfY = openTop + Math.round((openH * k) / (S.shelfCount + 1));
    ctx.fillStyle = C.shelf;
    ctx.fillRect(openLeft, shelfY, openRight - openLeft, 1);
    paintItems(ctx, rng, openLeft, openRight, shelfY);
  }

  // 판매대: 위 선반 + 세로 판자 앞판, 위에도 물건 몇 개
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(left, counterTop, width, S.counterHeight);
  ctx.fillStyle = C.wood;
  for (let x = left + S.counterPlankEvery; x < right; x += S.counterPlankEvery) ctx.fillRect(x, counterTop + 2, 1, S.counterHeight - 2);
  ctx.fillStyle = C.counterTop;
  ctx.fillRect(left - 1, counterTop, width + 2, 2);
  paintItems(ctx, rng, openLeft, openRight, counterTop);

  // 삼각 지붕 (처마가 벽 위를 2px 덮는다)
  const roofTop = wallTop - S.roofHeight + 2;
  for (let r = 0; r < S.roofHeight; r++) {
    const half = roofHalfAt(width, r);
    ctx.fillStyle = r % S.roofTextureEvery === 0 ? roofColors.roofDark : roofColors.roof;
    ctx.fillRect(Math.round(center - half), roofTop + r, half * 2, 1);
  }
  // 경사를 따라 쌓인 눈
  for (let r = 0; r < S.roofHeight; r++) {
    const half = roofHalfAt(width, r);
    const thick = Math.min(S.snowThickness, half);
    ctx.fillStyle = C.snow;
    ctx.fillRect(Math.round(center - half), roofTop + r, thick, 1);
    ctx.fillRect(Math.round(center + half) - thick, roofTop + r, thick, 1);
    if (r < S.snowThickness) ctx.fillRect(Math.round(center - half), roofTop + r, half * 2, 1);
  }
  // 처마 끝 눈 덩이
  const eaveY = roofTop + S.roofHeight;
  const eaveHalf = roofHalfAt(width, S.roofHeight - 1);
  ctx.fillStyle = C.snowShade;
  ctx.fillRect(Math.round(center - eaveHalf), eaveY, S.eaveSnowWidth, 1);
  ctx.fillRect(Math.round(center + eaveHalf) - S.eaveSnowWidth, eaveY, S.eaveSnowWidth, 1);

  // 지붕 테두리 전구 (눈 바로 안쪽, 양쪽 경사)
  let bulb = 0;
  for (let r = S.snowThickness; r < S.roofHeight; r += S.bulbSpacing) {
    const half = roofHalfAt(width, r) - S.snowThickness;
    for (const x of [Math.round(center - half), Math.round(center + half) - 1]) {
      const color = GARLAND.bulbs[bulb++ % GARLAND.bulbs.length];
      ctx.save();
      ctx.globalAlpha = S.bulbGlowAlpha;
      ctx.fillStyle = color;
      ctx.fillRect(x - 1, roofTop + r - 1, 3, 3);
      ctx.restore();
      ctx.fillStyle = color;
      ctx.fillRect(x, roofTop + r, 1, 1);
    }
  }
}

/** foot = 노점이 바닥을 차지하는 사각형 (world.ts의 stall 장애물) */
export function createMarketStall(foot: Rect, rng: Rng, roof: StallRoof = 'red'): DepthDrawable {
  const bottom = foot.y + foot.h;
  const bufW = foot.w + PAD_X * 2;
  const bufH = S.wallHeight + S.roofHeight;
  const getBuffer = lazyBuffer(bufW, bufH, (ctx) => paintStall(ctx, foot.w, bufH, rng, roof));
  return {
    footY: bottom,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(getBuffer().canvas, foot.x - PAD_X - ox, bottom - bufH);
    },
  };
}
