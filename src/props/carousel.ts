// 회전목마: 줄무늬 둥근 천막 지붕, 금 띠와 흐르는 전구, 거울 기둥, 둥근 나무 판, 금 막대에 꽂힌 목마 8마리.
// 말은 각도로 위치를 계산한다: 앞쪽(cos > 0)은 밝고 크게, 뒤쪽은 어둡고 작게 기둥 뒤로.
// 판·기둥·지붕(줄무늬가 도는 모습 몇 장)은 미리 그려 두고, 말·전구·깃발만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { CAROUSEL as K, CAROUSEL_COLORS as C, LAYER_FACTORS } from '../constants';
import { lazyBuffer, type PixelBuffer } from '../scenery/buffer';
import { CAROUSEL_X, getObstacle } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { fillPixelEllipse, mixColor } from './pixel';

// ───────────── 위치 계산 (순수) ─────────────

export function carouselGeometry() {
  const platform = getObstacle('carousel');
  const rimBottom = platform.y + platform.h;
  const platformY = rimBottom - K.rimHeight - K.platformRadiusY;
  const roofBottom = platformY - K.roofBottomAbove;
  return {
    rimBottom,
    /** 판 윗면 타원 가운데 y */
    platformY,
    platformRadiusX: platform.w / 2,
    roofBottom,
    apexY: roofBottom - K.roofHeight,
  };
}

/** 지붕 아래선 y (가운데가 앞으로 처진 곡선) */
export function roofBottomAt(dx: number): number {
  const a = Math.min(1, Math.abs(dx) / K.roofHalfWidth);
  return carouselGeometry().roofBottom + Math.round(K.roofSag * (1 - a * a));
}

export type Facing = 'left' | 'right';

export interface HorseState {
  index: number;
  x: number;
  /** 말 발끝 y */
  y: number;
  /** 1 = 맨 앞, -1 = 맨 뒤 */
  z: number;
  facing: Facing;
}

/** 지금 말들의 위치 (뒤 → 앞 순서) */
export function horseStates(time: number): HorseState[] {
  const { platformY } = carouselGeometry();
  const omega = (Math.PI * 2) / K.rotationPeriod;
  return Array.from({ length: K.horseCount }, (_, index): HorseState => {
    const theta = (Math.PI * 2 * index) / K.horseCount + omega * time;
    const z = Math.cos(theta);
    // 말마다 위상을 달리 해서 막대를 따라 오르내린다
    const bobPhase = (Math.PI * 2 * index * 3) / K.horseCount;
    const bob = Math.sin((Math.PI * 2 * time) / K.bobPeriod + bobPhase) * K.bobAmplitude;
    return {
      index,
      x: CAROUSEL_X + K.horseOrbitRadius * Math.sin(theta),
      y: platformY - K.horseBaseAbove + z * K.horseDepthDrop - bob,
      z,
      // 앞쪽은 오른쪽으로, 뒤쪽은 왼쪽으로 지나간다
      facing: z >= 0 ? 'right' : 'left',
    };
  }).sort((a, b) => a.z - b.z);
}

/** 앞뒤에 따른 어둡기 단계 (0 = 가장 밝음) */
export function shadeLevel(z: number): number {
  return Math.round(((1 - z) / 2) * (K.shadeLevels - 1));
}

/** 흐르는 전구: i번째 전구 밝기 */
export function bulbLevel(index: number, time: number): number {
  const L = K.bulbChaseLength;
  const pos = (((index - time * K.bulbChaseSpeed) % L) + L) % L;
  const f = 1 - pos / L;
  return K.bulbMinAlpha + (1 - K.bulbMinAlpha) * f * f;
}

// ───────────── 목마 스프라이트 ─────────────

