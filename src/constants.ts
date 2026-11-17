// 속도·시간·크기·색 같은 숫자는 이 파일에 모은다.
// 월드 좌표 데이터(맵, 구역, 바닥 띠, 장애물, 지점)는 src/world.ts에 둔다.

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

/** 배경 무작위 배치 시드 (고정 — 매번 같은 거리 모습) */
export const SCENERY_SEED = 1224;

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

// ───────────── 하늘 (레이어 0) ─────────────

/** 위에서 아래로 한두 단계 밝아지는 띠. 경계는 점묘로 계단처럼 섞는다 */
export const SKY = {
  bands: [
    { untilY: 80, color: '#0c1030' },
    { untilY: 140, color: '#121739' },
    { untilY: SCREEN_HEIGHT, color: '#192046' },
  ],
  /** 경계 위쪽으로 섞이는 줄 수 */
  ditherRows: 3,
} as const;

export const STARS = {
  minCount: 40,
  maxCount: 60,
  minY: 2,
  maxY: 44,
  /** 반짝임 한 주기 (초) */
  minPeriod: 2.5,
  maxPeriod: 7,
  /** 밝기 단계 (픽셀 느낌으로 끊어서) */
  levels: [0.25, 0.55, 1],
  /** 가장 밝을 때 십자로 빛나는 별 비율 */
  brightChance: 0.12,
  colors: ['#ffffff', '#d8e0ff', '#fff1c9'],
} as const;

// ───────────── 먼 건물 (레이어 0.3) ─────────────

export const FAR_CITY = {
  minWidth: 16,
  maxWidth: 44,
  maxGap: 2,
  minHeight: 64,
  maxHeight: 88,
  gableChance: 0.35,
  steppedChance: 0.2,
  gableMaxHeight: 10,
  steppedHeight: 5,
  chimneyChance: 0.35,
  chimneyWidth: 3,
  chimneyHeight: 5,
  maxWindows: 3,
  windowWidth: 1,
  windowHeight: 2,
  windowMarginX: 2,
  windowMarginTop: 6,
  windowMarginBottom: 8,
  /** 밤 안개 낀 먼 건물 — 하늘보다 한 단계 밝게 */
  silhouette: '#1f2650',
  window: '#b08440',
} as const;

// ───────────── 광장 석조 건물 (레이어 0.6) ─────────────

export const PLAZA_BUILDINGS = {
  /** 창문 한 칸(베이) 너비 */
  bayWidth: 13,
  sideMargin: 4,
  groundFloorHeight: 24,
  floorHeight: 18,
  roofHeight: 14,
  /** 지붕이 한 줄 올라갈 때 안으로 들어가는 정도 */
  roofSlope: 0.25,
  roofTextureEvery: 3,
  corniceHeight: 2,
  windowWidth: 7,
  windowHeight: 10,
  windowTopOffset: 4,
  /** 격자 창 가로 창살 위치 (창 높이 비율) */
  transomFraction: 0.4,
  archWidth: 9,
  archHeight: 15,
  archBottomGap: 3,
  doorWidth: 9,
  doorHeight: 20,
  fanlightRows: 4,
  dormerWidth: 5,
  dormerHeight: 5,
  dormerTopOffset: 5,
  chimneyChance: 0.5,
  chimneyWidth: 4,
  chimneyHeight: 6,
  /** 처음에 불이 켜진 창 비율 */
  litChance: 0.72,
  /** 켜진 창 아래쪽 진한 금빛 비율 */
  litDeepFraction: 0.35,
  /** 창문 하나가 켜지거나 꺼지는 간격 (초) */
  toggleMinInterval: 20,
  toggleMaxInterval: 40,
  /** 반복해서 섞어 쓰는 건물 모양 (모두 2층 — 걷는 길을 넓게 쓰려고 낮춤, 폭으로 구분) */
  templates: [
    { bays: 3, floors: 2 },
    { bays: 4, floors: 2 },
    { bays: 5, floors: 2 },
    { bays: 6, floors: 2 },
    { bays: 7, floors: 2 },
  ],
} as const;

