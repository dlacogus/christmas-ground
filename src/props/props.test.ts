import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT, TREE } from '../constants';
import { createRng } from '../random';
import { LAMPS, SPAWN, TREE_X, getObstacle, inZone } from '../world';
import { createPlazaZone } from '../zones/plaza';
import {
  celebrationWave,
  createTree,
  foliageHalfWidth,
  generateLights,
  lightLevel,
  starBox,
  starLevel,
  treeTiers,
  waveProgress,
} from './tree';

describe('큰 트리 모양', () => {
  const tiers = treeTiers();

  it('잎 단이 8개 이상 빽빽이 겹치고, 아래로 갈수록 넓어진다', () => {
    expect(tiers.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i].top).toBeLessThan(tiers[i - 1].bottom);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i].bottomHalf).toBeGreaterThan(tiers[i - 1].bottomHalf);
  });

  it('높이 약 200px(화면의 3/4), 맨 아래 폭 약 176px로 풍성하다', () => {
    const star = starBox();
    const bed = getObstacle('tree-bed');
    const total = bed.y + bed.h - star.top;
    expect(total).toBeGreaterThanOrEqual(190);
    expect(total).toBeLessThanOrEqual(215);
    expect(total / SCREEN_HEIGHT).toBeGreaterThan(0.7);
    expect(tiers.at(-1)!.bottomHalf * 2).toBe(176);
  });

  it('꼭대기부터 아래까지 한 줄기 원뿔로 매끈하게 넓어진다 (어깨가 튀어나오지 않는다)', () => {
    let prev = 0;
    for (let y = TREE.tipY; y <= TREE.foliageBottomY; y++) {
      const half = foliageHalfWidth(y);
      // 단이 끝나는 자리에서만 가지 끝만큼 살짝 들어간다
      expect(half).toBeGreaterThanOrEqual(prev - 6);
      expect(half - prev).toBeLessThanOrEqual(4);
      prev = half;
    }
    expect(foliageHalfWidth(TREE.tipY + 10)).toBeLessThanOrEqual(8);
  });

  it('꼭대기 별이 화면 위로 잘리지 않는다', () => {
    const star = starBox();
    expect(star.top).toBeGreaterThanOrEqual(0);
    expect(star.size).toBeGreaterThanOrEqual(10);
    expect(star.size).toBeLessThanOrEqual(13);
  });
});

describe('트리 장식', () => {
  it('트리는 비어 있다: 전구와 별만 있고 미리 달린 장식볼·눈꽃·밑동 선물은 없다', () => {
    const tree = createTree(createRng(5));
    expect(tree.lights.length).toBeGreaterThan(200);
    expect('ornaments' in tree).toBe(false);
    expect('gifts' in TREE).toBe(false);
    expect('ornamentMinCount' in TREE).toBe(false);
    expect('snowflakeCount' in TREE).toBe(false);
  });

  it('축하: 빛 물결이 아래에서 위로 세 번 흐르고, 장식이 100개를 넘으면 별이 항상 더 밝다', () => {
    expect(TREE.celebrateWaves).toBe(3);
    const one = TREE.celebrateWaveSeconds;
    expect(celebrationWave(-1)).toBeNull();
    expect(celebrationWave(0)).toBe(0);
    expect(celebrationWave(one * 0.5)).toBeCloseTo(0.5, 5);
    // 두 번째, 세 번째 물결도 다시 아래에서 시작한다
    expect(celebrationWave(one * 1.25)).toBeCloseTo(0.25, 5);
    expect(celebrationWave(one * 2.75)).toBeCloseTo(0.75, 5);
    expect(celebrationWave(one * 3)).toBeNull();
    // 물결 앞머리의 전구는 최대로 밝다
    const low = { x: TREE_X, y: TREE.foliageBottomY, period: 3, phase: 0 };
    expect(lightLevel(low, 1, 0)).toBeCloseTo(1, 5);
    for (let t = 0; t < TREE.starPeriod; t += 0.1) {
      expect(starLevel(t, true)).toBeGreaterThanOrEqual(starLevel(t));
      expect(starLevel(t, true)).toBeGreaterThanOrEqual(TREE.brightStarMinAlpha);
    }
  });

  it('꼬마전구 200개 넘게 잎 안에 있고 각자 다른 박자로 반짝인다', () => {
    const lights = generateLights(createRng(5));
    expect(lights.length).toBeGreaterThanOrEqual(TREE.lightMinCount);
    expect(lights.length).toBeLessThanOrEqual(TREE.lightMaxCount);
    expect(lights.length).toBeGreaterThan(200);
    for (const l of lights) expect(Math.abs(l.x - TREE_X)).toBeLessThanOrEqual(foliageHalfWidth(l.y));
    expect(new Set(lights.map((l) => l.period.toFixed(3))).size).toBeGreaterThan(lights.length * 0.9);
    // 물결이 없을 때는 은은하게
    for (const l of lights) {
      const level = lightLevel(l, 1);
      expect(level).toBeGreaterThanOrEqual(TREE.lightMinAlpha);
      expect(level).toBeLessThanOrEqual(TREE.lightMaxAlpha);
    }
  });

  it('빛 물결은 30초마다 아래에서 위로 지나간다', () => {
    const first = TREE.waveFirstDelay;
    expect(waveProgress(first - 1)).toBeNull();
    expect(waveProgress(first + 0.1)).toBeCloseTo(0.1 / TREE.waveDuration, 5);
    expect(waveProgress(first + TREE.waveDuration + 1)).toBeNull();
    expect(waveProgress(first + TREE.waveInterval + 0.1)).not.toBeNull();
    // 물결 앞머리에 있는 전구는 최대로 밝다: 시작 직후엔 아래쪽, 끝날 즈음엔 위쪽
    const low = { x: TREE_X, y: TREE.foliageBottomY, period: 3, phase: 0 };
    const high = { x: TREE_X, y: TREE.tipY + 2, period: 3, phase: 0 };
    expect(lightLevel(low, first + 0.01)).toBeCloseTo(1, 1);
    expect(lightLevel(high, first + TREE.waveDuration * 0.99)).toBeGreaterThan(0.9);
  });

  it('별은 천천히 밝아졌다 어두워진다', () => {
    const levels = Array.from({ length: 40 }, (_, i) => starLevel(i * 0.1));
    expect(Math.min(...levels)).toBeLessThan(Math.max(...levels));
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(TREE.starMinAlpha - 1e-9);
  });
});

describe('메인 광장 배치', () => {
  it('가로등 4개가 광장 앞쪽과 뒤쪽에 나뉘어 있다', () => {
    const lamps = LAMPS.filter((l) => inZone('plaza', l.x));
    expect(lamps).toHaveLength(4);
    const ys = lamps.map((l) => l.y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(lamps.filter((l) => l.y < mid)).toHaveLength(2);
    expect(lamps.filter((l) => l.y > mid)).toHaveLength(2);
  });

  it('시작 위치는 트리 앞(화단 아래쪽)', () => {
    const bed = getObstacle('tree-bed');
    expect(SPAWN.x).toBe(TREE_X);
    expect(SPAWN.y).toBeGreaterThan(bed.y + bed.h);
  });

  it('트리는 화단 아래선 기준으로 앞뒤 정렬된다', () => {
    const zone = createPlazaZone();
    const bed = getObstacle('tree-bed');
    expect(zone.props.some((p) => p.footY === bed.y + bed.h)).toBe(true);
  });
});
