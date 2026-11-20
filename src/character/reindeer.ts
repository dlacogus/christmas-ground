// 루돌프 바디슈트 (썰매를 끄는 사람만): 원래 캐릭터 위에 겹치지 않고 통째로 바꿔 그리는 전용 스프라이트.
// 머리 모양·옷 색과 상관없이 모두 같은 루돌프 — 누구인지는 이름표로 구분한다. 캐릭터와 같은 키·비율(16x32).
// 글자 = 픽셀 (REINDEER_PALETTE): A 뿔, B/b 털옷, T 배, S/s 얼굴, E 눈, C 볼, N 빨간 코(n 반짝임), H 손 발굽, W 꼬리, Q 어깨에 멘 밧줄,
// 다리는 캐릭터 다리 그림을 그대로 쓰고 색만 털옷(L/l)과 발굽(F/f)으로 바꾼다.

import { CHARACTER, REINDEER_NOSE_OFF, REINDEER_PALETTE } from '../constants';
import { LEGS_CONTACT, LEGS_PASS, LEGS_STAND, composeWith, mirrorRows, swapLegs, type Facing } from './sprites';

export type ReindeerPose = 'idle' | 'walk' | 'run';

/** 후드(얼굴만 동그랗게 뚫림) + 뿔 두 개(가지 하나씩) + 양옆 작은 귀 + 빨간 코 2x2 (0~15줄) */
const HEAD: readonly string[] = [
  '.A..A....A..A...',
  '.AA.A....A.AA...',
  '..AAA....AAA....',
  '...A......A.....',
  '...bBBBBBBBBb...',
  '..bBBBBBBBBBBB..',
  'bBbBBBBBBBBBBBBb',
  '.bBBBSSSSSSBBBb.',
  '..BBSSSSSSSSSBB.',
  '..BSSSESSSSESSB.',
  '..BSSSESSSSESSB.',
  '..BSSCSSNnSSCSB.',
  '..BBSSSSNNSSSBB.',
  '...BBSSSSSSSBB..',
  '...bBBBBBBBBBb..',
  '..bBBBBBBBBBBBb.',
];

/** 몸 (16~25줄): 털옷, 연한 배, 손 발굽, 엉덩이(뒤 = 왼쪽)에 하얀 꼬리 */
const BODY: readonly string[] = [
  '..bBBBBBBBBBBB..',
  '.bbBBBBTTTBBBBb.',
  '.bbBBBTTTTTBBBb.',
  '.bbBBBTTTTTBBBb.',
  '.bbBBBTTTTTBBBb.',
  '.HbBBBTTTTTBBBH.',
  '.H.BBBBTTTBBBBH.',
  '.WBBBBBBBBBBBB..',
  '..WbBBBBBBBBBb..',
  '...bbbbbbbbbbb..',
];

/** 어깨에서 등 뒤로 비스듬히 멘 밧줄 (열, 줄) */
const STRAP: readonly [number, number][] = [
  [12, 16],
  [11, 17],
  [10, 18],
  [9, 19],
  [8, 20],
  [7, 21],
  [6, 22],
  [5, 22],
  [4, 22],
];

/** 밧줄이 몸에서 썰매 쪽으로 나가는 자리 (오른쪽을 볼 때, 스프라이트 안 열·줄) */
export const REINDEER_ROPE_AT = { col: 4, row: 22 } as const;
/** 빨간 코 가운데 (오른쪽을 볼 때, 스프라이트 안 열·줄) — 빛이 여기서 난다 */
export const REINDEER_NOSE_AT = { col: 9, row: 12 } as const;

const UPPER: readonly string[] = (() => {
  const rows = [...HEAD, ...BODY].map((r) => [...r]);
  for (const [c, r] of STRAP) rows[r][c] = 'Q';
  return rows.map((r) => r.join(''));
})();

/** 머리만 앞으로 1px (달릴 때 몸을 앞으로 숙인다) */
function leanHead(rows: readonly string[]): string[] {
  return rows.map((row, i) => (i < HEAD.length ? '.' + row.slice(0, -1) : row));
}

