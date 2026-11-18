import { describe, expect, it } from 'vitest';
import { canStandAt } from '../character/character';
import { ROOF_SNOW } from '../constants';
import { HUTS, SNOW_ROOF_HUTS, WALK_AREA, eaveZone } from '../world';
import { createRoofSnow, createSnowHits, eaveLine, roofTopAt, type Person, type RoofEvent, type RoofSnow } from './roofSnow';

const DT = 1 / 60;
const sum = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0);

function run(sim: RoofSnow, seconds: number, persons: Person[] = []): RoofEvent[] {
  const events: RoofEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) events.push(...sim.update(DT, persons));
  return events;
}

/** 저절로는 떨어지지 않게 (시험하는 지붕만 직접 떨어뜨린다) */
function quiet(sim: RoofSnow): RoofSnow {
  for (const r of sim.roofs) {
    r.fillSeconds = 1e9;
    r.level = 0;
  }
  return sim;
}

const chunks = (sim: RoofSnow) => sim.particles.filter((p) => p.active && p.kind === 'chunk');

/** 처마 밑 한가운데 서 있는 사람 */
function under(roof: number, over: Partial<Person> = {}): Person {
  const z = eaveZone(SNOW_ROOF_HUTS[roof]);
  return { id: 'me', x: z.x + z.w / 2, y: z.y + z.h / 2, moving: false, canBeHit: true, ...over };
}

describe('지붕 눈 (칸 단위)', () => {
  it('지붕 4곳(회전목마 구역 2, 광장 2), 처마 밑 영역은 걸을 수 있는 바닥', () => {
    const sim = createRoofSnow();
    expect(sim.roofs).toHaveLength(4);
    expect(sim.roofs.filter((r) => r.hut.x < 480)).toHaveLength(2);
    expect(sim.roofs.filter((r) => r.hut.x >= 480 && r.hut.x < 960)).toHaveLength(2);
    SNOW_ROOF_HUTS.forEach((hutIndex, i) => {
      expect(eaveZone(hutIndex).y).toBe(WALK_AREA.y);
      const p = under(i);
      expect(canStandAt(p.x, p.y)).toBe(true);
      expect(roofTopAt(HUTS[hutIndex], HUTS[hutIndex].x)).toBeLessThan(eaveLine(HUTS[hutIndex]).y);
    });
  });

  it('가로 1px 칸마다 두께를 갖고, 칸마다 조금씩 달라 윗면이 울퉁불퉁하다', () => {
    const sim = createRoofSnow();
    for (const r of sim.roofs) {
      const e = eaveLine(r.hut);
      expect(r.depth).toHaveLength(e.right - e.left);
      const middle = Array.from(r.cap).slice(ROOF_SNOW.taperColumns, -ROOF_SNOW.taperColumns);
      expect(new Set(middle.map((c) => c.toFixed(2))).size).toBeGreaterThan(middle.length / 2);
      for (const c of middle) {
        expect(c).toBeGreaterThanOrEqual(ROOF_SNOW.maxDepth * (1 - ROOF_SNOW.depthVariation) - 1e-3);
        expect(c).toBeLessThanOrEqual(ROOF_SNOW.maxDepth * (1 + ROOF_SNOW.depthVariation) + 1e-3);
      }
    }
  });

  it('지붕마다 다른 양에서 시작하고 가득 차기까지 3~5분, 쌓일수록 칸이 두꺼워진다', () => {
    const sim = createRoofSnow();
    expect(new Set(sim.roofs.map((r) => r.level.toFixed(3))).size).toBe(sim.roofs.length);
    for (const r of sim.roofs) {
      expect(r.fillSeconds).toBeGreaterThanOrEqual(180);
      expect(r.fillSeconds).toBeLessThanOrEqual(300);
    }
    const before = sum(sim.roofs[0].depth);
    const level = sim.roofs[0].level;
    run(sim, 5);
    expect(sum(sim.roofs[0].depth)).toBeGreaterThan(before);
    expect(sim.roofs[0].level).toBeCloseTo(level + 5 / sim.roofs[0].fillSeconds, 3);
  });
});

