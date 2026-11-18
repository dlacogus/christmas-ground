// 오두막 뒤로 솟은 시계탑: 넓은 본관 위에 돌 몸통, 종루 아치 창, 빛나는 시계 판, 모서리 첨탑, 등롱, 뾰족 지붕.
// 아래에서 비추는 조명으로 위쪽이 금빛으로 물든다. 실제 건물을 본뜨지 않았다. 시계 바늘은 지금 시각을 가리킨다.

import { CLOCK_TOWER as T, CLOCK_TOWER_COLORS as C } from '../constants';
import { fillPixelCircle, mixColor } from '../props/pixel';
import { STREET_LINE_Y } from '../world';

export function clockTowerGeometry() {
  const base = STREET_LINE_Y;
  const shaftTop = base - T.shaftHeight;
  const lanternTop = shaftTop - T.lanternHeight;
  const spireTop = lanternTop - T.spireHeight;
  return {
    base,
    shaftTop,
    lanternTop,
    spireTop,
    /** 꼭대기 장식 끝 */
    top: spireTop - T.finialHeight,
    clockY: shaftTop + T.clockBelowTop,
    hallTop: base - T.hallHeight,
  };
}

/** 시계 바늘 각도 (12시 방향에서 시계 방향, 라디안) */
export function clockHandAngles(hours: number, minutes: number): { hour: number; minute: number } {
  return {
    hour: (((hours % 12) + minutes / 60) / 12) * Math.PI * 2,
    minute: (minutes / 60) * Math.PI * 2,
  };
}

/** 위가 뾰족한 아치 창 */
function fillPointedArch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const rise = Math.ceil(w / 2);
  for (let r = 0; r < rise; r++) {
    const inset = rise - 1 - r;
    ctx.fillRect(x + inset, y + r, w - inset * 2, 1);
  }
  ctx.fillRect(x, y + rise, w, h - rise);
}

function litArch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = C.windowFrame;
  fillPointedArch(ctx, x - 1, y - 1, w + 2, h + 1);
  ctx.fillStyle = C.windowLit;
  fillPointedArch(ctx, x, y, w, h);
  ctx.fillStyle = C.windowDeep;
  ctx.fillRect(x, y + Math.round(h * 0.6), w, h - Math.round(h * 0.6));
}

/** 조명에 물든 돌 색: 몸통 꼭대기가 가장 금빛 */
function stoneAt(color: string, y: number, shaftTop: number): string {
  const t = Math.max(0, Math.min(1, 1 - (y - shaftTop) / T.uplightHeight));
  return mixColor(color, C.uplight, T.uplightMax * t);
}

