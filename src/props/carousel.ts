// 회전목마: 줄무늬 둥근 천막 지붕, 금 띠와 흐르는 전구, 거울 기둥, 둥근 나무 판, 판 둘레의 낮은 금 난간(앞 가운데만 입구로 끊김).
// 탈 것 8개 = 금 막대에 꽂힌 목마 6마리 + 지붕 없는 2인용 마차 2대(서로 반대편).
// 탈 것은 각도로 위치를 계산한다: 앞쪽(cos > 0)은 밝고 크게, 뒤쪽은 어둡고 작게 기둥 뒤로.
// 목마는 막대를 따라 오르내리고, 마차는 판에 붙어 돌며 아주 살짝 흔들린다.
// 탄 사람은 자기 탈 것과 함께 그린다 (같은 밝기·크기, 기둥에 가려짐). 마차는 뒤판 → 사람 → 옆면 순서.
// 판·기둥·지붕(줄무늬가 도는 모습 몇 장)은 미리 그려 두고, 탈 것·전구·깃발만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { getSpriteCanvas } from '../character/render';
import { POSES, type PoseName } from '../character/sprites';
import {
  CAROUSEL as K,
  CAROUSEL_COLORS as C,
  CAROUSEL_RAIL as RAIL,
  CARRIAGE as G,
  CHARACTER,
  LAYER_FACTORS,
  SCREEN_WIDTH,
  type OutfitName,
} from '../constants';
import { lazyBuffer, type PixelBuffer } from '../scenery/buffer';
import { CAROUSEL_X, getObstacle } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { fillPixelEllipse, mixColor } from './pixel';

// ───────────── 위치 계산 (순수) ─────────────

export function carouselGeometry() {
  const platform = getObstacle('carousel');
  const rimBottom = platform.y + platform.h;
  const platformY = rimBottom - K.rimHeight - K.platformRadiusY;
  const roofBottom = platformY - K.roofBottomAbove;
  return {
    rimBottom,
    /** 판 윗면 타원 가운데 y */
    platformY,
    platformRadiusX: platform.w / 2,
    roofBottom,
    apexY: roofBottom - K.roofHeight,
  };
}

/** 지붕 아래선 y (가운데가 앞으로 처진 곡선) */
export function roofBottomAt(dx: number): number {
  const a = Math.min(1, Math.abs(dx) / K.roofHalfWidth);
  return carouselGeometry().roofBottom + Math.round(K.roofSag * (1 - a * a));
}

export type Facing = 'left' | 'right';
export type MountKind = 'horse' | 'carriage';

/** index번째 탈 것은 말인가 마차인가 */
export function mountKind(index: number): MountKind {
  return (K.carriageIndices as readonly number[]).includes(index) ? 'carriage' : 'horse';
}

/** 탈 것의 지금 각도 (-π ~ π). 0 = 입구 정면(맨 앞), 음수 = 왼쪽에서 다가오는 중, 양수 = 오른쪽으로 지나간 뒤 */
export function mountAngle(index: number, time: number): number {
  const raw = (Math.PI * 2 * index) / K.horseCount + ((Math.PI * 2) / K.rotationPeriod) * time;
  const wrapped = ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return wrapped > Math.PI ? wrapped - Math.PI * 2 : wrapped;
}

export interface MountState {
  index: number;
  kind: MountKind;
  angle: number;
  x: number;
  /** 말은 발끝 y, 마차는 바퀴 바닥 y */
  y: number;
  /** 1 = 맨 앞, -1 = 맨 뒤 */
  z: number;
  facing: Facing;
}

export function mountState(index: number, time: number): MountState {
  const { platformY } = carouselGeometry();
  const angle = mountAngle(index, time);
  const z = Math.cos(angle);
  const kind = mountKind(index);
  let y: number;
  if (kind === 'horse') {
    // 말마다 위상을 달리 해서 막대를 따라 오르내린다
    const bobPhase = (Math.PI * 2 * index * 3) / K.horseCount;
    const bob = Math.sin((Math.PI * 2 * time) / K.bobPeriod + bobPhase) * K.bobAmplitude;
    y = platformY - K.horseBaseAbove + z * K.horseDepthDrop - bob;
  } else {
    // 마차는 오르내리지 않고 판에 붙어 돈다. 대신 아주 살짝 흔들린다
    const sway = Math.sin((Math.PI * 2 * time) / K.carriageSwayPeriod + index) > 0 ? K.carriageSway : 0;
    y = platformY + Math.round(z * K.carriageDepthDrop) + sway;
  }
  return {
    index,
    kind,
    angle,
    x: CAROUSEL_X + K.horseOrbitRadius * Math.sin(angle),
    y,
    z,
    // 앞쪽은 오른쪽으로, 뒤쪽은 왼쪽으로 지나간다
    facing: z >= 0 ? 'right' : 'left',
  };
}