/** 오른쪽을 보는 목마 (22x18), 앞발 하나를 든 모습. B 몸, D 그늘, M 갈기, T 꼬리, S 안장, E 눈 */
const HORSE: readonly string[] = [
  '...............MM.....',
  '..............MBBB....',
  '.............MBBBBB...',
  '.............MBBEBBB..',
  '............MMBBBBBBBB',
  '............MBBB...DBD',
  '...........MMBBB......',
  'TT.........MBBBB......',
  'TTT......SSSBBBB......',
  '.TTBBBBBBSSSBBBB......',
  '..TBBBBBBSSSBBBBB.....',
  '...BBBBBBBBBBBBBBBDD..',
  '...BBBBBBBBBBBBBB..DD.',
  '...BBD.......BBD....D.',
  '...BD.......BD.....D..',
  '..BD........BD........',
  '.BD.........D.........',
  '.D..........D.........',
];
export const HORSE_WIDTH = HORSE[0].length;
export const HORSE_HEIGHT = HORSE.length;

/** 가까운 이웃 방식으로 줄인다 (뒤쪽 말) */
function resample(rows: readonly string[], w: number, h: number): string[] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => rows[Math.floor((y * rows.length) / h)][Math.floor((x * rows[0].length) / w)]).join(''),
  );
}

const SMALL_HORSE = resample(HORSE, Math.round(HORSE_WIDTH * K.backScale), Math.round(HORSE_HEIGHT * K.backScale));

const horseCache = new Map<string, HTMLCanvasElement>();

function horseSprite(index: number, small: boolean, facing: Facing, level: number): HTMLCanvasElement {
  const key = `${index % C.horses.length}|${index % C.saddles.length}|${small}|${facing}|${level}`;
  const cached = horseCache.get(key);
  if (cached) return cached;
  const look = C.horses[index % C.horses.length];
  const t = (level / (K.shadeLevels - 1)) * K.maxShade;
  const dim = (c: string) => mixColor(c, C.shadeTarget, t);
  const palette: Record<string, string> = {
    B: dim(look.body),
    D: dim(look.shade),
    M: dim(look.mane),
    T: dim(look.mane),
    S: dim(C.saddles[index % C.saddles.length]),
    E: dim(C.eye),
  };
  const rows = small ? SMALL_HORSE : HORSE;
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(facing === 'right' ? x : row.length - 1 - x, y, 1, 1);
    }),
  );
  horseCache.set(key, canvas);
  return canvas;
}

// ───────────── 미리 그리기 ─────────────

function paintPlatform(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number): void {
  const ry = K.platformRadiusY;
  // 앞 테두리 (나무 + 위아래 금선)
  for (let dx = -rx; dx < rx; dx++) {
    const edge = cy + Math.round(ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));
    ctx.fillStyle = C.rim;
    ctx.fillRect(cx + dx, edge, 1, K.rimHeight);
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx + dx, edge, 1, 1);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(cx + dx, edge + K.rimHeight - 1, 1, 1);
  }
  // 윗면 나무 판
  ctx.fillStyle = C.platformTop;
  fillPixelEllipse(ctx, cx, cy, rx, ry);
  ctx.fillStyle = C.plank;
  for (let dy = -ry + 2; dy < ry; dy += 3) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2)) - 2;
    if (half > 0) ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

function paintPole(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number): void {
  const half = K.poleHalfWidth;
  for (let x = -half; x < half; x++) {
    ctx.fillStyle = Math.floor((x + half) / 3) % 2 === 0 ? C.mirror : C.mirrorDark;
    ctx.fillRect(cx + x, top, 1, bottom - top);
  }
  for (let y = top + 2; y < bottom; y += K.poleBandEvery) {
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx - half - 1, y, half * 2 + 2, 2);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(cx - half - 1, y + 2, half * 2 + 2, 1);
  }
}

