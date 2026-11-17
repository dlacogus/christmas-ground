// 광장 석조 건물 (레이어 0.6): 3~4층, 1층 아치, 2층부터 격자 창, 슬레이트 지붕과 지붕 창.
// 창문마다 금빛, 20~40초마다 창 하나가 켜지거나 꺼진다. 2층 높이에 전구 줄이 처져 걸린다.

import { GARLAND, PLAZA_BUILDINGS as P, PLAZA_COLORS as C } from '../constants';
import { pickIndexExcept, randInt, randRange, type Rng } from '../random';
import { STREET_LINE_Y } from '../world';
import { lazyBuffer } from './buffer';

export interface PlazaBuilding {
  x: number;
  width: number;
  bays: number;
  floors: number;
  templateIndex: number;
  colorIndex: number;
  doorBay: number;
  /** 굴뚝 x (레이어 좌표), 없으면 null */
  chimneyX: number | null;
}

export type WindowKind = 'grid' | 'arch' | 'dormer';

export interface WindowSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: WindowKind;
  lit: boolean;
  buildingIndex: number;
}

export function buildingWidth(bays: number): number {
  return P.sideMargin * 2 + bays * P.bayWidth;
}

/** 벽 맨 윗줄 y */
export function wallTopY(floors: number): number {
  return STREET_LINE_Y - P.groundFloorHeight - (floors - 1) * P.floorHeight;
}

/** 몇 가지 모양·색을 섞어 이어 붙인다. 이웃끼리는 모양도 색도 겹치지 않게 */
export function generatePlazaRow(rng: Rng, totalWidth: number): PlazaBuilding[] {
  const row: PlazaBuilding[] = [];
  let prevTemplate = -1;
  let prevColor = -1;
  for (let x = 0; x < totalWidth; ) {
    const templateIndex = pickIndexExcept(rng, P.templates.length, prevTemplate);
    const colorIndex = pickIndexExcept(rng, C.walls.length, prevColor);
    const { bays, floors } = P.templates[templateIndex];
    const width = buildingWidth(bays);
    const chimneyX =
      rng() < P.chimneyChance ? x + randInt(rng, P.sideMargin, width - P.sideMargin - P.chimneyWidth) : null;
    row.push({ x, width, bays, floors, templateIndex, colorIndex, doorBay: randInt(rng, 0, bays - 1), chimneyX });
    x += width;
    prevTemplate = templateIndex;
    prevColor = colorIndex;
  }
  return row;
}

function bayX(b: PlazaBuilding, bay: number): number {
  return b.x + P.sideMargin + bay * P.bayWidth;
}

function centered(bayLeft: number, width: number): number {
  return bayLeft + Math.floor((P.bayWidth - width) / 2);
}

export function collectWindows(row: readonly PlazaBuilding[], rng: Rng): WindowSpot[] {
  const windows: WindowSpot[] = [];
  row.forEach((b, buildingIndex) => {
    const groundTop = STREET_LINE_Y - P.groundFloorHeight;
    const wallTop = wallTopY(b.floors);
    const add = (spot: Omit<WindowSpot, 'lit' | 'buildingIndex'>) =>
      windows.push({ ...spot, lit: rng() < P.litChance, buildingIndex });

    for (let bay = 0; bay < b.bays; bay++) {
      const left = bayX(b, bay);
      if (bay !== b.doorBay) {
        add({
          x: centered(left, P.archWidth),
          y: STREET_LINE_Y - P.archBottomGap - P.archHeight,
          w: P.archWidth,
          h: P.archHeight,
          kind: 'arch',
        });
      }
      for (let f = 1; f < b.floors; f++) {
        const floorBottom = groundTop - (f - 1) * P.floorHeight;
        add({
          x: centered(left, P.windowWidth),
          y: floorBottom - P.floorHeight + P.windowTopOffset,
          w: P.windowWidth,
          h: P.windowHeight,
          kind: 'grid',
        });
      }
      if (bay % 2 === 1) {
        add({
          x: centered(left, P.dormerWidth),
          y: wallTop - P.roofHeight + P.dormerTopOffset,
          w: P.dormerWidth,
          h: P.dormerHeight,
          kind: 'dormer',
        });
      }
    }
  });
  return windows;
}

