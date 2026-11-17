import { BREATH, COLORS } from '../constants';
import type { Facing } from './sprites';

/** 하얀 입김 한 덩이 */
export interface BreathPuff {
  x: number;
  y: number;
  vx: number;
  age: number;
}

export function nextBreathInterval(random: () => number = Math.random): number {
  return BREATH.minInterval + random() * (BREATH.maxInterval - BREATH.minInterval);
}

export function spawnPuff(footX: number, footY: number, facing: Facing): BreathPuff {
  const dir = facing === 'right' ? 1 : -1;
  return {
    x: footX + dir * BREATH.mouthOffsetX,
    y: footY - BREATH.mouthOffsetY,
    vx: dir * BREATH.driftSpeed,
    age: 0,
  };
}

/** 나이를 먹이고 수명이 다한 것은 지운다 */
export function updatePuffs(puffs: BreathPuff[], dt: number): void {
  for (const puff of puffs) {
    puff.age += dt;
    puff.x += puff.vx * dt;
    puff.y -= BREATH.riseSpeed * dt;
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    if (puffs[i].age >= BREATH.lifetime) puffs.splice(i, 1);
  }
}

/** 픽셀 덩어리로 그린다: 점점 커지고 옅어진다 */
export function drawPuffs(ctx: CanvasRenderingContext2D, puffs: readonly BreathPuff[], offsetX: number): void {
  ctx.save();
  ctx.fillStyle = COLORS.breath;
  for (const puff of puffs) {
    const life = puff.age / BREATH.lifetime;
    const radius = Math.min(BREATH.maxRadius, Math.floor(life * (BREATH.maxRadius + 1)));
    ctx.globalAlpha = BREATH.startAlpha * (1 - life);
    const cx = Math.round(puff.x) - offsetX;
    const cy = Math.round(puff.y);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius + radius) ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }
  ctx.restore();
}
