import { describe, expect, it } from 'vitest';
import { canStandAt } from '../character/character';
import { CAROUSEL, CAROUSEL_RAIL, CHARACTER, ENTRANCE, LIGHTING } from '../constants';
import { CAROUSEL_GATE, CAROUSEL_X, INTERACTION_POINTS, ZONE_BOUNDS, getObstacle } from '../world';
import { createCarouselZone } from '../zones/carousel';
import { carouselGeometry, inRailGap, mountState, railBaseAt, railEllipse } from './carousel';
import { ARCH_LEVELS, archBulbLevel, archBulbs, createCarouselEntrance, gateGeometry, ropeEnds, ropeOpenness } from './carouselEntrance';

const entry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;
const g = gateGeometry();

describe('난간', () => {
  it('바닥 판 둘레를 따라 낮게(약 10px) 두르고, 가로대는 2줄', () => {
    const { rx, ry } = railEllipse();
    const platform = getObstacle('carousel');
    expect(CAROUSEL_RAIL.height).toBe(10);
    expect(CAROUSEL_RAIL.railsAbove).toHaveLength(2);
    expect(rx).toBeLessThanOrEqual(platform.w / 2);
    expect(rx).toBeGreaterThan(CAROUSEL.horseOrbitRadius);
    expect(ry).toBeLessThanOrEqual(CAROUSEL.platformRadiusY);
  });

  it('앞쪽 가운데, CAROUSEL_ENTRY 바로 위만 약 28px 끊겨 있다', () => {
    expect(entry.x).toBe(CAROUSEL_X);
    expect(CAROUSEL_RAIL.gapWidth).toBe(28);
    expect(inRailGap(0)).toBe(true);
    expect(inRailGap(13)).toBe(true);
    expect(inRailGap(14)).toBe(false);
    expect(inRailGap(-60)).toBe(false);
  });

  it('뒤쪽 절반은 탈 것 뒤, 앞쪽 절반은 탈 것 앞에 온다', () => {
    const cy = carouselGeometry().platformY;
    for (let t = 0; t < CAROUSEL.rotationPeriod; t += 0.4) {
      for (let i = 0; i < CAROUSEL.horseCount; i++) {
        const m = mountState(i, t);
        if (m.kind !== 'carriage') continue;
        // 마차 바닥은 앞에서는 앞 난간보다 안쪽(위), 뒤에서는 뒤 난간보다 안쪽(아래)
        const dx = m.x - CAROUSEL_X;
        if (m.z > 0.3) expect(m.y).toBeLessThanOrEqual(cy + railBaseAt(dx, true) + 1);
        if (m.z < -0.3) expect(m.y).toBeGreaterThanOrEqual(cy + railBaseAt(dx, false));
      }
    }
    expect(railBaseAt(0, true)).toBeGreaterThan(0);
    expect(railBaseAt(0, false)).toBeLessThan(0);
  });
});

