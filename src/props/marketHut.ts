// 마켓 오두막: 돌바닥 뒤쪽 끝(연석 바로 뒤)에 세우는 나무 오두막. 크기도 종류도 제각각이다.
// 본 레이어에 있어 바닥과 함께 움직이지만 걷는 바닥을 차지하지 않는다 (장애물 없음, 항상 맨 뒤에 그림).
//   gable 삼각 지붕 · longhouse 옆으로 긴 지붕 · kiosk 줄무늬 차양 매점 · pavilion 원뿔 지붕 정자
// 지붕마다 눈이 두껍게 쌓이고 처마에 고드름, 전구가 제각각 반짝인다. 창구 안에는 가게 주인. 글자 간판은 없다.
// 오두막은 한 번 그려 두고 전구 반짝임만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, MARKET_HUT as M, MARKET_HUT_COLORS as C } from '../constants';
import { createRng, pick, randInt, randRange, type Rng } from '../random';
import { lazyBuffer } from '../scenery/buffer';
import { HUTS, STREET_LINE_Y, inZone, type HutKind, type ZoneName } from '../world';
import type { DepthDrawable } from '../zones/zone';

export interface HutSpec {
  /** 가운데 x */
  x: number;
  w: number;
  kind: HutKind;
  /** 벽 높이 */
  wall: number;
}

export interface HutBulb {
  x: number;
  y: number;
  color: string;
  period: number;
  phase: number;
}

/** 지붕 높이 (종류마다 폭에 비례) */
export function hutRoofHeight(spec: HutSpec): number {
  return Math.round(spec.w * M.roofRatio[spec.kind]);
}

/** 바닥에서 꼭대기 장식까지 높이 */
export function hutHeight(spec: HutSpec): number {
  return spec.wall + hutRoofHeight(spec) + (spec.kind === 'pavilion' ? M.finialHeight : 0);
}

/** 이 전구의 지금 밝기 (제각각 다른 박자, 꺼지지는 않는다) */
export function hutBulbLevel(bulb: HutBulb, time: number): number {
  const wave = 0.5 + 0.5 * Math.sin((Math.PI * 2 * time) / bulb.period + bulb.phase);
  return M.bulbMinAlpha + (1 - M.bulbMinAlpha) * wave;
}

// ───────────── 그리기 (버퍼 좌표: left = 벽 왼쪽, base = 바닥) ─────────────

interface Paint {
  ctx: CanvasRenderingContext2D;
  rng: Rng;
  bulbs: HutBulb[];
  left: number;
  base: number;
  w: number;
  wall: number;
  roof: number;
  wood: (typeof C.woods)[number];
  roofColor: string;
  awning: readonly string[];
}

function addBulb(p: Paint, x: number, y: number): void {
  p.bulbs.push({
    x,
    y,
    color: pick(p.rng, C.bulbs),
    period: randRange(p.rng, M.bulbMinPeriod, M.bulbMaxPeriod),
    phase: randRange(p.rng, 0, Math.PI * 2),
  });
}

function paintWall(p: Paint): void {
  const top = p.base - p.wall;
  p.ctx.fillStyle = p.wood.wall;
  p.ctx.fillRect(p.left, top, p.w, p.wall);
  p.ctx.fillStyle = p.wood.dark;
  for (let y = top + 3; y < p.base; y += 4) p.ctx.fillRect(p.left, y, p.w, 1);
}

/** 열린 창구: 어두운 안쪽에 아래로 갈수록 따뜻한 빛, 선반의 작은 물건들, 아래 판매대 */
function paintOpening(p: Paint, left: number, right: number, top: number): void {
  const { ctx, rng } = p;
  const bottom = p.base - M.counterHeight;
  const height = bottom - top;
  if (height < 3 || right - left < 4) return;
  ctx.fillStyle = C.interior;
  ctx.fillRect(left, top, right - left, height);
  ctx.save();
  ctx.fillStyle = C.warmGlow;
  for (let y = 0; y < height; y++) {
    ctx.globalAlpha = M.warmGlowMaxAlpha * ((y + 1) / height);
    ctx.fillRect(left, top + y, right - left, 1);
  }
  ctx.restore();
  for (let y = top + M.shelfEvery; y <= bottom; y += M.shelfEvery) {
    if (y < bottom) {
      ctx.fillStyle = C.shelf;
      ctx.fillRect(left, y, right - left, 1);
    }
    for (let x = left + 1; x + 2 <= right; x += M.itemSpacing) {
      if (rng() > M.itemChance) continue;
      const tall = rng() < 0.4 ? 3 : 2;
      ctx.fillStyle = pick(rng, C.items);
      ctx.fillRect(x, y - tall, 2, tall);
    }
  }
  paintKeeper(p, left, right);
  // 판매대: 밝은 윗판 + 세로 판자
  ctx.fillStyle = p.wood.wall;
  ctx.fillRect(left - 1, bottom, right - left + 2, M.counterHeight);
  ctx.fillStyle = p.wood.dark;
  for (let x = left + 2; x < right; x += 4) ctx.fillRect(x, bottom + 2, 1, M.counterHeight - 2);
  ctx.fillStyle = p.wood.light;
  ctx.fillRect(left - 2, bottom, right - left + 4, 2);
}

