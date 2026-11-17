import { describe, expect, it } from 'vitest';
import { FAR_CITY, GROUND, LAYER_FACTORS, PLAZA_BUILDINGS, SCREEN_HEIGHT, SCREEN_WIDTH, SKY, SNOWFALL, STARS } from '../constants';
import { layerWidth } from '../layers';
import { createRng } from '../random';
import { STREET_LINE_Y, WALK_AREA } from '../world';
import { generateFarSkyline } from './farCity';
import { generateForeground } from './foreground';
import { generateSlabs, slabRows } from './ground';
import { advanceToggleTimer, collectWindows, garlandY, generatePlazaRow, nextToggleInterval, wallTopY } from './plazaBuildings';
import { createStars, skyColorAt, starLevel } from './sky';
import { createSnowfall, totalFlakes, updateSnowfall } from './snowfall';

describe('무작위 시드', () => {
  it('같은 시드면 같은 거리, 다른 시드면 다른 거리', () => {
    const a = generatePlazaRow(createRng(7), 1056);
    const b = generatePlazaRow(createRng(7), 1056);
    const c = generatePlazaRow(createRng(8), 1056);
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

describe('광장 건물', () => {
  const width = layerWidth(LAYER_FACTORS.plazaBuildings);
  const row = generatePlazaRow(createRng(42), width);

  it('빈틈 없이 이어져 레이어 너비를 끝까지 덮는다', () => {
    expect(row[0].x).toBe(0);
    for (let i = 1; i < row.length; i++) expect(row[i].x).toBe(row[i - 1].x + row[i - 1].width);
    const last = row[row.length - 1];
    expect(last.x + last.width).toBeGreaterThanOrEqual(width);
  });

  it('이웃한 건물은 모양도 색도 다르다', () => {
    for (let i = 1; i < row.length; i++) {
      expect(row[i].templateIndex).not.toBe(row[i - 1].templateIndex);
      expect(row[i].colorIndex).not.toBe(row[i - 1].colorIndex);
    }
  });

  it('3~4층이고 1층은 아치, 위층은 격자 창, 지붕에는 지붕 창', () => {
    for (const b of row) expect([3, 4]).toContain(b.floors);
    const windows = collectWindows(row, createRng(1));
    const kinds = new Set(windows.map((w) => w.kind));
    expect(kinds).toEqual(new Set(['arch', 'grid', 'dormer']));
    for (const w of windows) {
      expect(w.y + w.h).toBeLessThanOrEqual(STREET_LINE_Y);
      if (w.kind === 'arch') expect(w.y).toBeGreaterThanOrEqual(STREET_LINE_Y - PLAZA_BUILDINGS.groundFloorHeight);
      if (w.kind === 'dormer') expect(w.y + w.h).toBeLessThanOrEqual(wallTopY(row[w.buildingIndex].floors));
    }
  });

  it('창문 하나가 20~40초마다 바뀐다', () => {
    const rng = createRng(3);
    const timer = { remaining: nextToggleInterval(rng) };
    let toggles = 0;
    const seconds = 3600;
    for (let t = 0; t < seconds * 60; t++) toggles += advanceToggleTimer(timer, 1 / 60, rng);
    expect(toggles).toBeGreaterThanOrEqual(seconds / PLAZA_BUILDINGS.toggleMaxInterval - 1);
    expect(toggles).toBeLessThanOrEqual(seconds / PLAZA_BUILDINGS.toggleMinInterval + 1);
  });

  it('전구 줄은 가운데가 처지고 2층 높이에 걸린다', () => {
    const anchor = garlandY(0);
    expect(garlandY(17)).toBeGreaterThan(anchor);
    const secondFloorTop = STREET_LINE_Y - PLAZA_BUILDINGS.groundFloorHeight - PLAZA_BUILDINGS.floorHeight;
    expect(anchor).toBeGreaterThanOrEqual(secondFloorTop);
    expect(garlandY(17)).toBeLessThan(STREET_LINE_Y - PLAZA_BUILDINGS.groundFloorHeight);
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