/** 지붕 한 장 (phaseIndex번째 회전 모습). 버퍼 y 0 = 꼭대기 */
function paintRoof(ctx: CanvasRenderingContext2D, phaseIndex: number): void {
  const R = K.roofHalfWidth;
  const ox = R + 1;
  const stripeAngle = (Math.PI * 2) / K.stripeCount;
  const phase = (phaseIndex / K.roofFrames) * stripeAngle * 2;
  for (let dx = -R; dx <= R; dx++) {
    const a = Math.abs(dx) / R;
    const colTop = Math.round(K.roofHeight * a ** (1 / K.roofCurve));
    const colBottom = K.roofHeight + Math.round(K.roofSag * (1 - a * a));
    for (let y = colTop; y < colBottom; y++) {
      const t = Math.min(1, Math.max(0.001, y / K.roofHeight));
      const halfW = R * t ** K.roofCurve;
      const u = Math.max(-1, Math.min(1, dx / halfW));
      const stripe = Math.floor((Math.asin(u) - phase) / stripeAngle);
      const edge = Math.abs(u) > K.roofEdgeShade;
      const even = ((stripe % 2) + 2) % 2 === 0;
      ctx.fillStyle = even ? (edge ? C.stripeAShade : C.stripeA) : edge ? C.stripeBShade : C.stripeB;
      ctx.fillRect(ox + dx, y, 1, 1);
    }
    // 금색 장식 띠
    ctx.fillStyle = C.gold;
    ctx.fillRect(ox + dx, colBottom, 1, K.goldBandHeight - 1);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(ox + dx, colBottom + K.goldBandHeight - 1, 1, 1);
    // 반원 술 장식 (빨강·크림 번갈아)
    const w = K.scallopWidth;
    const scallop = Math.floor((dx + R) / w);
    const local = ((dx + R) % w) - w / 2 + 0.5;
    for (let r = 0; r < K.valanceHeight; r++) {
      const half = (w / 2) * Math.sqrt(1 - (r / K.valanceHeight) ** 2);
      if (Math.abs(local) > half) continue;
      ctx.fillStyle = scallop % 2 === 0 ? C.stripeB : C.stripeA;
      ctx.fillRect(ox + dx, colBottom + K.goldBandHeight + r, 1, 1);
    }
  }
  // 꼭대기 금 장식
  ctx.fillStyle = C.gold;
  ctx.fillRect(ox - 1, 0, 3, 2);
}

// ───────────── 회전목마 소품 ─────────────

