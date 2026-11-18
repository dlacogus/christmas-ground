import { describe, expect, it } from 'vitest';
import {
  CLOCK_TOWER,
  FAR_CITY,
  GROUND,
  LAYER_FACTORS,
  TREE_LINE,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  SKY,
  SNOWFALL,
  STARS,
  TREE,
} from '../constants';
import { layerWidth } from '../layers';
import { createRng } from '../random';
import { HUT_BASE_Y, hutHeight } from '../props/marketHut';
import { HUTS, STREET_LINE_Y, TREE_X, WALK_AREA } from '../world';
import { generateFarSkyline } from './farCity';
import { generateForeground } from './foreground';
import { generateSlabs, slabRows } from './ground';
import { clockHandAngles, clockTowerGeometry } from './clockTower';
import { generateBackTrees } from './treeLine';
import { createStars, skyColorAt, starLevel } from './sky';
import { createSnowfall, totalFlakes, updateSnowfall } from './snowfall';

describe('무작위 시드', () => {
  it('같은 시드면 같은 거리, 다른 시드면 다른 거리', () => {
    const a = generateBackTrees(createRng(7), 1056);
    const b = generateBackTrees(createRng(7), 1056);
    const c = generateBackTrees(createRng(8), 1056);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('하늘', () => {
  it('위는 가장 어둡고 아래로 갈수록 밝아지는 띠다', () => {
    expect(skyColorAt(1, 0)).toBe(SKY.bands[0].color);
    expect(skyColorAt(1, SCREEN_HEIGHT - 1)).toBe(SKY.bands[SKY.bands.length - 1].color);
  });

  it('별은 40~60개, 하늘 위쪽에 있고 밝기는 정해진 단계 중 하나', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const stars = createStars(createRng(seed));
      expect(stars.length).toBeGreaterThanOrEqual(STARS.minCount);
      expect(stars.length).toBeLessThanOrEqual(STARS.maxCount);
      for (const s of stars) {
        expect(s.y).toBeLessThanOrEqual(STARS.maxY);
        expect(STARS.levels).toContain(starLevel(s, 3.3));
      }
    }
  });
});

describe('먼 건물', () => {
  it('레이어 너비를 끝까지 채우고 높이가 들쭉날쭉하다', () => {
    const width = layerWidth(LAYER_FACTORS.farBuildings);
    const row = generateFarSkyline(createRng(1), width);
    const last = row[row.length - 1];
    expect(last.x + last.w).toBeGreaterThanOrEqual(width);
    expect(new Set(row.map((b) => b.h)).size).toBeGreaterThan(row.length / 2);
    for (const b of row) expect(b.windows.length).toBeLessThanOrEqual(FAR_CITY.maxWindows);
  });
});

describe('나무 줄', () => {
  const width = layerWidth(LAYER_FACTORS.treeLine);
  const trees = generateBackTrees(createRng(42), width);

  it('잎 진 나무와 전나무가 섞여 레이어 끝까지 선다', () => {
    expect(trees.some((t) => t.kind === 'bare')).toBe(true);
    expect(trees.some((t) => t.kind === 'fir')).toBe(true);
    expect(trees.at(-1)!.x).toBeGreaterThan(width - TREE_LINE.treeMaxGap * 2);
    expect(new Set(trees.map((t) => t.height)).size).toBeGreaterThan(trees.length / 3);
  });

  it('돌바닥 끝 오두막들 위로 나무 꼭대기가 보인다', () => {
    const tallestHutTop = Math.min(...HUTS.map((h) => HUT_BASE_Y - hutHeight(h)));
    const treeTops = trees.map((t) => STREET_LINE_Y - t.height);
    expect(treeTops.filter((y) => y < tallestHutTop).length).toBeGreaterThan(trees.length / 4);
  });
});

describe('시계탑', () => {
  const g = clockTowerGeometry();

  it('나무 위로 솟고 화면 위로 잘리지 않는다', () => {
    expect(g.top).toBeGreaterThanOrEqual(0);
    expect(g.base - g.top).toBeGreaterThan(TREE_LINE.bareMaxHeight);
  });

  it('시계 판은 앞에 선 오두막 지붕에 가리지 않는다', () => {
    const tallestHutTop = Math.min(...HUTS.map((h) => HUT_BASE_Y - hutHeight(h)));
    expect(g.clockY + CLOCK_TOWER.clockRadius).toBeLessThan(tallestHutTop);
  });

  it('처음 화면(트리 가운데)에서 트리 오른쪽에 보인다', () => {
    const offset = Math.round((TREE_X - SCREEN_WIDTH / 2) * LAYER_FACTORS.treeLine);
    const screenX = CLOCK_TOWER.x - offset;
    expect(screenX).toBeGreaterThan(SCREEN_WIDTH / 2 + TREE.baseHalfWidth);
    expect(screenX + CLOCK_TOWER.shaftWidth / 2).toBeLessThan(SCREEN_WIDTH);
  });

  it('바늘은 시각을 가리킨다', () => {
    expect(clockHandAngles(3, 0).hour).toBeCloseTo(Math.PI / 2, 6);
    expect(clockHandAngles(3, 0).minute).toBe(0);
    expect(clockHandAngles(18, 30).minute).toBeCloseTo(Math.PI, 6);
    expect(clockHandAngles(18, 30).hour).toBeCloseTo(Math.PI * (6.5 / 6), 6);
  });
});

describe('바닥', () => {
  it('판석 줄은 걷는 띠를 정확히 채우고 아래로 갈수록 크다', () => {
    const rows = slabRows();
    expect(rows.reduce((s, r) => s + r.h, 0)).toBe(WALK_AREA.h);
    expect(rows[0].y).toBe(WALK_AREA.y);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].h).toBeGreaterThanOrEqual(rows[i - 1].h);
      expect(rows[i].slabWidth).toBeGreaterThanOrEqual(rows[i - 1].slabWidth);
    }
  });

  it('한 줄 걸러 어긋나게 깔린다', () => {
    const slabs = generateSlabs(createRng(1), 200);
    const firstX = (y: number) => slabs.find((s) => s.y === y)!.x;
    const rows = slabRows();
    expect(firstX(rows[0].y)).toBe(0);
    expect(firstX(rows[1].y)).toBeLessThan(0);
    expect(GROUND.rowHeights.length).toBe(rows.length);
  });
});