/** 처마 밑 고드름: 길이가 제각각 */
function paintIcicles(p: Paint, x0: number, x1: number, y: number): void {
  p.ctx.save();
  p.ctx.fillStyle = C.icicle;
  for (let x = x0; x < x1; x += randInt(p.rng, M.icicleMinGap, M.icicleMaxGap)) {
    const length = randInt(p.rng, 1, M.icicleMaxLength);
    p.ctx.globalAlpha = M.icicleAlpha;
    p.ctx.fillRect(x, y, 1, length);
    p.ctx.globalAlpha = M.icicleAlpha / 2;
    p.ctx.fillRect(x, y + length, 1, 1);
  }
  p.ctx.restore();
}

/** 창구 안 가게 주인: 털모자 쓴 머리와 어깨가 판매대 위로 보인다 */
function paintKeeper(p: Paint, left: number, right: number): void {
  if (right - left < M.keeperMinBay || p.rng() > M.keeperChance) return;
  const { ctx, rng } = p;
  const x = randInt(rng, left + 3, right - 9);
  const bottom = p.base - M.counterHeight;
  ctx.fillStyle = pick(rng, C.keeperCoats);
  ctx.fillRect(x - 1, bottom - 4, 8, 4);
  ctx.fillStyle = C.keeperSkin;
  ctx.fillRect(x, bottom - 9, 6, 5);
  ctx.fillStyle = C.keeperEye;
  ctx.fillRect(x + 1, bottom - 7, 1, 1);
  ctx.fillRect(x + 4, bottom - 7, 1, 1);
  ctx.fillStyle = pick(rng, C.keeperHats);
  ctx.fillRect(x, bottom - 12, 6, 3);
  ctx.fillRect(x + 1, bottom - 13, 4, 1);
  ctx.fillStyle = C.snow;
  ctx.fillRect(x + 2, bottom - 15, 2, 2);
}

/** 초록 리스와 빨간 리본 */
function paintWreath(p: Paint, cx: number, cy: number): void {
  const { ctx } = p;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 3.4 || d < 1.6) continue;
      ctx.fillStyle = (dx + dy) % 2 === 0 ? C.wreath : C.wreathDark;
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  ctx.fillStyle = C.bow;
  ctx.fillRect(cx - 1, cy + 3, 3, 1);
  ctx.fillRect(cx, cy + 4, 1, 1);
}

/** 삼각 지붕이 앞을 보는 오두막: 경사를 따라 두꺼운 눈, 그 안쪽 처마에 초록 장식과 전구 */
function paintGable(p: Paint): void {
  const { ctx } = p;
  const wallTop = p.base - p.wall;
  const cx = p.left + p.w / 2;
  paintWall(p);
  paintOpening(p, p.left + M.postWidth, p.left + p.w - M.postWidth, wallTop + M.openingTopGap);
  const apex = wallTop - p.roof;
  const T = M.snowThickness;
  for (let r = 0; r < p.roof; r++) {
    const half = Math.round(((r + 1) / p.roof) * (p.w / 2 + M.roofOverhang));
    const y = apex + r;
    const x0 = Math.round(cx - half);
    ctx.fillStyle = r % 4 === 3 ? p.wood.wall : p.wood.light;
    ctx.fillRect(x0, y, half * 2, 1);
    const thick = Math.min(T, half);
    ctx.fillStyle = C.snow;
    if (r <= T) ctx.fillRect(x0, y, half * 2, 1);
    ctx.fillRect(x0, y, thick, 1);
    ctx.fillRect(x0 + half * 2 - thick, y, thick, 1);
    if (r > T && half > T + 1) {
      ctx.fillStyle = r % 2 === 0 ? C.garland : C.garlandDark;
      ctx.fillRect(x0 + thick, y, 2, 1);
      ctx.fillRect(x0 + half * 2 - thick - 2, y, 2, 1);
      if ((r - T) % M.bulbSpacing === 1) {
        addBulb(p, x0 + thick + 2, y);
        addBulb(p, x0 + half * 2 - thick - 3, y);
      }
    }
  }
  // 처마 끝 눈 그늘과 고드름, 박공 가운데 리스
  const eaveHalf = Math.round(p.w / 2 + M.roofOverhang);
  ctx.fillStyle = C.snowShade;
  ctx.fillRect(Math.round(cx - eaveHalf), wallTop, T + 2, 1);
  ctx.fillRect(Math.round(cx + eaveHalf) - T - 2, wallTop, T + 2, 1);
  const starY = apex + Math.round(p.roof * 0.6);
  paintWreath(p, Math.round(cx), starY);
  paintIcicles(p, Math.round(cx - eaveHalf), Math.round(cx - eaveHalf) + T + 2, wallTop + 1);
  paintIcicles(p, Math.round(cx + eaveHalf) - T - 2, Math.round(cx + eaveHalf), wallTop + 1);
}

