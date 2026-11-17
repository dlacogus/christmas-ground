// 메인 광장의 큰 트리.
// 잎 단·리본·장식볼·화단·선물은 처음 한 번 그려 두고, 전구 반짝임·빛 물결·별 밝기만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, TREE, TREE_COLORS as C } from '../constants';
import { pickIndexExcept, randInt, randRange, type Rng } from '../random';
import { lazyBuffer } from '../scenery/buffer';
import { TREE_X, getObstacle, type Point } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { fillSoftGlow, stampPixels } from './pixel';

// ───────────── 모양 (순수 계산) ─────────────

/** 잎 한 단: 위는 좁고 아래로 넓어지는 사다리꼴 */
export interface Tier {
  top: number;
  bottom: number;
  topHalf: number;
  bottomHalf: number;
}

export function treeTiers(): Tier[] {
  const height = TREE.foliageBottomY - TREE.tipY;
  return Array.from({ length: TREE.tiers }, (_, i) => {
    const bottom = TREE.tipY + Math.round((height * (i + 1)) / TREE.tiers);
    const top = i === 0 ? TREE.tipY : TREE.tipY + Math.round((height * i) / TREE.tiers) - TREE.tierOverlap;
    const bottomHalf = Math.round((TREE.baseHalfWidth * (i + 1)) / TREE.tiers);
    const topHalf = i === 0 ? 0 : Math.round(bottomHalf * TREE.tierTopRatio);
    return { top, bottom, topHalf, bottomHalf };
  });
}

/** 한 단의 y 줄 반폭 (단 밖이면 -1) */
export function tierHalfAt(tier: Tier, y: number): number {
  if (y < tier.top || y > tier.bottom) return -1;
  const f = (y - tier.top) / (tier.bottom - tier.top);
  return Math.round(tier.topHalf + (tier.bottomHalf - tier.topHalf) * f);
}

const TIERS = treeTiers();

/** 잎 전체의 y 줄 반폭 (잎 밖이면 -1) */
export function foliageHalfWidth(y: number): number {
  return Math.max(-1, ...TIERS.map((t) => tierHalfAt(t, y)));
}

function jagAt(dx: number, tierIndex: number): number {
  const p = TREE.jagPattern;
  return p[(((dx + tierIndex * 5) % p.length) + p.length) % p.length];
}

/** 잎 안쪽 무작위 위치 (안쪽으로 inset만큼 들여서) */
function pointInFoliage(rng: Rng, inset: number, topMargin: number, bottomMargin: number): Point {
  for (;;) {
    const y = randInt(rng, TREE.tipY + topMargin, TREE.foliageBottomY - bottomMargin);
    const half = foliageHalfWidth(y) - inset;
    if (half < 1) continue;
    return { x: TREE_X + randInt(rng, -half, half), y };
  }
}

export interface Ornament extends Point {
  size: number;
  colorIndex: number;
}

/** 장식볼 30~40개, 서로 너무 붙지 않게 골고루 */
export function generateOrnaments(rng: Rng): Ornament[] {
  const count = randInt(rng, TREE.ornamentMinCount, TREE.ornamentMaxCount);
  const result: Ornament[] = [];
  let prevColor = -1;
  for (let tries = 0; result.length < count && tries < count * 200; tries++) {
    const p = pointInFoliage(rng, TREE.ornamentInset, TREE.ornamentTopMargin, TREE.ornamentBottomMargin);
    if (result.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < TREE.ornamentMinGap)) continue;
    const colorIndex = pickIndexExcept(rng, C.ornaments.length, prevColor);
    prevColor = colorIndex;
    const size = TREE.ornamentSizes[randInt(rng, 0, TREE.ornamentSizes.length - 1)];
    result.push({ ...p, size, colorIndex });
  }
  return result;
}

export interface TreeLight extends Point {
  period: number;
  phase: number;
}

