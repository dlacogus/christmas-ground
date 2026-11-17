import { describe, expect, it } from 'vitest';
import { INTERACTION_POINTS, MAP_WIDTH } from '../world';
import { createZones } from './index';

describe('구역 배치', () => {
  const zones = createZones();

  it('세 구역이 빈틈 없이 맵 전체를 덮는다', () => {
    expect(zones.map((z) => z.name)).toEqual(['carousel', 'plaza', 'rink']);
    expect(zones[0].startX).toBe(0);
    for (let i = 1; i < zones.length; i++) expect(zones[i].startX).toBe(zones[i - 1].endX);
    expect(zones.at(-1)!.endX).toBe(MAP_WIDTH);
  });

  it('상호작용 지점은 자기 구역에 하나씩 들어간다', () => {
    const ids = zones.flatMap((z) => z.interactionPoints.map((p) => p.id));
    expect(ids.sort()).toEqual(INTERACTION_POINTS.map((p) => p.id).sort());
    const byZone = Object.fromEntries(zones.map((z) => [z.name, z.interactionPoints.map((p) => p.id)]));
    expect(byZone.carousel).toEqual(['CAROUSEL_ENTRY', 'STALL_3', 'STALL_4']);
    expect(byZone.rink).toEqual(['RINK_GATE']);
    expect(byZone.plaza).toEqual(['STALL_1', 'STALL_2']);
  });
});
