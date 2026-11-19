// 메인 광장의 큰 트리: 빽빽이 겹친 잎 단, 늘어진 가지 끝, 꼬마전구 수백 개, 꼭대기 별.
// 장식은 처음엔 하나도 없다 — 산타 선물에서 나온 장식을 모두가 직접 단다 (features/treeDecor.ts).
// 잎 단·화단은 처음 한 번 그려 두고, 전구 반짝임·빛 물결·별 밝기만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, SCREEN_WIDTH, TREE, TREE_COLORS as C } from '../constants';
import { randInt, randRange, type Rng } from '../random';
import { lazyBuffer } from '../scenery/buffer';
import { TREE_X, getObstacle, type Point } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { fillSoftGlow, stampPixels } from './pixel';
import { TIERS, foliageHalfWidth, tierHalfAt } from './treeShape';

export { foliageHalfWidth, tierHalfAt, treeTiers, type Tier } from './treeShape';

// ───────────── 모양 (순수 계산) ─────────────

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

/** 물결이 progress(0 = 맨 아래 ~ 1 = 꼭대기)에 있을 때 이 전구를 얼마나 밝히나 (0~1, 물결 앞머리에서 1) */
export function waveBoostAt(light: Point, progress: number | null): number {
  if (progress === null) return 0;
  const frontY = TREE.foliageBottomY - progress * (TREE.foliageBottomY - TREE.tipY);
  return Math.max(0, 1 - Math.abs(light.y - frontY) / TREE.waveWidth);
}

/** 물결이 이 전구를 얼마나 밝히나 (0~1, 물결 앞머리에서 1) */
export function waveBoost(light: Point, time: number): number {
  return waveBoostAt(light, waveProgress(time));
}

/** 축하 물결: 시작한 지 elapsed초일 때 어디 있나 (아래에서 위로 세 번). 끝났으면 null */
export function celebrationWave(elapsed: number): number | null {
  if (elapsed < 0 || elapsed >= TREE.celebrateWaves * TREE.celebrateWaveSeconds) return null;
  return (elapsed % TREE.celebrateWaveSeconds) / TREE.celebrateWaveSeconds;
}

/** 전구 하나의 밝기: 각자 박자로 은은하게 + 물결이 지나가면 확 밝게 (extraWave = 축하 물결) */
export function lightLevel(light: TreeLight, time: number, extraWave: number | null = null): number {
  const wave01 = (Math.sin((time / light.period) * Math.PI * 2 + light.phase) + 1) / 2;
  const base = TREE.lightMinAlpha + (TREE.lightMaxAlpha - TREE.lightMinAlpha) * wave01;
  return Math.max(base, waveBoost(light, time), waveBoostAt(light, extraWave));
}

