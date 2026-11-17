// 속도·시간·색 같은 숫자는 이 파일에 모은다.
// 월드 좌표 데이터(맵, 구역, 바닥, 장애물, 지점)는 src/world.ts에 둔다.

/** 내부 렌더 해상도 (정수배로 확대해서 표시) */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 270;

/** 최소 확대 배율 */
export const MIN_SCALE = 1;

/** 프레임 간 dt 상한 (초) — 탭 전환 후 큰 점프 방지 */
export const MAX_FRAME_DT = 0.1;

/** 카메라: 60fps 기준 한 프레임에 남은 거리의 10%씩 다가간다 */
export const CAMERA_FOLLOW_RATE = 0.1;
export const CAMERA_REFERENCE_FPS = 60;

/** 깊이 레이어가 카메라를 따라가는 비율 */
export const LAYER_FACTORS = {
  sky: 0,
  farBuildings: 0.3,
  plazaBuildings: 0.6,
  main: 1,
  foregroundSnow: 1.3,
} as const;

/** 캐릭터 크기·이동·애니메이션 */
export const CHARACTER = {
  spriteWidth: 16,
  spriteHeight: 32,
  /** 초당 이동 거리 (px) */
  speed: 60,
  /** 발밑 충돌 상자: 발 x 기준 좌우 반폭, 발 y에서 위로 높이 */
  footHalfWidth: 5,
  footHeight: 3,
  /** 충돌 검사 간격 (px) — 벽 바로 앞까지 붙도록 잘게 나눠 움직인다 */
  collisionStep: 0.5,
  /** 탭 목표에 이 거리 안이면 도착 */
  arriveDistance: 1,
  /** 이 값보다 가로 성분이 커야 좌우 방향을 바꾼다 (위아래로 걸을 때 깜빡임 방지) */
  facingThreshold: 0.1,
  walkFrameDuration: 0.14,
  idleFrameDuration: 0.8,
  shadowWidth: 10,
  shadowHeight: 2,
  shadowAlpha: 0.35,
} as const;

/** 걸을 때 나오는 입김 */
export const BREATH = {
  minInterval: 1.4,
  maxInterval: 3.2,
  lifetime: 0.9,
  /** 발 기준 입 위치 (오른쪽 볼 때) */
  mouthOffsetX: 7,
  mouthOffsetY: 19,
  riseSpeed: 7,
  driftSpeed: 10,
  startAlpha: 0.85,
  maxRadius: 2,
} as const;

/** 바닥 띠 */
export const GROUND = {
  /** 걷는 띠 위쪽 연석 높이 */
  curbHeight: 4,
} as const;

/** 임시 그림(단색 상자)의 크기 */
export const PLACEHOLDER = {
  treeTopY: 64,
  treeBaseOffset: 6,
  treeHalfWidth: 56,
  treeTrunkHalfWidth: 6,
  treeBedVisibleHeight: 12,
  carouselHeight: 84,
  stallHeight: 40,
  rinkHeight: 70,
  moundTopInset: 6,
  moundTopHeight: 3,
} as const;

/** ?sprites=1 확인 화면 */
export const SPRITE_SHEET = {
  scale: 4,
  columns: 6,
  padding: 8,
  labelHeight: 14,
  titleHeight: 20,
  font: '10px sans-serif',
} as const;

/** ?debug=1 겹쳐 보기 */
export const DEBUG = {
  font: '8px monospace',
  labelOffset: 2,
  pointSize: 3,
  hudPadding: 2,
  hudLineHeight: 9,
} as const;

/** 색상 팔레트 */
export const COLORS = {
  nightSky: '#141a3a',
  bulbGold: '#ffc857',
  farBuildings: '#1c2350',
  plazaBuildings: '#262e60',
  ground: '#4f5068',
  curb: '#dfe6f2',
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
  treeGreen: '#2e7d4f',
  treeTrunk: '#5a3b26',
  treeBed: '#7a5236',
  carouselGold: '#d9a93c',
  rinkIce: '#8fd3f0',
  stall: '#8a4b3a',
  shadow: '#0a0d20',
  breath: '#ffffff',
  sheetBackground: '#141a3a',
  sheetCell: '#1f2752',
  sheetGrid: '#262f5e',
  sheetLabel: '#e8eef8',
} as const;

export const DEBUG_COLORS = {
  walkArea: '#00e5ff',
  obstacle: 'rgba(255, 60, 60, 0.4)',
  obstacleLabel: '#ff8a8a',
  point: '#ffe14d',
  zoneLine: '#ff4dd2',
  foot: '#7dff7d',
  target: '#ffffff',
  hudBackground: 'rgba(0, 0, 0, 0.6)',
  hudText: '#ffffff',
} as const;

/** 캐릭터 고정 색 (스프라이트 글자 → 색) */
export const CHARACTER_BASE_PALETTE: Readonly<Record<string, string>> = {
  P: '#f6f3ec', // 털모자 방울
  p: '#cdd2e2', // 방울 그늘
  H: '#d23c4e', // 털모자
  h: '#a32a3c', // 털모자 그늘
  b: '#f1e6cc', // 털모자 띠
  R: '#6b4330', // 머리카락
  S: '#ffdcbf', // 피부
  s: '#f2bd98', // 피부 그늘
  C: '#ff9b9b', // 볼터치
  E: '#2b1d26', // 눈
  u: '#4a3020', // 단추
  L: '#3d3a5c', // 앞다리
  l: '#2d2a45', // 뒷다리
  F: '#7a4a33', // 앞 부츠
  f: '#5e3825', // 뒤 부츠
};

/** 바꿔 끼우는 옷 색 (O/o = 코트, M/m = 목도리·장갑) */
export interface OutfitColors {
  coat: string;
  coatShade: string;
  scarf: string;
  scarfShade: string;
}

export const OUTFITS = {
  camel: { coat: '#d39a4f', coatShade: '#a8743a', scarf: '#3aa36b', scarfShade: '#2a7a50' },
  red: { coat: '#c7423f', coatShade: '#97302f', scarf: '#f0e3c2', scarfShade: '#cdbb93' },
  green: { coat: '#3f8f5f', coatShade: '#2d6b46', scarf: '#d9434f', scarfShade: '#a52f3b' },
  plum: { coat: '#8a4f8c', coatShade: '#663868', scarf: '#f2c14e', scarfShade: '#c99a2e' },
} as const satisfies Record<string, OutfitColors>;

export type OutfitName = keyof typeof OUTFITS;
export const DEFAULT_OUTFIT: OutfitName = 'camel';
