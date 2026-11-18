// 얼음 링크: 옆에서 본 모서리 둥근 사각형. 얼음(바닥에 납작), 뒤 울타리, 앞 울타리(스케이터보다 앞)로 나눠 그린다.
// 얼음 위에는 주변 불빛이 세로로 길게, 반 밝기로 일렁이며 비친다.
// 앞 울타리 입구는 닫힌 문 + '준비 중' 자물쇠 그림 팻말.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, REFLECTION as F, RINK as K, RINK_COLORS as C } from '../constants';
import { createRng, randRange, type Rng } from '../random';
import { lazyBuffer } from '../scenery/buffer';
import { RINK_GATE_OFFSET, getObstacle } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { mixColor, stampPixels } from './pixel';

// ───────────── 모양 (순수) ─────────────

export function rinkBounds() {
  const o = getObstacle('rink');
  return {
    left: o.x,
    right: o.x + o.w,
    top: o.y,
    bottom: o.y + o.h,
    centerX: o.x + o.w / 2,
    midY: Math.round(o.y + o.h / 2),
  };
}

/** 열 x에서 뒤 울타리 y와 앞 울타리 y (모서리에서는 둥글게 안으로 들어온다). 링크 밖이면 null */
export function rinkEdgeAt(x: number): { top: number; bottom: number } | null {
  const b = rinkBounds();
  if (x < b.left || x >= b.right) return null;
  const fromSide = Math.min(x - b.left, b.right - 1 - x);
  if (fromSide >= K.cornerRadiusX) return { top: b.top, bottom: b.bottom - 1 };
  const a = 1 - fromSide / K.cornerRadiusX;
  const k = Math.round(K.cornerRadiusY * (1 - Math.sqrt(1 - a * a)));
  return { top: b.top + k, bottom: b.bottom - 1 - k };
}

/** (x, y)가 얼음 위인가 (울타리 선 안쪽) */
export function onIce(x: number, y: number): boolean {
  const e = rinkEdgeAt(Math.round(x));
  return e !== null && y > e.top && y < e.bottom;
}

/** 닫힌 입구 문의 x 범위 (앞 울타리 위) */
export function gateSpan(): { left: number; right: number } {
  const center = rinkBounds().left + RINK_GATE_OFFSET;
  return { left: center - K.gateWidth / 2, right: center + K.gateWidth / 2 };
}

/** 비친 색: 원래 색의 반 밝기 */
export function reflectionColor(color: string): string {
  return mixColor(color, '#000000', F.dim);
}

/** 얼음에 비치는 불빛 하나 */
export interface IceLight {
  x: number;
  /** 비침이 시작하는 y (뒤 울타리 아래) */
  top: number;
  length: number;
  width: number;
  color: string;
  /** 0~1 지금 밝기 */
  level: number;
}

// ───────────── 미리 그리기 ─────────────

function paintIce(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const b = rinkBounds();
  const depth = b.bottom - b.top;
  for (let x = b.left; x < b.right; x++) {
    const e = rinkEdgeAt(x)!;
    for (let y = e.top; y <= e.bottom; y++) {
      const f = (y - b.top) / depth;
      let band = K.iceBands.findIndex((s) => f < s.untilFraction);
      if (band < 0) band = K.iceBands.length - 1;
      // 띠 경계 바로 위 한 줄은 점묘로 섞는다
      const next = K.iceBands[band + 1];
      const nearEdge = next && (K.iceBands[band].untilFraction - f) * depth < 1.5;
      ctx.fillStyle = nearEdge && (x + y) % 2 === 0 ? next.color : K.iceBands[band].color;
      ctx.fillRect(x - b.left, y - b.top, 1, 1);
    }
  }
  // 긁힌 자국: 가운데를 도는 타원 조각들, 군데군데 더 밝게
  const cy = b.midY;
  for (let i = 0; i < K.scratchCount; i++) {
    const rx = randRange(rng, K.scratchMinRadiusX, K.scratchMaxRadiusX);
    const ry = rx * ((depth / 2 - 4) / (b.right - b.left) * 2) * randRange(rng, 0.7, 1);
    const start = randRange(rng, 0, Math.PI * 2);
    const arc = randRange(rng, K.scratchMinArc, K.scratchMaxArc);
    const steps = Math.ceil(rx * arc);
    for (let s = 0; s <= steps; s++) {
      const t = start + (arc * s) / steps;
      const x = Math.round(b.centerX + rx * Math.sin(t));
      const y = Math.round(cy + ry * Math.cos(t));
      if (!onIce(x, y)) continue;
      ctx.fillStyle = s % 7 === 3 ? C.scratchBright : C.scratch;
      ctx.fillRect(x - b.left, y - b.top, 1, 1);
    }
  }
}