describe('입구 아치', () => {
  it('끊긴 자리에 폭 약 36px, 높이 약 46px로 서고 난간 틈보다 넓다', () => {
    expect(g.width).toBe(36);
    expect(g.height).toBe(46);
    expect(g.cx).toBe(entry.x);
    expect(g.width).toBeGreaterThan(CAROUSEL_RAIL.gapWidth);
    expect(g.ornamentTopY).toBeGreaterThan(0);
  });

  it('전구 8~10개가 테두리를 따라 좌우 대칭으로 달려 있다', () => {
    const bulbs = archBulbs();
    expect(bulbs.length).toBeGreaterThanOrEqual(8);
    expect(bulbs.length).toBeLessThanOrEqual(10);
    for (const b of bulbs) {
      const twin = bulbs.find((o) => o.level === b.level && o.x === 2 * g.cx - b.x);
      expect(twin, `단 ${b.level}`).toBeDefined();
      expect(b.y).toBeGreaterThanOrEqual(g.topY);
      expect(b.y).toBeLessThan(g.footY);
    }
    // 단이 높을수록 위에 달려 있다
    const yOf = (level: number) => bulbs.find((b) => b.level === level)!.y;
    for (let level = 1; level < ARCH_LEVELS; level++) expect(yOf(level)).toBeLessThan(yOf(level - 1));
  });

  it('평소엔 은은하고, 2초마다 불빛이 아래에서 위로 차례로 흐른다', () => {
    expect(ENTRANCE.flowPeriod).toBe(2);
    const brightest = (t: number) => {
      const levels = Array.from({ length: ARCH_LEVELS }, (_, i) => archBulbLevel(i, t, false));
      return levels.indexOf(Math.max(...levels));
    };
    const step = ENTRANCE.flowDuration / (ARCH_LEVELS + 1);
    const order = Array.from({ length: ARCH_LEVELS }, (_, i) => brightest(step * (i + 1)));
    expect(order).toEqual([0, 1, 2, 3, 4]);
    // 흐름이 끝난 뒤에는 모두 은은하게, 다음 주기에 다시 흐른다
    expect(archBulbLevel(2, ENTRANCE.flowDuration + 0.3, false)).toBe(ENTRANCE.idleLevel);
    expect(archBulbLevel(0, ENTRANCE.flowPeriod + step, false)).toBeCloseTo(1, 5);
  });

  it('가까이 가면 한 단계 밝아지고, 멀어지면 다시 은은해진다', () => {
    const t = ENTRANCE.flowDuration + 0.3;
    expect(archBulbLevel(1, t, true)).toBe(ENTRANCE.nearLevel);
    expect(ENTRANCE.nearLevel).toBeGreaterThan(ENTRANCE.idleLevel);
    for (let time = 0; time < 2; time += 0.1) {
      expect(archBulbLevel(3, time, true)).toBeGreaterThanOrEqual(archBulbLevel(3, time, false));
      expect(archBulbLevel(3, time, true)).toBeLessThanOrEqual(1);
    }
  });

  it('가까이 있는 동안에만 작은 반짝이가 2~3개까지 튄다', () => {
    expect(ENTRANCE.sparkleMax).toBeGreaterThanOrEqual(2);
    expect(ENTRANCE.sparkleMax).toBeLessThanOrEqual(3);
    // 반짝이 하나가 사는 동안 다음 것이 나와 여러 개가 함께 보인다
    expect(ENTRANCE.sparkleEvery).toBeLessThan(ENTRANCE.sparkleLife);
    const entrance = createCarouselEntrance(() => 0.5);
    expect(() => {
      entrance.setNear(true);
      for (let i = 0; i < 120; i++) entrance.update(1 / 60);
      entrance.setNear(false);
      for (let i = 0; i < 120; i++) entrance.update(1 / 60);
    }).not.toThrow();
  });

  it('깊이: 아치 위쪽은 회전목마 앞·캐릭터 뒤, 기둥은 그 사이를 지나는 캐릭터 앞, 줄 기둥은 맨 앞', () => {
    const entrance = createCarouselEntrance();
    const rim = carouselGeometry().rimBottom;
    const underArch = rim + CHARACTER.footHeight; // 아치 밑 계단까지 들어간 캐릭터의 발밑 y
    expect(entrance.back.footY).toBeGreaterThan(rim);
    expect(entrance.back.footY).toBeLessThan(underArch);
    expect(entrance.pillars.footY).toBeGreaterThan(underArch);
    expect(entrance.pillars.footY).toBeLessThan(entry.y);
    expect(entrance.ropes.footY).toBeGreaterThan(entry.y);
    const zone = createCarouselZone();
    for (const part of [entrance.back, entrance.pillars, entrance.ropes]) {
      expect(zone.props.some((p) => p.footY === part.footY)).toBe(true);
    }
  });
});