export const PLAZA_COLORS = {
  /** 밤이라 어둡게 가라앉힌 벽색 */
  walls: [
    { wall: '#5f5a68', shade: '#4b4756', trim: '#76707f' }, // 회베이지
    { wall: '#6e5948', shade: '#58463a', trim: '#87705b' }, // 황토
    { wall: '#68604f', shade: '#524b3f', trim: '#807662' }, // 모래
    { wall: '#5a5560', shade: '#47434e', trim: '#706a77' }, // 회색 석조
  ],
  roof: '#262b43',
  roofDark: '#1d2136',
  roofEdge: '#343a58',
  chimney: '#3b3445',
  chimneyCap: '#2a2533',
  windowLit: '#ffc857',
  windowLitDeep: '#f0a040',
  windowDark: '#222337',
  windowFrame: '#2c2433',
  door: '#3a2a22',
  doorFrame: '#2a1e18',
} as const;

/** 건물 앞면 2층 높이에 처지게 걸린 전구 줄 */
export const GARLAND = {
  /** 건물이 서는 선에서 위로 (2층 높이) */
  anchorAboveStreet: 40,
  span: 34,
  sag: 5,
  bulbSpacing: 5,
  bulbHeight: 2,
  wire: '#14141c',
  bulbs: ['#ffd36b', '#ffb347', '#fff0b8', '#ff9f5a'],
  glowAlpha: 0.28,
  glowRadius: 1,
} as const;

// ───────────── 바닥 (레이어 1) ─────────────

export const GROUND = {
  /** 걷는 띠 위쪽 연석 높이 */
  curbHeight: 4,
  /** 판석 줄 높이 (위=멀리 작게 → 아래=가까이 크게). 합 = WALK_AREA.h */
  rowHeights: [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10, 11, 13],
  /** 판석 너비 = 줄 높이 × aspect + extra */
  slabAspect: 3,
  slabExtra: 2,
  highlightMinHeight: 5,
  /** 판석 이음매에 눈이 낀 확률 */
  jointSnowChance: 0.06,
  driftMinGap: 18,
  driftMaxGap: 60,
  driftMinWidth: 5,
  driftMaxWidth: 16,
  driftMaxHeight: 3,
  driftRowInset: 2,
} as const;

export const GROUND_COLORS = {
  stones: ['#4d4f66', '#53556d', '#484a60', '#505268'],
  joint: '#383a4f',
  highlight: '#5e607a',
  curb: '#6b6d86',
  curbShadow: '#3a3c52',
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
} as const;

// ───────────── 앞 눈 더미 (레이어 1.3) ─────────────

export const FOREGROUND = {
  /** 화면 맨 아래 띠 높이 — 캐릭터를 가리지 않게 낮게 */
  height: 14,
  moundCount: 9,
  moundMinWidth: 28,
  moundMaxWidth: 64,
  moundMinHeight: 4,
  moundMaxHeight: 9,
  /** 둔덕 오른쪽 그늘 비율 */
  moundShadeFraction: 0.35,
  shrubCount: 5,
  shrubMinHeight: 10,
  shrubMaxHeight: 13,
  shrubTierHeight: 4,
  shrubMaxHalfWidth: 6,
  shrubTrunkHeight: 2,
  /** 같은 자리 주변으로 흩뜨리는 범위 (칸 너비 비율) */
  jitterFraction: 0.35,
} as const;

export const FOREGROUND_COLORS = {
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
  needle: '#1f4a3a',
  needleLight: '#2b6249',
  trunk: '#3a2a22',
} as const;

// ───────────── 내리는 눈 ─────────────

export const SNOWFALL = {
  maxParticles: 300,
  minSwayFreq: 0.4,
  maxSwayFreq: 1.1,
  /** 먼 눈 → 가까운 눈. parallax: 카메라가 움직일 때 밀리는 비율 */
  layers: [
    { name: 'far', count: 140, size: 1, minSpeed: 6, maxSpeed: 11, swayAmp: 1, parallax: LAYER_FACTORS.farBuildings, color: '#7f8bb4' },
    { name: 'mid', count: 100, size: 1, minSpeed: 14, maxSpeed: 22, swayAmp: 1.5, parallax: LAYER_FACTORS.plazaBuildings, color: '#c9d2ea' },
    { name: 'near', count: 60, size: 2, minSpeed: 28, maxSpeed: 40, swayAmp: 2.5, parallax: LAYER_FACTORS.foregroundSnow, color: '#ffffff' },
  ],
} as const;

