// 회전목마 입구: 어디로 타러 가야 하는지 한눈에 보이게 한다.
//   빨간 카펫(바닥) → 나무 계단 2칸 → 빨간 기둥 두 개와 반원 아치(전구, 꼭대기 금별, 기둥 아래 리스) → 양옆 금 기둥과 벨벳 줄.
// 깊이: 아치 위쪽·계단은 캐릭터보다 뒤, 기둥은 그 앞, 줄 기둥은 맨 앞 — 세 조각을 따로 y 정렬한다.
// 캐릭터가 입구 가까이 오면 전구가 밝아지고 작은 반짝이가 튄다. 올라타는 순간 오른쪽 줄이 잠깐 풀렸다 다시 걸린다.
// 움직이지 않는 부분은 한 번 그려 두고, 전구·반짝이·줄만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { CAROUSEL_COLORS, ENTRANCE as E, ENTRANCE_COLORS as C, LAYER_FACTORS } from '../constants';
import { lazyBuffer } from '../scenery/buffer';
import { CAROUSEL_GATE as G, CAROUSEL_X } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { carouselGeometry } from './carousel';
import { stampPixels } from './pixel';

// ───────────── 위치 계산 (순수) ─────────────

export function gateGeometry() {
  const rimBottom = carouselGeometry().rimBottom;
  const footY = rimBottom + G.stepsDepth;
  const springY = footY - E.pillarHeight;
  const radius = G.pillarOffset + G.pillarWidth / 2;
  return {
    cx: CAROUSEL_X,
    rimBottom,
    /** 기둥이 바닥에 닿는 y (카펫이 시작하는 곳) */
    footY,
    /** 기둥이 끝나고 반원이 시작하는 y */
    springY,
    /** 반원 바깥 반지름 */
    radius,
    /** 아치 꼭대기 y, 별 장식까지 포함한 맨 위 y */
    topY: springY - radius,
    ornamentTopY: springY - radius - STAR.length,
    width: radius * 2,
    height: footY - (springY - radius),
    carpetEndY: footY + G.carpetLength,
  };
}

export interface ArchBulb {
  x: number;
  y: number;
  /** 아래에서부터 몇 번째 단인가 (0 = 맨 아래) */
  level: number;
  /** 반원 위에 달렸는가 (아니면 기둥) */
  onArc: boolean;
}

/** 아치 테두리를 따라 달린 전구: 양쪽 대칭, 아래 → 위 순서의 단 */
export function archBulbs(): ArchBulb[] {
  const g = gateGeometry();
  const mid = g.radius - E.archThickness / 2;
  const bulbs: ArchBulb[] = [];
  for (const side of [-1, 1]) {
    E.pillarBulbsAbove.forEach((above, level) => {
      bulbs.push({ x: g.cx + side * G.pillarOffset, y: g.footY - above, level, onArc: false });
    });
    E.arcBulbAngles.forEach((degrees, i) => {
      const a = (degrees * Math.PI) / 180;
      bulbs.push({
        x: Math.round(g.cx + side * mid * Math.cos(a)),
        y: Math.round(g.springY - mid * Math.sin(a)),
        level: E.pillarBulbsAbove.length + i,
        onArc: true,
      });
    });
  }
  return bulbs;
}

export const ARCH_LEVELS = E.pillarBulbsAbove.length + E.arcBulbAngles.length;

/**
 * 이 단 전구의 밝기 (0~1). 평소엔 은은하게, flowPeriod초마다 불빛이 아래에서 위로 한 번 흐른다.
 * 캐릭터가 가까이 오면(near) 바탕 밝기가 한 단계 올라간다.
 */
export function archBulbLevel(level: number, time: number, near: boolean): number {
  const base = near ? E.nearLevel : E.idleLevel;
  const t = ((time % E.flowPeriod) + E.flowPeriod) % E.flowPeriod;
  // 흐르는 불빛의 머리 위치 (단 번호). 다 지나가면 다음 주기까지 쉰다
  const head = (t / E.flowDuration) * (ARCH_LEVELS + 1) - 1;
  const boost = t <= E.flowDuration ? Math.max(0, 1 - Math.abs(head - level)) : 0;
  return base + (1 - base) * boost;
}