/** 지금 탈 것들의 위치 (뒤 → 앞 순서) */
export function mountStates(time: number): MountState[] {
  return Array.from({ length: K.horseCount }, (_, index) => mountState(index, time)).sort((a, b) => a.z - b.z);
}

/** 앞뒤에 따른 어둡기 단계 (0 = 가장 밝음) */
export function shadeLevel(z: number): number {
  return Math.round(((1 - z) / 2) * (K.shadeLevels - 1));
}

/** 흐르는 전구: i번째 전구 밝기 */
export function bulbLevel(index: number, time: number): number {
  const L = K.bulbChaseLength;
  const pos = (((index - time * K.bulbChaseSpeed) % L) + L) % L;
  const f = 1 - pos / L;
  return K.bulbMinAlpha + (1 - K.bulbMinAlpha) * f * f;
}

// ───────────── 목마 스프라이트 ─────────────

/**
 * 오른쪽을 보는 목마 (30x23), 앞발 하나를 든 모습. B 몸, D 그늘, M 갈기, T 꼬리, S 안장, E 눈.
 * 캐릭터(16x32)가 탈 수 있게: 몸통 길이 ≈ 캐릭터 폭 2배, 안장은 HORSE_SEAT.
 */
const HORSE: readonly string[] = [
  '........................BB....',
  '.....................MMBBBB...',
  '....................MMBBBBBB..',
  '...................MMBBBEBBBB.',
  '..................MMBBBBBBBBBB',
  '..................MMBBBBBBBBBD',
  '.................MMBBBB....DDD',
  '.................MMBBBB.......',
  '................MMBBBBB.......',
  'TT.........SSSSMMBBBBB........',
  'TTT......SSSSSSBBBBBBB........',
  '.TTBBBBBBSSSSSSBBBBBBB........',
  '..TBBBBBBBSSSSBBBBBBBBB.......',
  '..TBBBBBBBBBBBBBBBBBBBBB......',
  '...BBBBBBBBBBBBBBBBBBBBBD.....',
  '...DBBBBBBBBBBBBBBBBBBBBDDD...',
  '....DBBBBBDDDDDDDDBBBBD...DD..',
  '.....BBD..........BBD.....D...',
  '....BBD...........BD.....DD...',
  '...BBD............BD..........',
  '..BBD.............BD..........',
  '.BBD..............BD..........',
  '.DD...............DD..........',
];

/** 안장 가운데 윗면 (오른쪽 보는 스프라이트 기준, 왼쪽 위가 0,0) — 탄 사람의 엉덩이 자리 */
export const HORSE_SEAT = { x: 12, y: 9 } as const;
export const HORSE_WIDTH = HORSE[0].length;
export const HORSE_HEIGHT = HORSE.length;

/** 가까운 이웃 방식으로 줄인다 (뒤쪽 말) */
function resample(rows: readonly string[], w: number, h: number): string[] {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => rows[Math.floor((y * rows.length) / h)][Math.floor((x * rows[0].length) / w)]).join(''),
  );
}

const SMALL_HORSE = resample(HORSE, Math.round(HORSE_WIDTH * K.backScale), Math.round(HORSE_HEIGHT * K.backScale));

/** 탈 것 그림 크기 (뒤쪽은 작다) */
export function mountSize(kind: MountKind, z: number): { w: number; h: number } {
  const full = kind === 'horse' ? { w: HORSE_WIDTH, h: HORSE_HEIGHT } : { w: G.width, h: G.height };
  if (z >= 0) return full;
  return { w: Math.round(full.w * K.backScale), h: Math.round(full.h * K.backScale) };
}

/** 사람이 앉는 자리 (월드 좌표). 엉덩이를 (x, y)에 맞추고, 뒤쪽이면 같은 scale로 줄여 그린다 */
export interface Seat {
  x: number;
  y: number;
  scale: number;
}

/**
 * 이 탈 것의 자리들. 말은 안장 한 자리, 마차는 두 자리 (0 = 뒷자리, 1 = 앞자리 — 마차가 보는 방향 기준).
 * 뒤쪽으로 돌 때는 탈 것이 작아지고 좌우가 뒤집히므로 자리도 함께 옮겨진다.
 */