// ───────────── 창문 켜고 끄기 ─────────────

export interface ToggleTimer {
  remaining: number;
}

export function nextToggleInterval(rng: Rng): number {
  return randRange(rng, P.toggleMinInterval, P.toggleMaxInterval);
}

/** dt만큼 시간을 보내고, 그동안 창문을 몇 번 바꿔야 하는지 돌려준다 */
export function advanceToggleTimer(timer: ToggleTimer, dt: number, rng: Rng): number {
  timer.remaining -= dt;
  let toggles = 0;
  while (timer.remaining <= 0) {
    toggles++;
    timer.remaining += nextToggleInterval(rng);
  }
  return toggles;
}

// ───────────── 그리기 ─────────────

/** 위 두 줄이 둥근 아치 모양으로 채운다 */
function fillArch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x + 2, y, w - 4, 1);
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x, y + 2, w, h - 2);
}

function paintWindow(ctx: CanvasRenderingContext2D, win: WindowSpot, row: readonly PlazaBuilding[]): void {
  const colors = C.walls[row[win.buildingIndex].colorIndex];
  const fill = (color: string, y: number, h: number) => {
    ctx.fillStyle = color;
    if (win.kind === 'arch') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(win.x, y, win.w, h);
      ctx.clip();
      fillArch(ctx, win.x, win.y, win.w, win.h);
      ctx.restore();
    } else {
      ctx.fillRect(win.x, y, win.w, h);
    }
  };

  if (win.kind === 'dormer') {
    ctx.fillStyle = C.roofEdge;
    ctx.fillRect(win.x - 1, win.y - 1, win.w + 2, 1);
  }
  fill(win.lit ? C.windowLit : C.windowDark, win.y, win.h);
  if (win.lit) {
    const deep = Math.round(win.h * P.litDeepFraction);
    fill(C.windowLitDeep, win.y + win.h - deep, deep);
  }

  ctx.fillStyle = C.windowFrame;
  const midX = win.x + Math.floor(win.w / 2);
  if (win.kind === 'grid') {
    ctx.fillRect(midX, win.y, 1, win.h);
    ctx.fillRect(win.x, win.y + Math.floor(win.h * P.transomFraction), win.w, 1);
    ctx.fillStyle = colors.trim;
    ctx.fillRect(win.x - 1, win.y + win.h, win.w + 2, 1);
  } else if (win.kind === 'arch') {
    ctx.fillRect(midX, win.y + 1, 1, win.h - 1);
    ctx.fillRect(win.x, win.y + Math.floor(win.h / 2), win.w, 1);
  }
}

function paintBuilding(ctx: CanvasRenderingContext2D, b: PlazaBuilding): void {
  const colors = C.walls[b.colorIndex];
  const top = wallTopY(b.floors);
  const groundTop = STREET_LINE_Y - P.groundFloorHeight;

  // 슬레이트 지붕 (위로 갈수록 안으로)
  for (let r = 0; r < P.roofHeight; r++) {
    const inset = Math.round(r * P.roofSlope);
    ctx.fillStyle = r === P.roofHeight - 1 ? C.roofEdge : r % P.roofTextureEvery === 0 ? C.roofDark : C.roof;
    ctx.fillRect(b.x + inset, top - 1 - r, b.width - inset * 2, 1);
  }
  if (b.chimneyX !== null) {
    const roofTop = top - P.roofHeight;
    ctx.fillStyle = C.chimney;
    ctx.fillRect(b.chimneyX, roofTop - P.chimneyHeight, P.chimneyWidth, P.chimneyHeight + 1);
    ctx.fillStyle = C.chimneyCap;
    ctx.fillRect(b.chimneyX - 1, roofTop - P.chimneyHeight, P.chimneyWidth + 2, 1);
  }

  // 벽: 위층은 벽색, 1층은 한 단계 어둡게
  ctx.fillStyle = colors.wall;
  ctx.fillRect(b.x, top, b.width, groundTop - top);
  ctx.fillStyle = colors.shade;
  ctx.fillRect(b.x, groundTop, b.width, P.groundFloorHeight);

  // 처마 돌림띠와 층 구분선
  ctx.fillStyle = colors.trim;
  ctx.fillRect(b.x, top, b.width, P.corniceHeight);
  for (let f = 0; f < b.floors - 1; f++) ctx.fillRect(b.x, groundTop - f * P.floorHeight - 1, b.width, 1);
  ctx.fillStyle = colors.shade;
  ctx.fillRect(b.x, top + P.corniceHeight, b.width, 1);

  // 아치형 문 (위쪽 반원 창에 불빛)
  const doorX = centered(bayX(b, b.doorBay), P.doorWidth);
  const doorY = STREET_LINE_Y - P.doorHeight;
  ctx.fillStyle = C.door;
  fillArch(ctx, doorX, doorY, P.doorWidth, P.doorHeight);
  ctx.save();
  ctx.beginPath();
  ctx.rect(doorX, doorY, P.doorWidth, P.fanlightRows);
  ctx.clip();
  ctx.fillStyle = C.windowLitDeep;
  fillArch(ctx, doorX, doorY, P.doorWidth, P.doorHeight);
  ctx.restore();
  ctx.fillStyle = C.doorFrame;
  ctx.fillRect(doorX, doorY + P.fanlightRows, P.doorWidth, 1);
  ctx.fillRect(doorX + Math.floor(P.doorWidth / 2), doorY + P.fanlightRows, 1, P.doorHeight - P.fanlightRows);

  // 이웃 건물과 경계
  ctx.fillStyle = colors.shade;
  ctx.fillRect(b.x + b.width - 1, top, 1, STREET_LINE_Y - top);
}

