// 모든 숫자(해상도, 좌표, 속도, 색)는 이 파일에 모은다.

/** 내부 렌더 해상도 (정수배로 확대해서 표시) */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 270;

/** 전체 맵 크기 */
export const MAP_WIDTH = 1440;
export const MAP_HEIGHT = 270;

/** 구역 경계 (x 좌표, 시작 포함 ~ 끝 미포함) */
export const ZONE_BOUNDS = {
  carousel: { startX: 0, endX: 480 },
  plaza: { startX: 480, endX: 960 },
  rink: { startX: 960, endX: 1440 },
} as const;

/** 최소 확대 배율 */
export const MIN_SCALE = 1;

/** 프레임 간 dt 상한 (초) — 탭 전환 후 큰 점프 방지 */
export const MAX_FRAME_DT = 0.1;

/** 색상 팔레트 */
export const COLORS = {
  nightSky: '#141a3a',
  bulbGold: '#ffc857',
} as const;
