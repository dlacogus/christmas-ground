// 월드 좌표 데이터. 좌표는 모두 맵 기준 (x 0~1440, y 0~270).
// 장애물은 '발밑 기준' 사각형이다: 캐릭터의 발 상자가 겹치면 못 지나간다.

import { GROUND } from './constants';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MAP_WIDTH = 1440;
export const MAP_HEIGHT = 270;

export type ZoneName = 'carousel' | 'plaza' | 'rink';

/** 구역 경계 (x 좌표, 시작 포함 ~ 끝 미포함) */
export const ZONE_BOUNDS: Readonly<Record<ZoneName, { startX: number; endX: number }>> = {
  carousel: { startX: 0, endX: 480 },
  plaza: { startX: 480, endX: 960 },
  rink: { startX: 960, endX: 1440 },
};

/** 걸을 수 있는 돌바닥 띠. 좌우 끝은 맵 끝에서 막힌다. */
export const WALK_AREA: Rect = { x: 0, y: 176, w: MAP_WIDTH, h: 88 };

// --- 주요 시설 위치 ---
/** 트리에서 너무 멀지 않게 구역 오른쪽(광장 쪽)으로 붙인다 */
export const CAROUSEL_X = 380;
export const CAROUSEL_HALF_WIDTH = 44;
export const CAROUSEL_DEPTH = 24;

export const TREE_X = 720;
export const TREE_BED_HALF_WIDTH = 22;
export const TREE_BED_DEPTH = 24;

/** 링크는 구역 왼쪽(광장 쪽)으로 붙이고, 입구도 광장 쪽 끝에 둔다 */
export const RINK_FENCE_START_X = 970;
export const RINK_FENCE_END_X = 1300;
export const RINK_FENCE_DEPTH = 48;
/** 울타리 왼쪽 끝에서 입구까지 */
export const RINK_GATE_OFFSET = 60;

/** 노점 4곳 (메인 광장, 트리 양옆) — 가운데 x */
export const STALL_CENTERS = [522, 594, 846, 918] as const;
export const STALL_WIDTH = 44;
/** 노점 뒷면이 바닥 띠를 차지하는 깊이 */
export const STALL_BACK_DEPTH = 10;

/** 상호작용 지점을 시설 앞쪽으로 띄우는 거리 */
export const INTERACTION_FRONT_GAP = 8;

/** 시작 위치를 트리 화단 앞으로 띄우는 거리 */
export const SPAWN_FRONT_GAP = 40;

// --- 장애물 ---
export interface Obstacle extends Rect {
  id: string;
}

export const OBSTACLES: readonly Obstacle[] = [
  {
    id: 'carousel',
    x: CAROUSEL_X - CAROUSEL_HALF_WIDTH,
    y: WALK_AREA.y,
    w: CAROUSEL_HALF_WIDTH * 2,
    h: CAROUSEL_DEPTH,
  },
  {
    id: 'tree-bed',
    x: TREE_X - TREE_BED_HALF_WIDTH,
    y: WALK_AREA.y,
    w: TREE_BED_HALF_WIDTH * 2,
    h: TREE_BED_DEPTH,
  },
  ...STALL_CENTERS.map((cx, i) => ({
    id: `stall-${i + 1}`,
    x: cx - STALL_WIDTH / 2,
    y: WALK_AREA.y,
    w: STALL_WIDTH,
    h: STALL_BACK_DEPTH,
  })),
  {
    id: 'rink-fence',
    x: RINK_FENCE_START_X,
    y: WALK_AREA.y,
    w: RINK_FENCE_END_X - RINK_FENCE_START_X,
    h: RINK_FENCE_DEPTH,
  },
];

export function getObstacle(id: string): Obstacle {
  const found = OBSTACLES.find((o) => o.id === id);
  if (!found) throw new Error(`장애물 없음: ${id}`);
  return found;
}

/** 시작 위치: 트리 앞 */
export const SPAWN: Point = { x: TREE_X, y: WALK_AREA.y + TREE_BED_DEPTH + SPAWN_FRONT_GAP };

// --- 상호작용 지점 (자리만, 동작 없음) ---
export interface InteractionPoint extends Point {
  id: string;
}

export const INTERACTION_POINTS: readonly InteractionPoint[] = [
  { id: 'CAROUSEL_ENTRY', x: CAROUSEL_X, y: WALK_AREA.y + CAROUSEL_DEPTH + INTERACTION_FRONT_GAP },
  {
    id: 'RINK_GATE',
    x: RINK_FENCE_START_X + RINK_GATE_OFFSET,
    y: WALK_AREA.y + RINK_FENCE_DEPTH + INTERACTION_FRONT_GAP,
  },
  ...STALL_CENTERS.map((x, i) => ({
    id: `STALL_${i + 1}`,
    x,
    y: WALK_AREA.y + STALL_BACK_DEPTH + INTERACTION_FRONT_GAP,
  })),
];

/** 연석 윗줄 = 건물들이 서 있는 선 (바닥 띠 바로 위 연석만큼) */
export const STREET_LINE_Y = WALK_AREA.y - GROUND.curbHeight;

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
