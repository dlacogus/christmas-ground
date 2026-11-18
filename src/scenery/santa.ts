// 5분에 한 번 하늘을 가로지르는 산타 썰매. 루돌프 두 마리가 끄는 썰매가 맵 오른쪽 끝에서 왼쪽 끝까지 날며,
// 큰 트리 위를 지날 때 꼭대기 별 바로 위로 솟아오른다. 뒤로 금빛 가루가 흩날린다.
// 월드 좌표로 움직이고 (본 레이어와 함께 흐른다) 시설보다 앞에 그린다.

import { MAP_WIDTH, TREE_X } from '../world';
import { SANTA as S, SANTA_COLORS as C, SCREEN_WIDTH } from '../constants';
import { stampPixels } from '../props/pixel';
import { lazyBuffer } from './buffer';

/** 루돌프 (왼쪽을 보고 달린다). 다리만 두 장으로 번갈아 움직인다 */
const REINDEER_BODY = [
  '.A.A.........',
  '..AA.........',
  '.BBB.........',
  'RBKB..BBBBBB.',
  '..BBBBBBBBBBW',
  '...BBBWBBBBB.',
];
const REINDEER_LEGS = [
  ['...D.D...D.D.', '..D..D...D..D'],
  ['...DD....DD..', '....DD..DD...'],
];
/** 썰매와 산타 (뒤에 선물 자루) */
const SLEIGH = [
  '......HHW....',
  '.....HHH..NN.',
  '....WWWW.NNNN',
  '....FFFH.NNNN',
  'S..WWWHHHNNNN',
  'S.SSSSSSSSSSS',
  '.SSGGGGGGGGSS',
  '..SSSSSSSSSS.',
  '..G.......G..',
  '.GGGGGGGGGGG.',
];

const PALETTE = {
  A: C.antler,
  B: C.fur,
  D: C.furDark,
  K: C.eye,
  R: C.nose,
  W: C.white,
  H: C.suit,
  F: C.skin,
  N: C.sack,
  S: C.sleigh,
  G: C.gold,
};

const REINDEER_WIDTH = REINDEER_BODY[0].length;
const REINDEER_HEIGHT = REINDEER_BODY.length + 2;
export const SANTA_WIDTH = REINDEER_WIDTH * 2 + S.harnessGap * 2 + SLEIGH[0].length;
export const SANTA_HEIGHT = SLEIGH.length;

function paintSanta(ctx: CanvasRenderingContext2D, frame: number): void {
  const deerTop = SANTA_HEIGHT - REINDEER_HEIGHT - 1;
  // 고삐: 루돌프 등에서 썰매 앞까지 한 줄
  ctx.fillStyle = C.reins;
  ctx.fillRect(REINDEER_WIDTH - 1, deerTop + 4, SANTA_WIDTH - SLEIGH[0].length - REINDEER_WIDTH + 2, 1);
  for (let i = 0; i < 2; i++) {
    const x = i * (REINDEER_WIDTH + S.harnessGap);
    // 두 마리가 엇박자로 달린다
    const legs = REINDEER_LEGS[(frame + i) % 2];
    stampPixels(ctx, [...REINDEER_BODY, ...legs], PALETTE, x, deerTop);
  }
  stampPixels(ctx, SLEIGH, PALETTE, SANTA_WIDTH - SLEIGH[0].length, 0);
}

/** 썰매 가운데가 월드 x에 있을 때의 높이 (썰매 위쪽 y): 평소 높이로 날다가 트리 위에서 별 위로 솟는다 */
export function santaAltitude(centerX: number): number {
  const d = (centerX - TREE_X) / S.treeRiseWidth;
  return S.cruiseY - (S.cruiseY - S.overTreeY) * Math.exp(-d * d);
}

/** 가로지른 정도(0 = 맵 오른쪽 밖, 1 = 맵 왼쪽 밖)에 따른 썰매 왼쪽 위 월드 좌표 */
export function santaPosition(progress: number, time: number): { x: number; y: number } {
  const x = MAP_WIDTH + (-SANTA_WIDTH - MAP_WIDTH) * progress;
  const bob = Math.sin((time / S.bobPeriod) * Math.PI * 2) * S.bobHeight;
  return { x: Math.round(x), y: Math.round(santaAltitude(x + SANTA_WIDTH / 2) + bob) };
}

/** 한 번 가로지르는 데 걸리는 시간 (초) */
export function flightSeconds(): number {
  return (MAP_WIDTH + SANTA_WIDTH) / S.speed;
}

interface Sparkle {
  x: number;
  y: number;
  age: number;
}

export function createSanta(random: () => number = Math.random) {
  const frames = [0, 1].map((f) => lazyBuffer(SANTA_WIDTH, SANTA_HEIGHT, (ctx) => paintSanta(ctx, f)));
  const sparkles: Sparkle[] = [];
  let wait: number = S.firstDelay;
  /** 날고 있으면 0~1, 아니면 -1 */
  let progress = -1;
  let time = 0;
  let sparkleTimer = 0;

  return {
    get flying() {
      return progress >= 0;
    },
    /** 지금 바로 날아오른다 (개발용) */
    fly(): void {
      if (progress < 0) progress = 0;
    },
    update(dt: number): void {
      time += dt;
      for (const s of sparkles) s.age += dt;
      while (sparkles.length > 0 && sparkles[0].age >= S.sparkleLife) sparkles.shift();
      if (progress < 0) {
        wait -= dt;
        if (wait <= 0) progress = 0;
        return;
      }
      progress += dt / flightSeconds();
      if (progress >= 1) {
        progress = -1;
        // 날기 시작한 때부터 5분마다
        wait = S.interval - flightSeconds();
        return;
      }
      // 썰매 뒤로 금빛 가루
      sparkleTimer -= dt;
      if (sparkleTimer <= 0) {
        sparkleTimer = S.sparkleEvery;
        const p = santaPosition(progress, time);
        sparkles.push({ x: p.x + SANTA_WIDTH + Math.round(random() * 3), y: p.y + 3 + Math.round(random() * 6), age: 0 });
      }
    },
    /** offsetX = 본 레이어가 왼쪽으로 밀린 정도 */
    draw(ctx: CanvasRenderingContext2D, offsetX: number): void {
      if (sparkles.length > 0) {
        ctx.fillStyle = C.sparkle;
        for (const s of sparkles) {
          const sx = s.x - offsetX;
          if (sx < 0 || sx >= SCREEN_WIDTH) continue;
          ctx.globalAlpha = 1 - s.age / S.sparkleLife;
          // 가루는 천천히 가라앉는다
          ctx.fillRect(sx, s.y + Math.round(s.age * S.sparkleFall), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      if (progress < 0) return;
      const p = santaPosition(progress, time);
      const sx = p.x - offsetX;
      if (sx <= -SANTA_WIDTH || sx >= SCREEN_WIDTH) return;
      const frame = Math.floor(time / S.gallopSeconds) % 2;
      ctx.drawImage(frames[frame]().canvas, sx, p.y);
    },
  };
}

export type Santa = ReturnType<typeof createSanta>;
