import { describe, expect, it } from 'vitest';
import { SANTA, TREE } from '../constants';
import { MAP_WIDTH, TREE_X } from '../world';
import { SANTA_HEIGHT, SANTA_WIDTH, createSanta, flightSeconds, santaAltitude, santaPosition } from './santa';

describe('산타 썰매', () => {
  it('맵 오른쪽 밖에서 나타나 왼쪽 밖으로 사라진다', () => {
    expect(santaPosition(0, 0).x).toBe(MAP_WIDTH);
    expect(santaPosition(1, 0).x).toBe(-SANTA_WIDTH);
  });

  it('트리 위를 지난다: 트리 꼭대기보다 위로 솟고, 화면 위로 잘리지 않는다', () => {
    const overTree = santaAltitude(TREE_X);
    expect(overTree + SANTA_HEIGHT).toBeLessThanOrEqual(TREE.tipY);
    expect(overTree - SANTA.bobHeight).toBeGreaterThanOrEqual(-1);
    // 트리에서 멀어지면 평소 높이로 내려온다
    expect(santaAltitude(TREE_X + 500)).toBeCloseTo(SANTA.cruiseY, 0);
    expect(santaAltitude(TREE_X - 500)).toBeCloseTo(SANTA.cruiseY, 0);
  });

  it('서버도 쓰는 썰매 폭 숫자가 그림 폭과 같다 (선물이 떨어지는 때를 같이 계산한다)', () => {
    expect(SANTA.width).toBe(SANTA_WIDTH);
    expect(SANTA.sackX).toBeLessThan(SANTA_WIDTH);
  });

  it('3분에 한 번, 서버 시각이 3분의 배수가 될 때마다 지나간다', () => {
    expect(SANTA.interval).toBe(180);
    let now = 1_000_000 * SANTA.interval + 40;
    const santa = createSanta(
      () => now,
      () => 0.5,
    );
    const step = 0.1;
    const starts: number[] = [];
    let was = santa.flying;
    expect(was).toBe(false);
    for (let i = 0; i < 5400; i++) {
      now += step;
      santa.update(step);
      if (santa.flying && !was) starts.push(now);
      was = santa.flying;
    }
    expect(starts).toHaveLength(3);
    for (const start of starts) expect(start % SANTA.interval).toBeLessThan(0.2);
    expect(starts[1] - starts[0]).toBeCloseTo(180, 0);
    expect(flightSeconds()).toBeLessThan(60);
  });

  it('같은 서버 시각이면 어느 화면에서나 같은 자리를 난다', () => {
    const at = 777 * SANTA.interval + 9.5;
    const a = createSanta(() => at);
    const b = createSanta(() => at);
    expect(a.flying).toBe(true);
    expect(a.position()).toEqual(b.position());
    // 시계를 바꿔 끼우면 (서버에 붙으면) 그 시각을 따른다
    b.setClock(() => at + 100);
    expect(b.flying).toBe(false);
  });
});
