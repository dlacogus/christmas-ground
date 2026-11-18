// 월드 좌표 데이터. 좌표는 모두 맵 기준 (x 0~1440, y 0~270).
// 장애물은 '발밑 기준' 사각형이다: 캐릭터의 발 상자가 겹치면 못 지나간다.

import { GROUND, MARKET_HUT } from './constants';

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
export const CAROUSEL_SETBACK = 40;

/**
 * 회전목마 입구 (가운데 x = CAROUSEL_X, 바닥 판 앞 테두리 바로 앞).
 * 판 테두리 → 계단(stepsDepth) → 아치 기둥 발밑 → 카펫(carpetLength) → 줄 기둥 순서로 앞으로 나온다.
 * 판 둘레(난간)는 장애물이고, 아치 기둥 사이 계단과 카펫은 걸어 들어갈 수 있다.
 */
export const CAROUSEL_GATE = {
  /** 아치 기둥 가운데가 입구 가운데에서 떨어진 거리, 기둥 폭 */
  pillarOffset: 16,
  pillarWidth: 4,
  /** 판 테두리에서 아치 기둥 발밑까지 (계단 2칸이 놓인다) */
  stepsDepth: 4,
  carpetHalfWidth: 12,
  carpetLength: 20,
  /** 줄 서는 금 기둥이 입구 가운데에서 떨어진 거리. 가늘어서 장애물로 두지 않는다 (앞을 지나는 길을 막지 않게) */
  ropePostOffset: 20,
} as const;

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

/** 회전목마 왼쪽 빈 눈밭에 쓴 글씨 "Merry Christmas": 가운데 x, 첫 줄 기준선 y */
export const SNOW_WRITING_AT = { centerX: 116, firstBaselineY: 152 } as const;

/** 벤치 (발밑 가운데) */
export const BENCHES = [
  { x: 84, y: 238 },
  { x: 152, y: 238 },
] as const;
/** 두 사람이 나란히 앉을 수 있는 폭 (36px) */
export const BENCH_HALF_WIDTH = 18;
export const BENCH_DEPTH = 4;

/** 메인 광장 이정표 (기둥 발밑). 위 판은 왼쪽 회전목마, 아래 판은 오른쪽 아이스링크를 가리킨다 */
export const SIGNPOST: Point = { x: 542, y: 216 };
export const SIGNPOST_FOOT_HALF_WIDTH = 3;
export const SIGNPOST_FOOT_DEPTH = 3;

export const TREE_X = 720;
/** 낮은 원형 화단 (발밑 기준 사각형 = 타원 화단을 감싸는 상자) */
export const TREE_BED_HALF_WIDTH = 44;
export const TREE_BED_DEPTH = 16;
/** 트리는 광장 안쪽에 선다: 바닥 띠 윗선에서 이만큼 앞 (뒤로도 지나갈 수 있음) */
export const TREE_BED_SETBACK = 86;

/** 얼음 링크: 울타리 선을 감싸는 상자 (모서리는 둥글게 그린다). 나중에 직접 탈 수 있게 구역 대부분을 쓴다.
 *  뒤로는 가로등이 서는 좁은 길, 앞으로는 입구 앞을 지나는 길을 남긴다 */
export const RINK_LEFT = 975;
export const RINK_RIGHT = 1398;
/** 바닥 띠 윗선에서 뒤 울타리까지 */
export const RINK_SETBACK = 20;
export const RINK_DEPTH = 104;
/** 울타리 왼쪽 끝에서 입구 문 가운데까지 — 둥근 모서리를 지나 곧은 부분에 (광장 쪽) */
export const RINK_GATE_OFFSET = 60;
/** 울타리 오른쪽 끝에서 출구 문 가운데까지 (입구 반대편 끝) */
export const RINK_EXIT_OFFSET = 60;
/** 입구·출구 팻말 기둥: 문 가운데에서 옆으로 (입구는 오른쪽, 출구는 왼쪽 — 둘 다 링크 안쪽 방향), 앞 울타리에서 앞으로 */
export const RINK_SIGN_SIDE = 16;
export const RINK_SIGN_FRONT = 3;

/** 스케이트장 오른쪽 끝을 막는 전나무 줄 (이 x부터 못 들어간다) */
export const RINK_FIR_LINE_X = 1404;
export const RINK_FIRS = [
  { x: 1430, y: 124, h: 36 },
  { x: 1412, y: 138, h: 28 },
  { x: 1428, y: 156, h: 40 },
  { x: 1414, y: 176, h: 30 },
  { x: 1432, y: 194, h: 38 },
  { x: 1412, y: 214, h: 32 },
  { x: 1430, y: 234, h: 36 },
  { x: 1414, y: 254, h: 28 },
  { x: 1434, y: 264, h: 26 },
] as const;

export type HutKind = 'gable' | 'longhouse' | 'kiosk' | 'pavilion';

/**
 * 마켓 오두막: 돌바닥이 끝나는 뒤쪽 끝, 연석 바로 뒤(STREET_LINE_Y)에 늘어선다 (x = 가운데, w = 폭, wall = 벽 높이).
 * 걷는 바닥을 차지하지 않으므로 장애물이 없다. 크기도 종류도 제각각. 스케이트장 뒤에는 세우지 않는다.
 * 처마까지 포함해 구역 경계(x 480, 960)를 넘지 않게 둔다 — 화면 밖 구역은 통째로 그리지 않기 때문.
 */