/** 전구 줄 한 칸의 x에서 처진 높이 */
export function garlandY(xInSpan: number): number {
  const t = xInSpan / GARLAND.span;
  return GARLAND.anchorY + Math.round(GARLAND.sag * 4 * t * (1 - t));
}

function paintGarland(ctx: CanvasRenderingContext2D, width: number): void {
  let bulbIndex = 0;
  for (let start = 0; start < width; start += GARLAND.span) {
    ctx.fillStyle = GARLAND.wire;
    for (let dx = 0; dx <= GARLAND.span; dx++) ctx.fillRect(start + dx, garlandY(dx), 1, 1);
    for (let dx = Math.floor(GARLAND.bulbSpacing / 2); dx < GARLAND.span; dx += GARLAND.bulbSpacing) {
      const x = start + dx;
      const y = garlandY(dx) + 1;
      const color = GARLAND.bulbs[bulbIndex++ % GARLAND.bulbs.length];
      const r = GARLAND.glowRadius;
      ctx.save();
      ctx.globalAlpha = GARLAND.glowAlpha;
      ctx.fillStyle = color;
      ctx.fillRect(x - r, y - r, 1 + r * 2, GARLAND.bulbHeight + r * 2);
      ctx.restore();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, GARLAND.bulbHeight);
    }
  }
}

export function createPlazaBuildings(rng: Rng, width: number) {
  const row = generatePlazaRow(rng, width);
  const windows = collectWindows(row, rng);
  const timer: ToggleTimer = { remaining: nextToggleInterval(rng) };
  const getBuffer = lazyBuffer(width, STREET_LINE_Y, (ctx) => {
    for (const b of row) paintBuilding(ctx, b);
    for (const w of windows) paintWindow(ctx, w, row);
    paintGarland(ctx, width);
  });

  /** 창 하나만 다시 칠하고, 그 자리에 걸친 전구 줄도 다시 얹는다 */
  const repaintWindow = (win: WindowSpot) => {
    const { ctx } = getBuffer();
    paintWindow(ctx, win, row);
    ctx.save();
    ctx.beginPath();
    ctx.rect(win.x, win.y, win.w, win.h);
    ctx.clip();
    paintGarland(ctx, width);
    ctx.restore();
  };

  return {
    row,
    windows,
    update(dt: number) {
      const toggles = advanceToggleTimer(timer, dt, rng);
      for (let i = 0; i < toggles; i++) {
        const win = windows[Math.floor(rng() * windows.length)];
        win.lit = !win.lit;
        repaintWindow(win);
      }
    },
    draw(ctx: CanvasRenderingContext2D, offsetX: number) {
      ctx.drawImage(getBuffer().canvas, -offsetX, 0);
    },
  };
}
