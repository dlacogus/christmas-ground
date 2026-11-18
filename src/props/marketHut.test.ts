import { describe, expect, it } from 'vitest';
import { canStandAt } from '../character/character';
import { CHARACTER, MARKET_HUT } from '../constants';
import { HUTS, OBSTACLES, STREET_LINE_Y, WALK_AREA, ZONE_BOUNDS } from '../world';
import { HUT_BASE_Y, hutBulbLevel, hutHeight } from './marketHut';

describe('마켓 오두막', () => {
  it('돌바닥이 끝나는 뒤쪽 끝(연석 뒤)에 서고, 걷는 바닥을 차지하지 않는다', () => {
    expect(HUT_BASE_Y).toBe(STREET_LINE_Y);
    expect(HUT_BASE_Y).toBeLessThanOrEqual(WALK_AREA.y);
    expect(OBSTACLES.some((o) => o.id.startsWith('hut'))).toBe(false);
    // 오두막 바로 앞 바닥 맨 뒷줄까지 걸어갈 수 있다
    expect(canStandAt(HUTS[1].x, WALK_AREA.y + CHARACTER.footHeight)).toBe(true);
  });

  it('종류가 네 가지, 이웃끼리는 종류가 다르다', () => {
    expect(new Set(HUTS.map((h) => h.kind)).size).toBe(4);
    for (let i = 1; i < HUTS.length; i++) expect(HUTS[i].kind).not.toBe(HUTS[i - 1].kind);
  });

  it('크기가 제각각이다', () => {
    const widths = HUTS.map((h) => h.w);
    const heights = HUTS.map(hutHeight);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(Math.min(...widths) * 3);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(15);
    expect(new Set(heights).size).toBeGreaterThan(HUTS.length / 2);
  });

  it('서로 겹치지 않는다 (처마 포함)', () => {
    for (let i = 1; i < HUTS.length; i++) {
      const gap = HUTS[i].x - HUTS[i].w / 2 - (HUTS[i - 1].x + HUTS[i - 1].w / 2);
      expect(gap).toBeGreaterThanOrEqual(MARKET_HUT.roofOverhang);
    }
  });

  it('스케이트장 뒤에는 세우지 않고, 지붕이 화면 위로 잘리지 않는다', () => {
    for (const h of HUTS) {
      expect(h.x + h.w / 2).toBeLessThanOrEqual(ZONE_BOUNDS.rink.startX);
      expect(HUT_BASE_Y - hutHeight(h)).toBeGreaterThan(40);
    }
  });

  it('전구는 꺼지지 않고 은은하게 반짝인다', () => {
    const bulb = { x: 0, y: 0, color: '#ffffff', period: 3, phase: 1 };
    const levels = Array.from({ length: 40 }, (_, i) => hutBulbLevel(bulb, i * 0.1));
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(MARKET_HUT.bulbMinAlpha - 1e-9);
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels));
  });
});