describe('카펫과 줄 기둥', () => {
  it('아치 앞 바닥에 폭 약 24px, 길이 약 20px 카펫이 깔리고 그 위에 CAROUSEL_ENTRY가 있다', () => {
    expect(CAROUSEL_GATE.carpetHalfWidth * 2).toBe(24);
    expect(CAROUSEL_GATE.carpetLength).toBe(20);
    expect(Math.abs(entry.x - g.cx)).toBeLessThan(CAROUSEL_GATE.carpetHalfWidth);
    expect(entry.y).toBeGreaterThan(g.footY);
    expect(entry.y).toBeLessThan(g.carpetEndY);
    // 카펫이 끝나는 곳(아치 발밑)과 바닥 판 사이에 계단 2칸
    expect(g.footY - g.rimBottom).toBe(CAROUSEL_GATE.stepsDepth);
  });

  it('카펫 양옆 금 기둥에서 아치 기둥으로 벨벳 줄이 걸려 길을 안내한다', () => {
    for (const side of [-1, 1]) {
      const { post, hook } = ropeEnds(side);
      expect(Math.abs(post.x - g.cx)).toBeGreaterThan(CAROUSEL_GATE.carpetHalfWidth);
      expect(Math.abs(hook.x - g.cx)).toBe(CAROUSEL_GATE.pillarOffset);
      expect(hook.y).toBeLessThan(g.footY);
      expect(post.y).toBeLessThan(g.carpetEndY);
    }
    expect(g.cx + CAROUSEL_GATE.ropePostOffset).toBeLessThan(ZONE_BOUNDS.carousel.endX);
  });

  it('올라타는 순간 줄이 풀렸다가 0.3초 안에 다시 걸린다', () => {
    expect(ENTRANCE.ropeOpenSeconds).toBe(0.3);
    expect(ropeOpenness(-1)).toBe(0);
    expect(ropeOpenness(0)).toBe(0);
    expect(ropeOpenness(0.15)).toBeCloseTo(1, 5);
    expect(ropeOpenness(0.3)).toBe(0);
    expect(ropeOpenness(5)).toBe(0);
  });
});

describe('입구 장애물', () => {
  const rim = carouselGeometry().rimBottom;

  it('아치 기둥 사이 계단과 카펫으로는 걸어 들어갈 수 있다', () => {
    expect(canStandAt(entry.x, entry.y)).toBe(true);
    expect(canStandAt(entry.x, rim + CHARACTER.footHeight)).toBe(true);
    expect(canStandAt(entry.x, g.carpetEndY)).toBe(true);
    // 계단 폭 안에서 좌우로 조금 움직일 수 있다
    expect(canStandAt(entry.x - 4, rim + CHARACTER.footHeight)).toBe(true);
  });

  it('난간 둘레와 아치 기둥으로는 들어가지 못한다', () => {
    // 입구에서도 바닥 판 위로는 못 올라간다
    expect(canStandAt(entry.x, rim)).toBe(false);
    // 난간 다른 곳
    for (const dx of [-100, -60, 60, 100]) expect(canStandAt(CAROUSEL_X + dx, rim)).toBe(false);
    // 아치 기둥 자리
    for (const side of [-1, 1]) {
      expect(canStandAt(CAROUSEL_X + side * CAROUSEL_GATE.pillarOffset, rim + CHARACTER.footHeight)).toBe(false);
    }
  });

  it('카펫 앞을 가로질러 지나가는 길은 막지 않는다', () => {
    for (let x = CAROUSEL_X - 40; x <= CAROUSEL_X + 40; x += 2) expect(canStandAt(x, entry.y), `x ${x}`).toBe(true);
  });
});

describe('입구 조명', () => {
  it('아치 둘레 빛은 반경 약 30px, 회전목마 전체 빛보다 약하지만 바닥에서는 가장 밝다', () => {
    expect(LIGHTING.gateHaloRadius).toBe(30);
    expect(LIGHTING.gatePoolRadiusX).toBeGreaterThan(LIGHTING.gatePoolRadiusY);
    // 전체 빛(넓은 범위)보다 좁고, 같은 자리 바닥 빛은 더 진하다
    expect(LIGHTING.gateHaloRadius).toBeLessThan(LIGHTING.carouselHaloRadiusX);
    expect(LIGHTING.gatePoolRadiusX).toBeLessThan(LIGHTING.carouselPoolRadiusX);
    expect(LIGHTING.gatePoolAlpha).toBeGreaterThan(LIGHTING.carouselPoolAlpha);
    expect(LIGHTING.gatePoolAlpha).toBeGreaterThan(CAROUSEL.floorGlowAlpha);
  });
});
