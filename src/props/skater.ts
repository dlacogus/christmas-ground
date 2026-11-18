// NPC 스케이터: 캐릭터와 같은 스프라이트·비율, 다른 옷 색. 링크 가운데를 도는 타원을 미끄러져 돈다.
// 발을 구르지 않는 미끄럼 자세 2장. 한 명은 30초마다 비틀거리다 균형을 잡는다. 지나간 자리에 얼음 자국.
// 내 캐릭터가 얼음 위에 있으면 조금 비켜 돌고, 부딪히면 살짝 밀려나며 잠깐 느려진다.

import { layerOffsetX, type Camera } from '../camera';
import { getSpriteCanvas } from '../character/render';
import { POSES, type Facing } from '../character/sprites';
import { CHARACTER, COLORS, LAYER_FACTORS, SKATE, SKATERS as S, type OutfitName } from '../constants';
import type { DepthDrawable } from '../zones/zone';
import { rinkBounds, rinkEdgeAt } from './iceRink';

export interface SkaterSpec {
  outfit: OutfitName;
  radiusX: number;
  radiusY: number;
  /** 한 바퀴 (초) */
  period: number;
  /** 처음 각도 */
  phase: number;
  wobbles: boolean;
}

/** 얼음 자국 한 점 */
export interface TrailMark {
  x: number;
  y: number;
  age: number;
}

// ───────────── 계산 (순수) ─────────────

/** 스케이터들이 도는 타원의 가운데 */
export function skateCenter(): { x: number; y: number } {
  const b = rinkBounds();
  return { x: b.centerX, y: b.midY + S.centerFrontShift };
}

/** 각도 → 발밑 위치와 방향. 앞쪽(cos > 0)에서는 오른쪽으로, 뒤쪽에서는 왼쪽으로 지나간다 */
export function skaterPose(spec: SkaterSpec, angle: number): { x: number; y: number; facing: Facing } {
  const c = skateCenter();
  return {
    x: c.x + spec.radiusX * Math.sin(angle),
    y: c.y + spec.radiusY * Math.cos(angle),
    facing: Math.cos(angle) >= 0 ? 'right' : 'left',
  };
}

/** 비틀거리는 중이면 0~1 진행도, 아니면 null (처음 wobbleFirstDelay초 뒤, 그다음 wobbleInterval초마다) */
export function wobbleProgress(time: number): number | null {
  const since = time - S.wobbleFirstDelay;
  if (since < 0) return null;
  const local = since % S.wobbleInterval;
  return local < S.wobbleDuration ? local / S.wobbleDuration : null;
}

/** 비틀거릴 때 윗몸이 기우는 px: 좌우로 흔들리다 점점 잦아들어 균형을 잡는다 */
export function wobbleLean(progress: number): number {
  return Math.round(S.wobbleLean * Math.sin(progress * Math.PI * S.wobbleSwings) * (1 - progress));
}

/** 자국 나이를 먹이고 오래된 것은 지운다 */
export function updateTrail(trail: TrailMark[], dt: number): void {
  for (const m of trail) m.age += dt;
  while (trail.length > 0 && trail[0].age >= S.trailLifetime) trail.shift();
}

// ───────────── 스케이터 ─────────────

export interface Skater extends DepthDrawable {
  readonly spec: SkaterSpec;
  readonly x: number;
  readonly y: number;
  readonly trail: readonly TrailMark[];
  /** 지금 비틀거리는 중인가 */
  readonly wobbling: boolean;
  update(dt: number): void;
  /** 얼음 자국 (바닥에 납작, 시설보다 먼저) */
  drawTrail(ctx: CanvasRenderingContext2D, camera: Camera): void;
  /** 얼음에 뒤집혀 비친 모습 (발밑 아래로, 멀어질수록 옅게) */
  drawReflection(ctx: CanvasRenderingContext2D, camera: Camera): void;
  /** 얼음 위 내 캐릭터 발밑 (없으면 null) — 가까우면 조금 비켜 돈다 */
  setAvoid(x: number, y: number): void;
  clearAvoid(): void;
  /** 부딪혔다: (nx, ny) = 밀려날 방향 (단위 벡터) */
  bump(nx: number, ny: number): void;
}

/** 스프라이트를 발밑 아래로 뒤집어, 멀어질수록 옅게 얼음에 비춘다 */
export function drawSpriteReflection(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, offsetX: number): void {
  const edge = rinkEdgeAt(Math.round(x));
  if (!edge) return;
  const footY = Math.round(y);
  const height = Math.min(S.reflectionHeight, edge.bottom - footY);
  if (height <= 0) return;
  const W = CHARACTER.spriteWidth;
  const H = CHARACTER.spriteHeight;
  ctx.save();
  ctx.translate(Math.round(x) - offsetX - W / 2, footY);
  ctx.scale(1, -1);
  // 두 줄씩 뒤집어 찍으며 발에서 멀어질수록 옅게
  for (let i = 0; i < height; i += 2) {
    ctx.globalAlpha = S.reflectionAlpha * (1 - i / S.reflectionHeight);
    ctx.drawImage(sprite, 0, H - i - 2, W, 2, 0, -i - 2, W, 2);
  }
  ctx.restore();
}

/** 윗몸만 기울여 그리는 줄 범위: [시작 줄, 기우는 비율] (머리는 많이, 허리는 반만) */
const LEAN_SLICES: readonly [number, number, number][] = [
  [0, 16, 1],
  [16, 24, 0.5],
  [24, CHARACTER.spriteHeight, 0],
];

