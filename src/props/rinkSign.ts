// 스케이트장 입구·출구 팻말: 문 옆에 선 작은 기둥 팻말. 짙은 원목 작은 판에 색 화살표만.
//   입구 = 초록 ↑ (링크 안으로), 출구 = 빨강 ↓ (링크 밖으로).

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, RINK_SIGN as S, RINK_SIGN_COLORS as C } from '../constants';
import { lazyBuffer } from '../scenery/buffer';
import type { DepthDrawable } from '../zones/zone';
import { stampPixels } from './pixel';

/** 화살표 (5x7): 위 = 안으로, 아래 = 밖으로 */
const ARROW_UP = ['..#..', '.###.', '#####', '..#..', '..#..', '..#..', '..#..'];
const ARROW_DOWN = [...ARROW_UP].reverse();

export type RinkSignKind = 'enter' | 'exit';

/** 판 폭 */
export function signBoardWidth(): number {
  return S.paddingX * 2 + ARROW_UP[0].length;
}

function paintSign(ctx: CanvasRenderingContext2D, kind: RinkSignKind, width: number): void {
  const h = S.boardHeight;
  const postLeft = Math.floor(width / 2) - 1;
  // 기둥
  ctx.fillStyle = C.post;
  ctx.fillRect(postLeft, h, S.postWidth, S.postHeight - h);
  ctx.fillStyle = C.postShade;
  ctx.fillRect(postLeft + S.postWidth - 1, h, 1, S.postHeight - h);
  // 판: 모서리를 깎고 위·아래 테두리
  ctx.fillStyle = C.board;
  ctx.fillRect(1, 1, width - 2, h - 1);
  ctx.fillRect(0, 2, width, h - 3);
  ctx.fillStyle = C.boardLight;
  ctx.fillRect(1, 1, width - 2, 1);
  ctx.fillStyle = C.boardShade;
  ctx.fillRect(1, h - 1, width - 2, 1);
  // 판 위에 얹힌 눈
  ctx.fillStyle = C.snow;
  ctx.fillRect(1, 0, width - 2, 1);
  // 화살표
  const arrow = kind === 'enter' ? ARROW_UP : ARROW_DOWN;
  stampPixels(ctx, arrow, { '#': kind === 'enter' ? C.enter : C.exit }, S.paddingX, Math.floor((h - arrow.length) / 2) + 1);
}

/** 발밑 (x, y)에 선 팻말 */
export function createRinkSign(kind: RinkSignKind, foot: { x: number; y: number }): DepthDrawable {
  const width = signBoardWidth();
  const buffer = lazyBuffer(width, S.postHeight, (ctx) => paintSign(ctx, kind, width));
  return {
    footY: foot.y,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const x = foot.x - layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(buffer().canvas, x - Math.floor(width / 2), foot.y - S.postHeight);
    },
  };
}
