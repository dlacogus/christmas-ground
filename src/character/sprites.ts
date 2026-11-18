// 캐릭터 스프라이트. 글자 하나 = 픽셀 한 칸, '.' = 투명.
// 오른쪽을 보는 모습으로 그리고, 왼쪽은 좌우 반전해서 만든다.
// 글자 → 색은 constants.ts의 CHARACTER_BASE_PALETTE와 옷 색(OUTFITS)이 정한다.
//   O/o = 코트(바꿔 끼움), M/m = 목도리·장갑(바꿔 끼움), u = 단추
//   P/p = 방울, H/h = 털모자, b = 모자 띠, R = 머리, S/s = 피부, C = 볼, E = 눈
//   L/l = 앞/뒷다리, F/f = 앞/뒤 부츠, K = 스케이트 날, G = 대머리 정수리 반짝임
// 모든 자세는 '모자 있음'(POSES)과 '대머리'(BALD_POSES) 두 벌이다.

import { CHARACTER } from '../constants';

export type Facing = 'left' | 'right';
export type PoseName =
  | 'idle'
  | 'walk'
  | 'glide'
  | 'skateGlide'
  | 'crouch'
  | 'push'
  | 'cheer'
  | 'ride'
  | 'rideWave'
  | 'sit'
  | 'sitWave';

const TRANSPARENT = '.';

/** 머리·몸 (26줄). 0~15줄 = 머리(모자·얼굴·목도리), 16~25줄 = 코트 */
const UPPER: readonly string[] = [
  '......PPP.......',
  '.....PPPPp......',
  '.....hHHHHH.....',
  '....hHHHHHHH....',
  '...hHHHHHHHHH...',
  '..hHHHHHHHHHHH..',
  '..bbbbbbbbbbbb..',
  '..bbbbbbbbbbbb..',
  '..RRSSSSSSSSSS..',
  '..RSSSSSSSSSSSS.',
  '..RSSSSESSSESSS.',
  '..RSSSSESSSESSS.',
  '..RSSSCSSSSSCSS.',
  '...sSSSSSSSSSs..',
  '...MMMMMMMMMMM..',
  '..mMMMMMMMMMMMm.',
  '..MmOOOOOOOOOO..',
  '.oMmOOOOOOOOOOo.',
  '.oMmOOOOuOOOOOo.',
  '.oMmOOOOOOOOOOo.',
  '.oMmOOOOuOOOOOo.',
  '.MmMOOOOOOOOOOM.',
  '.M.mOOOOOOOOOOM.',
  '...OOOOOOOOOOO..',
  '...oOOOOOOOOOo..',
  '...ooooooooooo..',
];

/** 모자가 벗겨진 머리 (0~12줄): 머리카락 없는 맨들맨들한 살색 대머리, 정수리에 흰 반짝임 */
const BALD_HEAD: readonly string[] = [
  '................',
  '................',
  '................',
  '.....SSSSSS.....',
  '...sSSSSSGGSS...',
  '..sSSSSSSSSGSS..',
  '..sSSSSSSSSSSS..',
  '..sSSSSSSSSSSS..',
  '..sSSSSSSSSSSS..',
  '..sSSSSSSSSSSSS.',
  '..sSSSSESSSESSS.',
  '..sSSSSESSSESSS.',
  '..sSSSCSSSSSCSS.',
];
const BALD_UPPER: readonly string[] = [...BALD_HEAD, ...UPPER.slice(BALD_HEAD.length)];

/** 털모자만 (날아가거나 바닥에 떨어진 모자 그림): 방울 + 모자 + 띠 */
export const HAT_ROWS: readonly string[] = UPPER.slice(0, 8).map((row) => row.slice(2, 14));

/** 머리 부분 줄 수 (숨쉬기에서 이 부분만 1px 내려간다) */
const HEAD_ROWS = 16;

/** 다리 (6줄, 26~31줄) */
const LEGS_STAND: readonly string[] = [
  '.....lll.LLL....',
  '.....lll.LLL....',
  '.....lll.LLL....',
  '.....lll.LLL....',
  '.....fff.FFFF...',
  '.....fff.FFFF...',
];