export interface CarouselProp extends DepthDrawable {
  update(dt: number): void;
  /** 주변 바닥에 번지는 불빛 (시설보다 먼저, 바닥 위에 그린다) */
  drawFloorGlow(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

export function createCarousel(): CarouselProp {
  const g = carouselGeometry();
  const R = K.roofHalfWidth;
  const platformBuffer = lazyBuffer(g.platformRadiusX * 2 + 2, K.platformRadiusY * 2 + K.rimHeight + 1, (ctx) =>
    paintPlatform(ctx, g.platformRadiusX + 1, K.platformRadiusY, g.platformRadiusX),
  );
  const poleTop = roofBottomAt(0);
  const poleBuffer = lazyBuffer(K.poleHalfWidth * 2 + 2, g.platformY - poleTop, (ctx) =>
    paintPole(ctx, K.poleHalfWidth + 1, 0, g.platformY - poleTop),
  );
  const roofBufferHeight = K.roofHeight + K.roofSag + K.goldBandHeight + K.valanceHeight + 1;
  const roofFrames: (() => PixelBuffer)[] = Array.from({ length: K.roofFrames }, (_, k) =>
    lazyBuffer(R * 2 + 3, roofBufferHeight, (ctx) => paintRoof(ctx, k)),
  );
  const bulbCount = Math.floor((R * 2) / K.bulbSpacing);
  let time = 0;

  const drawHorse = (ctx: CanvasRenderingContext2D, h: HorseState, ox: number) => {
    const level = shadeLevel(h.z);
    const shade = (level / (K.shadeLevels - 1)) * K.maxShade;
    const x = Math.round(h.x) - ox;
    const dx = h.x - CAROUSEL_X;
    // 금 막대: 지붕 술 장식 아래부터 판 윗면까지
    const rodTop = roofBottomAt(dx) + K.goldBandHeight + K.valanceHeight;
    const rodBottom = g.platformY + Math.round(h.z * K.platformRadiusY * 0.7);
    ctx.fillStyle = mixColor(C.gold, C.shadeTarget, shade);
    ctx.fillRect(x, rodTop, 1, rodBottom - rodTop);
    const sprite = horseSprite(h.index, h.z < 0, h.facing, level);
    ctx.drawImage(sprite, x - Math.floor(sprite.width / 2), Math.round(h.y) - sprite.height);
  };

  return {
    footY: g.rimBottom,
    update(dt: number) {
      time += dt;
    },
    drawFloorGlow(ctx: CanvasRenderingContext2D, camera: Camera) {
      const cx = CAROUSEL_X - layerOffsetX(camera, LAYER_FACTORS.main);
      const pulse = 1 - K.floorGlowPulse * (0.5 + 0.5 * Math.sin((Math.PI * 2 * time) / K.floorGlowPeriod));
      ctx.save();
      ctx.fillStyle = C.floorGlow;
      ctx.globalAlpha = (K.floorGlowAlpha * pulse) / K.floorGlowRings;
      for (let i = 0; i < K.floorGlowRings; i++) {
        const f = (K.floorGlowRings - i) / K.floorGlowRings;
        fillPixelEllipse(ctx, cx, g.rimBottom - 2, Math.round(K.floorGlowRadiusX * f), Math.round(K.floorGlowRadiusY * f));
      }
      ctx.restore();
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const cx = CAROUSEL_X - ox;
      const horses = horseStates(time);

      ctx.drawImage(platformBuffer().canvas, cx - g.platformRadiusX - 1, g.platformY - K.platformRadiusY);
      for (const h of horses) if (h.z < 0) drawHorse(ctx, h, ox);
      ctx.drawImage(poleBuffer().canvas, cx - K.poleHalfWidth - 1, poleTop);
      for (const h of horses) if (h.z >= 0) drawHorse(ctx, h, ox);

      // 지붕: 말과 같은 속도로 도는 줄무늬
      const stripeSpan = ((Math.PI * 2) / K.stripeCount) * 2;
      const turned = (((Math.PI * 2) / K.rotationPeriod) * time) % stripeSpan;
      const frame = Math.floor((turned / stripeSpan) * K.roofFrames) % K.roofFrames;
      ctx.drawImage(roofFrames[frame]().canvas, cx - R - 1, g.apexY);

      // 금 띠 위 전구: 한 방향으로 흐르듯 차례로 밝아진다
      ctx.save();
      for (let i = 0; i < bulbCount; i++) {
        const dx = -R + Math.floor(K.bulbSpacing / 2) + i * K.bulbSpacing;
        const y = roofBottomAt(dx);
        const level = bulbLevel(i, time);
        ctx.globalAlpha = K.bulbGlowAlpha * level;
        ctx.fillStyle = C.bulbGlow;
        ctx.fillRect(cx + dx - 1, y - 1, 3, 3);
        ctx.globalAlpha = level;
        ctx.fillStyle = C.bulb;
        ctx.fillRect(cx + dx, y, 1, 1);
      }
      ctx.restore();

      // 꼭대기 작은 깃발 (펄럭이는 2장)
      const poleTopY = g.apexY - K.flagPoleHeight;
      ctx.fillStyle = C.gold;
      ctx.fillRect(cx, poleTopY, 1, K.flagPoleHeight);
      ctx.fillStyle = C.flag;
      const wave = Math.floor(time / K.flagWavePeriod) % 2;
      for (let x = 0; x < K.flagWidth; x++) {
        const h = Math.max(1, Math.round(K.flagHeight * (1 - x / K.flagWidth)));
        const lift = wave === 1 && x > K.flagWidth / 2 ? 1 : 0;
        ctx.fillRect(cx + 1 + x, poleTopY + Math.floor((K.flagHeight - h) / 2) + lift, 1, h);
      }
    },
  };
}
