import { describe, expect, it } from 'vitest';
import { clampCameraX } from '../camera';
import { MAP_WIDTH, SCREEN_WIDTH } from '../constants';
import { createZones } from './index';

describe('구역 배치', () => {
  it('세 구역이 빈틈 없이 맵 전체를 덮는다', () => {
    const zones = createZones();
    expect(zones.map((z) => z.name)).toEqual(['carousel', 'plaza', 'rink']);
    expect(zones[0].startX).toBe(0);
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].startX).toBe(zones[i - 1].endX);
    }
    expect(zones[zones.length - 1].endX).toBe(MAP_WIDTH);
  });
});

describe('카메라', () => {
  it('맵 범위 밖으로 나가지 않는다', () => {
    expect(clampCameraX(-50)).toBe(0);
    expect(clampCameraX(5000)).toBe(MAP_WIDTH - SCREEN_WIDTH);
  });
});
