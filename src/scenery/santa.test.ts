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

  it('5분에 한 번 지나간다', () => {
    expect(SANTA.interval).toBe(300);
    const santa = createSanta(() => 0.5);
    const step = 0.1;
    const starts: number[] = [];
    let was = false;
    for (let t = 0; t < 700; t += step) {
      santa.update(step);
      if (santa.flying && !was) starts.push(t);
      was = santa.flying;
    }
    expect(starts).toHaveLength(3);
    expect(starts[0]).toBeCloseTo(SANTA.firstDelay, 0);
    expect(starts[1] - starts[0]).toBeCloseTo(300, 0);
    expect(starts[2] - starts[1]).toBeCloseTo(300, 0);
    expect(flightSeconds()).toBeLessThan(60);
  });
});
