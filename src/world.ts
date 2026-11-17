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
export const WALK_AREA: Rect = { x: 0, y: 116, w: MAP_WIDTH, h: 148 };

// --- 주요 시설 위치 ---
/** 트리에서 너무 멀지 않게 구역 오른쪽(광장 쪽)으로 붙이되, 큰 판이 구역 경계(480)를 넘지 않게 */
export const CAROUSEL_X = 340;
/** 회전목마 둥근 판(발밑 기준 사각형 = 판과 앞 테두리를 감싸는 상자: 판 지름 + 앞 테두리) */
export const CAROUSEL_HALF_WIDTH = 120;
export const CAROUSEL_DEPTH = 40;
/** 바닥 띠 윗선에서 판 뒤쪽 끝까지 — 뒤로도 지나갈 수 있다 */
export const CAROUSEL_SETBACK = 62;

/** 구역 왼쪽 끝을 막는 작은 전나무 줄 (이 x까지 못 들어간다) */
export const FIR_LINE_X = 40;
/** 전나무 한 그루씩: 발밑 위치와 키 */
export const FIRS = [
  { x: 12, y: 128, h: 34 },
  { x: 30, y: 146, h: 28 },
  { x: 8, y: 166, h: 38 },
  { x: 28, y: 186, h: 30 },
  { x: 10, y: 206, h: 36 },
  { x: 30, y: 226, h: 26 },
  { x: 12, y: 246, h: 32 },
  { x: 32, y: 262, h: 24 },
] as const;

/** 벤치 (발밑 가운데) */
export const BENCHES = [
  { x: 80, y: 238 },
  { x: 150, y: 238 },
] as const;
export const BENCH_HALF_WIDTH = 10;
export const BENCH_DEPTH = 3;

export const TREE_X = 720;
/** 낮은 원형 화단 (발밑 기준 사각형 = 타원 화단을 감싸는 상자) */
export const TREE_BED_HALF_WIDTH = 44;
export const TREE_BED_DEPTH = 16;
/** 트리는 광장 안쪽에 선다: 바닥 띠 윗선에서 이만큼 앞 (뒤로도 지나갈 수 있음) */
export const TREE_BED_SETBACK = 86;

/** 링크는 구역 왼쪽(광장 쪽)으로 붙이고, 입구도 광장 쪽 끝에 둔다 */
export const RINK_FENCE_START_X = 970;
export const RINK_FENCE_END_X = 1300;
export const RINK_FENCE_DEPTH = 90;
/** 울타리 왼쪽 끝에서 입구까지 */
export const RINK_GATE_OFFSET = 60;

/** 마켓 노점 (뒤쪽): 메인 광장 트리 양옆 2곳 + 회전목마 구역 2곳. roof = 지붕 색 */
export const STALLS = [
  { x: 580, roof: 'red' },
  { x: 860, roof: 'red' },
  { x: 80, roof: 'navy' },
  { x: 150, roof: 'navy' },
] as const;
export const STALL_WIDTH = 64;
/** 노점 오두막이 바닥 띠를 차지하는 깊이 */
export const STALL_BACK_DEPTH = 30;

/** 가로등: 구역마다 뒤쪽(등 하나)·앞쪽(등 둘). y는 발밑 */
export const LAMPS = [
  { x: 510, y: 126, heads: 1 },
  { x: 950, y: 126, heads: 1 },
  { x: 600, y: 252, heads: 2 },
  { x: 840, y: 252, heads: 2 },
  { x: 196, y: 126, heads: 1 },
  { x: 196, y: 252, heads: 2 },
] as const;
/** 가로등 받침이 바닥을 차지하는 크기 */
export const LAMP_FOOT_HALF_WIDTH = 3;
export const LAMP_FOOT_DEPTH = 3;

/** 상호작용 지점을 시설 앞쪽으로 띄우는 거리 */
export const INTERACTION_FRONT_GAP = 8;

/** 시작 위치를 트리 화단 앞으로 띄우는 거리 */
export const SPAWN_FRONT_GAP = 26;

// --- 장애물 ---
export interface Obstacle extends Rect {
  id: string;
}

export const OBSTACLES: readonly Obstacle[] = [
  {
    id: 'carousel',
    x: CAROUSEL_X - CAROUSEL_HALF_WIDTH,
    y: WALK_AREA.y + CAROUSEL_SETBACK,
    w: CAROUSEL_HALF_WIDTH * 2,
    h: CAROUSEL_DEPTH,
  },
  { id: 'firs', x: WALK_AREA.x, y: WALK_AREA.y, w: FIR_LINE_X - WALK_AREA.x, h: WALK_AREA.h },
  ...BENCHES.map((b, i) => ({
    id: `bench-${i + 1}`,
    x: b.x - BENCH_HALF_WIDTH,
    y: b.y - BENCH_DEPTH,
    w: BENCH_HALF_WIDTH * 2,
    h: BENCH_DEPTH,
  })),
  {
    id: 'tree-bed',
    x: TREE_X - TREE_BED_HALF_WIDTH,
    y: WALK_AREA.y + TREE_BED_SETBACK,
    w: TREE_BED_HALF_WIDTH * 2,
    h: TREE_BED_DEPTH,
  },
  ...STALLS.map((s, i) => ({
    id: `stall-${i + 1}`,
    x: s.x - STALL_WIDTH / 2,
    y: WALK_AREA.y,
    w: STALL_WIDTH,
    h: STALL_BACK_DEPTH,
  })),
  ...LAMPS.map((lamp, i) => ({
    id: `lamp-${i + 1}`,
    x: lamp.x - LAMP_FOOT_HALF_WIDTH,
    y: lamp.y - LAMP_FOOT_DEPTH,
    w: LAMP_FOOT_HALF_WIDTH * 2,
    h: LAMP_FOOT_DEPTH,
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
export const SPAWN: Point = {
  x: TREE_X,
  y: WALK_AREA.y + TREE_BED_SETBACK + TREE_BED_DEPTH + SPAWN_FRONT_GAP,
};

// --- 상호작용 지점 (자리만, 동작 없음) ---
export interface InteractionPoint extends Point {
  id: string;
}

export const INTERACTION_POINTS: readonly InteractionPoint[] = [
  {
    id: 'CAROUSEL_ENTRY',
    x: CAROUSEL_X,
    y: WALK_AREA.y + CAROUSEL_SETBACK + CAROUSEL_DEPTH + INTERACTION_FRONT_GAP,
  },
  {
    id: 'RINK_GATE',
    x: RINK_FENCE_START_X + RINK_GATE_OFFSET,
    y: WALK_AREA.y + RINK_FENCE_DEPTH + INTERACTION_FRONT_GAP,
  },
  ...STALLS.map((s, i) => ({
    id: `STALL_${i + 1}`,
    x: s.x,
    y: WALK_AREA.y + STALL_BACK_DEPTH + INTERACTION_FRONT_GAP,
  })),
];

/** 연석 윗줄 = 건물들이 서 있는 선 (바닥 띠 바로 위 연석만큼) */
export const STREET_LINE_Y = WALK_AREA.y - GROUND.curbHeight;

/** x가 이 구역 범위 안인가 (시작 포함 ~ 끝 미포함) */
export function inZone(zone: ZoneName, x: number): boolean {
  return x >= ZONE_BOUNDS[zone].startX && x < ZONE_BOUNDS[zone].endX;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