export function paintClockTower(ctx: CanvasRenderingContext2D, cx: number): void {
  const g = clockTowerGeometry();

  // 본관: 눈 얹은 지붕, 뾰족 아치 창이 줄지어 빛난다
  const hallLeft = cx - T.hallWidth / 2;
  for (let r = 0; r < T.hallRoofHeight; r++) {
    const inset = T.hallRoofHeight - 1 - r;
    ctx.fillStyle = r < 2 ? C.snow : r % 3 === 0 ? C.roofLight : C.roof;
    ctx.fillRect(hallLeft + inset, g.hallTop - T.hallRoofHeight + r, T.hallWidth - inset * 2, 1);
  }
  ctx.fillStyle = C.stoneDark;
  ctx.fillRect(hallLeft, g.hallTop, T.hallWidth, T.hallHeight);
  ctx.fillStyle = C.stoneLight;
  ctx.fillRect(hallLeft - 1, g.hallTop, T.hallWidth + 2, 2);
  for (let x = hallLeft + 4; x + T.hallWindowWidth <= hallLeft + T.hallWidth - 3; x += T.hallWindowEvery) {
    litArch(ctx, x, g.hallTop + 6, T.hallWindowWidth, T.hallWindowHeight);
  }

  // 탑 몸통: 돌 켜, 왼쪽은 밝고 오른쪽은 그늘
  const left = cx - T.shaftWidth / 2;
  for (let y = g.shaftTop; y < g.base; y++) {
    const course = (y - g.shaftTop) % T.stoneEvery === T.stoneEvery - 1;
    ctx.fillStyle = stoneAt(course ? C.stoneDark : C.stone, y, g.shaftTop);
    ctx.fillRect(left, y, T.shaftWidth, 1);
    ctx.fillStyle = stoneAt(C.stoneLight, y, g.shaftTop);
    ctx.fillRect(left, y, 2, 1);
    ctx.fillStyle = stoneAt(C.stoneDark, y, g.shaftTop);
    ctx.fillRect(left + T.shaftWidth - 2, y, 2, 1);
  }

  // 종루 아치 창 두 개
  const belfryY = g.clockY + T.belfryBelowClock;
  for (const dx of [-T.belfryWindowWidth - 2, 2]) litArch(ctx, cx + dx, belfryY, T.belfryWindowWidth, T.belfryWindowHeight);

  // 시계 판 (바늘은 매 프레임 따로 그린다)
  ctx.fillStyle = C.faceRim;
  fillPixelCircle(ctx, cx, g.clockY, T.clockRadius);
  ctx.fillStyle = C.face;
  fillPixelCircle(ctx, cx, g.clockY, T.clockRadius - 1);
  ctx.fillStyle = C.hands;
  const tick = T.clockRadius - 2;
  for (const [dx, dy] of [[0, -tick], [tick, 0], [0, tick], [-tick, 0]]) ctx.fillRect(cx + dx, g.clockY + dy, 1, 1);

  // 돌림띠와 모서리 작은 첨탑
  ctx.fillStyle = stoneAt(C.stoneLight, g.shaftTop, g.shaftTop);
  ctx.fillRect(left - 2, g.shaftTop - 1, T.shaftWidth + 4, 3);
  for (const px of [left - 2, left + T.shaftWidth - 1]) {
    for (let r = 0; r < T.pinnacleHeight; r++) {
      const w = r < 3 ? 1 : 3;
      ctx.fillStyle = r === 0 ? C.gold : stoneAt(C.stoneLight, g.shaftTop, g.shaftTop);
      ctx.fillRect(px + (3 - w) / 2, g.shaftTop - 1 - T.pinnacleHeight + r, w, 1);
    }
  }

  // 등롱: 환하게 빛나는 아치 창
  const lanternLeft = cx - T.lanternWidth / 2;
  ctx.fillStyle = mixColor(C.stoneLight, C.uplight, T.uplightMax);
  ctx.fillRect(lanternLeft, g.lanternTop, T.lanternWidth, T.lanternHeight - 1);
  for (const dx of [-5, -1, 3]) litArch(ctx, cx + dx, g.lanternTop + 3, 2, T.lanternHeight - 5);
  ctx.fillStyle = C.stoneLight;
  ctx.fillRect(lanternLeft - 1, g.lanternTop, T.lanternWidth + 2, 1);

  // 뾰족 지붕: 왼쪽 모서리는 밝게, 오른쪽에 눈
  for (let r = 0; r < T.spireHeight; r++) {
    const half = Math.max(1, Math.round((T.lanternWidth / 2 + 1) * ((r + 1) / T.spireHeight)));
    const y = g.spireTop + r;
    ctx.fillStyle = C.roof;
    ctx.fillRect(cx - half, y, half * 2, 1);
    ctx.fillStyle = C.roofLight;
    ctx.fillRect(cx - half, y, 1, 1);
    if (r % 5 < 2 || r > T.spireHeight - 3) {
      ctx.fillStyle = C.snow;
      ctx.fillRect(cx + Math.floor(half / 3), y, half - Math.floor(half / 3), 1);
    }
  }
  ctx.fillStyle = C.gold;
  ctx.fillRect(cx - 1, g.top + 1, 2, T.finialHeight - 1);
  ctx.fillRect(cx, g.top, 1, 1);
}

function drawHand(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, length: number): void {
  for (let i = 0; i <= length; i++) {
    ctx.fillRect(cx + Math.round(Math.sin(angle) * i), cy - Math.round(Math.cos(angle) * i), 1, 1);
  }
}

/** 지금 시각의 시계 바늘 (cx = 화면에서 탑 가운데 x) */
export function drawClockHands(ctx: CanvasRenderingContext2D, cx: number, now: Date): void {
  const g = clockTowerGeometry();
  const a = clockHandAngles(now.getHours(), now.getMinutes());
  ctx.fillStyle = C.hands;
  drawHand(ctx, cx, g.clockY, a.minute, T.minuteHand);
  drawHand(ctx, cx, g.clockY, a.hour, T.hourHand);
}
