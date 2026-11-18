// 나무 이정표: 기둥 하나에 화살표 판 두 장 — 위는 회전목마(왼쪽), 아래는 아이스링크(오른쪽).
// 저해상도라 글자는 한 자씩 손으로 찍은 작은 픽셀 글꼴로 그린다 (높이 7). 짙은 원목에 크림색 글씨, 꼭대기에 호랑가시 장식.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, SIGNPOST as S, SIGNPOST_COLORS as C } from '../constants';
import { lazyBuffer } from '../scenery/buffer';
import type { DepthDrawable } from '../zones/zone';
import { stampPixels } from './pixel';

export const GLYPH_HEIGHT = 7;

/** 이정표에 쓰는 글자 (# = 칠한 칸). 높이 7, 폭은 글자마다 5~6 */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  회: ['.#..#', '###.#', '#.#.#', '###.#', '.#..#', '###.#', '....#'],
  전: ['###.#', '.#.##', '#.#.#', '....#', '#....', '#....', '#####'],
  목: ['#####', '#...#', '#####', '..#..', '#####', '....#', '....#'],
  마: ['....#.', '###.#.', '#.#.#.', '#.#.##', '#.#.#.', '###.#.', '....#.'],
  아: ['....#.', '.#..#.', '#.#.#.', '#.#.##', '#.#.#.', '.#..#.', '....#.'],
  이: ['....#', '.#..#', '#.#.#', '#.#.#', '#.#.#', '.#..#', '....#'],
  스: ['..#..', '..#..', '.#.#.', '#...#', '.....', '#####', '.....'],
  링: ['###.#', '..#.#', '###.#', '#...#', '###..', '.#.#.', '.###.'],
  크: ['####.', '...#.', '####.', '...#.', '.....', '#####', '.....'],
};

export interface SignBoard {
  text: string;
  direction: 'left' | 'right';
  /** 판 왼쪽 끝 (기둥 가운데 기준), 판 위쪽 (기둥 꼭대기 기준), 화살촉을 뺀 몸통 폭 */
  left: number;
  top: number;
  bodyWidth: number;
}

/** 글자 줄의 폭 */
export function textWidth(text: string): number {
  const chars = [...text];
  return chars.reduce((sum, ch) => sum + GLYPHS[ch][0].length, 0) + (chars.length - 1) * S.letterGap;
}

/** 판 두 장의 자리: 화살촉이 가리키는 쪽으로 길게 뻗고, 반대쪽은 기둥을 조금 지나서 끝난다 */
export function signBoards(): SignBoard[] {
  return S.boards.map((b, i) => {
    const bodyWidth = textWidth(b.text) + S.paddingX * 2;
    const total = bodyWidth + S.tipLength;
    const left = b.direction === 'left' ? S.tailPastPost - total : -S.tailPastPost;
    return { text: b.text, direction: b.direction, left, top: S.firstBoardBelowTop + i * (S.boardHeight + S.boardGap), bodyWidth };
  });
}

/** 이정표 그림이 차지하는 좌우 범위 (기둥 가운데 기준) */
export function signExtent(): { left: number; right: number } {
  const boards = signBoards();
  return {
    left: Math.min(...boards.map((b) => b.left)) - 1,
    right: Math.max(...boards.map((b) => b.left + b.bodyWidth + S.tipLength)) + 1,
  };
}

