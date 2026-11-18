import { describe, expect, it } from 'vitest';
import { LIGHTING, SCREEN_HEIGHT, SCREEN_WIDTH, STARS } from '../constants';
import { STREET_LINE_Y, WALK_AREA } from '../world';
import { dither } from './lighting';

describe('조명·분위기', () => {
  it('점묘는 값이 클수록 더 많은 칸이 켜진다', () => {
    const lit = (v: number) => {
      let n = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dither(x, y, v)) n++;
      return n;
    };
    expect(lit(0)).toBe(0);
    expect(lit(0.5)).toBe(8);
    expect(lit(1)).toBe(16);
    expect(lit(0.75)).toBeGreaterThan(lit(0.25));
  });

  it('달과 달무리는 화면 안, 하늘 위쪽에 있다', () => {
    const m = LIGHTING.moon;
    expect(m.x - m.radius).toBeGreaterThan(0);
    expect(m.x + m.radius).toBeLessThan(SCREEN_WIDTH);
    expect(m.y - m.radius).toBeGreaterThan(0);
    expect(m.y + m.radius).toBeLessThan(STREET_LINE_Y / 2);
  });

  it('구름은 달 아래로 지나가고, 지평선 노을빛은 별 아래쪽에서 시작한다', () => {
    expect(LIGHTING.cloudMinY).toBeGreaterThan(LIGHTING.moon.y + LIGHTING.moon.radius);
    expect(LIGHTING.cloudMaxY).toBeLessThan(STREET_LINE_Y);
    expect(LIGHTING.horizonFromY).toBeGreaterThan(STARS.minY);
    expect(LIGHTING.horizonFromY).toBeLessThan(STREET_LINE_Y);
  });

  it('바닥 불빛과 그늘은 걷는 바닥 안에서 끝난다', () => {
    expect(WALK_AREA.y + LIGHTING.hutSpillDepth).toBeLessThan(WALK_AREA.y + WALK_AREA.h);
    expect(LIGHTING.frontShadeFromY).toBeGreaterThan(WALK_AREA.y);
    expect(LIGHTING.frontShadeFromY).toBeLessThan(SCREEN_HEIGHT);
  });

  it('효과는 은은하다 (그림을 덮지 않는다)', () => {
    for (const a of [LIGHTING.hutSpillAlpha, LIGHTING.lampPoolAlpha, LIGHTING.treePoolAlpha, LIGHTING.treeHaloAlpha, LIGHTING.vignetteAlpha]) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(0.5);
    }
  });
});