const compose = (legs: readonly string[], bodyShift: number, headShift: number, upper: readonly string[] = UPPER) => composeWith(upper, legs, bodyShift, headShift);
const RUN_UPPER = leanHead(UPPER);

/** 오른쪽을 보는 자세별 프레임 */
export const REINDEER_POSES: Readonly<Record<ReindeerPose, readonly string[][]>> = {
  // 서기: 숨쉬듯 머리가 1px
  idle: [compose(LEGS_STAND, 0, 0), compose(LEGS_STAND, 0, 1)],
  // 걷기 4프레임 (그릴 때 넘기는 프레임에서 살짝 통통 뛴다)
  walk: [compose(LEGS_CONTACT, 1, 0), compose(LEGS_PASS, 0, 0), compose(swapLegs(LEGS_CONTACT), 1, 0), compose(swapLegs(LEGS_PASS), 0, 0)],
  // 달리기 4프레임: 머리를 앞으로 숙이고 다리를 크게
  run: [
    compose(LEGS_CONTACT, 1, 0, RUN_UPPER),
    compose(LEGS_PASS, 0, 0, RUN_UPPER),
    compose(swapLegs(LEGS_CONTACT), 1, 0, RUN_UPPER),
    compose(swapLegs(LEGS_PASS), 0, 0, RUN_UPPER),
  ],
};

const MIRRORED: Readonly<Record<ReindeerPose, readonly string[][]>> = {
  idle: REINDEER_POSES.idle.map(mirrorRows),
  walk: REINDEER_POSES.walk.map(mirrorRows),
  run: REINDEER_POSES.run.map(mirrorRows),
};

export function reindeerFrame(pose: ReindeerPose, index: number, facing: Facing): readonly string[] {
  const frames = facing === 'right' ? REINDEER_POSES[pose] : MIRRORED[pose];
  const n = frames.length;
  return frames[((Math.floor(index) % n) + n) % n];
}

/** 프레임 번호와 통통 뛰는 높이: 걷기·달리기는 다리를 넘기는 프레임(홀수)에서 뜬다 */
export function reindeerBounce(pose: ReindeerPose, index: number, walkBounce: number, runBounce: number): number {
  if (pose === 'idle' || index % 2 === 0) return 0;
  return pose === 'run' ? runBounce : walkBounce;
}

const cache = new Map<string, HTMLCanvasElement>();

/** 한 프레임을 1배 크기 캔버스로 구워 둔다. noseOn = 코가 켜져 있나 (눈덩이에 맞으면 잠깐 꺼진다) */
export function getReindeerCanvas(pose: ReindeerPose, index: number, facing: Facing, noseOn = true, eyesClosed = false): HTMLCanvasElement {
  const key = `${pose}|${index}|${facing}|${noseOn}|${eyesClosed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = reindeerFrame(pose, index, facing);
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER.spriteWidth;
  canvas.height = CHARACTER.spriteHeight;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      let color = REINDEER_PALETTE[c];
      if (!color) return;
      if (!noseOn && (c === 'N' || c === 'n')) color = REINDEER_NOSE_OFF;
      // 눈을 감으면 (재채기) 눈 윗칸을 얼굴색으로
      if (eyesClosed && c === 'E' && rows[y + 1]?.[x] === 'E') color = REINDEER_PALETTE.S;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  cache.set(key, canvas);
  return canvas;
}

/** 스프라이트 안 (열, 줄)이 발밑에서 얼마나 떨어져 있나 (왼쪽을 보면 좌우 반전) */
export function reindeerOffset(at: { col: number; row: number }, facing: Facing): { dx: number; dy: number } {
  const col = facing === 'right' ? at.col : CHARACTER.spriteWidth - 1 - at.col;
  return { dx: col - CHARACTER.spriteWidth / 2 + 0.5, dy: at.row - CHARACTER.spriteHeight + 0.5 };
}