/** 별 밝기 (가장 어두울 때 ~ 1). bright = 장식이 100개를 넘어 항상 조금 더 밝다 */
export function starLevel(time: number, bright = false): number {
  const wave01 = (Math.sin((time / TREE.starPeriod) * Math.PI * 2) + 1) / 2;
  const min = bright ? TREE.brightStarMinAlpha : TREE.starMinAlpha;
  return min + (1 - min) * wave01;
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
const BUFFER_HALF = TREE.baseHalfWidth + Math.max(...TREE.jagPattern) + Math.max(...TREE.sideJag) + TREE.bedRimWidth * 4;

/** 자리마다 늘 같은 0~99 값 (잎 결을 고르게 흩뿌리는 데 쓴다) */
function fleck(dx: number, y: number): number {
  return ((Math.imul(dx + 977, 73856093) ^ Math.imul(y + 131, 19349663)) >>> 0) % 100;
}

export interface SnowClump {
  /** 가운데 x (트리 가운데 기준), 아랫줄 y, 폭 */
  dx: number;
  y: number;
  w: number;
}

/** tierIndex번째 단의 가지 위에 쌓인 눈 더미들 (늘 같은 자리). 단 폭 안쪽에만 놓인다 */
export function snowClumps(tierIndex: number): SnowClump[] {
  const t = TIERS[tierIndex];
  const clumps: SnowClump[] = [];
  const step = TREE.snowClumpEvery;
  const offset = (tierIndex * 3) % step;
  for (let dx = -t.bottomHalf + offset; dx <= t.bottomHalf; dx += step) {
    if (fleck(dx, tierIndex * 17 + 5) >= TREE.snowClumpChance) continue;
    const w = TREE.snowClumpMinWidth + (fleck(dx, tierIndex + 40) % (TREE.snowClumpMaxWidth - TREE.snowClumpMinWidth + 1));
    const rise = TREE.snowClumpRiseMin + (fleck(dx, tierIndex + 80) % (TREE.snowClumpRiseMax - TREE.snowClumpRiseMin + 1));
    const y = t.bottom - rise;
    if (y - 2 < t.top) continue;
    // 더미 양 끝이 그 높이의 잎 안에 있어야 한다
    if (Math.abs(dx) + Math.ceil(w / 2) > tierHalfAt(t, y) - TREE.edgeWidth) continue;
    clumps.push({ dx, y, w });
  }
  return clumps;
}

/** 눈 더미: 위는 둥글고 밝게, 아랫줄은 그늘 */
function paintSnowClumps(ctx: CanvasRenderingContext2D, ox: number, tierIndex: number): void {
  for (const c of snowClumps(tierIndex)) {
    const left = ox + c.dx - Math.floor(c.w / 2);
    ctx.fillStyle = C.snowClumpShade;
    ctx.fillRect(left, c.y, c.w, 1);
    ctx.fillStyle = C.snowClump;
    ctx.fillRect(left, c.y - 1, c.w, 1);
    ctx.fillRect(left + 1, c.y - 2, c.w - 2, 1);
  }
}

function paintFoliage(ctx: CanvasRenderingContext2D, ox: number): void {
  // 아랫단부터 그리고 윗단이 그 위를 덮는다
  for (let i = TIERS.length - 1; i >= 0; i--) {
    const t = TIERS[i];
    const below = TIERS[i + 1];
    const reach = t.bottomHalf + Math.max(...TREE.sideJag);
    for (let dx = -reach; dx <= reach; dx++) {
      const droop = jagAt(dx, i);
      const colBottom = t.bottom + droop;
      for (let y = t.top; y <= colBottom; y++) {
        // 옆 테두리는 줄마다 들쭉날쭉 (가지가 삐져나온 모습)
        const half = tierHalfAt(t, Math.min(y, t.bottom)) + TREE.sideJag[(y + i * 3) % TREE.sideJag.length];
        if (Math.abs(dx) > half) continue;
        const fromTip = colBottom - y;
        const side = Math.abs(dx) > half - TREE.edgeWidth;
        const f = fleck(dx, y);
        let color: string;
        if (fromTip < TREE.tipBrightRows) color = C.needleTip;
        else if (fromTip < TREE.tipRows || side) color = f < TREE.fleckDark ? C.needleDark : C.needleLight;
        else if (f < TREE.fleckLight) color = C.needleLight;
        else if (f > 99 - TREE.fleckDark) color = C.needleShadow;
        else color = C.needleDark;
        ctx.fillStyle = color;
        ctx.fillRect(ox + dx, y, 1, 1);
      }
      // 늘어진 가지 끝마다 눈이 조금 얹힌다
      if (droop === Math.max(...TREE.jagPattern) && fleck(dx, i) < TREE.tipSnowChance && Math.abs(dx) < t.bottomHalf - 2) {
        ctx.fillStyle = C.tipSnow;
        ctx.fillRect(ox + dx - 1, colBottom - TREE.tipRows, 3, 1);
        ctx.fillRect(ox + dx, colBottom - TREE.tipRows - 1, 1, 1);
      }
      // 윗단 아래로 드리운 깊은 그늘 (아랫단 위에만)
      if (!below) continue;
      for (let s = 1; s <= TREE.shadowRows; s++) {
        const y = colBottom + s;
        if (Math.abs(dx) > tierHalfAt(below, y) - TREE.edgeWidth) continue;
        ctx.fillStyle = s <= TREE.shadowRows / 2 ? C.needleDeep : C.needleShadow;
        ctx.fillRect(ox + dx, y, 1, 1);
      }
    }
    paintSnowClumps(ctx, ox, i);
  }
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

// ───────────── 트리 소품 ─────────────

export interface TreeProp extends DepthDrawable {
  update(dt: number): void;
  readonly lights: readonly TreeLight[];
  /** 전구 하나의 지금 밝기 (가까운 장식볼에 비치는 하이라이트에 쓴다) */
  levelOf(light: TreeLight): number;
  /** 축하: 빛 물결이 아래에서 위로 세 번 흐르고 별이 크게 반짝인다 */
  celebrate(): void;
  /** 장식이 100개를 넘으면 별이 항상 조금 더 밝게 빛난다 */
  setBright(on: boolean): void;
}

export function createTree(rng: Rng): TreeProp {
  const bed = getObstacle('tree-bed');
  const lights = generateLights(rng);
  const bedRng = rng;
  const height = bed.y + bed.h + TREE.bedWallHeight;
  const getBuffer = lazyBuffer(BUFFER_HALF * 2, height, (ctx) => {
    const ox = BUFFER_HALF;
    const bedCenterY = bed.y + TREE.bedCenterFromTop;
    paintTrunk(ctx, ox, bedCenterY);
    paintFoliage(ctx, ox);
    paintBed(ctx, ox, bedRng);
  });
  const star = starBox();
  let time = 0;
  /** 축하를 시작한 뒤 지난 시간 (안 하는 중이면 -1) */
  let celebrating = -1;
  let bright = false;

  return {
    footY: bed.y + bed.h,
    lights,
    levelOf: (light) => lightLevel(light, time, celebrationWave(celebrating)),
    celebrate() {
      celebrating = 0;
    },
    setBright(on) {
      bright = on;
    },
    update(dt: number) {
      time += dt;
      if (celebrating >= 0) {
        celebrating += dt;
        if (celebrationWave(celebrating) === null) celebrating = -1;
      }
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const screenX = TREE_X - layerOffsetX(camera, LAYER_FACTORS.main);
      if (screenX + BUFFER_HALF < 0 || screenX - BUFFER_HALF > SCREEN_WIDTH) return;
      ctx.drawImage(getBuffer().canvas, screenX - BUFFER_HALF, 0);

      // 전구: 각자 박자로 반짝이고, 밝을 때 둘레에 은은한 번짐. 물결이 지나가면 더 크게 번진다
      const extra = celebrationWave(celebrating);
      const wave = waveProgress(time) !== null || extra !== null;
      ctx.save();
      for (const light of lights) {
        const level = lightLevel(light, time, extra);
        const x = screenX + (light.x - TREE_X);
        if (wave) {
          const boost = Math.max(waveBoost(light, time), waveBoostAt(light, extra));
          if (boost > 0) fillSoftGlow(ctx, x, light.y, TREE.waveGlowRadius, TREE.waveGlowAlpha * boost, C.lightHalo, 2);
        }
        if (level >= TREE.lightHaloLevel) {
          ctx.globalAlpha = (TREE.lightHaloAlpha * (level - TREE.lightHaloLevel)) / (1 - TREE.lightHaloLevel);
          ctx.fillStyle = C.lightHalo;
          ctx.fillRect(x - 1, light.y, 3, 1);
          ctx.fillRect(x, light.y - 1, 1, 3);
        }
        ctx.globalAlpha = level;
        ctx.fillStyle = C.light;
        ctx.fillRect(x, light.y, 1, 1);
      }
      ctx.restore();

      // 별: 빛 번짐 → 별 그림, 함께 밝아졌다 어두워진다
      // 축하하는 동안은 가장 밝게, 크게 번진다. 장식이 100개를 넘으면 평소에도 조금 더 밝다
      const level = extra !== null ? 1 : starLevel(time, bright);
      const glow01 = Math.max(0, (level - TREE.starMinAlpha) / (1 - TREE.starMinAlpha));
      const half = Math.floor(star.size / 2);
      const glowScale = extra !== null ? TREE.celebrateStarGlow : bright ? TREE.brightStarGlow : 1;
      const glowAlpha = TREE.starGlowMinAlpha + (TREE.starGlowMaxAlpha - TREE.starGlowMinAlpha) * glow01;
      fillSoftGlow(ctx, screenX, star.top + half, Math.round(TREE.starGlowRadius * glowScale), glowAlpha, C.starGlow);
      ctx.save();
      ctx.globalAlpha = level;
      stampPixels(ctx, STAR_PIXELS, { X: C.star, o: C.starBright }, screenX - half, star.top);
      ctx.restore();
    },
  };
}
