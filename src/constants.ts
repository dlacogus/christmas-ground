// 속도·시간·크기·색 같은 숫자는 이 파일에 모은다.
// 월드 좌표 데이터(맵, 구역, 바닥 띠, 장애물, 지점)는 src/world.ts에 둔다.

/** 내부 렌더 해상도 (정수배로 확대해서 표시) */
export const SCREEN_WIDTH = 480;
export const SCREEN_HEIGHT = 270;

/** 최소 확대 배율 */
export const MIN_SCALE = 1;

/** 미리 그려 두는 버퍼: 시작 뒤 이만큼 기다렸다가, 한 번에 몇 개씩, 이 간격으로 */
export const WARM_BUFFERS = { delayMs: 300, perStep: 2, stepMs: 30 } as const;

/** 프레임 간 dt 상한 (초) — 탭 전환 후 큰 점프 방지 */
export const MAX_FRAME_DT = 0.1;

/** 카메라: 60fps 기준 한 프레임에 남은 거리의 10%씩 다가간다 */
export const CAMERA_FOLLOW_RATE = 0.1;
export const CAMERA_REFERENCE_FPS = 60;

/** 깊이 레이어가 카메라를 따라가는 비율 */
export const LAYER_FACTORS = {
  sky: 0,
  farBuildings: 0.3,
  treeLine: 0.6,
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

// ───────────── 나무 줄과 시계탑 (레이어 0.6) ─────────────

/** 광장 뒤 배경: 눈 덮인 나무들(잎 진 큰 나무·전나무)과 그 사이로 솟은 시계탑 */
export const TREE_LINE = {
  treeMinGap: 9,
  treeMaxGap: 24,
  bareMinHeight: 52,
  bareMaxHeight: 86,
  firMinHeight: 34,
  firMaxHeight: 66,
  firChance: 0.35,
  /** 잎 진 나무: 가지 갈래 깊이, 가지가 벌어지는 각, 자식 가지 길이 비율, 가지 위 눈 확률 */
  branchDepth: 4,
  branchMinSpread: 0.3,
  branchMaxSpread: 0.75,
  branchShrink: 0.68,
  trunkFraction: 0.36,
  branchSnowChance: 0.6,
  firTierHeight: 6,
  firHalfWidthRatio: 0.3,
  /** 나무 밑동을 덮는 눈 둔덕 높이 */
  bankMinHeight: 2,
  bankMaxHeight: 6,
} as const;

export const TREE_LINE_COLORS = {
  /** 밤이라 가라앉은 색 */
  bark: '#3a3448',
  barkDark: '#2b2638',
  branchSnow: '#aab4d0',
  needle: '#1c3d38',
  needleLight: '#27544a',
  firSnow: '#c4cee4',
  bank: '#9aa6c6',
  bankShade: '#7c88ac',
} as const;

/** 나무들 사이로 솟은 시계탑 (실제 건물을 본뜨지 않은 뾰족탑 시청사). x는 0.6 레이어 좌표 */
export const CLOCK_TOWER = {
  /** 트리를 가운데 둔 첫 화면에서 트리 오른쪽에 보이는 자리 */
  x: 664,
  /** 탑 아래 넓은 본관 */
  hallWidth: 96,
  hallHeight: 44,
  hallRoofHeight: 9,
  hallWindowEvery: 12,
  hallWindowWidth: 5,
  hallWindowHeight: 16,
  /** 탑 몸통 */
  shaftWidth: 26,
  shaftHeight: 74,
  /** 시계 판: 몸통 꼭대기에서 아래로 가운데까지, 반지름, 바늘 길이 */
  clockBelowTop: 9,
  clockRadius: 7,
  minuteHand: 6,
  hourHand: 4,
  /** 종루 아치 창 (시계 아래) */
  belfryBelowClock: 12,
  belfryWindowWidth: 4,
  belfryWindowHeight: 12,
  /** 모서리 작은 첨탑, 꼭대기 등롱과 뾰족 지붕 */
  pinnacleHeight: 9,
  lanternWidth: 14,
  lanternHeight: 11,
  spireHeight: 20,
  finialHeight: 3,
  /** 아래에서 비추는 조명: 위쪽 이만큼이 금빛으로 물든다 */
  uplightHeight: 60,
  uplightMax: 0.5,
  stoneEvery: 5,
} as const;

export const CLOCK_TOWER_COLORS = {
  stone: '#5d586a',
  stoneDark: '#474354',
  stoneLight: '#757084',
  uplight: '#e8b060',
  windowLit: '#ffc857',
  windowDeep: '#f0a040',
  windowFrame: '#2c2433',
  roof: '#262b43',
  roofLight: '#343a58',
  snow: '#e8eef8',
  face: '#fff1c4',
  faceRim: '#e2b23e',
  hands: '#2a1e2a',
  gold: '#e2b23e',
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
    { name: 'mid', count: 100, size: 1, minSpeed: 14, maxSpeed: 22, swayAmp: 1.5, parallax: LAYER_FACTORS.treeLine, color: '#c9d2ea' },
    { name: 'near', count: 60, size: 2, minSpeed: 28, maxSpeed: 40, swayAmp: 2.5, parallax: LAYER_FACTORS.foregroundSnow, color: '#ffffff' },
  ],
} as const;

// ───────────── 메인 광장 소품 ─────────────