// ───────────── 임시 그림 / 개발용 ─────────────

/** 임시 그림(단색 상자)의 크기 */
export const PLACEHOLDER = {
  carouselHeight: 84,
  rinkHeight: 70,
} as const;

// ───────────── 메인 광장 소품 ─────────────

/** 큰 트리 (중심 x는 world.ts의 TREE_X) */
export const TREE = {
  /** 잎 꼭대기 y — 별이 화면 위로 잘리지 않게 */
  tipY: 18,
  /** 잎 맨 아래 y */
  foliageBottomY: 198,
  /** 맨 아래 잎 단의 반폭 (폭 약 130px) */
  baseHalfWidth: 65,
  tiers: 6,
  /** 윗단이 아랫단을 덮는 줄 수 */
  tierOverlap: 10,
  /** 각 단 윗변 폭 / 아랫변 폭 */
  tierTopRatio: 0.45,
  /** 바깥쪽 밝은 초록 테두리 두께 */
  edgeWidth: 2,
  /** 단 아래 그늘 줄 수 */
  shadowRows: 2,
  /** 단 아래 테두리 들쭉날쭉 패턴 (열마다 아래로 더 내려가는 px) */
  jagPattern: [0, 1, 2, 1, 0, 0, 1, 2, 2, 1, 0, 1],
  trunkHalfWidth: 5,
  /** 별 가운데 = 잎 꼭대기에서 위로 */
  starCenterAbove: 4,
  starPeriod: 4,
  starMinAlpha: 0.7,
  starGlowRadius: 9,
  starGlowMinAlpha: 0.25,
  starGlowMaxAlpha: 0.6,
  ornamentMinCount: 30,
  ornamentMaxCount: 40,
  ornamentMinGap: 9,
  /** 장식을 잎 테두리 안쪽으로 들이는 거리 */
  ornamentInset: 4,
  ornamentTopMargin: 20,
  ornamentBottomMargin: 6,
  ornamentSizes: [3, 4],
  ribbonThickness: 3,
  /** 리본 기울기 (x 1px당 y) */
  ribbonSlope: 0.45,
  /** 리본이 트리 가운데를 지나는 y */
  ribbonCenterYs: [72, 140],
  lightMinCount: 60,
  lightMaxCount: 80,
  lightInset: 2,
  lightTopMargin: 8,
  lightMinPeriod: 1.6,
  lightMaxPeriod: 4.2,
  lightMinAlpha: 0.45,
  lightMaxAlpha: 1,
  /** 이 밝기 이상이면 전구 둘레에 은은한 번짐 */
  lightHaloLevel: 0.75,
  lightHaloAlpha: 0.35,
  /** 아래에서 위로 흐르는 빛 물결 */
  waveInterval: 30,
  waveDuration: 3,
  /** 처음 들어오고 몇 초 뒤 첫 물결 */
  waveFirstDelay: 4,
  waveWidth: 14,
  /** 물결이 지나갈 때 번짐 반지름 */
  waveGlowRadius: 3,
  waveGlowAlpha: 0.5,
  /** 화단 타원: 화단 상자 윗선에서 중심까지, 세로 반지름, 앞 벽 높이, 테두리 두께 */
  bedCenterFromTop: 7,
  bedRadiusY: 6,
  bedWallHeight: 3,
  bedRimWidth: 3,
  bedSnowChance: 0.08,
  /** 선물 상자 (트리 중심 기준 x, 크기, 색 이름) */
  gifts: [
    { dx: -27, w: 9, h: 8, box: 'red', ribbon: 'gold' },
    { dx: -16, w: 8, h: 11, box: 'green', ribbon: 'gold' },
    { dx: -4, w: 9, h: 6, box: 'gold', ribbon: 'red' },
    { dx: 11, w: 10, h: 9, box: 'red', ribbon: 'gold' },
    { dx: 23, w: 7, h: 7, box: 'green', ribbon: 'red' },
  ],
  /** 선물 바닥 = 화단 중심에서 아래로 */
  giftBaseBelowCenter: 3,
} as const;

