// NPC 스케이터: 캐릭터와 같은 스프라이트·비율, 다른 옷 색. 링크 가운데를 도는 타원을 미끄러져 돈다.
// 발을 구르지 않는 미끄럼 자세 2장. 한 명은 30초마다 비틀거리다 균형을 잡는다. 지나간 자리에 얼음 자국.

import { layerOffsetX, type Camera } from '../camera';
import { getSpriteCanvas } from '../character/render';
import { POSES, type Facing } from '../character/sprites';
import { CHARACTER, COLORS, LAYER_FACTORS, SKATERS as S, type OutfitName } from '../constants';
import type { DepthDrawable } from '../zones/zone';
import { rinkBounds } from './iceRink';

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

  const state = () => skaterPose(spec, angle);
  const wobble = () => (spec.wobbles ? wobbleProgress(time) : null);

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
      angle += omega * dt * (wobble() !== null ? S.wobbleSpeedFactor : 1);
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