/** 큰 트리 (중심 x는 world.ts의 TREE_X) */
export const TREE = {
  /** 잎 꼭대기 y — 별이 화면 위로 잘리지 않게 */
  tipY: 18,
  /** 잎 맨 아래 y */
  foliageBottomY: 198,
  /** 맨 아래 잎 단의 반폭 (폭 약 176px — 풍성하게) */
  baseHalfWidth: 88,
  /** 잎 단이 많고 서로 깊이 겹쳐 빽빽해 보인다 */
  tiers: 9,
  /** 윗단이 아랫단을 덮는 줄 수 */
  tierOverlap: 13,
  /** 각 단 윗변 폭 / 그 높이에서의 원뿔 폭 */
  tierTopRatio: 0.85,
  /** 바깥쪽 밝은 초록 테두리 두께 */
  edgeWidth: 2,
  /** 단 아래 그늘 줄 수 */
  shadowRows: 4,
  /** 단 아래쪽 가지 끝이 밝게 빛나는 줄 수, 그중 맨 끝 가장 밝은 줄 수 */
  tipRows: 6,
  tipBrightRows: 2,
  /** 잎 결: 밝은 점·어두운 점이 섞이는 비율 (%) */
  fleckLight: 14,
  fleckDark: 12,
  /** 옆 테두리가 줄마다 들쭉날쭉한 정도 (px) */
  sideJag: [0, 1, 2, 1, 0, 2, 1, 0, 1, 2, 0, 1],
  /** 가지 끝에 얹힌 눈 비율 (%) */
  tipSnowChance: 38,
  /** 단 아래 테두리 들쭉날쭉 패턴 (열마다 아래로 더 내려가는 px) */
  jagPattern: [0, 1, 3, 4, 5, 5, 4, 2, 1, 0, 0, 2, 3, 4, 3, 1],
  trunkHalfWidth: 5,
  /** 별 가운데 = 잎 꼭대기에서 위로 */
  starCenterAbove: 4,
  starPeriod: 4,
  starMinAlpha: 0.7,
  starGlowRadius: 9,
  starGlowMinAlpha: 0.25,
  starGlowMaxAlpha: 0.6,
  ornamentMinCount: 52,
  ornamentMaxCount: 62,
  ornamentMinGap: 9,
  /** 장식을 잎 테두리 안쪽으로 들이는 거리 */
  ornamentInset: 4,
  ornamentTopMargin: 20,
  ornamentBottomMargin: 6,
  ornamentSizes: [3, 4, 4, 5],
  /** 흰 눈꽃 장식 개수, 다른 장식과 띄우는 거리 */
  snowflakeCount: 12,
  snowflakeGap: 10,
  /** 꼬마전구를 빽빽하게 두른다 */
  lightMinCount: 230,
  lightMaxCount: 270,
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
  needleTip: '#3f8a55',
  needleShadow: '#143526',
  needleDeep: '#0f2a1f',
  tipSnow: '#dfe8f4',
  snowflake: '#f4f8ff',
  trunk: '#4a3020',
  trunkShade: '#36231a',
  star: '#ffd34d',
  starBright: '#fff2a8',
  starGlow: '#ffe08a',
  light: '#fff1c2',
  lightHalo: '#ffd98a',
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

/** 마켓 오두막: 돌바닥 뒤쪽 끝(연석 바로 뒤)에 늘어선다. 크기도 종류도 제각각 (위치·폭·벽 높이는 world.ts의 HUTS) */
export const MARKET_HUT = {
  /** 종류별 지붕 높이 / 폭 */
  roofRatio: {
    /** 삼각 지붕이 앞을 보는 오두막 (처마에 초록 장식과 전구) */
    gable: 0.38,
    /** 옆으로 긴 오두막 (눈이 두껍게 쌓인 긴 지붕, 창구 여러 칸) */
    longhouse: 0.16,
    /** 줄무늬 차양을 단 작은 매점 */
    kiosk: 0.16,
    /** 뾰족한 원뿔 지붕 정자 */
    pavilion: 0.5,
  },
  roofOverhang: 4,
  /** 지붕 위 눈 두께 */
  snowThickness: 4,
  counterHeight: 11,
  postWidth: 4,
  openingTopGap: 4,
  shelfEvery: 8,
  itemSpacing: 5,
  itemChance: 0.75,
  warmGlowMaxAlpha: 0.45,
  /** 긴 오두막 창구 한 칸 폭 (대략) */
  bayWidth: 30,
  awningDrop: 8,
  awningOut: 4,
  awningStripe: 4,
  /** 정자 꼭대기 금 장식 높이 */
  finialHeight: 3,
  bulbSpacing: 5,
  /** 전구 반짝임: 한 주기 (초), 가장 어두울 때 */
  bulbMinPeriod: 1.6,
  bulbMaxPeriod: 4.5,
  bulbMinAlpha: 0.45,
  bulbGlowAlpha: 0.3,
  /** 처마 고드름: 간격, 가장 긴 길이, 진하기 */
  icicleMinGap: 2,
  icicleMaxGap: 4,
  icicleMaxLength: 4,
  icicleAlpha: 0.9,
  /** 가게 주인: 창구가 이 폭 이상일 때, 이 확률로 서 있다 */
  keeperMinBay: 14,
  keeperChance: 0.7,
} as const;

export const MARKET_HUT_COLORS = {
  woods: [
    { wall: '#7a4e2e', dark: '#5a3820', light: '#a06a3e' },
    { wall: '#6a4630', dark: '#4c3020', light: '#8c6040' },
    { wall: '#86583a', dark: '#644028', light: '#aa7848' },
  ],
  /** 눈 아래로 보이는 지붕·차양 색 */
  roofs: ['#5c2a26', '#2a3358', '#24493a', '#4a3328'],
  awnings: [
    ['#c8343e', '#f3e6c8'],
    ['#2f7a52', '#f3e6c8'],
  ],
  interior: '#2e1c12',
  warmGlow: '#ffb347',
  shelf: '#6b4428',
  items: ['#d23a3a', '#e8b83a', '#d6dbe8', '#3aa36b', '#f3e6c4'],
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
  garland: '#2b6249',
  garlandDark: '#1f4a3a',
  gold: '#e2b23e',
  bulbs: ['#ffd36b', '#ffb347', '#fff0b8', '#ff9f5a'],
  icicle: '#dcebfa',
  wreath: '#2f7a52',
  wreathDark: '#1f5a3c',
  bow: '#d23a3a',
  keeperSkin: '#ffdcbf',
  keeperEye: '#2b1d26',
  keeperHats: ['#d23c4e', '#3f8f5f', '#e2b23e', '#6a7fd0'],
  keeperCoats: ['#7a4a6a', '#3d5a8a', '#8a5a3a', '#4a7a5a'],
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

// ───────────── 회전목마 구역 ─────────────

/** 회전목마 (중심 x는 world.ts의 CAROUSEL_X, 판 위치는 carousel 장애물) */
export const CAROUSEL = {
  /** 한 바퀴 (초) — 숨쉬듯 느긋하게 */
  rotationPeriod: 12,
  horseCount: 8,
  horseOrbitRadius: 92,
  /** 말 발끝 = 판 가운데에서 위로 (탄 사람 머리가 지붕 장식에 닿지 않게) */
  horseBaseAbove: 26,
  /** 탈 때 자리 위로 올라오는 캐릭터 높이 = 앉은 자세 그림에서 엉덩이 줄까지 (엉덩이 ~ 털모자 방울) */
  riderAboveSeat: 26,
  /** 탈 것 8개 가운데 마차 자리 (서로 반대편). 나머지는 말 */
  carriageIndices: [0, 4],
  /** 마차는 오르내리지 않고 판에 붙어 돈다: 앞쪽일수록 이만큼 아래로, 아주 살짝 흔들림 */
  carriageDepthDrop: 12,
  carriageSway: 1,
  carriageSwayPeriod: 1.4,
  /** 타고 내릴 수 있는 '앞쪽': 탈 것이 입구 정면에서 이 각도(라디안) 안에 있을 때 */
  boardWindow: 0.3,
  /** 입구(CAROUSEL_ENTRY)에서 이 거리 안이면 탈 수 있다 */
  entryRadius: 22,
  /** 스페이스를 이만큼 누르고 있으면 '꾹' (마차만 기다림) */
  holdSeconds: 0.5,
  /** 손 흔들기: 길이, 팔 그림이 바뀌는 간격 */
  waveSeconds: 1,
  waveFrameDuration: 0.16,
  /** 앞쪽 말일수록 이만큼 아래로 (원근) */
  horseDepthDrop: 9,
  bobAmplitude: 4,
  bobPeriod: 3.2,
  /** 뒤쪽 말을 어둡게 하는 단계 수와 가장 어두울 때 섞는 비율 */
  shadeLevels: 4,
  maxShade: 0.55,
  /** 뒤쪽 말 크기 (앞쪽 대비) */
  backScale: 0.82,
  platformRadiusY: 16,
  rimHeight: 8,
  /** 판 가운데에서 지붕 아래선까지 */
  roofBottomAbove: 106,
  roofHeight: 44,
  roofHalfWidth: 132,
  /** 지붕 둥글기 (작을수록 볼록) */
  roofCurve: 0.6,
  /** 지붕 아래선이 가운데에서 앞으로 처지는 정도 (둥근 천막을 앞에서 본 모습) */
  roofSag: 6,
  stripeCount: 20,
  /** 지붕 줄무늬가 도는 모습을 미리 그려 두는 장 수 */
  roofFrames: 8,
  roofEdgeShade: 0.8,
  goldBandHeight: 3,
  valanceHeight: 8,
  scallopWidth: 14,
  bulbSpacing: 7,
  /** 전구 불빛이 흐르는 속도 (초당 칸)와 한 번에 밝은 칸 수 */
  bulbChaseSpeed: 8,
  bulbChaseLength: 7,
  bulbMinAlpha: 0.35,
  bulbGlowAlpha: 0.35,
  poleHalfWidth: 9,
  poleBandEvery: 18,
  flagPoleHeight: 12,
  flagWidth: 10,
  flagHeight: 7,
  flagWavePeriod: 0.6,
  /** 주변 바닥에 번지는 불빛 */
  /** 구역 경계(x 480)를 넘지 않게 — 더 넓게 번지는 빛은 scenery/lighting이 맡는다 */
  floorGlowRadiusX: 138,
  floorGlowRadiusY: 34,
  floorGlowAlpha: 0.24,
  floorGlowRings: 4,
  floorGlowPulse: 0.15,
  floorGlowPeriod: 2.4,
} as const;

/** 바닥 판 둘레의 낮은 금색 난간. 앞쪽 가운데(입구)만 끊겨 있다 */
export const CAROUSEL_RAIL = {
  height: 10,
  /** 기둥 간격, 가로대 2줄의 높이 (바닥에서 위로) */
  postEvery: 12,
  railsAbove: [9, 5],
  /** 판 가장자리에서 안쪽으로 들인 거리 (가로, 세로) */
  insetX: 3,
  insetY: 2,
  /** 입구로 끊긴 폭 */
  gapWidth: 28,
  /** 입구 양옆 기둥이 더 솟는 높이 */
  gapPostRise: 3,
  /** 뒤쪽 절반을 어둡게 하는 비율 */
  backShade: 0.45,
} as const;

/** 회전목마 입구 아치·카펫·줄 기둥 (위치는 world.ts의 CAROUSEL_GATE) */
export const ENTRANCE = {
  /** 아치 = 기둥 높이 + 반원 (폭 36, 높이 46) */
  pillarHeight: 28,
  archThickness: 4,
  /** 감은 금 띠 간격과 두께 */
  bandEvery: 7,
  bandWidth: 2,
  /** 전구: 기둥에 달린 것(발밑에서 위로), 반원에 달린 것(수평에서 잰 각도). 양쪽 대칭이라 모두 10개 */
  pillarBulbsAbove: [8, 20],
  arcBulbAngles: [14, 46, 78],
  /** 평소 밝기, 가까이 왔을 때 밝기 */
  idleLevel: 0.45,
  nearLevel: 0.8,
  /** 불빛이 아래에서 위로 흐르는 주기와 한 번 흐르는 데 걸리는 시간 */
  flowPeriod: 2,
  flowDuration: 0.9,
  bulbGlowAlpha: 0.45,
  /** 가까이 가면 튀는 작은 반짝이 */
  sparkleMax: 3,
  sparkleEvery: 0.28,
  sparkleLife: 0.5,
  sparkleSpread: 5,
  /** 기둥 아래 리스 */
  wreathAbove: 12,
  wreathRadius: 3,
  /** 계단 한 칸 높이 */
  stepRise: 4,
  /** 카펫 금 줄무늬 위치, 끝자락 술 길이 */
  carpetStripeInset: 2,
  fringeLength: 2,
  /** 줄 서는 금 기둥과 벨벳 줄 */
  postHeight: 13,
  ropeHookAbove: 11,
  ropeSag: 3,
  /** 올라탈 때 오른쪽 줄이 풀렸다 다시 걸리는 시간, 풀렸을 때 늘어지는 길이 */
  ropeOpenSeconds: 0.3,
  ropeLooseDrop: 9,
} as const;

export const ENTRANCE_COLORS = {
  pillar: '#8a1f2a',
  pillarShade: '#641620',
  gold: '#e2b23e',
  goldShade: '#b0862a',
  star: '#ffd34d',
  bulb: '#fff1c2',
  bulbGlow: '#ffd98a',
  sparkle: '#fff6d0',
  wreath: '#2f7a52',
  wreathDark: '#1f5a3c',
  bow: '#d23a3a',
  carpet: '#6e1420',
  carpetLight: '#84202c',
  carpetStripe: '#c79a3a',
  stepTop: '#8a5a38',
  stepFront: '#5a3a26',
  stepEdge: '#a8744a',
  rope: '#b3202e',
  ropeShade: '#7a1420',
} as const;

/** 지붕 없이 위가 트인 2인용 마차 (오른쪽을 보는 그림 기준, 왼쪽 위가 0,0) */
export const CARRIAGE = {
  width: 46,
  height: 30,
  /** 자리: 엉덩이가 놓이는 곳. 0 = 뒷자리(왼쪽), 1 = 앞자리(오른쪽). 캐릭터 폭(16)만큼 떨어져 겹치지 않는다 */
  seats: [
    { x: 13, y: 17 },
    { x: 30, y: 17 },
  ],
  /** 옆면 윗선: 뒤는 높고 가운데(타는 곳)는 낮고 앞은 말려 올라간다 */
  rearTopY: 10,
  dipTopY: 15,
  frontTopY: 11,
  bottomY: 24,
  /** 등받이 (빨간 벨벳): 뒷자리·앞자리 */
  backrests: [
    { x: 4, w: 5, top: 2 },
    { x: 21, w: 4, top: 6 },
  ],
  wheelRadius: 4,
  wheelXs: [12, 34],
  wheelY: 25,
  /** 앞쪽 둥글게 말린 장식 가운데 */
  scrollX: 43,
  scrollY: 7,
} as const;

export const CAROUSEL_COLORS = {
  carriage: {
    body: '#f3e6c8',
    bodyShade: '#d9c9a4',
    inside: '#b9a67e',
    velvet: '#c8343e',
    velvetShade: '#9a2630',
    under: '#4a3020',
  },
  stripeA: '#f3e6c8',
  stripeB: '#c8343e',
  stripeAShade: '#c9bc9e',
  stripeBShade: '#9a2630',
  gold: '#e2b23e',
  goldShade: '#b0862a',
  bulb: '#fff1c2',
  bulbGlow: '#ffd98a',
  mirror: '#c9d4ea',
  mirrorDark: '#8e9bb8',
  platformTop: '#7a5236',
  plank: '#6a4529',
  rim: '#4a3020',
  flag: '#c8343e',
  floorGlow: '#ffcf7a',
  /** 뒤쪽 말을 어둡게 할 때 섞는 밤색 */
  shadeTarget: '#1a1530',
  horses: [
    { body: '#f4f1ea', shade: '#cfc8bb', mane: '#e2b23e' }, // 흰색
    { body: '#f0dcb0', shade: '#cdb487', mane: '#7a4a2a' }, // 크림
    { body: '#8a5a3a', shade: '#6a4229', mane: '#3a2418' }, // 갈색
  ],
  saddles: ['#c8343e', '#e2b23e'],
  eye: '#2a1a1a',
} as const;

/** 나무 벤치 (위에 눈 살짝) */
export const BENCH = {
  seatAbove: 7,
  seatThickness: 2,
  backTopAbove: 13,
  backSlats: 2,
  legInset: 1,
  snowChance: 0.6,
} as const;

export const BENCH_COLORS = {
  wood: '#8a5a38',
  woodDark: '#6a4529',
  iron: '#17171f',
  snow: '#e8eef8',
} as const;

/** 구역 끝을 막는 작은 전나무 */
export const FIR = {
  tierHeight: 6,
  /** 키에 대한 아래 반폭 비율 */
  halfWidthRatio: 0.3,
  trunkHeight: 3,
  trunkHalfWidth: 1,
} as const;

// ───────────── 스케이트장 구역 ─────────────

/** 얼음 링크 (위치는 world.ts의 rink 장애물) */
export const RINK = {
  /** 둥근 모서리 반지름 (옆에서 보니 세로로 납작하다) */
  cornerRadiusX: 48,
  cornerRadiusY: 30,
  /** 낮은 나무 울타리 높이, 기둥 간격·기둥이 더 솟는 높이 */
  fenceHeight: 9,
  fencePostEvery: 12,
  fencePostRise: 2,
  fenceBoardEvery: 4,
  fenceSnowChance: 0.7,
  /** 얼음 색 띠: 뒤(먼 쪽) → 앞. untilFraction = 링크 깊이 비율 */
  iceBands: [
    { untilFraction: 0.22, color: '#7aaccb' },
    { untilFraction: 0.6, color: '#8fc0dc' },
    { untilFraction: 1, color: '#a6d0e6' },
  ],
  /** 긁힌 자국 (가운데를 도는 타원 조각) */
  scratchCount: 18,
  scratchMinArc: 0.3,
  scratchMaxArc: 1.1,
  scratchMinRadiusX: 40,
  scratchMaxRadiusX: 190,
  /** 반짝이는 점 */
  sparkleCount: 30,
  sparkleMinPeriod: 1.5,
  sparkleMaxPeriod: 4,
  /** sin 값이 이보다 크면 반짝, 더 크면 십자 */
  sparkleOn: 0.82,
  sparkleCross: 0.96,
  /** 닫힌 입구 문 폭, 문 기둥이 울타리보다 솟는 높이 */
  gateWidth: 16,
  gatePostRise: 4,
  /** '준비 중' 팻말 (자물쇠 그림) 크기, 문 위로 솟는 높이 */
  signWidth: 13,
  signHeight: 12,
  signRise: 5,
} as const;

/**
 * 얼음 위 비침 (링크 뒤 가로등). 얼음판은 거울처럼 비춘다:
 * - 비친 상은 가로등이 땅에 닿은 발밑을 기준으로 위아래가 뒤집힌 자리에 생긴다 (등이 발밑 위로 h만큼 높으면, 상은 발밑 아래로 h).
 *   그래서 빛은 울타리 바로 밑이 아니라 얼음 한가운데쯤에 맺히고, 그 위로는 뒤집힌 기둥이 어둡게 비친다.
 * - 얼음 표면의 잔 흠집이 상을 보는 방향(세로)으로 길게 늘이고, 빛을 사방으로 조금씩 흩는다.
 *   그래서 밝은 심 둘레로 옅은 빛이 넓게 번지고, 가장자리는 알갱이처럼 흩어진다. 보는 사람 쪽(아래)으로 더 길게 끌린다.
 * - 가로등 불빛은 가까운 얼음에도 직접 떨어져 울타리 밑에 은은하게 번진다.
 * - 단단한 얼음이라 물처럼 흔들리지 않는다.
 */
export const REFLECTION = {
  /** 빛의 심: 거울 자리(가장 밝은 곳)의 진하기, 옆으로 좁게 */
  alpha: 0.7,
  coreSigmaX: 1.4,
  /** 심 둘레로 넓게 흩어진 빛: 진하기, 옆으로 퍼지는 거리, 세로로는 심보다 이만큼 더 길게 */
  haloAlpha: 0.3,
  haloSigmaX: 7,
  haloStretch: 1.3,
  /** 세로로 늘어나는 정도: 거울 자리에서 위(먼 쪽)·아래(보는 사람 쪽)로 옅어지는 거리 */
  sigmaUp: 12,
  sigmaDown: 19,
  /** 빛을 그리는 범위 (거울 자리에서 위·아래·양옆) */
  reachUp: 34,
  reachDown: 52,
  reachSide: 16,
  /** 진하기를 이 단계로 끊고 점묘로 섞는다 — 가장자리가 알갱이처럼 흩어진다 */
  steps: 5,
  /** 얼음 흠집 때문에 줄마다 밝기가 끊기는 정도 (0 = 매끈, 1 = 크게 끊김) */
  scratchBreak: 0.35,
  /** 가운데에 섞는 흰빛 (빛의 심) */
  coreWhite: 0.55,
  white: '#ffffff',
  /** 가로등 불빛이 가까운 얼음에 직접 떨어져 번지는 빛 (뒤 울타리 밑) */
  poolAlpha: 0.26,
  poolSigmaX: 24,
  poolSigmaY: 9,
  poolReachSide: 46,
  poolReachDown: 22,
  /** 뒤집혀 비친 기둥: 아주 옅고 가장자리가 흐리다. 얼음 맨 뒤와 등 가까이의 진하기 */
  pole: '#1a2140',
  poleFarAlpha: 0.13,
  poleNearAlpha: 0.03,
  /** 기둥 양옆으로 흐려지는 칸의 진하기 (가운데 대비) */
  poleBlur: 0.4,
} as const;

/** 링크 양쪽 기둥 사이에 처지게 걸린 전구 줄 */
export const RINK_LIGHTS = {
  /** 기둥: 링크 가운데 깊이(옆 울타리)에 서서 이만큼 솟는다 */
  poleHeight: 126,
  poleWidth: 2,
  /** 줄 걸이: 기둥 꼭대기에서 아래로 첫 걸이, 걸이 간격 */
  firstHookBelowTop: 4,
  hookGap: 6,
  /** 줄마다 처지는 정도 (위 줄 → 아래 줄) */
  sags: [14, 19, 24, 29],
  bulbSpacing: 8,
  bulbHeight: 2,
  /** 빨강·초록·금·파랑이 차례로 밝아지는 한 바퀴 (초) */
  cyclePeriod: 8,
  minLevel: 0.3,
  glowAlpha: 0.4,
  /** 가장 어두울 때도 전구 알맹이는 이만큼 보인다 */
  bulbMinAlpha: 0.35,
  wire: '#14141c',
  snow: '#e8eef8',
  pole: '#17171f',
  poleLight: '#2c2c3a',
  bulbs: ['#ff5a5a', '#5ad67a', '#ffd36b', '#6ab4ff'],
} as const;

/** NPC 스케이터 3명: 링크 가운데를 도는 타원 */
export const SKATERS = {
  /** 타원 가운데가 링크 가운데보다 이만큼 앞 (앞 울타리에 발이 살짝 가린다) */
  centerFrontShift: 6,
  /** 미끄럼 자세 한 장 시간 */
  glideFrameDuration: 0.8,
  list: [
    { outfit: 'red', radiusX: 168, radiusY: 34, period: 18, phase: 0, wobbles: false },
    { outfit: 'green', radiusX: 136, radiusY: 22, period: 15, phase: 2.2, wobbles: true },
    { outfit: 'plum', radiusX: 184, radiusY: 40, period: 22, phase: 4.3, wobbles: false },
  ],
  /** 비틀거림: 처음 몇 초 뒤, 그다음 30초마다, 얼마 동안 */
  wobbleFirstDelay: 6,
  wobbleInterval: 30,
  wobbleDuration: 2,
  /** 비틀거릴 때 몸이 기우는 최대 px, 흔들리는 횟수, 느려지는 비율, 발 바꾸는 간격 */
  wobbleLean: 2,
  wobbleSwings: 5,
  wobbleSpeedFactor: 0.45,
  wobbleFrameDuration: 0.12,
  /** 얼음 자국: 남기는 간격, 남아 있는 시간, 진하기 */
  trailInterval: 0.05,
  trailLifetime: 1.4,
  trailAlpha: 0.6,
  trailColor: '#eef8ff',
  /** 발 뒤쪽으로 자국을 남기는 거리 */
  trailBehind: 2,
  /** 얼음에 비친 스케이터: 발밑 아래로 뒤집혀 비치는 높이, 진하기 */
  reflectionHeight: 16,
  reflectionAlpha: 0.3,
} as const;

/** 링크 색 */
export const RINK_COLORS = {
  scratch: '#c6e4f3',
  scratchBright: '#eef8ff',
  sparkle: '#ffffff',
  fence: '#6a4529',
  fenceDark: '#4a3020',
  fenceLight: '#8a5a38',
  snow: '#e8eef8',
  gate: '#7a4e30',
  signBoard: '#e8dcc0',
  signBorder: '#4a3020',
  lockBody: '#e2b23e',
  lockShade: '#b0862a',
  lockShackle: '#b9c4dc',
  lockHole: '#3a2a22',
} as const;

// ───────────── 조명·분위기 ─────────────

/** 조명·분위기 효과: 하늘 노을빛과 달, 먼 안개, 바닥에 번지는 불빛, 빛 번짐, 화면 가장자리 어둡게 */
export const LIGHTING = {
  /** 하늘: 이 y부터 지평선까지 보랏빛으로 밝아진다 (점묘로 섞음) */
  horizonFromY: 34,
  horizonColors: ['#161c44', '#222552', '#30295c', '#3f2f64'],
  moon: { x: 78, y: 30, radius: 9, haloRadius: 26, haloAlpha: 0.16, haloRings: 4 },
  cloudCount: 4,
  cloudMinWidth: 36,
  cloudMaxWidth: 90,
  cloudMinY: 44,
  cloudMaxY: 70,
  cloudSpeed: 1.2,
  cloudAlpha: 0.5,
  /** 먼 건물 아래쪽 안개: 이 y부터 건물 선까지 점점 짙게 */
  fogFromY: 62,
  fogMaxAlpha: 0.6,
  /** 오두막 앞 바닥에 쏟아지는 따뜻한 빛 (깊이, 양옆으로 퍼지는 폭, 단계) */
  hutSpillDepth: 38,
  hutSpillSpread: 18,
  hutSpillAlpha: 0.24,
  spillSteps: 8,
  /** 가로등 아래 빛 웅덩이 */
  lampPoolRadiusX: 40,
  lampPoolRadiusY: 12,
  lampPoolAlpha: 0.3,
  /** 큰 트리 둘레 바닥 금빛 */
  treePoolRadiusX: 120,
  treePoolRadiusY: 34,
  treePoolAlpha: 0.26,
  /** 트리 자체의 빛 번짐 (세로로 긴 타원) */
  treeHaloRadiusX: 80,
  treeHaloRadiusY: 100,
  treeHaloAlpha: 0.09,
  hutHaloAlpha: 0.14,
  hutHaloRise: 26,
  /** 회전목마 천막 둘레 빛 번짐, 링크 앞 바닥에 번지는 전구 빛 */
  carouselHaloRadiusX: 150,
  carouselHaloRadiusY: 70,
  carouselHaloAlpha: 0.1,
  /** 회전목마 둘레 바닥에 넓게 번지는 금빛 */
  carouselPoolRadiusX: 190,
  carouselPoolRadiusY: 34,
  carouselPoolAlpha: 0.12,
  rinkSpillRadiusY: 20,
  rinkSpillAlpha: 0.14,
  /** 회전목마 입구: 아치 둘레 작은 빛, 카펫 위로 타원처럼 번지는 금빛 — 회전목마 둘레에서 가장 밝은 곳 */
  gateHaloRadius: 30,
  gateHaloAlpha: 0.2,
  gatePoolRadiusX: 30,
  gatePoolRadiusY: 14,
  gatePoolAlpha: 0.36,
  lampHaloRadius: 22,
  lampHaloAlpha: 0.2,
  clockHaloRadius: 20,
  clockHaloAlpha: 0.22,
  rinkHazeAlpha: 0.1,
  /** 바닥: 앞쪽(아래)으로 갈수록 밤 그늘, 연석 위 쌓인 눈 */
  frontShadeFromY: 200,
  frontShadeAlpha: 0.3,
  curbSnowMin: 2,
  curbSnowMax: 5,
  /** 화면 가장자리 어둡게: 이 비율 밖부터, 가장 짙을 때 */
  vignetteStart: 0.62,
  vignetteAlpha: 0.42,
  vignetteSteps: 5,
} as const;

export const LIGHTING_COLORS = {
  moon: '#f6f1dc',
  moonShade: '#d9d3c0',
  moonHalo: '#c9d4ff',
  cloud: '#232a5a',
  fog: '#333c72',
  warm: '#ffb14a',
  gold: '#ffd27a',
  shade: '#070a1e',
  snow: '#e8eef8',
  snowShade: '#b9c4dc',
  rinkHaze: '#9fd0ff',
  vignette: '#04061a',
} as const;

// ───────────── 소리 ─────────────

/** 기준음 A4 (Hz), 미디 번호 */
export const A4_FREQUENCY = 440;
export const A4_MIDI = 69;

/** 소리 전체: 기본 볼륨, 켜고 끄기 */
export const SOUND = {
  masterVolume: 0.4,
  /** 켜고 끌 때 부드럽게 (초) */
  muteFade: 0.05,
  /** 앞으로 날 소리를 예약하는 간격 */
  scheduleIntervalMs: 100,
  /** 음소거 여부를 기억하는 localStorage 열쇠 */
  storageKey: 'christmas-plaza.muted',
  /** 켜고 끄는 키 */
  toggleKey: 'KeyM',
} as const;

/** 오른쪽 위 스피커 버튼 */
export const SOUND_BUTTON = {
  margin: 4,
  padding: 3,
  /** 누를 수 있는 범위를 버튼 밖으로 넓히는 정도 (손가락용) */
  hitSlop: 8,
  back: '#0a0d20',
  backAlpha: 0.55,
  offAlpha: 0.6,
  icon: '#e8eef8',
  wave: '#ffc857',
  cross: '#ff6b6b',
} as const;

/** 광장 전체 배경 소리 */
export const AMBIENCE = {
  noiseSeconds: 4,
  murmurVolume: 0.5,
  /** 웅성거림 층: 대역(hz, q), 세기, 느린 물결과 말소리 떨림의 빠르기 */
  murmurLayers: [
    { hz: 190, q: 0.7, gain: 1, swellHz: 0.06, babbleHz: 2.3 },
    { hz: 420, q: 0.9, gain: 0.6, swellHz: 0.09, babbleHz: 3.1 },
    { hz: 760, q: 1.1, gain: 0.3, swellHz: 0.13, babbleHz: 4.2 },
    { hz: 1300, q: 1.4, gain: 0.1, swellHz: 0.17, babbleHz: 5.3 },
  ],
  /** 크기가 일렁이는 정도 (세기 대비) */
  swellDepth: 0.35,
  babbleDepth: 0.2,
  /** 종: 처음 울리기까지, 그다음부터 간격 (초) — 아주 가끔 */
  bellFirstMinDelay: 25,
  bellFirstMaxDelay: 50,
  bellMinGap: 70,
  bellMaxGap: 150,
  bellMinStrokes: 1,
  bellMaxStrokes: 3,
  bellStrokeGap: 1.8,
  bellLead: 0.1,
  bellMinHz: 330,
  bellMaxHz: 440,
  bellVolume: 0.22,
  bellAttack: 0.01,
  bellLength: 7,
  /** 멀리서 들리듯 높은 음을 깎는다 */
  bellLowpassHz: 1500,
  /** 종 배음: 기준음 대비 비율, 세기, 사라지는 빠르기 */
  bellPartials: [
    { ratio: 0.5, gain: 0.5, decay: 1.8 },
    { ratio: 1, gain: 1, decay: 1.3 },
    { ratio: 1.19, gain: 0.5, decay: 0.9 },
    { ratio: 1.5, gain: 0.35, decay: 0.7 },
    { ratio: 2, gain: 0.3, decay: 0.5 },
    { ratio: 2.51, gain: 0.15, decay: 0.3 },
  ],
} as const;

/** 회전목마를 타고 앞쪽을 지날 때 스치는 아주 작은 바람 소리 */
export const WIND = {
  volume: 0.14,
  noiseSeconds: 1,
  length: 0.7,
  attack: 0.25,
  /** 걸러 내는 대역이 낮게 시작해 높아졌다 다시 내려온다 */
  lowHz: 350,
  highHz: 950,
  filterQ: 0.8,
} as const;

/** 화면 위에 띄우는 조작 힌트 (글자는 또렷하게 보이도록 캔버스 위 DOM으로 띄운다) */
export const HINT = {
  /** 글자 크기 = 캔버스 확대 배율 × 이 값 (px), 최소 크기 */
  fontPerScale: 5.2,
  minFont: 11,
  subFontRatio: 0.8,
  /** 캐릭터 머리 위로 띄우는 높이 (내부 해상도 px) */
  aboveHead: 38,
  /** 입구 아치 꼭대기 장식 위로 띄우는 높이 */
  aboveArch: 2,
  /** 화면 아래쪽 안내의 y */
  bottomY: 258,
  background: 'rgba(10, 13, 32, 0.78)',
  color: '#fff6dc',
  subColor: '#c9d4ea',
} as const;

/** 눈 밟는 발자국 */
export const FOOTSTEPS = {
  /** 발 디디는 간격 = 걷기 그림 두 장 */
  interval: 0.28,
  volume: 0.5,
  noiseSeconds: 0.5,
  filterQ: 1.6,
  attack: 0.004,
  /** 눌리는 소리, 살짝 늦게 으스러지는 소리 */
  pressHz: 900,
  pressLength: 0.07,
  crunchHz: 2400,
  crunchLength: 0.05,
  crunchDelay: 0.03,
  crunchLevel: 0.6,
  pitchVariation: 0.2,
} as const;

/** 회전목마 오르골 */
export const MUSIC_BOX = {
  /** 4분음표 빠르기 (bpm) */
  tempo: 100,
  /** 전체 볼륨(SOUND.masterVolume)을 곱하기 전 크기 */
  maxVolume: 0.4,
  /** 이 거리 안에서는 최대, farDistance 밖에서는 들리지 않는다 (px) */
  nearDistance: 70,
  farDistance: 380,
  /** 좌우 소리 위치가 끝까지 가는 거리 */
  panDistance: 260,
  /** 음량·좌우 변화를 부드럽게 (초) */
  smoothing: 0.15,
  /** 회전목마를 타는 동안 조금 더 크게 */
  ridingBoost: 1.35,
  /** 미리 예약하는 시간 */
  lookahead: 0.3,
  attack: 0.004,
  /** 소리가 남아 있는 시간 */
  noteLength: 2.2,
  melodyVelocity: 1,
  bassVelocity: 0.55,
  /** 오르골 음색: 배음 비율·세기·사라지는 속도 */
  partials: [
    { ratio: 1, gain: 1, decay: 0.5 },
    { ratio: 2, gain: 0.3, decay: 0.3 },
    { ratio: 4.1, gain: 0.08, decay: 0.12 },
  ],
} as const;

/** 스케이트장 소리: 날이 얼음을 스치는 소리(걸러 낸 잡음), 가끔 작은 웃음 같은 짧은 음 */
export const RINK_SOUND = {
  maxVolume: 0.32,
  /** 링크 울타리에서 이 거리 안이면 최대, farDistance 밖은 안 들린다 */
  nearDistance: 30,
  farDistance: 300,
  panDistance: 260,
  smoothing: 0.15,
  lookahead: 0.3,
  /** 사사삭: 한 번에 몇 번 긁고, 긁는 사이 간격, 다음 묶음까지 */
  minStrokes: 1,
  maxStrokes: 3,
  strokeGap: 0.09,
  minGap: 0.35,
  maxGap: 1.1,
  strokeAttack: 0.03,
  minStrokeLength: 0.16,
  maxStrokeLength: 0.32,
  minFilterHz: 3500,
  maxFilterHz: 6500,
  filterQ: 0.9,
  strokeGain: 0.9,
  noiseSeconds: 1,
  /** 웃음: 몇 초마다, 몇 번 끊어서, 한 마디 길이·사이, 높이 */
  laughMinGap: 9,
  laughMaxGap: 22,
  laughMinPulses: 3,
  laughMaxPulses: 4,
  laughPulseLength: 0.07,
  laughPulseGap: 0.06,
  laughMinHz: 480,
  laughMaxHz: 640,
  /** 마디마다 낮아지는 비율, 한 마디 안에서 떨어지는 비율 */
  laughStepDown: 0.94,
  laughDroop: 0.85,
  laughFormantHz: 1400,
  laughFormantQ: 1.2,
  laughGain: 0.35,
} as const;

/** ?sprites=1 확인 화면 */
export const SPRITE_SHEET = {
  scale: 4,
  columns: 14,
  padding: 8,
  labelHeight: 14,
  titleHeight: 20,
  font: '10px sans-serif',
} as const;

/** ?debug=1 겹쳐 보기 */
export const DEBUG = {
  /** fps를 평균 내는 시간 (초) */
  fpsWindow: 0.5,
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
  K: '#c9d4ea', // 스케이트 날
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