describe('미끄러져 떨어지기', () => {
  it('가득 차면 눈 판이 미끄러지기 시작하고 쌓인 양은 0으로 돌아가 다시 쌓인다', () => {
    const sim = quiet(createRoofSnow());
    const roof = sim.roofs[0];
    sim.fillAndDrop(0);
    const events = run(sim, 0.1);
    expect(events.filter((e) => e.type === 'slide')).toEqual([{ type: 'slide', roof: 0 }]);
    expect(roof.slabs.length).toBeGreaterThan(0);
    expect(roof.level).toBeLessThan(0.01);
    run(sim, 6);
    expect(roof.slabs).toHaveLength(0);
    roof.fillSeconds = 200;
    run(sim, 2);
    expect(roof.level).toBeGreaterThan(0);
  });

  it('지붕 폭의 30~70%만 떨어지고, 지나간 자리는 얕은 눈만 남고 나머지는 그대로다', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const sim = quiet(createRoofSnow(seed));
      const roof = sim.roofs[0];
      sim.fillAndDrop(0);
      sim.update(DT, []);
      const n = roof.depth.length;
      const length = sum(roof.slabs.map((s) => s.th.length));
      expect(length / n).toBeGreaterThanOrEqual(ROOF_SNOW.slideMinRatio - 0.02);
      expect(length / n).toBeLessThanOrEqual(ROOF_SNOW.slideMaxRatio + 0.02);
      const thin = Array.from(roof.depth).filter((d) => d <= ROOF_SNOW.residue + 0.01).length;
      expect(thin).toBeGreaterThanOrEqual(length);
      expect(thin).toBeLessThan(n);
    }
  });

  it('처음에는 느리게 들썩이다가 점점 빨라진다', () => {
    const sim = quiet(createRoofSnow());
    sim.fillAndDrop(0);
    sim.update(DT, []);
    const slab = sim.roofs[0].slabs[0];
    run(sim, ROOF_SNOW.creepSeconds - 0.1);
    expect(slab.v).toBe(ROOF_SNOW.creepSpeed);
    expect(slab.s).toBeLessThan(ROOF_SNOW.creepSpeed * ROOF_SNOW.creepSeconds);
    const speeds: number[] = [];
    for (let i = 0; i < 4; i++) {
      run(sim, 0.1);
      speeds.push(slab.v);
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    // 가속도 = 중력 × sin(지붕 각도) × 0.6
    const accel = (speeds[3] - speeds[2]) / 0.1;
    expect(accel).toBeCloseTo(ROOF_SNOW.gravity * sim.roofs[0].slope.sin * ROOF_SNOW.slideFactor, -1);
  });

  it('처마에서 3덩어리 이상으로 끊어져 연달아 떨어진다 (한 번에 다 떨어지지 않는다)', () => {
    const sim = quiet(createRoofSnow());
    sim.fillAndDrop(0);
    sim.update(DT, []);
    const slab = sim.roofs[0].slabs[0];
    const breaks: number[] = [];
    let lead = 0;
    for (let t = 0; t < 5 && sim.roofs[0].slabs.includes(slab); t += DT) {
      sim.update(DT, []);
      if (slab.lead > lead) {
        breaks.push(t);
        expect(slab.lead - lead).toBeLessThanOrEqual(ROOF_SNOW.breakMaxLength + 1);
        lead = slab.lead;
      }
    }
    expect(breaks.length).toBeGreaterThanOrEqual(3);
    expect(breaks[breaks.length - 1] - breaks[0]).toBeGreaterThan(0.1);
  });

  it('덩어리는 중력을 따라 점점 빠르게 떨어진다', () => {
    const sim = quiet(createRoofSnow());
    sim.fillAndDrop(0);
    for (let t = 0; t < 5 && chunks(sim).length === 0; t += DT) sim.update(DT, []);
    const chunk = chunks(sim)[0];
    expect(chunk).toBeDefined();
    const v0 = chunk.vy;
    const y0 = chunk.y;
    run(sim, 0.1);
    expect(chunk.active).toBe(true);
    expect(chunk.vy).toBeGreaterThan(v0);
    // 공기 저항이 있어 중력만일 때보다는 조금 느리다
    expect(chunk.vy - v0).toBeLessThanOrEqual(ROOF_SNOW.gravity * 0.1 + 1e-6);
    expect(chunk.vy - v0).toBeGreaterThan(ROOF_SNOW.gravity * 0.1 * 0.7);
    expect(chunk.y).toBeGreaterThan(y0);
  });

  it('지붕에서 줄어든 눈의 양과 떨어진 덩어리·더미의 양이 대략 같다', () => {
    const sim = quiet(createRoofSnow());
    const roof = sim.roofs[0];
    sim.fillAndDrop(0);
    const before = sum(roof.depth);
    sim.update(DT, []);
    const removed = before - sum(roof.depth);
    expect(removed).toBeGreaterThan(20);
    expect(sim.stats.removed).toBeCloseTo(removed, 3);
    const lands = run(sim, 6).filter((e) => e.type === 'land');
    expect(lands.length).toBeGreaterThanOrEqual(3);
    expect(chunks(sim)).toHaveLength(0);
    expect(sim.stats.landed).toBeCloseTo(removed, 1);
    // 더미는 떨어지는 몇 초 사이 가장자리부터 조금 녹았다
    expect(sum(roof.pile)).toBeGreaterThan(removed * 0.4);
    expect(sum(roof.pile)).toBeLessThanOrEqual(removed + 1e-3);
    // 덩어리가 떨어진 자리마다 언덕 — 울퉁불퉁하다
    const heights = Array.from(roof.pile).filter((h) => h > 0);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
  });

  it('더미는 가장자리부터 낮아지며 20초 뒤 없어진다', () => {
    const sim = quiet(createRoofSnow());
    const roof = sim.roofs[0];
    sim.fillAndDrop(0);
    run(sim, 6);
    const wide = Array.from(roof.pile).filter((h) => h > 0).length;
    expect(wide).toBeGreaterThan(0);
    run(sim, ROOF_SNOW.pileMeltSeconds / 2);
    const narrow = Array.from(roof.pile).filter((h) => h > 0).length;
    expect(narrow).toBeGreaterThan(0);
    expect(narrow).toBeLessThan(wide);
    run(sim, ROOF_SNOW.pileMeltSeconds / 2 + 0.5);
    expect(sum(roof.pile)).toBe(0);
  });

  it('동시에 떠 있는 덩어리·가루는 상한(약 200)을 넘지 않는다', () => {
    const sim = quiet(createRoofSnow());
    expect(sim.particles).toHaveLength(ROOF_SNOW.poolSize);
    for (let i = 0; i < sim.roofs.length; i++) sim.fillAndDrop(i);
    let most = 0;
    for (let t = 0; t < 5; t += DT) {
      sim.update(DT, []);
      most = Math.max(most, sim.particles.filter((p) => p.active).length);
    }
    expect(most).toBeGreaterThan(20);
    expect(most).toBeLessThanOrEqual(ROOF_SNOW.poolSize);
  });
});