/** 옆으로 긴 오두막: 긴 지붕 위에 울퉁불퉁 두꺼운 눈, 처마 밑 전구 줄, 창구 여러 칸 */
function paintLonghouse(p: Paint): void {
  const { ctx, rng } = p;
  const wallTop = p.base - p.wall;
  paintWall(p);
  const bays = Math.max(2, Math.round(p.w / M.bayWidth));
  const bayW = (p.w - M.postWidth) / bays;
  for (let b = 0; b < bays; b++) {
    paintOpening(p, Math.round(p.left + M.postWidth + b * bayW), Math.round(p.left + (b + 1) * bayW), wallTop + M.openingTopGap);
  }
  const roofTop = wallTop - p.roof;
  for (let r = 0; r < p.roof; r++) {
    const inset = Math.round((p.roof - 1 - r) * 0.6);
    ctx.fillStyle = r === p.roof - 1 ? p.wood.dark : r % 3 === 0 ? p.wood.dark : p.roofColor;
    ctx.fillRect(p.left - M.roofOverhang + inset, roofTop + r, p.w + M.roofOverhang * 2 - inset * 2, 1);
  }
  const topInset = Math.round((p.roof - 1) * 0.6);
  let lump = 1;
  for (let x = p.left - M.roofOverhang + topInset - 1; x < p.left + p.w + M.roofOverhang - topInset + 1; x++) {
    // 눈 두께가 조금씩 오르내린다
    if (rng() < 0.35) lump = Math.max(0, Math.min(3, lump + (rng() < 0.5 ? -1 : 1)));
    const depth = M.snowThickness + 1 + lump;
    ctx.fillStyle = C.snow;
    ctx.fillRect(x, roofTop - 2, 1, depth);
    ctx.fillStyle = C.snowShade;
    ctx.fillRect(x, roofTop - 2 + depth, 1, 1);
  }
  paintIcicles(p, p.left - M.roofOverhang, p.left + p.w + M.roofOverhang, wallTop);
  for (let x = p.left - 1; x < p.left + p.w; x += M.bulbSpacing) addBulb(p, x, wallTop + 1);
}

/** 작은 매점: 눈 얹은 납작 지붕, 줄무늬 차양 */
function paintKiosk(p: Paint): void {
  const { ctx } = p;
  const wallTop = p.base - p.wall;
  paintWall(p);
  paintOpening(p, p.left + M.postWidth, p.left + p.w - M.postWidth, wallTop + M.awningDrop + 2);
  for (let r = 0; r < M.awningDrop; r++) {
    const out = Math.round((M.awningOut * (r + 1)) / M.awningDrop);
    for (let x = p.left - out; x < p.left + p.w + out; x++) {
      const stripe = Math.floor((x - p.left + M.awningStripe * 8) / M.awningStripe) % 2;
      // 맨 아랫줄은 줄무늬 한 칸씩 건너 물결 모양으로
      if (r === M.awningDrop - 1 && stripe === 1) continue;
      ctx.fillStyle = p.awning[stripe];
      ctx.fillRect(x, wallTop + r, 1, 1);
    }
  }
  const roofTop = wallTop - p.roof;
  ctx.fillStyle = p.roofColor;
  ctx.fillRect(p.left - 2, roofTop, p.w + 4, p.roof);
  ctx.fillStyle = C.snow;
  ctx.fillRect(p.left - 2, roofTop - 1, p.w + 4, M.snowThickness);
  ctx.fillRect(p.left, roofTop - 2, p.w, 1);
  ctx.fillStyle = C.snowShade;
  ctx.fillRect(p.left - 2, roofTop - 1 + M.snowThickness, p.w + 4, 1);
  paintIcicles(p, p.left - 2, p.left + p.w + 2, roofTop + M.snowThickness);
  for (let x = p.left; x < p.left + p.w; x += M.bulbSpacing) addBulb(p, x, wallTop - 1);
}