/** 걷기: 두 발이 앞뒤로 벌어진 순간 */
const LEGS_CONTACT: readonly string[] = [
  '.....lll.LLL....',
  '....lll...LLL...',
  '....lll...LLL...',
  '...lll.....LLL..',
  '..ffff.....FFFF.',
  '..ffff.....FFFF.',
];

/** 걷기: 뒷발을 들어 앞으로 넘기는 순간 */
const LEGS_PASS: readonly string[] = [
  '.....lllLLL.....',
  '.....lllLLL.....',
  '.....lllLLL.....',
  '.....ffffLLL....',
  '.....ffffFFFF...',
  '........FFFF....',
];

/** 스케이트 미끄럼: 뒷발을 뒤로 뻗고 앞발 날로 미끄러진다 (발을 구르지 않는다) */
const LEGS_GLIDE_REACH: readonly string[] = [
  '.....lll.LLL....',
  '....lll..LLL....',
  '..llll...LLL....',
  'ffff.....FFFF...',
  'KKKK.....FFFF...',
  '.........KKKKK..',
];

/** 스케이트 미끄럼: 두 발을 모으고 무릎을 살짝 굽힌다 */
const LEGS_GLIDE_TUCK: readonly string[] = [
  '.....lllLLL.....',
  '.....lllLLL.....',
  '.....lllLLL.....',
  '.....ffffLLL....',
  '.....ffffFFFF...',
  '....KKKKKKKKKK..',
];

/** 쪼그려 앉기 (스케이트 신기, 넘어졌다 일어나기): 무릎을 벌리고 몸을 3px 낮춘다 */
const LEGS_CROUCH: readonly string[] = [
  '................',
  '................',
  '................',
  '....lll..LLLL...',
  '...ffff..FFFFF..',
  '...ffff..FFFFF..',
];
const CROUCH_DROP = 3;

/** 말 위에 앉은 자세: 허벅지는 앞으로, 종아리는 말 옆구리로 내려온다 */
const LEGS_RIDE: readonly string[] = [
  '.....LLLLLL.....',
  '.....LLLLLLL....',
  '.........LLL....',
  '.........LLL....',
  '.........FFFF...',
  '.........FFFF...',
];

/** 마차 의자에 앉은 자세: 무릎을 굽혀 앉는다 (아래쪽은 마차 옆면에 가려 상반신만 보인다) */
const LEGS_SIT: readonly string[] = [
  '.....LLLLLLL....',
  '.....LLLLLLL....',
  '..........LL....',
  '..........LL....',
  '..........FFF...',
  '..........FFF...',
];

/** 한 손을 들어 흔드는 팔 (머리·몸 그림 8번째 줄부터 겹쳐 찍는다). 두 장이 번갈아 나온다 */
const WAVE_ARM_TOP_ROW = 7;
const WAVE_ARMS: readonly (readonly string[])[] = [
  [
    '................',
    '..............MM',
    '..............MM',
    '...............O',
    '...............O',
    '...............O',
    '..............OO',
    '..............Oo',
    '..............Oo',
    '.............OOo',
  ],
  [
    '.............MM.',
    '.............MM.',
    '..............O.',
    '..............OO',
    '...............O',
    '...............O',
    '..............OO',
    '..............Oo',
    '..............Oo',
    '.............OOo',
  ],
];
/** 흔드는 동안에는 옆에 늘어뜨린 손(장갑)을 코트로 덮는다 */
const HANGING_HAND_ROWS = [21, 22];
const HANGING_HAND_COLUMN = 14;

