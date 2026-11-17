import { describe, expect, it } from 'vitest';
import { CHARACTER } from '../constants';
import { OBSTACLES, SPAWN, WALK_AREA, getObstacle, rectsOverlap } from '../world';
import {
  canStandAt,
  createCharacter,
  footRect,
  setWalkTarget,
  updateCharacter,
  type Character,
  type MoveInput,
} from './character';

const FRAME = 1 / 60;

/** 매 프레임 발 상자가 바닥 띠 안, 장애물 밖인지 확인하며 움직인다 */
function walk(ch: Character, input: MoveInput, seconds: number): void {
  const frames = Math.round(seconds / FRAME);
  for (let i = 0; i < frames; i++) {
    updateCharacter(ch, FRAME, input);
    expectLegal(ch);
  }
}

function expectLegal(ch: Character): void {
  const foot = footRect(ch.x, ch.y);
  expect(foot.x).toBeGreaterThanOrEqual(WALK_AREA.x);
  expect(foot.x + foot.w).toBeLessThanOrEqual(WALK_AREA.x + WALK_AREA.w);
  expect(foot.y).toBeGreaterThanOrEqual(WALK_AREA.y);
  expect(foot.y + foot.h).toBeLessThanOrEqual(WALK_AREA.y + WALK_AREA.h);
  for (const o of OBSTACLES) expect(rectsOverlap(foot, o), `${o.id}와 겹침`).toBe(false);
}

describe('캐릭터 이동', () => {
  it('트리 앞 시작 위치는 설 수 있는 자리다', () => {
    expect(canStandAt(SPAWN.x, SPAWN.y)).toBe(true);
  });

  it('초당 약 60px 걷는다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    walk(ch, { x: 1, y: 0 }, 1);
    expect(ch.x - SPAWN.x).toBeCloseTo(CHARACTER.speed, 0);
  });

  it('왼쪽 끝까지 걸어가서 맵 끝에서 막힌다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    walk(ch, { x: -1, y: 0 }, 20);
    expect(ch.x).toBe(WALK_AREA.x + CHARACTER.footHalfWidth);
  });

  it('오른쪽 끝까지 걸어가서 맵 끝에서 막힌다 (링크 울타리 앞으로 지나감)', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    walk(ch, { x: 1, y: 0 }, 20);
    expect(ch.x).toBe(WALK_AREA.x + WALK_AREA.w - CHARACTER.footHalfWidth);
  });

  it('위아래로 바닥 띠를 벗어나지 않는다', () => {
    const ch = createCharacter(100, SPAWN.y);
    walk(ch, { x: 0, y: -1 }, 5);
    expect(ch.y).toBe(WALK_AREA.y + CHARACTER.footHeight);
    walk(ch, { x: 0, y: 1 }, 5);
    expect(ch.y).toBe(WALK_AREA.y + WALK_AREA.h);
  });

  it('트리 화단을 뚫지 못하고 바로 앞에서 멈춘다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    walk(ch, { x: 0, y: -1 }, 5);
    const bed = getObstacle('tree-bed');
    expect(ch.y).toBe(bed.y + bed.h + CHARACTER.footHeight);
  });

  it('장애물마다 사방에서 부딪혀도 뚫지 못한다', () => {
    for (const o of OBSTACLES) {
      const below = o.y + o.h + CHARACTER.footHeight + 6;
      if (below > WALK_AREA.y + WALK_AREA.h) continue;
      // 아래에서 위로
      const up = createCharacter(o.x + o.w / 2, below);
      walk(up, { x: 0, y: -1 }, 3);
      // 왼쪽에서 오른쪽으로 (장애물 뒤쪽 높이에서)
      const sideY = o.y + CHARACTER.footHeight + 1;
      const leftX = o.x - CHARACTER.footHalfWidth - 6;
      if (canStandAt(leftX, sideY)) walk(createCharacter(leftX, sideY), { x: 1, y: 0 }, 3);
      const rightX = o.x + o.w + CHARACTER.footHalfWidth + 6;
      if (canStandAt(rightX, sideY)) walk(createCharacter(rightX, sideY), { x: -1, y: 0 }, 3);
    }
  });

  it('무작위로 오래 걸어도 바닥 띠와 장애물을 뚫지 않는다', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    for (let i = 0; i < 400; i++) {
      const input = { x: Math.round(random() * 2 - 1), y: Math.round(random() * 2 - 1) };
      walk(ch, input, 0.5);
    }
  });

  it('탭한 곳으로 걸어가 도착하면 멈춘다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    setWalkTarget(ch, SPAWN.x - 100, WALK_AREA.y + 50);
    walk(ch, { x: 0, y: 0 }, 5);
    expect(ch.target).toBeNull();
    expect(Math.hypot(ch.x - (SPAWN.x - 100), ch.y - (WALK_AREA.y + 50))).toBeLessThanOrEqual(CHARACTER.arriveDistance);
    expect(ch.moving).toBe(false);
  });

  it('장애물 안을 탭하면 앞에서 막혀 멈춘다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    const bed = getObstacle('tree-bed');
    setWalkTarget(ch, bed.x + bed.w / 2, bed.y + bed.h / 2);
    walk(ch, { x: 0, y: 0 }, 5);
    expect(ch.target).toBeNull();
  });

  it('왼쪽으로 걸으면 왼쪽을 본다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    walk(ch, { x: -1, y: 0 }, 0.1);
    expect(ch.facing).toBe('left');
    expect(ch.moving).toBe(true);
  });
});