export const HUTS: readonly { x: number; w: number; kind: HutKind; wall: number }[] = [
  { x: 61, w: 30, kind: 'kiosk', wall: 34 },
  { x: 111, w: 58, kind: 'gable', wall: 27 },
  { x: 166, w: 40, kind: 'pavilion', wall: 26 },
  { x: 257, w: 86, kind: 'longhouse', wall: 25 },
  { x: 339, w: 62, kind: 'gable', wall: 31 },
  { x: 401, w: 46, kind: 'pavilion', wall: 29 },
  { x: 452, w: 30, kind: 'kiosk', wall: 35 },
  { x: 553, w: 66, kind: 'gable', wall: 30 },
  { x: 611, w: 34, kind: 'kiosk', wall: 36 },
  { x: 686, w: 100, kind: 'longhouse', wall: 24 },
  { x: 768, w: 48, kind: 'pavilion', wall: 30 },
  { x: 828, w: 56, kind: 'gable', wall: 26 },
  { x: 880, w: 32, kind: 'kiosk', wall: 32 },
  { x: 921, w: 42, kind: 'pavilion', wall: 27 },
];

/** 지붕 눈이 떨어지는 오두막 (HUTS 번호): 회전목마 구역 2곳(삼각 지붕·원뿔 정자), 광장 2곳(삼각 지붕) */
export const SNOW_ROOF_HUTS: readonly number[] = [1, 2, 7, 11];
/** 처마 밑 영역: 깊이(바닥 띠 윗선에서 앞으로)와 처마 양 끝 바깥으로 더 넓힌 폭 (경사를 타고 내려온 눈이 처마 끝 바깥에 떨어진다) */
export const EAVE_DEPTH = 14;
export const EAVE_SIDE = 14;

/** 오두막 처마 밑 영역 (발밑 기준 사각형): 처마 폭 + 양옆, 연석 바로 앞 바닥 */
export function eaveZone(hutIndex: number): Rect {
  const hut = HUTS[hutIndex];
  const half = Math.round(hut.w / 2 + MARKET_HUT.roofOverhang) + EAVE_SIDE;
  return { x: hut.x - half, y: WALK_AREA.y, w: half * 2, h: EAVE_DEPTH };
}

/** 가로등: 구역마다 뒤쪽(등 하나)·앞쪽(등 둘). y는 발밑 */
export const LAMPS = [
  { x: 510, y: 126, heads: 1 },
  { x: 946, y: 126, heads: 1 },
  { x: 600, y: 252, heads: 2 },
  { x: 840, y: 252, heads: 2 },
  { x: 196, y: 126, heads: 1 },
  { x: 196, y: 252, heads: 2 },
  { x: 1110, y: 126, heads: 1 },
  { x: 1270, y: 126, heads: 1 },
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
  // 입구 아치 기둥 두 개 (발밑) — 그 사이로만 계단까지 들어갈 수 있다
  ...[-1, 1].map((side, i) => ({
    id: `gate-pillar-${i + 1}`,
    x: CAROUSEL_X + side * CAROUSEL_GATE.pillarOffset - CAROUSEL_GATE.pillarWidth / 2 - 1,
    y: WALK_AREA.y + CAROUSEL_SETBACK + CAROUSEL_DEPTH,
    w: CAROUSEL_GATE.pillarWidth + 2,
    h: CAROUSEL_GATE.stepsDepth,
  })),
  { id: 'firs', x: WALK_AREA.x, y: WALK_AREA.y, w: FIR_LINE_X - WALK_AREA.x, h: WALK_AREA.h },
  {
    id: 'signpost',
    x: SIGNPOST.x - SIGNPOST_FOOT_HALF_WIDTH,
    y: SIGNPOST.y - SIGNPOST_FOOT_DEPTH,
    w: SIGNPOST_FOOT_HALF_WIDTH * 2,
    h: SIGNPOST_FOOT_DEPTH,
  },
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
  ...LAMPS.map((lamp, i) => ({
    id: `lamp-${i + 1}`,
    x: lamp.x - LAMP_FOOT_HALF_WIDTH,
    y: lamp.y - LAMP_FOOT_DEPTH,
    w: LAMP_FOOT_HALF_WIDTH * 2,
    h: LAMP_FOOT_DEPTH,
  })),
  {
    id: 'rink',
    x: RINK_LEFT,
    y: WALK_AREA.y + RINK_SETBACK,
    w: RINK_RIGHT - RINK_LEFT,
    h: RINK_DEPTH,
  },
  {
    id: 'rink-firs',
    x: RINK_FIR_LINE_X,
    y: WALK_AREA.y,
    w: WALK_AREA.x + WALK_AREA.w - RINK_FIR_LINE_X,
    h: WALK_AREA.h,
  },
];

const OBSTACLE_BY_ID = new Map(OBSTACLES.map((o) => [o.id, o]));

export function getObstacle(id: string): Obstacle {
  const found = OBSTACLE_BY_ID.get(id);
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
    x: RINK_LEFT + RINK_GATE_OFFSET,
    y: WALK_AREA.y + RINK_SETBACK + RINK_DEPTH + INTERACTION_FRONT_GAP,
  },
  {
    id: 'RINK_EXIT',
    x: RINK_RIGHT - RINK_EXIT_OFFSET,
    y: WALK_AREA.y + RINK_SETBACK + RINK_DEPTH + INTERACTION_FRONT_GAP,
  },
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
