// 스피커 버튼 바로 아래 작은 웃는 얼굴 버튼: 눌러서 이모트 바퀴를 연다 (E 키와 같다). 글자 없이 픽셀 그림으로만.

import { EMOTE, SOUND_BUTTON as B } from '../constants';
import { stampPixels } from '../props/pixel';
import { soundButtonRect } from './soundButton';

/** 웃는 얼굴 (Y 얼굴, K 눈·입) */
const SMILE = [
  '..YYYYY..',
  '.YYYYYYY.',
  'YYKYYYKYY',
  'YYKYYYKYY',
  'YYYYYYYYY',
  'YKYYYYYKY',
  'YYKKKKKYY',
  '.YYYYYYY.',
  '..YYYYY..',
];

export function emoteButtonRect(): { x: number; y: number; w: number; h: number } {
  const s = soundButtonRect();
  return { x: s.x, y: s.y + s.h + EMOTE.buttonGap, w: s.w, h: SMILE.length + B.padding * 2 };
}

/** 화면 좌표 (sx, sy)가 버튼 위인가 — 손가락용으로 넉넉히, 위쪽만은 스피커 버튼과 겹치지 않게 틈의 절반까지 */
export function hitEmoteButton(sx: number, sy: number): boolean {
  const r = emoteButtonRect();
  return sx >= r.x - B.hitSlop && sx <= r.x + r.w + B.hitSlop && sy >= r.y - EMOTE.buttonGap / 2 && sy <= r.y + r.h + B.hitSlop;
}

/** open = 바퀴가 열려 있다 (버튼을 밝게) */
export function drawEmoteButton(ctx: CanvasRenderingContext2D, open: boolean): void {
  const r = emoteButtonRect();
  ctx.globalAlpha = open ? 0.85 : B.backAlpha;
  ctx.fillStyle = open ? EMOTE.wheelPicked : B.back;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  stampPixels(ctx, SMILE, { Y: EMOTE.buttonFace, K: EMOTE.buttonInk }, r.x + Math.floor((r.w - SMILE[0].length) / 2), r.y + B.padding);
}
