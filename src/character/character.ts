// 캐릭터 상태와 이동. DOM을 쓰지 않아 테스트에서 바로 돌릴 수 있다.

import { CHARACTER, DEFAULT_OUTFIT, type OutfitName } from '../constants';
import { OBSTACLES, WALK_AREA, rectsOverlap, type Point, type Rect } from '../world';
import { nextBreathInterval, spawnPuff, updatePuffs, type BreathPuff } from './breath';
import { POSES, type Facing, type PoseName } from './sprites';
import { createCharacterState, createHatState, type CharacterStateStore, type HatStore, createHoldState, type HoldStore } from './state';

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
  /** 지금 무엇을 하고 있나: 걷기 / 회전목마 타기 / 스케이트 (바뀌면 onChange로 알린다) */
  state: CharacterStateStore;
  /** 털모자: 쓰고 있나, 벗겨져 어디에 떨어져 있나 (벗겨져 있으면 대머리로 그린다) */
  hat: HatStore;
  /** 쓰고 있는 털모자 색 (목도리 색 번호 0~5, null = 기본 빨강)과 그 모자의 주인 닉네임 (내 모자면 null) */
  hatColor: number | null;
  hatOwner: string | null;
  /** 손에 든 노점 소품 또는 트리 장식 */
  holding: HoldStore;
  /** 손에 든 것이 트리 장식이면 그 장식의 id (선물 상자에서 받은 것 — 서버가 이 id로 확인한다) */
  heldTag: string | null;
  /** 윗몸을 옆으로 기울이는 px (재채기·떨림). 어떤 자세로 그리든 더해진다 */
  lean: number;
  /** 걷는 빠르기 배율 (재채기 준비 중에는 느려진다) */
  speedFactor: number;
  /** 눈을 감았나 (재채기하는 동안) */
  eyesClosed: boolean;
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
    state: createCharacterState(),
    hat: createHatState(),
    hatColor: null,
    hatOwner: null,
    holding: createHoldState(),
    heldTag: null,
    lean: 0,
    speedFactor: 1,
    eyesClosed: false,
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

/** 그때그때 생기는 장애물 (놓아둔 눈덩이, 눈사람). 매 프레임 바꿔 끼운다 */
let dynamicObstacles: readonly Rect[] = [];

export function setDynamicObstacles(rects: readonly Rect[]): void {
  dynamicObstacles = rects;
}

/**
 * 이 자리에 설 수 있나: 발 상자가 바닥 띠 안에 있고 장애물과 겹치지 않아야 한다.
 * from = 지금 서 있는 자리. 그때그때 생기는 장애물은, 이미 겹쳐 서 있던 것이면 막지 않는다 (발밑에 눈사람이 생겨도 빠져나올 수 있게).
 */
export function canStandAt(x: number, y: number, from?: { x: number; y: number }): boolean {
  const foot = footRect(x, y);
  const insideWalk =
    foot.x >= WALK_AREA.x &&
    foot.x + foot.w <= WALK_AREA.x + WALK_AREA.w &&
    foot.y >= WALK_AREA.y &&
    foot.y + foot.h <= WALK_AREA.y + WALK_AREA.h;
  if (!insideWalk || OBSTACLES.some((o) => rectsOverlap(foot, o))) return false;
  if (dynamicObstacles.length === 0) return true;
  const here = from ? footRect(from.x, from.y) : null;
  return !dynamicObstacles.some((o) => rectsOverlap(foot, o) && !(here && rectsOverlap(here, o)));
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
    if (!canStandAt(nx, ny, ch)) return;
    ch.x = nx;
    ch.y = ny;
  }
}

export function updateCharacter(ch: Character, dt: number, input: MoveInput): void {
  let dirX = 0;
  let dirY = 0;
  let maxDistance = CHARACTER.speed * ch.speedFactor * dt;

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