export function mountSeats(m: MountState): Seat[] {
  const { w, h } = mountSize(m.kind, m.z);
  const fullWidth = m.kind === 'horse' ? HORSE_WIDTH : G.width;
  const scale = w / fullWidth;
  const left = Math.round(m.x) - Math.floor(w / 2);
  const top = Math.round(m.y) - h;
  const spots = m.kind === 'horse' ? [HORSE_SEAT] : G.seats;
  return spots.map((spot) => {
    const sx = Math.round(spot.x * scale);
    return {
      x: left + (m.facing === 'right' ? sx : w - 1 - sx),
      y: top + Math.round(spot.y * scale),
      scale,
    };
  });
}

/** 자리 하나의 지금 위치 */
export function seatPosition(mount: number, slot: number, time: number): Seat {
  return mountSeats(mountState(mount, time))[slot];
}

const spriteCache = new Map<string, HTMLCanvasElement>();

function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let canvas = spriteCache.get(key);
  if (!canvas) {
    canvas = make();
    spriteCache.set(key, canvas);
  }
  return canvas;
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/** 어둡기 단계 → 밤색을 섞는 비율 */
function shadeAmount(level: number): number {
  return (level / (K.shadeLevels - 1)) * K.maxShade;
}

function horseSprite(index: number, small: boolean, facing: Facing, level: number): HTMLCanvasElement {
  return cached(`horse|${index % C.horses.length}|${index % C.saddles.length}|${small}|${facing}|${level}`, () => {
    const look = C.horses[index % C.horses.length];
    const dim = (c: string) => mixColor(c, C.shadeTarget, shadeAmount(level));
    const palette: Record<string, string> = {
      B: dim(look.body),
      D: dim(look.shade),
      M: dim(look.mane),
      T: dim(look.mane),
      S: dim(C.saddles[index % C.saddles.length]),
      E: dim(C.eye),
    };
    const rows = small ? SMALL_HORSE : HORSE;
    const [canvas, ctx] = newCanvas(rows[0].length, rows.length);
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const color = palette[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(facing === 'right' ? x : row.length - 1 - x, y, 1, 1);
      }),
    );
    return canvas;
  });
}

// ───────────── 마차 ─────────────

/** 마차 옆면 윗선 y (오른쪽 보는 그림): 뒤는 높고, 타는 가운데는 낮고, 앞은 말려 올라간다 */
export function carriageTopAt(x: number): number {
  if (x <= 9) return G.rearTopY;
  if (x <= 18) return G.rearTopY + Math.round(((x - 9) * (G.dipTopY - G.rearTopY)) / 9);
  if (x <= 27) return G.dipTopY;
  if (x <= 37) return G.dipTopY - Math.round(((x - 27) * (G.dipTopY - G.frontTopY)) / 10);
  return G.frontTopY - (x - 37);
}

/** 마차 바닥선 y: 배처럼 양 끝이 살짝 올라간다 */
function carriageBottomAt(x: number): number {
  return G.bottomY - Math.round(3 * ((x - 22) / 20) ** 4);
}

type CarriageLayer = 'back' | 'front';

/** 뒤판: 안쪽 벽, 빨간 벨벳 등받이와 방석 — 사람보다 먼저 그린다 */
function paintCarriageBack(ctx: CanvasRenderingContext2D): void {
  const P = C.carriage;
  ctx.fillStyle = P.inside;
  for (let x = 5; x <= 40; x++) ctx.fillRect(x, carriageTopAt(x) - 1, 1, G.seats[0].y + 2 - carriageTopAt(x));
  ctx.fillStyle = P.velvet;
  ctx.fillRect(9, G.seats[0].y, 11, 2);
  ctx.fillRect(25, G.seats[1].y, 12, 2);
  for (const b of G.backrests) {
    ctx.fillStyle = P.velvet;
    ctx.fillRect(b.x, b.top + 1, b.w, G.seats[0].y - b.top);
    ctx.fillRect(b.x + 1, b.top, b.w - 2, 1);
    ctx.fillStyle = P.velvetShade;
    ctx.fillRect(b.x + b.w - 1, b.top + 1, 1, G.seats[0].y - b.top);
    // 등받이 금 테두리와 단추
    ctx.fillStyle = C.gold;
    ctx.fillRect(b.x, b.top, 1, 1);
    ctx.fillRect(b.x + b.w - 1, b.top, 1, 1);
    ctx.fillRect(b.x + Math.floor(b.w / 2), b.top + 3, 1, 1);
  }
}

