// 오른쪽 위 작은 스피커 버튼: 눌러서 소리를 켜고 끈다. 글자 없이 픽셀 그림으로만.

import { SCREEN_WIDTH, SOUND_BUTTON as B } from '../constants';
import { stampPixels } from '../props/pixel';

/** 스피커 + 소리 물결 (X 스피커, W 물결) */
const SPEAKER_ON = [
  '....X......',
  '...XX..W...',
  'XXXXX...W..',
  'XXXXX.W.W..',
  'XXXXX.W.W..',
  'XXXXX...W..',
  '...XX..W...',
  '....X......',
];

/** 스피커 + 가위표 (R) */
const SPEAKER_OFF = [
  '....X......',
  '...XX......',
  'XXXXX.R...R',
  'XXXXX..R.R.',
  'XXXXX...R..',
  'XXXXX..R.R.',
  '...XX.R...R',
  '....X......',
];

export function soundButtonRect(): { x: number; y: number; w: number; h: number } {
  const w = SPEAKER_ON[0].length + B.padding * 2;
  const h = SPEAKER_ON.length + B.padding * 2;
  return { x: SCREEN_WIDTH - B.margin - w, y: B.margin, w, h };
}

/** 화면 좌표 (sx, sy)가 버튼 위인가 — 손가락으로도 누르기 쉽게 둘레를 넉넉히 잡는다 */
export function hitSoundButton(sx: number, sy: number): boolean {
  const r = soundButtonRect();
  return sx >= r.x - B.hitSlop && sx <= r.x + r.w + B.hitSlop && sy >= r.y - B.hitSlop && sy <= r.y + r.h + B.hitSlop;
}

/** on = 지금 소리가 나는 상태 (첫 입력을 받았고 꺼 두지 않음) */
export function drawSoundButton(ctx: CanvasRenderingContext2D, on: boolean): void {
  const r = soundButtonRect();
  ctx.save();
  ctx.globalAlpha = B.backAlpha;
  ctx.fillStyle = B.back;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = on ? 1 : B.offAlpha;
  stampPixels(ctx, on ? SPEAKER_ON : SPEAKER_OFF, { X: B.icon, W: B.wave, R: B.cross }, r.x + B.padding, r.y + B.padding);
  ctx.restore();
}