describe('맞기', () => {
  /** 0번 지붕을 떨어뜨리고, 덩어리가 실제로 떨어지는 자리를 찾는다 */
  function landingSpot(seed: number): { x: number; y: number } {
    const sim = quiet(createRoofSnow(seed));
    sim.fillAndDrop(0);
    const lands = run(sim, 6).filter((e) => e.type === 'land');
    const first = lands[0] as Extract<RoofEvent, { type: 'land' }>;
    return { x: Math.round(first.x), y: Math.round(first.y) };
  }

  it('실제로 덩어리가 몸에 닿았을 때만 눈사람이 된다', () => {
    const seed = 3;
    const spot = landingSpot(seed);
    for (const [person, expectHit] of [
      // 덩어리가 떨어지는 자리에 서 있다
      [{ id: 'me', x: spot.x, y: spot.y, moving: true, canBeHit: true }, true],
      // 처마 밑이지만 덩어리가 떨어지지 않는 지붕 한가운데 아래
      [under(0, { moving: true }), false],
      // 멀리 있다
      [{ id: 'me', x: spot.x, y: WALK_AREA.y + 60, moving: true, canBeHit: true }, false],
      // 회전목마·스케이트 중
      [{ id: 'me', x: spot.x, y: spot.y, moving: true, canBeHit: false }, false],
    ] as const) {
      const sim = quiet(createRoofSnow(seed));
      sim.fillAndDrop(0);
      const events = run(sim, 6, [person]);
      const hits = createSnowHits(() => 0.5);
      hits.handle(events, 'me');
      expect(sim.stats.hit > 0, JSON.stringify(person)).toBe(expectHit);
      expect(hits.snowman || hits.hat, JSON.stringify(person)).toBe(expectHit);
      expect(events.some((e) => e.type === 'snowman'), JSON.stringify(person)).toBe(expectHit && sim.stats.hit >= ROOF_SNOW.snowmanMass);
      // 닿은 덩어리는 더미가 되지 않는다
      expect(sim.stats.hit + sim.stats.landed).toBeCloseTo(sim.stats.removed, 1);
    }
  });

  it('닿은 눈의 양이 많으면 눈사람, 적으면 눈 모자', () => {
    const spot = landingSpot(3);
    const sim = quiet(createRoofSnow(3));
    sim.fillAndDrop(0);
    const events = run(sim, 6, [{ id: 'me', x: spot.x, y: spot.y, moving: true, canBeHit: true }]);
    expect(sim.stats.hit).toBeGreaterThanOrEqual(ROOF_SNOW.snowmanMass);
    expect(events.some((e) => e.type === 'snowman')).toBe(true);
  });

  it('느리게 들썩이는 동안 빠져나가면 맞지 않는다', () => {
    const spot = landingSpot(3);
    const sim = quiet(createRoofSnow(3));
    sim.fillAndDrop(0);
    const person: Person = { id: 'me', x: spot.x, y: spot.y, moving: true, canBeHit: true };
    run(sim, ROOF_SNOW.creepSeconds, [person]);
    expect(sim.stats.hit).toBe(0);
    // 앞쪽으로 걸어 나온다
    person.y = WALK_AREA.y + 50;
    run(sim, 6, [person]);
    expect(sim.stats.hit).toBe(0);
  });

  it('눈사람은 2초 뒤 빠져나오고, 방향키를 연타하면 더 빨리 나온다', () => {
    const event: RoofEvent = { type: 'snowman', id: 'me', x: 0, y: 0, afterHat: false };
    const slow = createSnowHits(() => 0.5);
    let cold = 0;
    slow.handle([event], 'me', (amount) => (cold += amount));
    expect(cold).toBe(ROOF_SNOW.cold.fall);
    expect(slow.frozen).toBe(true);
    for (let t = 0; t < ROOF_SNOW.snowmanSeconds - 0.2; t += DT) slow.update(DT);
    expect(slow.frozen).toBe(true);
    for (let t = 0; t < 0.3; t += DT) slow.update(DT);
    expect(slow.frozen).toBe(false);

    const fast = createSnowHits(() => 0.5);
    fast.handle([event], 'me');
    fast.struggle(6);
    for (let t = 0; t < 0.6; t += DT) fast.update(DT);
    expect(fast.frozen).toBe(false);
    // 남의 일은 받지 않는다
    const other = createSnowHits();
    other.handle([event], 'someone-else');
    expect(other.frozen).toBe(false);
  });
});