export function generateLights(rng: Rng): TreeLight[] {
  const count = randInt(rng, TREE.lightMinCount, TREE.lightMaxCount);
  return Array.from({ length: count }, () => ({
    ...pointInFoliage(rng, TREE.lightInset, TREE.lightTopMargin, 0),
    period: randRange(rng, TREE.lightMinPeriod, TREE.lightMaxPeriod),
    phase: rng() * Math.PI * 2,
  }));
}

/** 빛 물결이 지금 어디 있나: 0(맨 아래)~1(꼭대기), 물결이 없으면 null */
export function waveProgress(time: number): number | null {
  const t = time - TREE.waveFirstDelay;
  if (t < 0) return null;
  const inCycle = t % TREE.waveInterval;
  return inCycle < TREE.waveDuration ? inCycle / TREE.waveDuration : null;
}

/** 물결이 이 전구를 얼마나 밝히나 (0~1, 물결 앞머리에서 1) */
export function waveBoost(light: Point, time: number): number {
  const p = waveProgress(time);
  if (p === null) return 0;
  const frontY = TREE.foliageBottomY - p * (TREE.foliageBottomY - TREE.tipY);
  return Math.max(0, 1 - Math.abs(light.y - frontY) / TREE.waveWidth);
}

/** 전구 하나의 밝기: 각자 박자로 은은하게 + 물결이 지나가면 확 밝게 */
export function lightLevel(light: TreeLight, time: number): number {
  const wave01 = (Math.sin((time / light.period) * Math.PI * 2 + light.phase) + 1) / 2;
  const base = TREE.lightMinAlpha + (TREE.lightMaxAlpha - TREE.lightMinAlpha) * wave01;
  return Math.max(base, waveBoost(light, time));
}

/** 별 밝기 (starMinAlpha ~ 1) */
export function starLevel(time: number): number {
  const wave01 = (Math.sin((time / TREE.starPeriod) * Math.PI * 2) + 1) / 2;
  return TREE.starMinAlpha + (1 - TREE.starMinAlpha) * wave01;
}

/** 꼭대기 금색 별 (11x11) */
const STAR_PIXELS = [
  '.....X.....',
  '.....X.....',
  '....XXX....',
  '....XoX....',
  'XXXXXoXXXXX',
  '.XXXoooXXX.',
  '..XXXoXXX..',
  '..XXXXXXX..',
  '.XXXX.XXXX.',
  '.XXX...XXX.',
  'XX.......XX',
];
const STAR_SIZE = STAR_PIXELS.length;

export function starBox(): { left: number; top: number; size: number } {
  const cy = TREE.tipY - TREE.starCenterAbove;
  const half = Math.floor(STAR_SIZE / 2);
  return { left: TREE_X - half, top: cy - half, size: STAR_SIZE };
}

// ───────────── 미리 그리기 ─────────────

/** 버퍼 왼쪽 = TREE_X - BUFFER_HALF */
const BUFFER_HALF = TREE.baseHalfWidth + Math.max(...TREE.jagPattern) + TREE.bedRimWidth * 4;

function paintFoliage(ctx: CanvasRenderingContext2D, ox: number): void {
  // 아랫단부터 그리고 윗단이 그 위를 덮는다
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    const below = TIERS[i + 1];
    for (let dx = -t.bottomHalf; dx <= t.bottomHalf; dx++) {
      const colBottom = t.bottom + jagAt(dx, i);
      for (let y = t.top; y <= colBottom; y++) {
        const half = tierHalfAt(t, Math.min(y, t.bottom));
        if (Math.abs(dx) > half) continue;
        const edge = Math.abs(dx) > half - TREE.edgeWidth || y > colBottom - TREE.edgeWidth;
        ctx.fillStyle = edge ? C.needleLight : C.needleDark;
        ctx.fillRect(ox + dx, y, 1, 1);
      }
      // 윗단 아래로 드리운 그늘 (아랫단 위에만)
      if (!below) continue;
      ctx.fillStyle = C.needleShadow;
      for (let s = 1; s <= TREE.shadowRows; s++) {
        const y = colBottom + s;
        if (Math.abs(dx) <= tierHalfAt(below, y) - TREE.edgeWidth) ctx.fillRect(ox + dx, y, 1, 1);
      }
    }
  }
}