export const TREE_COLORS = {
  needleDark: '#1d4a34',
  needleLight: '#2f7348',
  needleShadow: '#143526',
  trunk: '#4a3020',
  trunkShade: '#36231a',
  star: '#ffd34d',
  starBright: '#fff2a8',
  starGlow: '#ffe08a',
  light: '#fff1c2',
  lightHalo: '#ffd98a',
  ribbon: '#f1d48a',
  ribbonLight: '#fff3cf',
  ribbonShade: '#c9a85e',
  ornaments: [
    { base: '#e8b83a', shade: '#b8862a' }, // 금
    { base: '#d6dbe8', shade: '#9aa2b8' }, // 은
    { base: '#d23a3a', shade: '#9e2626' }, // 빨강
  ],
  ornamentShine: '#ffffff',
  bedStone: '#6f7188',
  bedStoneDark: '#4f5068',
  bedSoil: '#2b2320',
  snow: '#e8eef8',
  gift: {
    red: { base: '#c73a3a', shade: '#962a2a' },
    green: { base: '#2f8a52', shade: '#226540' },
    gold: { base: '#e2b23e', shade: '#b0862a' },
  },
} as const;

/** 나무 오두막 마켓 노점 */
export const MARKET_STALL = {
  wallHeight: 34,
  counterHeight: 12,
  postWidth: 4,
  openingTopGap: 4,
  roofHeight: 20,
  roofOverhang: 5,
  /** 지붕 위 눈: 경사를 따라 쌓인 두께, 처마 끝 눈 덩이 */
  snowThickness: 3,
  eaveSnowWidth: 6,
  plankEvery: 4,
  counterPlankEvery: 4,
  roofTextureEvery: 3,
  shelfCount: 2,
  itemSpacing: 5,
  candleChance: 0.4,
  candleHeight: 3,
  bulbSpacing: 4,
  bulbGlowAlpha: 0.3,
  /** 안쪽 따뜻한 빛 (아래가 가장 밝다) */
  warmGlowMaxAlpha: 0.35,
} as const;

export const STALL_COLORS = {
  wood: '#5a3a26',
  woodDark: '#432a1b',
  woodLight: '#8a5a38',
  counterTop: '#a8744a',
  interior: '#2e1c12',
  shelf: '#6b4428',
  roof: '#5c2a26',
  roofDark: '#45201d',
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
  candle: '#f3e6c4',
  flame: '#ffd36b',
  warmGlow: '#ffb347',
  items: ['#d23a3a', '#e8b83a', '#d6dbe8', '#3aa36b'],
  itemShine: '#ffffff',
} as const;

/** 주철 가로등 */
export const STREET_LAMP = {
  height: 58,
  baseWidth: 6,
  baseHeight: 5,
  plinthWidth: 4,
  plinthHeight: 2,
  poleWidth: 2,
  /** 기둥 장식 고리 = 발밑에서 위로 */
  collarAbove: 40,
  /** 리스 가운데 = 발밑에서 위로 */
  wreathAbove: 26,
  wreathRadius: 3,
  armHalfWidth: 7,
  lanternWidth: 6,
  lanternHeight: 8,
  glowRadius: 12,
  glowAlpha: 0.3,
} as const;

export const LAMP_COLORS = {
  iron: '#17171f',
  ironLight: '#2c2c3a',
  glass: '#ffd98a',
  glassBright: '#fff1c4',
  glow: '#ffcf7a',
  wreath: '#2b6249',
  wreathDark: '#1f4a3a',
  bow: '#d23a3a',
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

/** 공통 색 */
export const COLORS = {
  nightSky: '#141a3a',
  bulbGold: '#ffc857',
  carouselGold: '#d9a93c',
  rinkIce: '#8fd3f0',
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

// ───────────── 캐릭터 색 ─────────────

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