/** 두 팔을 살짝 벌린다 (스케이트 글라이드): 옆에 늘어뜨린 손을 지우고 몸 바깥쪽 조금 위에 손을 둔다 */
function armsOut(frame: readonly string[], bodyShift: number): string[] {
  const grid = frame.map((row) => [...row]);
  const hand = 21 + bodyShift;
  for (const r of [hand, hand + 1]) {
    for (const c of [1, 14]) if (grid[r]?.[c] === 'M') grid[r][c] = TRANSPARENT;
  }
  const sleeve = hand - 1;
  grid[sleeve][0] = 'o';
  grid[sleeve][15] = 'o';
  grid[hand][0] = 'M';
  grid[hand][15] = 'M';
  return grid.map((row) => row.join(''));
}

/** 두 팔을 앞으로 뻗어 민다 (눈덩이 굴리기): 늘어뜨린 손을 지우고 몸 앞에 팔과 장갑을 둔다 */
function armsForward(frame: readonly string[], bodyShift: number): string[] {
  const grid = frame.map((row) => [...row]);
  for (const r of HANGING_HAND_ROWS) if (grid[r + bodyShift]?.[HANGING_HAND_COLUMN] === 'M') grid[r + bodyShift][HANGING_HAND_COLUMN] = 'O';
  const arm = 19 + bodyShift;
  grid[arm][14] = 'O';
  grid[arm][15] = 'o';
  grid[arm + 1][14] = 'M';
  grid[arm + 1][15] = 'M';
  return grid.map((row) => row.join(''));
}

/** 뿌듯하게 두 손을 번쩍 든다 */
function armsUp(frame: readonly string[]): string[] {
  const grid = withWave(frame, WAVE_ARMS[1]).map((row) => [...row]);
  // 반대쪽 팔도 (좌우를 뒤집어) 올리고, 늘어뜨린 손은 지운다
  for (const r of HANGING_HAND_ROWS) if (grid[r][1] === 'M') grid[r][1] = TRANSPARENT;
  stamp(grid, WAVE_ARMS[1].map((row) => [...row].reverse().join('')), WAVE_ARM_TOP_ROW);
  return grid.map((row) => row.join(''));
}

/** 앉은 자세에 손 흔드는 팔을 얹는다 */
function withWave(frame: readonly string[], arm: readonly string[]): string[] {
  const grid = frame.map((row) => [...row]);
  for (const r of HANGING_HAND_ROWS) if (grid[r][HANGING_HAND_COLUMN] === 'M') grid[r][HANGING_HAND_COLUMN] = 'O';
  stamp(grid, arm, WAVE_ARM_TOP_ROW);
  return grid.map((row) => row.join(''));
}

const LEGS_TOP_ROW = CHARACTER.spriteHeight - LEGS_STAND.length;

/** 앞다리·뒷다리 색을 맞바꾼다 (반대쪽 발이 앞에 나온 프레임) */
function swapLegs(rows: readonly string[]): string[] {
  const swap: Record<string, string> = { L: 'l', l: 'L', F: 'f', f: 'F' };
  return rows.map((row) => [...row].map((ch) => swap[ch] ?? ch).join(''));
}

/** 빈 판에 부분 그림을 겹쳐 찍는다 ('.'은 건너뜀) */
function stamp(grid: string[][], part: readonly string[], top: number): void {
  part.forEach((row, r) => {
    const y = top + r;
    if (y < 0 || y >= grid.length) return;
    [...row].forEach((ch, x) => {
      if (ch !== TRANSPARENT) grid[y][x] = ch;
    });
  });
}

/**
 * 다리 + 몸 + 머리를 합쳐 한 프레임을 만든다.
 * bodyShift: 몸 전체를 아래로 (걸음 반동), headShift: 머리만 더 아래로 (숨쉬기)
 */
function composeWith(upper: readonly string[], legs: readonly string[], bodyShift: number, headShift: number): string[] {
  const grid = Array.from({ length: CHARACTER.spriteHeight }, () =>
    Array<string>(CHARACTER.spriteWidth).fill(TRANSPARENT),
  );
  stamp(grid, legs, LEGS_TOP_ROW);
  stamp(grid, upper.slice(HEAD_ROWS), HEAD_ROWS + bodyShift);
  stamp(grid, upper.slice(0, HEAD_ROWS), bodyShift + headShift);
  return grid.map((row) => row.join(''));
}

