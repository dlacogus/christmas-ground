// 캐릭터 상태와 이동. DOM을 쓰지 않아 테스트에서 바로 돌릴 수 있다.

import { CHARACTER, DEFAULT_OUTFIT, type OutfitName } from '../constants';
import { OBSTACLES, WALK_AREA, rectsOverlap, type Point, type Rect } from '../world';
import { nextBreathInterval, spawnPuff, updatePuffs, type BreathPuff } from './breath';
import { POSES, type Facing, type PoseName } from './sprites';

export interface Character {
  /** 발밑 좌표 */
  x: number;
  y: number;
  facing: Facing;
  outfit: OutfitName;
  moving: boolean;
  animTime: number;
  /** 탭으로 정한 목적지 (없으면 null) */
  target: Point | null;
  breathTimer: number;
  puffs: BreathPuff[];
}

/** 키 입력 방향 (-1~1) */
export interface MoveInput {
  x: number;
  y: number;
}

export function createCharacter(x: number, y: number, outfit: OutfitName = DEFAULT_OUTFIT): Character {
  return {
    x,
    y,
    facing: 'right',
    outfit,
    moving: false,
    animTime: 0,
    target: null,
    breathTimer: nextBreathInterval(),
    puffs: [],
  };
}

/** 발밑 충돌 상자 */
export function footRect(x: number, y: number): Rect {
  return {
    x: x - CHARACTER.footHalfWidth,
    y: y - CHARACTER.footHeight,
    w: CHARACTER.footHalfWidth * 2,
    h: CHARACTER.footHeight,
  };
}

/** 이 자리에 설 수 있나: 발 상자가 바닥 띠 안에 있고 장애물과 겹치지 않아야 한다 */
export function canStandAt(x: number, y: number): boolean {
  const foot = footRect(x, y);
  const insideWalk =
    foot.x >= WALK_AREA.x &&
    foot.x + foot.w <= WALK_AREA.x + WALK_AREA.w &&
    foot.y >= WALK_AREA.y &&
    foot.y + foot.h <= WALK_AREA.y + WALK_AREA.h;
  return insideWalk && !OBSTACLES.some((o) => rectsOverlap(foot, o));
}

/** 탭한 곳을 목적지로 정한다 (바닥 띠 안으로 맞춤) */
export function setWalkTarget(ch: Character, x: number, y: number): void {
  const minX = WALK_AREA.x + CHARACTER.footHalfWidth;
  const maxX = WALK_AREA.x + WALK_AREA.w - CHARACTER.footHalfWidth;
  const minY = WALK_AREA.y + CHARACTER.footHeight;
  const maxY = WALK_AREA.y + WALK_AREA.h;
  ch.target = {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/** 한 축으로 잘게 나눠 움직이고, 막히면 그 바로 앞에서 멈춘다 */
function moveAxis(ch: Character, axis: 'x' | 'y', amount: number): void {
  if (amount === 0) return;
  const steps = Math.ceil(Math.abs(amount) / CHARACTER.collisionStep);
  const step = amount / steps;
  for (let i = 0; i < steps; i++) {
    const nx = axis === 'x' ? ch.x + step : ch.x;
    const ny = axis === 'y' ? ch.y + step : ch.y;
    if (!canStandAt(nx, ny)) return;
    ch.x = nx;
    ch.y = ny;
  }
}

export function updateCharacter(ch: Character, dt: number, input: MoveInput): void {
  let dirX = 0;
  let dirY = 0;
  let maxDistance = CHARACTER.speed * dt;

  if (input.x !== 0 || input.y !== 0) {
    // 키 입력이 탭 목적지보다 우선
    ch.target = null;
    const len = Math.hypot(input.x, input.y);
    dirX = input.x / len;
    dirY = input.y / len;
  } else if (ch.target) {
    const tx = ch.target.x - ch.x;
    const ty = ch.target.y - ch.y;
    const dist = Math.hypot(tx, ty);
    if (dist <= CHARACTER.arriveDistance) {
      ch.target = null;
    } else {
      dirX = tx / dist;
      dirY = ty / dist;
      maxDistance = Math.min(maxDistance, dist);
    }
  }

  const beforeX = ch.x;
  const beforeY = ch.y;
  moveAxis(ch, 'x', dirX * maxDistance);
  moveAxis(ch, 'y', dirY * maxDistance);
  const moved = ch.x !== beforeX || ch.y !== beforeY;

  // 탭 목적지로 가다가 완전히 막히면 포기
  if (ch.target && !moved) ch.target = null;

  if (dirX > CHARACTER.facingThreshold) ch.facing = 'right';
  else if (dirX < -CHARACTER.facingThreshold) ch.facing = 'left';

  if (moved !== ch.moving) {
    ch.moving = moved;
    ch.animTime = 0;
  }
  ch.animTime += dt;

  if (ch.moving) {
    ch.breathTimer -= dt;
    if (ch.breathTimer <= 0) {
      ch.puffs.push(spawnPuff(ch.x, ch.y, ch.facing));
      ch.breathTimer = nextBreathInterval();
    }
  }
  updatePuffs(ch.puffs, dt);
}

/** 지금 보여줄 자세와 프레임 번호 */
export function getCharacterFrame(ch: Character): { pose: PoseName; index: number } {
  const pose: PoseName = ch.moving ? 'walk' : 'idle';
  const duration = ch.moving ? CHARACTER.walkFrameDuration : CHARACTER.idleFrameDuration;
  return { pose, index: Math.floor(ch.animTime / duration) % POSES[pose].length };
}