function paintBoard(ctx: CanvasRenderingContext2D, ox: number, board: SignBoard): void {
  const total = board.bodyWidth + S.tipLength;
  const h = S.boardHeight;
  const pointsLeft = board.direction === 'left';
  for (let i = 0; i < total; i++) {
    // 화살촉 쪽 끝에서의 거리 → 위아래로 깎인 정도
    const fromTip = pointsLeft ? i : total - 1 - i;
    const inset = Math.max(0, Math.ceil(((S.tipLength - fromTip) * (h / 2)) / S.tipLength));
    const colH = h - inset * 2;
    if (colH <= 0) continue;
    const x = ox + board.left + i;
    const y = board.top + inset;
    ctx.fillStyle = C.board;
    ctx.fillRect(x, y, 1, colH);
    ctx.fillStyle = C.boardLight;
    ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = C.boardShade;
    ctx.fillRect(x, y + colH - 1, 1, 1);
    // 판 위에 얹힌 눈 (몸통 위에만, 군데군데 두껍게)
    if (inset === 0) {
      ctx.fillStyle = C.snow;
      ctx.fillRect(x, y - 1, 1, 1);
      if ((i * 7 + board.top) % 5 < 2) ctx.fillRect(x, y - 2, 1, 1);
    }
  }
  // 꼬리 쪽 끝: 모서리를 둥글게 깎고 그늘
  const tailX = ox + board.left + (pointsLeft ? total - 1 : 0);
  ctx.clearRect(tailX, board.top - 2, 1, 3);
  ctx.clearRect(tailX, board.top + h - 1, 1, 1);
  ctx.fillStyle = C.boardShade;
  ctx.fillRect(tailX, board.top + 1, 1, h - 2);
  // 꼬리 끝에 박힌 금빛 못
  ctx.fillStyle = C.nail;
  ctx.fillRect(tailX + (pointsLeft ? -2 : 2), board.top + Math.floor(h / 2), 1, 1);
  // 글자
  let textX = ox + board.left + (pointsLeft ? S.tipLength : 0) + S.paddingX;
  const textTop = board.top + Math.floor((h - GLYPH_HEIGHT) / 2);
  for (const ch of board.text) {
    stampPixels(ctx, GLYPHS[ch], { '#': C.text }, textX, textTop);
    textX += GLYPHS[ch][0].length + S.letterGap;
  }
}

function paintSignpost(ctx: CanvasRenderingContext2D, ox: number): void {
  const left = ox - Math.floor(S.postWidth / 2);
  // 기둥: 왼쪽은 밝게, 오른쪽은 그늘
  ctx.fillStyle = C.post;
  ctx.fillRect(left, S.snowCap, S.postWidth, S.height);
  ctx.fillStyle = C.postLight;
  ctx.fillRect(left, S.snowCap, 1, S.height);
  ctx.fillStyle = C.postShade;
  ctx.fillRect(left + S.postWidth - 1, S.snowCap, 1, S.height);
  // 꼭대기 눈 모자 (둥글게)
  ctx.fillStyle = C.snow;
  ctx.fillRect(left - 1, S.snowCap - 1, S.postWidth + 2, 2);
  ctx.fillRect(left, S.snowCap - 2, S.postWidth, 1);
  // 발밑에 쌓인 눈
  ctx.fillRect(left - 2, S.snowCap + S.height - 1, S.postWidth + 4, 1);
  ctx.fillRect(left - 1, S.snowCap + S.height - 2, S.postWidth + 2, 1);
  for (const board of signBoards()) {
    paintBoard(ctx, ox, { ...board, top: board.top + S.snowCap });
  }
  // 눈 모자 아래 호랑가시 잎 두 장과 빨간 열매
  const hy = S.snowCap + 2;
  ctx.fillStyle = C.holly;
  ctx.fillRect(left - 3, hy, 3, 2);
  ctx.fillRect(left + S.postWidth, hy, 3, 2);
  ctx.fillStyle = C.hollyDark;
  ctx.fillRect(left - 3, hy + 1, 1, 1);
  ctx.fillRect(left + S.postWidth + 2, hy + 1, 1, 1);
  ctx.fillStyle = C.berry;
  ctx.fillRect(left, hy, 1, 1);
  ctx.fillRect(left + S.postWidth - 1, hy, 1, 1);
  ctx.fillRect(left + 1, hy + 1, 1, 1);
}

export function createSignpost(foot: { x: number; y: number }): DepthDrawable {
  const extent = signExtent();
  const buffer = lazyBuffer(extent.right - extent.left, S.height + S.snowCap, (ctx) => paintSignpost(ctx, -extent.left));
  return {
    footY: foot.y,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const x = foot.x - layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(buffer().canvas, x + extent.left, foot.y - S.height - S.snowCap);
    },
  };
}