/** 원뿔 지붕 정자: 옆면이 꺾인 벽, 오목하게 솟은 뾰족 지붕, 꼭대기 금 장식 */
function paintPavilion(p: Paint): void {
  const { ctx } = p;
  const wallTop = p.base - p.wall;
  const cx = Math.round(p.left + p.w / 2);
  paintWall(p);
  const side = Math.round(p.w / 5);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = p.wood.dark;
  ctx.fillRect(p.left, wallTop, side, p.wall);
  ctx.fillRect(p.left + p.w - side, wallTop, side, p.wall);
  ctx.restore();
  paintOpening(p, p.left + side + 1, p.left + p.w - side - 1, wallTop + M.openingTopGap);
  const apex = wallTop - p.roof;
  const snowRows = Math.round(p.roof * 0.4);
  for (let r = 0; r < p.roof; r++) {
    const half = Math.max(1, Math.round((p.w / 2 + M.roofOverhang) * ((r + 1) / p.roof) ** 1.6));
    const y = apex + r;
    ctx.fillStyle = r < snowRows ? C.snow : p.roofColor;
    ctx.fillRect(cx - half, y, half * 2, 1);
    if (r >= snowRows) {
      // 왼쪽 경사에 눈 줄기, 눈 아래 그늘
      ctx.fillStyle = C.snow;
      ctx.fillRect(cx - half, y, Math.max(1, Math.round(half * 0.3)), 1);
      if (r === snowRows && half > 2) {
        ctx.fillStyle = C.snowShade;
        ctx.fillRect(cx - half + 1, y, half * 2 - 2, 1);
      }
    }
  }
  ctx.fillStyle = C.gold;
  ctx.fillRect(cx - 1, apex - M.finialHeight, 2, M.finialHeight);
  ctx.fillStyle = C.garland;
  ctx.fillRect(p.left - M.roofOverhang, wallTop, p.w + M.roofOverhang * 2, 1);
  paintIcicles(p, p.left - M.roofOverhang, p.left + p.w + M.roofOverhang, wallTop + 1);
  for (let x = p.left - M.roofOverhang + 1; x < p.left + p.w + M.roofOverhang; x += M.bulbSpacing) addBulb(p, x, wallTop + 1);
}

const PAINTERS: Record<HutKind, (p: Paint) => void> = {
  gable: paintGable,
  longhouse: paintLonghouse,
  kiosk: paintKiosk,
  pavilion: paintPavilion,
};

// ───────────── 소품 ─────────────

export interface MarketHut extends DepthDrawable {
  update(dt: number): void;
}

/** 오두막 바닥선 y: 연석 윗줄 (돌바닥이 끝나는 곳) */
export const HUT_BASE_Y = STREET_LINE_Y;

export function createMarketHut(spec: HutSpec, rng: Rng): MarketHut {
  const bottom = HUT_BASE_Y;
  const pad = M.roofOverhang + 2;
  const bufW = spec.w + pad * 2;
  const bufH = hutHeight(spec) + 3;
  const woodIndex = randInt(rng, 0, C.woods.length - 1);
  const roofIndex = randInt(rng, 0, C.roofs.length - 1);
  const awningIndex = randInt(rng, 0, C.awnings.length - 1);
  const bulbs: HutBulb[] = [];
  const getBuffer = lazyBuffer(bufW, bufH, (ctx) =>
    PAINTERS[spec.kind]({
      ctx,
      rng,
      bulbs,
      left: pad,
      base: bufH,
      w: spec.w,
      wall: spec.wall,
      roof: hutRoofHeight(spec),
      wood: C.woods[woodIndex],
      roofColor: C.roofs[roofIndex],
      awning: C.awnings[awningIndex],
    }),
  );
  let time = 0;

  return {
    footY: bottom,
    update(dt: number) {
      time += dt;
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const left = Math.round(spec.x - spec.w / 2) - pad - layerOffsetX(camera, LAYER_FACTORS.main);
      const top = bottom - bufH;
      ctx.drawImage(getBuffer().canvas, left, top);
      ctx.save();
      for (const b of bulbs) {
        const level = hutBulbLevel(b, time);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = M.bulbGlowAlpha * level;
        ctx.fillRect(left + b.x - 1, top + b.y - 1, 3, 3);
        ctx.globalAlpha = level;
        ctx.fillRect(left + b.x, top + b.y, 1, 1);
      }
      ctx.restore();
    },
  };
}

/** 이 구역에 속한 오두막들 (world.ts의 HUTS 가운데 x가 구역 안인 것). 오두막마다 시드를 달리해 색이 섞인다 */
export function createHutsInZone(zone: ZoneName, seed: number): MarketHut[] {
  return HUTS.flatMap((h, i) => (inZone(zone, h.x) ? [createMarketHut(h, createRng(seed + 50 + i))] : []));
}