/** 머리·몸 그림(모자 있음/대머리)으로 자세별 프레임을 만든다 */
function buildPoses(upper: readonly string[]): Record<PoseName, string[][]> {
  const compose = (legs: readonly string[], bodyShift: number, headShift: number) => composeWith(upper, legs, bodyShift, headShift);
  return {
  // 서기: 숨쉬듯 머리가 1px 오르내린다
  idle: [compose(LEGS_STAND, 0, 0), compose(LEGS_STAND, 0, 1)],
  // 걷기 4프레임: 벌림 → 넘김 → 반대발 벌림 → 반대발 넘김 (벌릴 때 몸이 1px 내려감)
  walk: [
    compose(LEGS_CONTACT, 1, 0),
    compose(LEGS_PASS, 0, 0),
    compose(swapLegs(LEGS_CONTACT), 1, 0),
    compose(swapLegs(LEGS_PASS), 0, 0),
  ],
  // 스케이트 미끄럼 2프레임: 뒷발 뻗기 → 모으며 살짝 웅크림
  glide: [compose(LEGS_GLIDE_REACH, 0, 0), compose(LEGS_GLIDE_TUCK, 1, 0)],
  // 내 스케이트: 두 발을 모으고 두 팔을 살짝 벌린 글라이드 (밀어낼 때는 위 glide 2프레임)
  skateGlide: [armsOut(compose(LEGS_GLIDE_TUCK, 1, 0), 1)],
  // 쪼그려 앉기 2프레임 (신는 동안 머리가 까딱)
  crouch: [compose(LEGS_CROUCH, CROUCH_DROP, 0), compose(LEGS_CROUCH, CROUCH_DROP, 1)],
  // 눈덩이 밀기 4프레임 (걷는 다리 + 앞으로 뻗은 두 팔)
  push: [
    armsForward(compose(LEGS_CONTACT, 1, 0), 1),
    armsForward(compose(LEGS_PASS, 0, 0), 0),
    armsForward(compose(swapLegs(LEGS_CONTACT), 1, 0), 1),
    armsForward(compose(swapLegs(LEGS_PASS), 0, 0), 0),
  ],
  // 뿌듯하게 두 손 들기
  cheer: [armsUp(compose(LEGS_STAND, 0, 0))],
  // 회전목마: 말 위에 앉기 / 마차 의자에 앉기, 각각 손 흔드는 두 장
  ride: [compose(LEGS_RIDE, 0, 0)],
  rideWave: WAVE_ARMS.map((arm) => withWave(compose(LEGS_RIDE, 0, 0), arm)),
  sit: [compose(LEGS_SIT, 0, 0)],
  sitWave: WAVE_ARMS.map((arm) => withWave(compose(LEGS_SIT, 0, 0), arm)),
};
}

/** 오른쪽을 보는 자세별 프레임 (모자 있음) */
export const POSES: Readonly<Record<PoseName, readonly string[][]>> = buildPoses(UPPER);
/** 오른쪽을 보는 자세별 프레임 (대머리) */
export const BALD_POSES: Readonly<Record<PoseName, readonly string[][]>> = buildPoses(BALD_UPPER);

export function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

const mirrorAll = (poses: Readonly<Record<PoseName, readonly string[][]>>) =>
  Object.fromEntries((Object.keys(poses) as PoseName[]).map((pose) => [pose, poses[pose].map(mirrorRows)])) as Record<PoseName, string[][]>;
const mirrored = mirrorAll(POSES);
const mirroredBald = mirrorAll(BALD_POSES);

export function getFrame(pose: PoseName, index: number, facing: Facing, bald = false): readonly string[] {
  const frames = bald ? (facing === 'right' ? BALD_POSES[pose] : mirroredBald[pose]) : facing === 'right' ? POSES[pose] : mirrored[pose];
  const n = frames.length;
  return frames[((Math.floor(index) % n) + n) % n];
}