/** 오른쪽 줄이 얼마나 풀렸나 (0 = 걸림, 1 = 다 풀림): 올라타는 순간부터 ropeOpenSeconds 동안 풀렸다 다시 걸린다 */
export function ropeOpenness(sinceOpened: number): number {
  if (sinceOpened < 0 || sinceOpened >= E.ropeOpenSeconds) return 0;
  return Math.sin((Math.PI * sinceOpened) / E.ropeOpenSeconds);
}

/** 줄 기둥 꼭대기와 아치 기둥의 고리 (side = -1 왼쪽, 1 오른쪽) */
export function ropeEnds(side: number): { post: { x: number; y: number }; hook: { x: number; y: number } } {
  const g = gateGeometry();
  return {
    post: { x: g.cx + side * G.ropePostOffset, y: g.carpetEndY - E.postHeight + 1 },
    hook: { x: g.cx + side * G.pillarOffset, y: g.footY - E.ropeHookAbove },
  };
}

// ───────────── 미리 그리기 ─────────────

/** 아치 꼭대기 금별 */
const STAR = ['..X..', '.XXX.', 'XXXXX', '.XXX.', 'X...X'];

/** 기둥과 아치에 감은 금 띠: 비스듬히 일정한 간격으로 */
function banded(along: number, across: number): boolean {
  return (((along + across) % E.bandEvery) + E.bandEvery) % E.bandEvery < E.bandWidth;
}

/** 뒤 조각: 나무 계단 2칸 + 반원 아치 + 별. 버퍼 원점 = (cx - radius - 1, ornamentTopY - 1) */
function paintBack(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const g = gateGeometry();
  const cx = g.cx - ox;
  const spring = g.springY - oy;

  // 반원 아치: 짙은 빨강에 금 띠, 바깥·안쪽 테두리
  for (let dy = 0; dy <= g.radius; dy++) {
    for (let dx = -g.radius; dx <= g.radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > g.radius + 0.3 || d < g.radius - E.archThickness) continue;
      const along = Math.round((Math.atan2(dy, dx) * g.radius) / 1);
      let color: string = banded(along, Math.round(d)) ? C.gold : C.pillar;
      if (d > g.radius - 0.8) color = C.goldShade;
      else if (d < g.radius - E.archThickness + 1) color = C.pillarShade;
      ctx.fillStyle = color;
      ctx.fillRect(cx + dx, spring - dy, 1, 1);
    }
  }
  stampPixels(ctx, STAR, { X: C.star }, cx - Math.floor(STAR[0].length / 2), g.ornamentTopY - oy);

  // 계단 2칸: 위 칸은 바닥 판 테두리에 걸치고, 아래 칸은 카펫과 만난다. 칸마다 밝은 윗면 + 어두운 앞면
  const half = G.carpetHalfWidth;
  const stepTop = g.rimBottom - E.stepRise - oy;
  ctx.fillStyle = C.stepTop;
  ctx.fillRect(cx - half + 1, stepTop, half * 2 - 2, E.stepRise);
  ctx.fillStyle = C.stepFront;
  ctx.fillRect(cx - half + 1, stepTop + E.stepRise - 1, half * 2 - 2, 1);
  ctx.fillStyle = C.stepTop;
  ctx.fillRect(cx - half, g.rimBottom - oy, half * 2, G.stepsDepth);
  ctx.fillStyle = C.stepFront;
  ctx.fillRect(cx - half, g.footY - 1 - oy, half * 2, 1);
  ctx.fillStyle = C.stepEdge;
  ctx.fillRect(cx - half, g.rimBottom - oy, half * 2, 1);
}