/** 대각선으로 두른 흰금색 리본 — 이미 그린 잎 위에만 (source-atop) */
function paintRibbons(ctx: CanvasRenderingContext2D, ox: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const colors = [C.ribbonLight, C.ribbon, C.ribbonShade];
  for (const centerY of TREE.ribbonCenterYs) {
    for (let dx = -TREE.baseHalfWidth; dx <= TREE.baseHalfWidth; dx++) {
      const y = Math.round(centerY + dx * TREE.ribbonSlope);
      for (let k = 0; k < TREE.ribbonThickness; k++) {
        ctx.fillStyle = colors[Math.min(k, colors.length - 1)];
        ctx.fillRect(ox + dx, y + k, 1, 1);
      }
    }
  }
  ctx.restore();
}

function paintOrnament(ctx: CanvasRenderingContext2D, o: Ornament, ox: number): void {
  const { base, shade } = C.ornaments[o.colorIndex];
  const left = ox + (o.x - TREE_X) - Math.floor(o.size / 2);
  const top = o.y - Math.floor(o.size / 2);
  for (let y = 0; y < o.size; y++) {
    for (let x = 0; x < o.size; x++) {
      const corner = (x === 0 || x === o.size - 1) && (y === 0 || y === o.size - 1);
      if (corner && o.size > 3) continue;
      ctx.fillStyle = y === o.size - 1 || x === o.size - 1 ? shade : base;
      ctx.fillRect(left + x, top + y, 1, 1);
    }
  }
  ctx.fillStyle = C.ornamentShine;
  ctx.fillRect(left + (o.size > 3 ? 1 : 0), top + (o.size > 3 ? 1 : 0), 1, 1);
}

function paintTrunk(ctx: CanvasRenderingContext2D, ox: number, bedCenterY: number): void {
  const top = TREE.foliageBottomY - TREE.tierOverlap;
  ctx.fillStyle = C.trunk;
  ctx.fillRect(ox - TREE.trunkHalfWidth, top, TREE.trunkHalfWidth * 2, bedCenterY - top);
  ctx.fillStyle = C.trunkShade;
  ctx.fillRect(ox + TREE.trunkHalfWidth - 2, top, 2, bedCenterY - top);
}

/** 낮은 원형 화단: 눈 덮인 돌 테두리 + 흙 + 앞쪽 낮은 벽 */
function paintBed(ctx: CanvasRenderingContext2D, ox: number, rng: Rng): number {
  const bed = getObstacle('tree-bed');
  const cy = bed.y + TREE.bedCenterFromTop;
  const rx = bed.w / 2;
  const ry = TREE.bedRadiusY;
  const innerRx = rx - TREE.bedRimWidth;
  const innerRy = ry - 2;

  // 앞 벽
  ctx.fillStyle = C.bedStoneDark;
  for (let dx = -rx; dx < rx; dx++) {
    const edge = cy + Math.round(ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));
    ctx.fillRect(ox + dx, edge, 1, TREE.bedWallHeight);
  }
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    ctx.fillStyle = dy < 0 ? C.snow : C.bedStone;
    ctx.fillRect(ox - half, cy + dy, half * 2, 1);
    if (Math.abs(dy) > innerRy) continue;
    const inner = Math.round(innerRx * Math.sqrt(1 - (dy / innerRy) ** 2));
    ctx.fillStyle = C.bedSoil;
    ctx.fillRect(ox - inner, cy + dy, inner * 2, 1);
    ctx.fillStyle = C.snow;
    for (let dx = -inner; dx < inner; dx++) if (rng() < TREE.bedSnowChance) ctx.fillRect(ox + dx, cy + dy, 1, 1);
  }
  return cy;
}