/** 옆면: 크림색 몸통에 금색 곡선 테두리, 앞쪽 둥글게 말린 장식, 금 바퀴 — 사람보다 나중에 그려 다리를 가린다 */
function paintCarriageFront(ctx: CanvasRenderingContext2D): void {
  const P = C.carriage;
  for (let x = 3; x <= 41; x++) {
    const top = carriageTopAt(x);
    const bottom = carriageBottomAt(x);
    ctx.fillStyle = P.body;
    ctx.fillRect(x, top, 1, bottom - top + 1);
    ctx.fillStyle = P.bodyShade;
    ctx.fillRect(x, bottom - 2, 1, 2);
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, top, 1, 1);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(x, bottom, 1, 1);
    // 옆면 가운데를 흐르는 금색 곡선
    if (x >= 7 && x <= 37) {
      ctx.fillStyle = C.gold;
      ctx.fillRect(x, Math.round((top + bottom) / 2 + 1 + 1.4 * Math.sin((x - 7) / 4.5)), 1, 1);
    }
  }
  // 앞쪽 둥글게 말린 장식 (금 고리 + 가운데 점), 뒤쪽 작은 말림
  ctx.fillStyle = C.gold;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d >= 1.5 && d <= 2.5 && !(dx < 0 && dy > 0)) ctx.fillRect(G.scrollX + dx, G.scrollY + dy, 1, 1);
    }
  }
  ctx.fillRect(G.scrollX, G.scrollY, 1, 1);
  ctx.fillRect(2, G.rearTopY - 1, 1, 2);
  ctx.fillRect(1, G.rearTopY - 3, 1, 2);
  ctx.fillRect(2, G.rearTopY - 4, 2, 1);
  // 바퀴 축과 금 바퀴
  ctx.fillStyle = P.under;
  ctx.fillRect(G.wheelXs[0] - 2, G.bottomY + 1, G.wheelXs[1] - G.wheelXs[0] + 5, 1);
  for (const wx of G.wheelXs) {
    for (let dy = -G.wheelRadius; dy <= G.wheelRadius; dy++) {
      for (let dx = -G.wheelRadius; dx <= G.wheelRadius; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > G.wheelRadius + 0.4) continue;
        ctx.fillStyle = d >= G.wheelRadius - 0.9 ? C.gold : dx === 0 || dy === 0 ? C.goldShade : P.under;
        ctx.fillRect(wx + dx, G.wheelY + dy, 1, 1);
      }
    }
  }
}

function carriageSprite(layer: CarriageLayer, small: boolean, facing: Facing, level: number): HTMLCanvasElement {
  return cached(`carriage|${layer}|${small}|${facing}|${level}`, () => {
    const [full, fullCtx] = newCanvas(G.width, G.height);
    if (layer === 'back') paintCarriageBack(fullCtx);
    else paintCarriageFront(fullCtx);
    const { w, h } = mountSize('carriage', small ? -1 : 1);
    const [canvas, ctx] = newCanvas(w, h);
    if (facing === 'left') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(full, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    darken(ctx, w, h, level);
    return canvas;
  });
}

/** 이미 그린 부분만 밤색으로 덮어 어둡게 한다 (뒤쪽으로 갈수록) */
function darken(ctx: CanvasRenderingContext2D, w: number, h: number, level: number): void {
  if (level <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = shadeAmount(level);
  ctx.fillStyle = C.shadeTarget;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ───────────── 탄 사람 ─────────────

/** 회전목마에 탄 사람 한 명 (그릴 때 필요한 것만) */
export interface RiderView {
  mount: number;
  slot: number;
  outfit: OutfitName;
  /** 손을 흔드는 중인가 */
  waving: boolean;
  /** 손 흔들 때 볼 방향 (옆자리 사람 쪽). 없으면 탈 것이 가는 방향 */
  lookAt: Facing | null;
}

/** 탄 사람 그림: 탈 것과 같은 크기·밝기로 미리 만들어 둔다 */
function riderSprite(pose: PoseName, frame: number, facing: Facing, outfit: OutfitName, small: boolean, level: number): HTMLCanvasElement {
  return cached(`rider|${pose}|${frame}|${facing}|${outfit}|${small}|${level}`, () => {
    const source = getSpriteCanvas(pose, frame, facing, outfit);
    const scale = small ? K.backScale : 1;
    const w = Math.round(CHARACTER.spriteWidth * scale);
    const h = Math.round(CHARACTER.spriteHeight * scale);
    const [canvas, ctx] = newCanvas(w, h);
    ctx.drawImage(source, 0, 0, w, h);
    darken(ctx, w, h, level);
    return canvas;
  });
}

// ───────────── 미리 그리기 ─────────────

function paintPlatform(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number): void {
  const ry = K.platformRadiusY;
  // 앞 테두리 (나무 + 위아래 금선)
  for (let dx = -rx; dx < rx; dx++) {
    const edge = cy + Math.round(ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));
    ctx.fillStyle = C.rim;
    ctx.fillRect(cx + dx, edge, 1, K.rimHeight);
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx + dx, edge, 1, 1);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(cx + dx, edge + K.rimHeight - 1, 1, 1);
  }
  // 윗면 나무 판
  ctx.fillStyle = C.platformTop;
  fillPixelEllipse(ctx, cx, cy, rx, ry);
  ctx.fillStyle = C.plank;
  for (let dy = -ry + 2; dy < ry; dy += 3) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2)) - 2;
    if (half > 0) ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

