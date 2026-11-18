import { describe, expect, it } from 'vitest';
import { GROUND, SCENERY_SEED } from '../constants';
import { createRng } from '../random';
import { MAP_WIDTH, WALK_AREA } from '../world';
import { generateSnowCover } from './ground';

describe('바닥에 쌓인 눈', () => {
  const cover = generateSnowCover(createRng(SCENERY_SEED + GROUND.snowSeedOffset), MAP_WIDTH, WALK_AREA.h);
  const snowRatio = (from: number, to: number) => {
    let snow = 0;
    for (let y = 0; y < WALK_AREA.h; y++) for (let x = from; x < to; x++) if (cover[y * MAP_WIDTH + x] > 0) snow++;
    return snow / ((to - from) * WALK_AREA.h);
  };

  it('벽돌 : 눈 = 1 : 9', () => {
    expect(GROUND.snowCoverRatio).toBe(0.9);
    expect(snowRatio(0, MAP_WIDTH)).toBeCloseTo(0.9, 2);
  });

  it('구역마다 고르게 쌓여 있다 (한쪽에만 몰리지 않는다)', () => {
    for (let from = 0; from < MAP_WIDTH; from += 480) {
      expect(snowRatio(from, from + 480)).toBeGreaterThan(0.8);
      expect(snowRatio(from, from + 480)).toBeLessThan(0.98);
    }
  });
});