describe('앞 눈 더미', () => {
  it('낮아서 캐릭터를 가리지 않는다', () => {
    const { mounds, shrubs } = generateForeground(createRng(1), layerWidth(LAYER_FACTORS.foregroundSnow));
    for (const m of mounds) expect(SCREEN_HEIGHT - m.h).toBeGreaterThan(WALK_AREA.y + WALK_AREA.h - 12);
    for (const s of shrubs) expect(s.h).toBeLessThanOrEqual(14);
  });
});

describe('내리는 눈', () => {
  it('세 층, 합쳐서 300개 이하, 가까울수록 크고 빠르다', () => {
    const snow = createSnowfall(createRng(1));
    expect(snow.layers).toHaveLength(3);
    expect(totalFlakes(snow)).toBeLessThanOrEqual(SNOWFALL.maxParticles);
    const [far, , near] = snow.layers.map((l) => l.config);
    expect(far.size).toBe(1);
    expect(near.size).toBe(2);
    expect(near.minSpeed).toBeGreaterThan(far.maxSpeed);
  });

  it('카메라가 움직이면 가까운 눈일수록 더 많이 밀린다', () => {
    const snow = createSnowfall(createRng(1));
    const rng = createRng(2);
    updateSnowfall(snow, 0, 100, rng);
    const before = snow.layers.map((l) => l.flakes.map((f) => f.x));
    updateSnowfall(snow, 0, 110, rng);
    const shift = snow.layers.map((l, i) => {
      const d = before[i][0] - l.flakes[0].x;
      return ((d % SCREEN_WIDTH) + SCREEN_WIDTH) % SCREEN_WIDTH;
    });
    expect(shift[0]).toBeCloseTo(10 * LAYER_FACTORS.farBuildings, 5);
    expect(shift[2]).toBeCloseTo(10 * LAYER_FACTORS.foregroundSnow, 5);
    expect(shift[2]).toBeGreaterThan(shift[1]);
    expect(shift[1]).toBeGreaterThan(shift[0]);
  });

  it('오래 내려도 화면 안에 머문다', () => {
    const snow = createSnowfall(createRng(1));
    const rng = createRng(2);
    for (let i = 0; i < 2000; i++) updateSnowfall(snow, 1 / 30, i * 3, rng);
    for (const layer of snow.layers) {
      for (const f of layer.flakes) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThan(SCREEN_WIDTH);
        expect(f.y).toBeLessThan(SCREEN_HEIGHT);
      }
    }
    expect(totalFlakes(snow)).toBeLessThanOrEqual(SNOWFALL.maxParticles);
  });
});