function paintPole(ctx: CanvasRenderingContext2D, cx: number, top: number, bottom: number): void {
  const half = K.poleHalfWidth;
  for (let x = -half; x < half; x++) {
    ctx.fillStyle = Math.floor((x + half) / 3) % 2 === 0 ? C.mirror : C.mirrorDark;
    ctx.fillRect(cx + x, top, 1, bottom - top);
  }
  for (let y = top + 2; y < bottom; y += K.poleBandEvery) {
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx - half - 1, y, half * 2 + 2, 2);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(cx - half - 1, y + 2, half * 2 + 2, 1);
  }
}

/** 난간이 서는 타원 (판 가장자리에서 조금 안쪽) */
export function railEllipse(): { rx: number; ry: number } {
  return { rx: carouselGeometry().platformRadiusX - RAIL.insetX, ry: K.platformRadiusY - RAIL.insetY };
}

/** 가운데에서 dx 떨어진 곳의 난간 바닥 y (판 가운데 기준). front = 앞쪽 절반인가 */
export function railBaseAt(dx: number, front: boolean): number {
  const { rx, ry } = railEllipse();
  const reach = Math.round(ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)));
  return front ? reach : -reach;
}

/** 앞쪽 난간이 입구로 끊긴 곳인가 */
export function inRailGap(dx: number): boolean {
  return Math.abs(dx) < RAIL.gapWidth / 2;
}

/**
 * 낮은 금색 난간 절반 (기둥 사이에 가로대 2줄). 뒤쪽 절반은 탈 것 뒤에, 앞쪽 절반은 탈 것 앞에 그린다.
 * 앞쪽은 가운데가 입구로 끊겨 있고, 끊긴 자리 양옆 기둥은 조금 더 솟아 금 구슬을 얹는다.
 * 버퍼 원점 = (판 가운데 - rx - 1, 판 가운데 - ry - 높이 - 솟는 높이 - 2)
 */
function paintRail(ctx: CanvasRenderingContext2D, front: boolean): void {
  const { rx, ry } = railEllipse();
  const cx = rx + 1;
  const cy = ry + RAIL.height + RAIL.gapPostRise + 2;
  const shade = (c: string) => (front ? c : mixColor(c, C.shadeTarget, RAIL.backShade));
  const gapEdge = Math.ceil(RAIL.gapWidth / 2);
  for (let dx = -rx; dx <= rx; dx++) {
    if (front && inRailGap(dx)) continue;
    const base = cy + railBaseAt(dx, front);
    const newel = front && Math.abs(dx) === gapEdge;
    if (newel || (dx + rx) % RAIL.postEvery === 0) {
      const rise = newel ? RAIL.gapPostRise : 0;
      ctx.fillStyle = shade(C.goldShade);
      ctx.fillRect(cx + dx, base - RAIL.height - rise + 1, 1, RAIL.height + rise);
      if (newel) {
        ctx.fillStyle = shade(C.gold);
        ctx.fillRect(cx + dx - 1, base - RAIL.height - rise - 1, 3, 2);
      }
      continue;
    }
    ctx.fillStyle = shade(C.gold);
    for (const above of RAIL.railsAbove) ctx.fillRect(cx + dx, base - above, 1, 1);
  }
}

const S = K.roofSnow;

/** 0~1 고정 무작위 (같은 자리는 늘 같은 값) */
function snowHash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** 지붕 버퍼에서 dx 열의 눈이 끝나는 y (꼭대기 눈 모자와 윗선에 얹힌 눈 중 더 아래쪽). colTop = 그 열의 지붕 윗선 */
export function roofSnowEnd(dx: number, colTop: number): number {
  const wobble = Math.sin(dx * 0.11) * 0.6 + Math.sin(dx * 0.37 + 1.3) * 0.4;
  const cap = Math.round(K.roofHeight * (S.capRatio + S.capWobble * wobble));
  const rim = colTop + S.rimThickness - (snowHash(dx, 7) < 0.3 ? 1 : 0);
  return Math.max(cap, rim);
}