describe('서 있으면 툭', () => {
  it('처마 밑에 6초 가만히 서 있으면 머리 위 눈이 흔들리다 떨어져 눈 모자가 얹히고, 그 자리 눈이 실제로 줄어든다', () => {
    const sim = quiet(createRoofSnow());
    const roof = sim.roofs[0];
    roof.level = 0.5;
    const me = under(0);
    expect(run(sim, ROOF_SNOW.standSeconds - 0.2, [me]).some((e) => e.type === 'drip')).toBe(false);
    const above = () => {
      const c = Math.round(me.x) - roof.left;
      return sum(Array.from(roof.depth).slice(c - ROOF_SNOW.dripHalfWidth, c + ROOF_SNOW.dripHalfWidth + 1));
    };
    const before = above();
    const start = run(sim, 0.3, [me]);
    expect(start.find((e) => e.type === 'drip')).toMatchObject({ type: 'drip', roof: 0, id: 'me' });
    expect(roof.level).toBeCloseTo(0.5 - ROOF_SNOW.dripLevelDrop, 2);
    // 0.3초 흔들린 뒤 떨어져 머리에 닿는다
    const after = run(sim, 2, [me]);
    expect(above()).toBeLessThan(before - 3);
    expect(after.some((e) => e.type === 'hat')).toBe(true);
    expect(after.some((e) => e.type === 'snowman')).toBe(false);
    const hits = createSnowHits();
    hits.handle(after, 'me');
    expect(hits.hat).toBe(true);
    expect(hits.snowman).toBe(false);
  });

  it('흔들리는 동안 자리를 뜨면 맞지 않고 바닥에 떨어진다', () => {
    const sim = quiet(createRoofSnow());
    const me = under(0);
    run(sim, ROOF_SNOW.standSeconds + 0.1, [me]);
    me.y = WALK_AREA.y + 60;
    me.moving = true;
    const events = run(sim, 2, [me]);
    expect(events.some((e) => e.type === 'hat')).toBe(false);
    expect(events.some((e) => e.type === 'land')).toBe(true);
  });

  it('움직이거나 처마 밖이면 툭이 없다', () => {
    const sim = quiet(createRoofSnow());
    expect(run(sim, 10, [under(0, { moving: true })]).some((e) => e.type === 'drip')).toBe(false);
    expect(run(sim, 10, [under(0, { y: WALK_AREA.y + 40 })]).some((e) => e.type === 'drip')).toBe(false);
    expect(run(sim, 10, [under(0, { canBeHit: false })]).some((e) => e.type === 'drip')).toBe(false);
  });

  it('한 번 맞으면 20초 동안 다시 떨어지지 않는다', () => {
    const sim = quiet(createRoofSnow());
    const me = under(0);
    const drips: number[] = [];
    for (let t = 0; t < 30; t += DT) {
      if (sim.update(DT, [me]).some((e) => e.type === 'drip')) drips.push(t);
    }
    expect(drips.length).toBe(2);
    expect(drips[0]).toBeCloseTo(ROOF_SNOW.standSeconds, 0);
    expect(drips[1] - drips[0]).toBeGreaterThanOrEqual(ROOF_SNOW.dripCooldown - DT);
  });
});