/** 울타리 한 열 (위에서 아래로: 눈 · 윗 가로대 · 판자 · 아래 그늘) */
function paintFenceColumn(ctx: CanvasRenderingContext2D, x: number, footY: number, rise: number, snow: boolean, wood: string): void {
  const h = K.fenceHeight + rise;
  const top = footY - h + 1;
  ctx.fillStyle = wood;
  ctx.fillRect(x, top, 1, h);
  ctx.fillStyle = C.fenceLight;
  ctx.fillRect(x, top + 1, 1, 1);
  ctx.fillStyle = C.fenceDark;
  ctx.fillRect(x, footY, 1, 1);
  if (snow) {
    ctx.fillStyle = C.snow;
    ctx.fillRect(x, top, 1, 1);
  }
}

function fenceWood(x: number, left: number): { wood: string; rise: number } {
  const local = x - left;
  if (local % K.fencePostEvery === 0) return { wood: C.fenceDark, rise: K.fencePostRise };
  return { wood: local % K.fenceBoardEvery === 0 ? C.fenceDark : C.fence, rise: 0 };
}

/** 뒤 울타리 (윗선 + 양옆 위쪽 절반). 버퍼 원점 = (left, top - 높이) */
function paintBackFence(ctx: CanvasRenderingContext2D, rng: Rng, oy: number): void {
  const b = rinkBounds();
  for (let x = b.left; x < b.right; x++) {
    const { wood, rise } = fenceWood(x, b.left);
    paintFenceColumn(ctx, x - b.left, rinkEdgeAt(x)!.top - oy, rise, rng() < K.fenceSnowChance, wood);
  }
  paintSides(ctx, oy, rinkEdgeAt(b.left)!.top, b.midY);
}

/** 옆 울타리: 깊이 방향으로 늘어선 판자를 옆에서 보면 세로 띠 */
function paintSides(ctx: CanvasRenderingContext2D, oy: number, fromY: number, toY: number): void {
  const b = rinkBounds();
  for (const [x, inner] of [
    [b.left, b.left + 1],
    [b.right - 1, b.right - 2],
  ]) {
    ctx.fillStyle = C.fence;
    ctx.fillRect(x - b.left, fromY - K.fenceHeight + 1 - oy, 1, toY - fromY + K.fenceHeight);
    ctx.fillStyle = C.fenceDark;
    ctx.fillRect(inner - b.left, fromY - K.fenceHeight + 2 - oy, 1, toY - fromY + K.fenceHeight - 1);
  }
}

/** '준비 중' 팻말: 글자 대신 자물쇠 그림 (S 고리, L 몸통, l 그늘, D 열쇠 구멍) */
const PADLOCK: readonly string[] = [
  '..SSS..',
  '.S...S.',
  '.S...S.',
  'LLLLLLL',
  'LLLDLLl',
  'LLLDLLl',
  'lllllll',
];

function paintGate(ctx: CanvasRenderingContext2D, oy: number): void {
  const b = rinkBounds();
  const g = gateSpan();
  const foot = b.bottom - 1 - oy;
  const top = foot - K.fenceHeight + 1;
  // 문짝: 세로 판자 + 대각선 버팀목
  for (let x = g.left; x < g.right; x++) {
    ctx.fillStyle = (x - g.left) % 3 === 0 ? C.fenceDark : C.gate;
    ctx.fillRect(x - b.left, top + 1, 1, K.fenceHeight - 1);
    const t = (x - g.left) / (g.right - g.left - 1);
    ctx.fillStyle = C.fenceLight;
    ctx.fillRect(x - b.left, top + 1 + Math.round(t * (K.fenceHeight - 3)), 1, 1);
  }
  // 양쪽 문 기둥 (더 높이, 위에 눈)
  for (const x of [g.left - 1, g.right]) {
    ctx.fillStyle = C.fenceDark;
    ctx.fillRect(x - b.left, top - K.gatePostRise, 1, K.fenceHeight + K.gatePostRise);
    ctx.fillStyle = C.snow;
    ctx.fillRect(x - b.left, top - K.gatePostRise, 1, 1);
  }
  // 문 가운데 걸린 팻말
  const signLeft = Math.round((g.left + g.right) / 2 - K.signWidth / 2) - b.left;
  const signTop = top - K.signRise;
  ctx.fillStyle = C.signBorder;
  ctx.fillRect(signLeft, signTop, K.signWidth, K.signHeight);
  ctx.fillStyle = C.signBoard;
  ctx.fillRect(signLeft + 1, signTop + 1, K.signWidth - 2, K.signHeight - 2);
  stampPixels(
    ctx,
    PADLOCK,
    { S: C.lockShackle, L: C.lockBody, l: C.lockShade, D: C.lockHole },
    signLeft + Math.floor((K.signWidth - PADLOCK[0].length) / 2),
    signTop + Math.floor((K.signHeight - PADLOCK.length) / 2),
  );
}