/** 처마 바로 위에 쌓인 눈 둔덕 높이 (0이면 없음) */
export function roofSnowEave(dx: number): number {
  const lump = Math.sin(dx * 0.19 + 0.7) * 0.6 + Math.sin(dx * 0.53) * 0.4;
  return Math.max(0, Math.round(lump * S.eaveMax));
}

/** 지붕 한 장 (phaseIndex번째 회전 모습). 버퍼 y 0 = 꼭대기 */
function paintRoof(ctx: CanvasRenderingContext2D, phaseIndex: number): void {
  const R = K.roofHalfWidth;
  const ox = R + 1;
  const stripeAngle = (Math.PI * 2) / K.stripeCount;
  const phase = (phaseIndex / K.roofFrames) * stripeAngle * 2;
  for (let dx = -R; dx <= R; dx++) {
    const a = Math.abs(dx) / R;
    const colTop = Math.round(K.roofHeight * a ** (1 / K.roofCurve));
    const colBottom = K.roofHeight + Math.round(K.roofSag * (1 - a * a));
    for (let y = colTop; y < colBottom; y++) {
      const t = Math.min(1, Math.max(0.001, y / K.roofHeight));
      const halfW = R * t ** K.roofCurve;
      const u = Math.max(-1, Math.min(1, dx / halfW));
      const stripe = Math.floor((Math.asin(u) - phase) / stripeAngle);
      const edge = Math.abs(u) > K.roofEdgeShade;
      const even = ((stripe % 2) + 2) % 2 === 0;
      ctx.fillStyle = even ? (edge ? C.stripeAShade : C.stripeA) : edge ? C.stripeBShade : C.stripeB;
      ctx.fillRect(ox + dx, y, 1, 1);
    }
    // 쌓인 눈: 꼭대기를 덮는 눈 모자 + 윗선을 따라 얹힌 눈 (줄무늬와 달리 돌아도 모양이 같다)
    const snowEnd = Math.min(colBottom, roofSnowEnd(dx, colTop));
    ctx.fillStyle = C.roofSnow;
    ctx.fillRect(ox + dx, colTop, 1, snowEnd - colTop);
    ctx.fillStyle = C.roofSnowShade;
    ctx.fillRect(ox + dx, snowEnd - 1, 1, 1);
    // 처마 위에 군데군데 쌓인 눈 둔덕
    const eave = roofSnowEave(dx);
    if (eave > 0 && colBottom - eave >= snowEnd) {
      ctx.fillStyle = C.roofSnow;
      ctx.fillRect(ox + dx, colBottom - eave, 1, eave);
    }
    // 사이사이 눈 얼룩
    ctx.fillStyle = C.roofSnow;
    for (let y = snowEnd + 1; y < colBottom - eave; y++) {
      if (snowHash(dx, y) < S.fleckChance) ctx.fillRect(ox + dx, y, 1, 1);
    }
    // 금색 장식 띠
    ctx.fillStyle = C.gold;
    ctx.fillRect(ox + dx, colBottom, 1, K.goldBandHeight - 1);
    ctx.fillStyle = C.goldShade;
    ctx.fillRect(ox + dx, colBottom + K.goldBandHeight - 1, 1, 1);
    // 반원 술 장식 (빨강·크림 번갈아)
    const w = K.scallopWidth;
    const scallop = Math.floor((dx + R) / w);
    const local = ((dx + R) % w) - w / 2 + 0.5;
    for (let r = 0; r < K.valanceHeight; r++) {
      const half = (w / 2) * Math.sqrt(1 - (r / K.valanceHeight) ** 2);
      if (Math.abs(local) > half) continue;
      ctx.fillStyle = scallop % 2 === 0 ? C.stripeB : C.stripeA;
      ctx.fillRect(ox + dx, colBottom + K.goldBandHeight + r, 1, 1);
    }
  }
  // 꼭대기 금 장식
  ctx.fillStyle = C.gold;
  ctx.fillRect(ox - 1, 0, 3, 2);
}

// ───────────── 회전목마 소품 ─────────────

