// 캐릭터 스프라이트. 글자 하나 = 픽셀 한 칸, '.' = 투명.
// 오른쪽을 보는 모습으로 그리고, 왼쪽은 좌우 반전해서 만든다.
// 글자 → 색은 constants.ts의 CHARACTER_BASE_PALETTE와 옷 색(OUTFITS)이 정한다.
//   O/o = 코트(바꿔 끼움), M/m = 목도리·장갑(바꿔 끼움), u = 단추
//   P/p = 방울, H/h = 털모자, b = 모자 띠, R = 머리, S/s = 피부, C = 볼, E = 눈
//   L/l = 앞/뒷다리, F/f = 앞/뒤 부츠, K = 스케이트 날

import { CHARACTER } from '../constants';

export type Facing = 'left' | 'right';
export type PoseName = 'idle' | 'walk' | 'glide' | 'ride' | 'rideWave' | 'sit' | 'sitWave';

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
function compose(legs: readonly string[], bodyShift: number, headShift: number): string[] {
  const grid = Array.from({ length: CHARACTER.spriteHeight }, () =>
    Array<string>(CHARACTER.spriteWidth).fill(TRANSPARENT),
  );
  stamp(grid, legs, LEGS_TOP_ROW);
  stamp(grid, UPPER.slice(HEAD_ROWS), HEAD_ROWS + bodyShift);
  stamp(grid, UPPER.slice(0, HEAD_ROWS), bodyShift + headShift);
  return grid.map((row) => row.join(''));
}

/** 오른쪽을 보는 자세별 프레임 */
export const POSES: Readonly<Record<PoseName, readonly string[][]>> = {
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
  // 회전목마: 말 위에 앉기 / 마차 의자에 앉기, 각각 손 흔드는 두 장
  ride: [compose(LEGS_RIDE, 0, 0)],
  rideWave: WAVE_ARMS.map((arm) => withWave(compose(LEGS_RIDE, 0, 0), arm)),
  sit: [compose(LEGS_SIT, 0, 0)],
  sitWave: WAVE_ARMS.map((arm) => withWave(compose(LEGS_SIT, 0, 0), arm)),
};

export function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

const mirrored = Object.fromEntries(
  (Object.keys(POSES) as PoseName[]).map((pose) => [pose, POSES[pose].map(mirrorRows)]),
) as Record<PoseName, string[][]>;

export function getFrame(pose: PoseName, index: number, facing: Facing): readonly string[] {
  const frames = facing === 'right' ? POSES[pose] : mirrored[pose];
  const n = frames.length;
  return frames[((Math.floor(index) % n) + n) % n];
}