export function createSkater(spec: SkaterSpec): Skater {
  let angle = spec.phase;
  let time = 0;
  let trailTimer = 0;
  const trail: TrailMark[] = [];
  const omega = (Math.PI * 2) / spec.period;

  // 원래 타원 자리에서 비켜난 정도 (피하기 + 부딪혀 밀려남)
  let offX = 0;
  let offY = 0;
  let bumpVx = 0;
  let bumpVy = 0;
  let slowLeft = 0;
  let avoid: { x: number; y: number } | null = null;

  const state = () => {
    const p = skaterPose(spec, angle);
    return { x: p.x + offX, y: p.y + offY, facing: p.facing };
  };
  const wobble = () => (spec.wobbles ? wobbleProgress(time) : null);

  const updateOffset = (dt: number) => {
    let tx = 0;
    let ty = 0;
    if (avoid) {
      const base = skaterPose(spec, angle);
      const dx = base.x - avoid.x;
      const dy = base.y - avoid.y;
      const d = Math.hypot(dx, dy);
      if (d < SKATE.avoidRadius) {
        const push = SKATE.avoidPush * (1 - d / SKATE.avoidRadius);
        tx = d > 0 ? (dx / d) * push : push;
        ty = d > 0 ? (dy / d) * push : 0;
      }
    }
    const ease = Math.min(1, SKATE.avoidEase * dt);
    offX += (tx - offX) * ease + bumpVx * dt;
    offY += (ty - offY) * ease + bumpVy * dt;
    const decay = Math.exp(-SKATE.npcBumpDecay * dt);
    bumpVx *= decay;
    bumpVy *= decay;
    const len = Math.hypot(offX, offY);
    if (len > SKATE.npcMaxOffset) {
      offX *= SKATE.npcMaxOffset / len;
      offY *= SKATE.npcMaxOffset / len;
    }
    // 얼음 밖으로는 밀려나지 않는다
    const p = skaterPose(spec, angle);
    const edge = rinkEdgeAt(Math.round(p.x + offX));
    if (!edge) offX = 0;
    else offY = Math.min(Math.max(offY, edge.top + 2 - p.y), edge.bottom - 2 - p.y);
  };

  return {
    spec,
    trail,
    get x() {
      return state().x;
    },
    get y() {
      return state().y;
    },
    get footY() {
      return state().y;
    },
    get wobbling() {
      return wobble() !== null;
    },
    update(dt: number) {
      time += dt;
      const slow = slowLeft > 0 ? SKATE.npcSlowFactor : 1;
      slowLeft = Math.max(0, slowLeft - dt);
      angle += omega * dt * (wobble() !== null ? S.wobbleSpeedFactor : 1) * slow;
      updateOffset(dt);
      updateTrail(trail, dt);
      trailTimer -= dt;
      if (trailTimer <= 0) {
        const { x, y, facing } = state();
        trail.push({ x: x - (facing === 'right' ? S.trailBehind : -S.trailBehind), y, age: 0 });
        trailTimer = S.trailInterval;
      }
    },
    drawTrail(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.save();
      ctx.fillStyle = S.trailColor;
      for (const m of trail) {
        ctx.globalAlpha = S.trailAlpha * (1 - m.age / S.trailLifetime);
        ctx.fillRect(Math.round(m.x) - ox, Math.round(m.y) - 1, 2, 1);
      }
      ctx.restore();
    },
    drawReflection(ctx: CanvasRenderingContext2D, camera: Camera) {
      const { x, y, facing } = state();
      const sprite = getSpriteCanvas('glide', Math.floor(time / S.glideFrameDuration) % POSES.glide.length, facing, spec.outfit);
      drawSpriteReflection(ctx, sprite, x, y, layerOffsetX(camera, LAYER_FACTORS.main));
    },
    setAvoid(x: number, y: number) {
      avoid = { x, y };
    },
    clearAvoid() {
      avoid = null;
    },
    bump(nx: number, ny: number) {
      bumpVx = nx * SKATE.npcBumpSpeed;
      bumpVy = ny * SKATE.npcBumpSpeed;
      slowLeft = SKATE.npcSlowSeconds;
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const { x, y, facing } = state();
      const footX = Math.round(x) - layerOffsetX(camera, LAYER_FACTORS.main);
      const footY = Math.round(y);

      ctx.save();
      ctx.globalAlpha = CHARACTER.shadowAlpha;
      ctx.fillStyle = COLORS.shadow;
      ctx.fillRect(footX - CHARACTER.shadowWidth / 2, footY - CHARACTER.shadowHeight / 2, CHARACTER.shadowWidth, CHARACTER.shadowHeight);
      ctx.restore();

      const w = wobble();
      const frameDuration = w !== null ? S.wobbleFrameDuration : S.glideFrameDuration;
      const sprite = getSpriteCanvas('glide', Math.floor(time / frameDuration) % POSES.glide.length, facing, spec.outfit);
      const lean = w !== null ? wobbleLean(w) : 0;
      const left = footX - CHARACTER.spriteWidth / 2;
      const top = footY - CHARACTER.spriteHeight;
      for (const [from, to, ratio] of LEAN_SLICES) {
        const dx = Math.round(lean * ratio);
        ctx.drawImage(sprite, 0, from, CHARACTER.spriteWidth, to - from, left + dx, top + from, CHARACTER.spriteWidth, to - from);
      }
    },
  };
}