export interface CarouselProp extends DepthDrawable {
  update(dt: number): void;
  /** 회전목마가 돌아간 시간 (탈 것 위치는 이 시간으로 정해진다) */
  time(): number;
  /** 지금 타고 있는 사람들 (매 프레임 넘긴다) */
  setRiders(riders: readonly RiderView[]): void;
  /** 주변 바닥에 번지는 불빛 (시설보다 먼저, 바닥 위에 그린다) */
  drawFloorGlow(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

export function createCarousel(): CarouselProp {
  const g = carouselGeometry();
  const R = K.roofHalfWidth;
  const platformBuffer = lazyBuffer(g.platformRadiusX * 2 + 2, K.platformRadiusY * 2 + K.rimHeight + 1, (ctx) =>
    paintPlatform(ctx, g.platformRadiusX + 1, K.platformRadiusY, g.platformRadiusX),
  );
  const poleTop = roofBottomAt(0);
  const poleBuffer = lazyBuffer(K.poleHalfWidth * 2 + 2, g.platformY - poleTop, (ctx) =>
    paintPole(ctx, K.poleHalfWidth + 1, 0, g.platformY - poleTop),
  );
  const roofBufferHeight = K.roofHeight + K.roofSag + K.goldBandHeight + K.valanceHeight + 1;
  const roofFrames: (() => PixelBuffer)[] = Array.from({ length: K.roofFrames }, (_, k) =>
    lazyBuffer(R * 2 + 3, roofBufferHeight, (ctx) => paintRoof(ctx, k)),
  );
  const rail = railEllipse();
  const railHeight = rail.ry * 2 + RAIL.height + RAIL.gapPostRise + 4;
  const railBack = lazyBuffer(rail.rx * 2 + 3, railHeight, (ctx) => paintRail(ctx, false));
  const railFront = lazyBuffer(rail.rx * 2 + 3, railHeight, (ctx) => paintRail(ctx, true));
  const railLeft = -rail.rx - 1;
  const railTop = g.platformY - rail.ry - RAIL.height - RAIL.gapPostRise - 2;
  const bulbCount = Math.floor((R * 2) / K.bulbSpacing);
  let time = 0;
  let riders: readonly RiderView[] = [];

  /** 탄 사람 한 명: 엉덩이를 자리에 맞춰, 탈 것과 같은 크기·밝기로 */
  const drawRider = (ctx: CanvasRenderingContext2D, rider: RiderView, m: MountState, seat: Seat, ox: number) => {
    const base: PoseName = m.kind === 'horse' ? 'ride' : 'sit';
    const pose: PoseName = rider.waving ? (`${base}Wave` as PoseName) : base;
    const frame = rider.waving ? Math.floor(time / K.waveFrameDuration) % POSES[pose].length : 0;
    const facing = rider.waving && rider.lookAt ? rider.lookAt : m.facing;
    const sprite = riderSprite(pose, frame, facing, rider.outfit, m.z < 0, shadeLevel(m.z));
    ctx.drawImage(sprite, seat.x - Math.floor(sprite.width / 2) - ox, seat.y - Math.round(K.riderAboveSeat * seat.scale));
  };

  const drawMount = (ctx: CanvasRenderingContext2D, m: MountState, ox: number) => {
    const level = shadeLevel(m.z);
    const x = Math.round(m.x) - ox;
    const seats = mountSeats(m);
    const mine = riders.filter((r) => r.mount === m.index);

    if (m.kind === 'horse') {
      // 금 막대: 지붕 술 장식 아래부터 판 윗면까지
      const rodTop = roofBottomAt(m.x - CAROUSEL_X) + K.goldBandHeight + K.valanceHeight;
      const rodBottom = g.platformY + Math.round(m.z * K.platformRadiusY * 0.7);
      ctx.fillStyle = mixColor(C.gold, C.shadeTarget, shadeAmount(level));
      ctx.fillRect(x, rodTop, 1, rodBottom - rodTop);
      const sprite = horseSprite(m.index, m.z < 0, m.facing, level);
      ctx.drawImage(sprite, x - Math.floor(sprite.width / 2), Math.round(m.y) - sprite.height);
      for (const rider of mine) drawRider(ctx, rider, m, seats[rider.slot], ox);
      return;
    }

    // 마차: 뒤판 → 탄 사람(화면에서 뒤에 있는 사람부터) → 옆면
    const back = carriageSprite('back', m.z < 0, m.facing, level);
    const left = x - Math.floor(back.width / 2);
    const top = Math.round(m.y) - back.height;
    ctx.drawImage(back, left, top);
    const ordered = [...mine].sort((a, b) => riderDepth(m, a.slot) - riderDepth(m, b.slot));
    for (const rider of ordered) drawRider(ctx, rider, m, seats[rider.slot], ox);
    ctx.drawImage(carriageSprite('front', m.z < 0, m.facing, level), left, top);
  };

  return {
    footY: g.rimBottom,
    update(dt: number) {
      time += dt;
    },
    time: () => time,
    setRiders(next: readonly RiderView[]) {
      riders = next;
    },
    drawFloorGlow(ctx: CanvasRenderingContext2D, camera: Camera) {
      const cx = CAROUSEL_X - layerOffsetX(camera, LAYER_FACTORS.main);
      const pulse = 1 - K.floorGlowPulse * (0.5 + 0.5 * Math.sin((Math.PI * 2 * time) / K.floorGlowPeriod));
      ctx.save();
      ctx.fillStyle = C.floorGlow;
      ctx.globalAlpha = (K.floorGlowAlpha * pulse) / K.floorGlowRings;
      for (let i = 0; i < K.floorGlowRings; i++) {
        const f = (K.floorGlowRings - i) / K.floorGlowRings;
        fillPixelEllipse(ctx, cx, g.rimBottom - 2, Math.round(K.floorGlowRadiusX * f), Math.round(K.floorGlowRadiusY * f));
      }
      ctx.restore();
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const cx = CAROUSEL_X - ox;
      if (cx + R + 2 < 0 || cx - R - 2 > SCREEN_WIDTH) return;
      const mounts = mountStates(time);

      // 난간: 뒤쪽 절반 → 뒤쪽 탈 것 → 기둥 → 앞쪽 탈 것 → 앞쪽 절반 (입구만 끊김)
      ctx.drawImage(platformBuffer().canvas, cx - g.platformRadiusX - 1, g.platformY - K.platformRadiusY);
      ctx.drawImage(railBack().canvas, cx + railLeft, railTop);
      for (const m of mounts) if (m.z < 0) drawMount(ctx, m, ox);
      ctx.drawImage(poleBuffer().canvas, cx - K.poleHalfWidth - 1, poleTop);
      for (const m of mounts) if (m.z >= 0) drawMount(ctx, m, ox);
      ctx.drawImage(railFront().canvas, cx + railLeft, railTop);

      // 지붕: 탈 것과 같은 속도로 도는 줄무늬
      const stripeSpan = ((Math.PI * 2) / K.stripeCount) * 2;
      const turned = (((Math.PI * 2) / K.rotationPeriod) * time) % stripeSpan;
      const frame = Math.floor((turned / stripeSpan) * K.roofFrames) % K.roofFrames;
      ctx.drawImage(roofFrames[frame]().canvas, cx - R - 1, g.apexY);

      // 금 띠 위 전구: 한 방향으로 흐르듯 차례로 밝아진다
      ctx.save();
      for (let i = 0; i < bulbCount; i++) {
        const dx = -R + Math.floor(K.bulbSpacing / 2) + i * K.bulbSpacing;
        const y = roofBottomAt(dx);
        const level = bulbLevel(i, time);
        ctx.globalAlpha = K.bulbGlowAlpha * level;
        ctx.fillStyle = C.bulbGlow;
        ctx.fillRect(cx + dx - 1, y - 1, 3, 3);
        ctx.globalAlpha = level;
        ctx.fillStyle = C.bulb;
        ctx.fillRect(cx + dx, y, 1, 1);
      }
      ctx.restore();

      // 꼭대기 작은 깃발 (펄럭이는 2장)
      const poleTopY = g.apexY - K.flagPoleHeight;
      ctx.fillStyle = C.gold;
      ctx.fillRect(cx, poleTopY, 1, K.flagPoleHeight);
      ctx.fillStyle = C.flag;
      const wave = Math.floor(time / K.flagWavePeriod) % 2;
      for (let x = 0; x < K.flagWidth; x++) {
        const h = Math.max(1, Math.round(K.flagHeight * (1 - x / K.flagWidth)));
        const lift = wave === 1 && x > K.flagWidth / 2 ? 1 : 0;
        ctx.fillRect(cx + 1 + x, poleTopY + Math.floor((K.flagHeight - h) / 2) + lift, 1, h);
      }
    },
  };
}

/**
 * 마차에 탄 두 사람 가운데 누가 화면에서 더 앞인가 (클수록 앞 = 나중에 그린다).
 * 마차가 돌면서 진행 방향 쪽 자리가 보는 사람에게서 멀어졌다 가까워졌다 한다:
 * 왼쪽에서 다가올 때(각도 < 0)는 앞자리가 더 가깝고, 지나간 뒤에는 뒷자리가 더 가깝다.
 */
export function riderDepth(m: MountState, slot: number): number {
  const frontSeatNearer = m.angle < 0;
  return (slot === 1) === frontSeatNearer ? 1 : 0;
}
