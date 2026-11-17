// 하늘 (레이어 0, 고정): 남색 띠 + 천천히 반짝이는 별

import { SCREEN_HEIGHT, SCREEN_WIDTH, SKY, STARS } from '../constants';
import { pick, randInt, randRange, type Rng } from '../random';
import { lazyBuffer } from './buffer';

export interface Star {
  x: number;
  y: number;
  period: number;
  phase: number;
  color: string;
  /** 가장 밝을 때 십자로 빛나는 별 */
  bright: boolean;
}

export function createStars(rng: Rng): Star[] {
  const count = randInt(rng, STARS.minCount, STARS.maxCount);
  return Array.from({ length: count }, () => ({
    x: randInt(rng, 0, SCREEN_WIDTH - 1),
    y: randInt(rng, STARS.minY, STARS.maxY),
    period: randRange(rng, STARS.minPeriod, STARS.maxPeriod),
    phase: rng() * Math.PI * 2,
    color: pick(rng, STARS.colors),
    bright: rng() < STARS.brightChance,
  }));
}

/** 지금 밝기 (STARS.levels 중 하나로 끊어서) */
export function starLevel(star: Star, time: number): number {
  const wave = (Math.sin((time / star.period) * Math.PI * 2 + star.phase) + 1) / 2;
  const i = Math.min(STARS.levels.length - 1, Math.floor(wave * STARS.levels.length));
  return STARS.levels[i];
}

/** (x, y)의 하늘색. 띠 경계 바로 위 몇 줄은 아래 띠 색을 점점 더 섞는다 (픽셀 계단) */
export function skyColorAt(x: number, y: number): string {
  const bands = SKY.bands;
  for (let i = 0; i < bands.length; i++) {
    if (y >= bands[i].untilY) continue;
    const next = bands[i + 1];
    const distance = bands[i].untilY - y; // 1 = 경계 바로 위
    if (next && distance <= SKY.ditherRows && (x + y) % (distance + 1) === 0) return next.color;
    return bands[i].color;
  }
  return bands[bands.length - 1].color;
}

function paintSky(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      ctx.fillStyle = skyColorAt(x, y);
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function createSky(rng: Rng) {
  const stars = createStars(rng);
  const getBuffer = lazyBuffer(SCREEN_WIDTH, SCREEN_HEIGHT, paintSky);
  const maxLevel = STARS.levels[STARS.levels.length - 1];
  let time = 0;

  return {
    stars,
    update(dt: number) {
      time += dt;
    },
    draw(ctx: CanvasRenderingContext2D) {
      ctx.drawImage(getBuffer().canvas, 0, 0);
      ctx.save();
      for (const star of stars) {
        const level = starLevel(star, time);
        ctx.globalAlpha = level;
        ctx.fillStyle = star.color;
        ctx.fillRect(star.x, star.y, 1, 1);
        if (star.bright && level === maxLevel) {
          ctx.globalAlpha = level / 2;
          ctx.fillRect(star.x - 1, star.y, 1, 1);
          ctx.fillRect(star.x + 1, star.y, 1, 1);
          ctx.fillRect(star.x, star.y - 1, 1, 1);
          ctx.fillRect(star.x, star.y + 1, 1, 1);
        }
      }
      ctx.restore();
    },
  };
}