/** 앞 조각: 기둥 두 개 (금 띠, 금 받침과 머리) + 기둥 아래 리스와 리본. 버퍼 원점 = (cx - radius - 2, springY) */
function paintPillars(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
  const g = gateGeometry();
  for (const side of [-1, 1]) {
    const left = g.cx + side * G.pillarOffset - G.pillarWidth / 2 - ox;
    for (let y = g.springY; y < g.footY; y++) {
      for (let x = 0; x < G.pillarWidth; x++) {
        ctx.fillStyle = banded(y - g.springY, x) ? C.gold : x === G.pillarWidth - 1 ? C.pillarShade : C.pillar;
        ctx.fillRect(left + x, y - oy, 1, 1);
      }
    }
    // 금 머리와 받침 (기둥보다 한 칸씩 넓다)
    ctx.fillStyle = C.gold;
    ctx.fillRect(left - 1, g.springY - oy, G.pillarWidth + 2, 2);
    ctx.fillRect(left - 1, g.footY - 2 - oy, G.pillarWidth + 2, 2);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(left - 1, g.footY - 1 - oy, G.pillarWidth + 2, 1);

    // 작은 리스와 빨간 리본
    const wx = g.cx + side * G.pillarOffset - ox;
    const wy = g.footY - E.wreathAbove - oy;
    for (let dy = -E.wreathRadius; dy <= E.wreathRadius; dy++) {
      for (let dx = -E.wreathRadius; dx <= E.wreathRadius; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > E.wreathRadius + 0.3 || d < E.wreathRadius - 1.4) continue;
        ctx.fillStyle = (dx + dy) % 2 === 0 ? C.wreath : C.wreathDark;
        ctx.fillRect(wx + dx, wy + dy, 1, 1);
      }
    }
    ctx.fillStyle = C.bow;
    ctx.fillRect(wx - 1, wy + E.wreathRadius, 3, 1);
    ctx.fillRect(wx - 1, wy + E.wreathRadius + 1, 1, 1);
    ctx.fillRect(wx + 1, wy + E.wreathRadius + 1, 1, 1);
  }
}

// ───────────── 입구 소품 ─────────────

interface Sparkle {
  x: number;
  y: number;
  age: number;
}

export interface CarouselEntrance {
  /** 아치 위쪽과 계단 (회전목마 바로 앞, 캐릭터보다 뒤) */
  back: DepthDrawable;
  /** 아치 기둥 (그 사이를 지나는 캐릭터보다 앞) */
  pillars: DepthDrawable;
  /** 줄 서는 금 기둥과 벨벳 줄 (맨 앞) */
  ropes: DepthDrawable;
  update(dt: number): void;
  /** 빨간 카펫 (바닥에 납작, 시설보다 먼저) */
  drawCarpet(ctx: CanvasRenderingContext2D, camera: Camera): void;
  /** 캐릭터가 입구 가까이 있는가 */
  setNear(near: boolean): void;
  /** 올라타는 순간: 오른쪽 줄이 잠깐 풀린다 */
  openRope(): void;
}