/** 앞 울타리 (아랫선 + 양옆 아래쪽 절반 + 입구 문) */
function paintFrontFence(ctx: CanvasRenderingContext2D, rng: Rng, oy: number): void {
  const b = rinkBounds();
  const g = gateSpan();
  paintSides(ctx, oy, b.midY, rinkEdgeAt(b.left)!.bottom);
  for (let x = b.left; x < b.right; x++) {
    if (x >= g.left && x < g.right) continue;
    const { wood, rise } = fenceWood(x, b.left);
    paintFenceColumn(ctx, x - b.left, rinkEdgeAt(x)!.bottom - oy, rise, rng() < K.fenceSnowChance, wood);
  }
  paintGate(ctx, oy);
}

// ───────────── 링크 소품 ─────────────

export interface IceRink {
  /** 얼음 + 긁힌 자국 + 반짝임 + 비침 (바닥에 납작, 시설보다 먼저) */
  drawIce(ctx: CanvasRenderingContext2D, camera: Camera, lights: readonly IceLight[]): void;
  backFence: DepthDrawable;
  frontFence: DepthDrawable;
  update(dt: number): void;
}

interface Sparkle {
  x: number;
  y: number;
  period: number;
  phase: number;
}

export function createIceRink(seed: number): IceRink {
  const b = rinkBounds();
  const width = b.right - b.left;
  const above = K.fenceHeight + K.signRise + K.gatePostRise + 2;
  const iceBuffer = lazyBuffer(width, b.bottom - b.top + 1, (ctx) => paintIce(ctx, createRng(seed)));
  const backBuffer = lazyBuffer(width, b.midY - b.top + above + 1, (ctx) => paintBackFence(ctx, createRng(seed + 1), b.top - above));
  const frontBuffer = lazyBuffer(width, b.bottom - b.midY + above + 1, (ctx) =>
    paintFrontFence(ctx, createRng(seed + 2), b.midY - above),
  );

  const rng = createRng(seed + 3);
  const sparkles: Sparkle[] = [];
  while (sparkles.length < K.sparkleCount) {
    const x = Math.round(randRange(rng, b.left, b.right));
    const y = Math.round(randRange(rng, b.top, b.bottom));
    if (!onIce(x, y) || !onIce(x, y - 1) || !onIce(x, y + 1)) continue;
    sparkles.push({ x, y, period: randRange(rng, K.sparkleMinPeriod, K.sparkleMaxPeriod), phase: randRange(rng, 0, Math.PI * 2) });
  }
  let time = 0;

  const drawReflection = (ctx: CanvasRenderingContext2D, light: IceLight, ox: number) => {
    const color = reflectionColor(light.color);
    ctx.fillStyle = color;
    // 한 줄 걸러 끊어진 물결 무늬로 (빈 줄 사이로 얼음이 보인다)
    for (let r = 0; r < light.length; r += F.rowStep) {
      const y = light.top + r;
      // 줄마다 좌우로 살짝 흔들리고 깜빡인다
      const sway = Math.round(Math.sin(time * F.shimmerSpeed + y * F.shimmerRowFreq + light.x * 0.37) * F.shimmerAmp);
      const flicker = 1 - F.flickerDepth * (0.5 + 0.5 * Math.sin(time * F.flickerSpeed + y * 1.3 + light.x));
      ctx.globalAlpha = F.alpha * light.level * flicker * (1 - r / light.length);
      for (let w = 0; w < light.width; w++) {
        const x = Math.round(light.x) - Math.floor(light.width / 2) + w + sway;
        if (!onIce(x, y)) continue;
        ctx.fillRect(x - ox, y, 1, 1);
      }
    }
  };

  return {
    update(dt: number) {
      time += dt;
    },
    drawIce(ctx, camera, lights) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(iceBuffer().canvas, b.left - ox, b.top);
      ctx.save();
      for (const light of lights) drawReflection(ctx, light, ox);
      ctx.restore();
      ctx.fillStyle = C.sparkle;
      for (const s of sparkles) {
        const v = Math.sin((Math.PI * 2 * time) / s.period + s.phase);
        if (v < K.sparkleOn) continue;
        const x = s.x - ox;
        ctx.fillRect(x, s.y, 1, 1);
        if (v > K.sparkleCross) {
          ctx.fillRect(x - 1, s.y, 3, 1);
          ctx.fillRect(x, s.y - 1, 1, 3);
        }
      }
    },
    backFence: {
      footY: b.top,
      draw(ctx, camera) {
        ctx.drawImage(backBuffer().canvas, b.left - layerOffsetX(camera, LAYER_FACTORS.main), b.top - above);
      },
    },
    frontFence: {
      footY: b.bottom,
      draw(ctx, camera) {
        ctx.drawImage(frontBuffer().canvas, b.left - layerOffsetX(camera, LAYER_FACTORS.main), b.midY - above);
      },
    },
  };
}
