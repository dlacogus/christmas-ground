import { describe, expect, it } from 'vitest';
import { FOOTPRINTS } from '../constants';
import { MAP_WIDTH, WALK_AREA } from '../world';
import { createFootprints, footprintAlpha } from './footprints';
import { isSnowAt } from './ground';

describe('눈 위 발자국', () => {
  it('왼발·오른발이 걷는 줄 양옆에 번갈아 찍힌다', () => {
    const f = createFootprints();
    f.add(100, 200, -1, 0);
    f.add(96, 200, -1, 0);
    expect(f.prints).toHaveLength(2);
    expect(f.prints[0].y).not.toBe(f.prints[1].y);
    expect(Math.abs(f.prints[0].y - 200)).toBe(FOOTPRINTS.sideOffset);
    // 세로로 걸으면 좌우로 벌어진다
    f.add(96, 204, 0, 1);
    expect(f.prints[2].vertical).toBe(true);
    expect(f.prints[2].y).toBe(204);
  });

  it('한동안 남아 있다가 서서히 흐려져 사라진다', () => {
    expect(footprintAlpha(0)).toBe(1);
    expect(footprintAlpha(FOOTPRINTS.life - FOOTPRINTS.fade)).toBe(1);
    expect(footprintAlpha(FOOTPRINTS.life - FOOTPRINTS.fade / 2)).toBeCloseTo(0.5, 5);
    expect(footprintAlpha(FOOTPRINTS.life)).toBe(0);
    const f = createFootprints();
    f.add(100, 200, 1, 0);
    f.update(FOOTPRINTS.life - 0.1);
    expect(f.prints).toHaveLength(1);
    f.update(0.2);
    expect(f.prints).toHaveLength(0);
  });

  it('너무 많이 쌓이지 않는다 (오래된 것부터 지운다)', () => {
    const f = createFootprints();
    for (let i = 0; i < FOOTPRINTS.max + 30; i++) f.add(i, 200, 1, 0);
    expect(f.prints).toHaveLength(FOOTPRINTS.max);
    expect(f.prints[0].x).toBe(30);
  });

  it('눈이 쌓인 곳과 벽돌이 드러난 곳을 구분한다', () => {
    let snow = 0;
    let bare = 0;
    for (let x = 0; x < MAP_WIDTH; x += 7) {
      for (let y = WALK_AREA.y; y < WALK_AREA.y + WALK_AREA.h; y += 5) {
        if (isSnowAt(x, y)) snow++;
        else bare++;
      }
    }
    expect(bare).toBeGreaterThan(0);
    expect(snow).toBeGreaterThan(bare * 5);
    // 바닥 밖
    expect(isSnowAt(100, WALK_AREA.y - 1)).toBe(false);
    expect(isSnowAt(-1, 200)).toBe(false);
  });
});