function paintGifts(ctx: CanvasRenderingContext2D, ox: number, bedCenterY: number): void {
  const bottom = bedCenterY + TREE.giftBaseBelowCenter;
  for (const g of TREE.gifts) {
    const box = C.gift[g.box];
    const ribbon = C.gift[g.ribbon].base;
    const left = ox + g.dx - Math.floor(g.w / 2);
    const top = bottom - g.h;
    ctx.fillStyle = box.base;
    ctx.fillRect(left, top, g.w, g.h);
    ctx.fillStyle = box.shade;
    ctx.fillRect(left + g.w - 1, top, 1, g.h);
    ctx.fillRect(left, bottom - 1, g.w, 1);
    ctx.fillStyle = ribbon;
    const midX = left + Math.floor(g.w / 2);
    ctx.fillRect(midX, top, 1, g.h);
    ctx.fillRect(left, top + Math.floor(g.h / 2), g.w, 1);
    // 위 리본 매듭
    ctx.fillRect(midX - 1, top - 1, 1, 1);
    ctx.fillRect(midX + 1, top - 1, 1, 1);
  }
}

// ───────────── 트리 소품 ─────────────

export interface TreeProp extends DepthDrawable {
  update(dt: number): void;
  readonly ornaments: readonly Ornament[];
  readonly lights: readonly TreeLight[];
}

export function createTree(rng: Rng): TreeProp {
  const bed = getObstacle('tree-bed');
  const ornaments = generateOrnaments(rng);
  const lights = generateLights(rng);
  const bedRng = rng;
  const height = bed.y + bed.h + TREE.bedWallHeight;
  const getBuffer = lazyBuffer(BUFFER_HALF * 2, height, (ctx) => {
    const ox = BUFFER_HALF;
    const bedCenterY = bed.y + TREE.bedCenterFromTop;
    paintTrunk(ctx, ox, bedCenterY);
    paintFoliage(ctx, ox);
    paintRibbons(ctx, ox);
    for (const o of ornaments) paintOrnament(ctx, o, ox);
    paintBed(ctx, ox, bedRng);
    paintGifts(ctx, ox, bedCenterY);
  });
  const star = starBox();
  let time = 0;

  return {
    footY: bed.y + bed.h,
    ornaments,
    lights,
    update(dt: number) {
      time += dt;
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const screenX = TREE_X - layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(getBuffer().canvas, screenX - BUFFER_HALF, 0);

      // 전구: 각자 박자로 반짝이고, 밝을 때 둘레에 은은한 번짐. 물결이 지나가면 더 크게 번진다
      for (const light of lights) {
        const level = lightLevel(light, time);
        const boost = waveBoost(light, time);
        const x = screenX + (light.x - TREE_X);
        if (boost > 0) fillSoftGlow(ctx, x, light.y, TREE.waveGlowRadius, TREE.waveGlowAlpha * boost, C.lightHalo, 2);
        ctx.save();
        if (level >= TREE.lightHaloLevel) {
          ctx.globalAlpha = (TREE.lightHaloAlpha * (level - TREE.lightHaloLevel)) / (1 - TREE.lightHaloLevel);
          ctx.fillStyle = C.lightHalo;
          ctx.fillRect(x - 1, light.y, 3, 1);
          ctx.fillRect(x, light.y - 1, 1, 3);
        }
        ctx.globalAlpha = level;
        ctx.fillStyle = C.light;
        ctx.fillRect(x, light.y, 1, 1);
        ctx.restore();
      }

      // 별: 빛 번짐 → 별 그림, 함께 밝아졌다 어두워진다
      const level = starLevel(time);
      const glow01 = (level - TREE.starMinAlpha) / (1 - TREE.starMinAlpha);
      const half = Math.floor(star.size / 2);
      const glowAlpha = TREE.starGlowMinAlpha + (TREE.starGlowMaxAlpha - TREE.starGlowMinAlpha) * glow01;
      fillSoftGlow(ctx, screenX, star.top + half, TREE.starGlowRadius, glowAlpha, C.starGlow);
      ctx.save();
      ctx.globalAlpha = level;
      stampPixels(ctx, STAR_PIXELS, { X: C.star, o: C.starBright }, screenX - half, star.top);
      ctx.restore();
    },
  };
}