export function createCarouselEntrance(random: () => number = Math.random): CarouselEntrance {
  const g = gateGeometry();
  const bulbs = archBulbs();
  const backLeft = g.cx - g.radius - 1;
  const backTop = g.ornamentTopY - 1;
  const backBuffer = lazyBuffer(g.width + 3, g.footY - backTop + 1, (ctx) => paintBack(ctx, backLeft, backTop));
  const pillarLeft = g.cx - g.radius - 2;
  const pillarBuffer = lazyBuffer(g.width + 5, g.footY - g.springY + 1, (ctx) => paintPillars(ctx, pillarLeft, g.springY));

  let time = 0;
  let near = false;
  let ropeOpenedAt = -Infinity;
  let sparkleTimer = 0;
  const sparkles: Sparkle[] = [];

  const drawBulbs = (ctx: CanvasRenderingContext2D, ox: number, onArc: boolean) => {
    ctx.save();
    for (const bulb of bulbs) {
      if (bulb.onArc !== onArc) continue;
      const level = archBulbLevel(bulb.level, time, near);
      ctx.fillStyle = C.bulbGlow;
      ctx.globalAlpha = E.bulbGlowAlpha * level;
      ctx.fillRect(bulb.x - 1 - ox, bulb.y - 1, 3, 3);
      ctx.fillStyle = C.bulb;
      ctx.globalAlpha = level;
      ctx.fillRect(bulb.x - ox, bulb.y, 1, 1);
    }
    ctx.restore();
  };

  /** 처진 줄 한 가닥: 기둥 꼭대기에서 끝점까지, 가운데가 sag만큼 처진다 */
  const drawRope = (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, sag: number, ox: number) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(from.x + (to.x - from.x) * t) - ox;
      const y = Math.round(from.y + (to.y - from.y) * t + sag * 4 * t * (1 - t));
      ctx.fillStyle = C.rope;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = C.ropeShade;
      ctx.fillRect(x, y + 1, 1, 1);
    }
  };

  return {
    update(dt: number) {
      time += dt;
      for (const s of sparkles) s.age += dt;
      while (sparkles.length > 0 && sparkles[0].age >= E.sparkleLife) sparkles.shift();
      if (!near) return;
      // 가까이 있는 동안 아치 둘레에서 작은 반짝이가 튄다 (한 번에 최대 sparkleMax개)
      sparkleTimer -= dt;
      if (sparkleTimer <= 0 && sparkles.length < E.sparkleMax) {
        const a = random() * Math.PI;
        const r = g.radius + E.sparkleSpread * (random() * 2 - 1);
        sparkles.push({ x: Math.round(g.cx + r * Math.cos(a)), y: Math.round(g.springY - r * Math.sin(a)), age: 0 });
        sparkleTimer = E.sparkleEvery;
      }
    },
    setNear(next: boolean) {
      near = next;
    },
    openRope() {
      ropeOpenedAt = time;
    },
    drawCarpet(ctx: CanvasRenderingContext2D, camera: Camera) {
      const x = g.cx - G.carpetHalfWidth - layerOffsetX(camera, LAYER_FACTORS.main);
      const w = G.carpetHalfWidth * 2;
      ctx.fillStyle = C.carpet;
      ctx.fillRect(x, g.footY, w, G.carpetLength);
      // 양옆 금 줄무늬와 가운데 조금 밝은 길
      ctx.fillStyle = C.carpetLight;
      ctx.fillRect(x + E.carpetStripeInset + 2, g.footY, w - (E.carpetStripeInset + 2) * 2, G.carpetLength);
      ctx.fillStyle = C.carpetStripe;
      ctx.fillRect(x + E.carpetStripeInset, g.footY, 1, G.carpetLength);
      ctx.fillRect(x + w - E.carpetStripeInset - 1, g.footY, 1, G.carpetLength);
      // 끝자락 금색 술
      ctx.fillStyle = C.gold;
      ctx.fillRect(x, g.carpetEndY - 1, w, 1);
      for (let i = 0; i < w; i += 2) ctx.fillRect(x + i, g.carpetEndY, 1, E.fringeLength);
    },
    back: {
      footY: g.rimBottom + 1,
      draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const ox = layerOffsetX(camera, LAYER_FACTORS.main);
        ctx.drawImage(backBuffer().canvas, backLeft - ox, backTop);
        drawBulbs(ctx, ox, true);
        // 가까이 가면 튀는 반짝이
        ctx.save();
        ctx.fillStyle = C.sparkle;
        for (const s of sparkles) {
          const life = s.age / E.sparkleLife;
          ctx.globalAlpha = 1 - life;
          ctx.fillRect(s.x - ox, s.y, 1, 1);
          if (life < 0.6) {
            ctx.fillRect(s.x - 1 - ox, s.y, 3, 1);
            ctx.fillRect(s.x - ox, s.y - 1, 1, 3);
          }
        }
        ctx.restore();
      },
    },
    pillars: {
      footY: g.footY,
      draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const ox = layerOffsetX(camera, LAYER_FACTORS.main);
        ctx.drawImage(pillarBuffer().canvas, pillarLeft - ox, g.springY);
        drawBulbs(ctx, ox, false);
      },
    },
    ropes: {
      footY: g.carpetEndY,
      draw(ctx: CanvasRenderingContext2D, camera: Camera) {
        const ox = layerOffsetX(camera, LAYER_FACTORS.main);
        const open = ropeOpenness(time - ropeOpenedAt);
        for (const side of [-1, 1]) {
          const { post, hook } = ropeEnds(side);
          // 오른쪽 줄은 풀리면 고리에서 빠져 기둥 아래로 늘어진다
          const loose = side === 1 ? open : 0;
          const end = {
            x: hook.x + (post.x - hook.x) * loose,
            y: hook.y + (post.y + E.ropeLooseDrop - hook.y) * loose,
          };
          drawRope(ctx, post, end, E.ropeSag * (1 - loose), ox);
          // 금 기둥: 받침, 몸통, 둥근 머리
          const px = post.x - ox;
          ctx.fillStyle = C.goldShade;
          ctx.fillRect(px - 2, g.carpetEndY - 1, 5, 1);
          ctx.fillStyle = C.gold;
          ctx.fillRect(px - 1, g.carpetEndY - 2, 3, 1);
          ctx.fillRect(px, post.y, 1, E.postHeight - 2);
          ctx.fillRect(px - 1, post.y - 1, 3, 2);
          ctx.fillStyle = CAROUSEL_COLORS.bulb;
          ctx.fillRect(px - 1, post.y - 1, 1, 1);
        }
      },
    },
  };
}
