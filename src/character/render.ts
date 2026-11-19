// 스프라이트를 캔버스에 굽고(캐시) 그린다.

import { CHARACTER, CHARACTER_BASE_PALETTE, COLORS, HAT_CHASE, OUTFITS, type OutfitName } from '../constants';
import { drawPuffs } from './breath';
import { getCharacterFrame, type Character } from './character';
import { HAT_ROWS, getFrame, type Facing, type PoseName } from './sprites';
import type { ExtraHat } from './state';

/** 털모자 그림(HAT_ROWS)이 스프라이트에서 시작하는 칸 */
const HAT_COLUMN = 2;

/** 털모자 색: 목도리 색 번호(0~5)와 같은 색, null이면 기본 빨강 */
export function hatColors(hatColor: number | null): { H: string; h: string } {
  if (hatColor === null) return { H: CHARACTER_BASE_PALETTE.H, h: CHARACTER_BASE_PALETTE.h };
  const colors = OUTFITS[`scarf${hatColor}` as OutfitName] ?? OUTFITS.scarf1;
  return { H: colors.scarf, h: colors.scarfShade };
}

export function buildPalette(outfit: OutfitName, hatColor: number | null = null): Record<string, string> {
  const colors = OUTFITS[outfit];
  return {
    ...CHARACTER_BASE_PALETTE,
    O: colors.coat,
    o: colors.coatShade,
    M: colors.scarf,
    m: colors.scarfShade,
    ...hatColors(hatColor),
  };
}

const cache = new Map<string, HTMLCanvasElement>();

/** 한 프레임을 1배 크기 캔버스로 구워 둔다 */
export function getSpriteCanvas(
  pose: PoseName,
  index: number,
  facing: Facing,
  outfit: OutfitName,
  bald = false,
  eyesClosed = false,
  hatColor: number | null = null,
): HTMLCanvasElement {
  const key = `${outfit}|${pose}|${index}|${facing}|${bald}|${eyesClosed}|${hatColor}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const rows = getFrame(pose, index, facing, bald);
  const palette = buildPalette(outfit, hatColor);
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER.spriteWidth;
  canvas.height = CHARACTER.spriteHeight;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      let color = palette[ch];
      if (!color) return;
      // 눈을 감으면: 세로 2px 눈의 윗칸을 피부색으로 덮어 가는 줄만 남긴다
      if (eyesClosed && ch === 'E' && rows[y + 1]?.[x] === 'E') color = palette.S;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  cache.set(key, canvas);
  return canvas;
}

/**
 * 머리 모습: 대머리인가, 머리에 바로 얹힌 모자 색, 그 위로 쌓인 모자들.
 * 내 모자를 쓰고 있으면 그게 맨 아래, 아니면 주워 쓴 남의 모자 가운데 맨 아래 것이 머리에 바로 얹힌다.
 */
export function headLook(ch: Character): { bald: boolean; color: number | null; above: readonly ExtraHat[] } {
  const extras = ch.extraHats;
  if (ch.hat.get() === 'on') return { bald: false, color: ch.hatColor, above: extras };
  if (extras.length === 0) return { bald: true, color: ch.hatColor, above: extras };
  return { bald: false, color: extras[0].color, above: extras.slice(1) };
}

const hatCanvases = new Map<number | null, HTMLCanvasElement>();

/** 털모자 하나 (방울·모자·띠) 그림을 색마다 한 번 그려 둔다 */
export function hatCanvas(color: number | null): HTMLCanvasElement {
  let canvas = hatCanvases.get(color);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = HAT_ROWS[0].length;
  canvas.height = HAT_ROWS.length;
  const ctx = canvas.getContext('2d')!;
  const palette: Record<string, string> = { ...CHARACTER_BASE_PALETTE, ...hatColors(color) };
  HAT_ROWS.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const fill = palette[c];
      if (!fill) return;
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  hatCanvases.set(color, canvas);
  return canvas;
}

const topRows = new Map<string, number>();

/** 이 프레임에서 머리 꼭대기(방울)가 있는 줄 */
function headTopRow(pose: PoseName, index: number, facing: Facing): number {
  const key = `${pose}|${index}|${facing}`;
  let row = topRows.get(key);
  if (row === undefined) {
    row = Math.max(0, getFrame(pose, index, facing).findIndex((r) => r.includes('P')));
    topRows.set(key, row);
  }
  return row;
}

/** 머리 위로 쌓인 모자들 (아래 → 위). 걸을 때 위로 갈수록 크게 흔들흔들 */
function drawHatStack(ctx: CanvasRenderingContext2D, hats: readonly ExtraHat[], left: number, headTop: number, moving: boolean, time: number): void {
  for (let k = 1; k <= hats.length; k++) {
    const sway = moving ? Math.round(Math.sin(time * HAT_CHASE.swayHz * Math.PI * 2 + k * 0.9) * HAT_CHASE.swayPerLevel * k) : 0;
    ctx.drawImage(hatCanvas(hats[k - 1].color), left + HAT_COLUMN + sway, headTop - k * HAT_CHASE.stackStep);
  }
}

/** 그리는 방법을 바꿀 때 (스케이트·벤치 등) */
export interface DrawOptions {
  /** 자세와 프레임 (없으면 걷기/서기) */
  pose?: PoseName;
  index?: number;
  facing?: Facing;
  /** 몸을 발밑보다 이만큼 위에 그린다 (점프, 앉기). 그림자는 발밑에 남는다 */
  lift?: number;
  /** 윗몸을 이만큼 옆으로 기울인다 (+ = 오른쪽) */
  lean?: number;
  shadow?: boolean;
  /** 바닥에 드러눕는다 (1 = 머리가 오른쪽, -1 = 왼쪽) — 떼쓰기 */
  lie?: number;
}

/** 윗몸만 기울여 그리는 줄 범위: [시작 줄, 끝 줄, 기우는 비율] (머리는 많이, 허리는 반만) */
const LEAN_SLICES: readonly [number, number, number][] = [
  [0, 16, 1],
  [16, 24, 0.5],
  [24, CHARACTER.spriteHeight, 0],
];

/** 스프라이트를 윗몸만 기울여 찍는다 */
export function drawLeaning(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, left: number, top: number, lean: number): void {
  if (lean === 0) {
    ctx.drawImage(sprite, left, top);
    return;
  }
  const W = CHARACTER.spriteWidth;
  for (const [from, to, ratio] of LEAN_SLICES) {
    ctx.drawImage(sprite, 0, from, W, to - from, left + Math.round(lean * ratio), top + from, W, to - from);
  }
}

/** 발밑 (x, y) 기준으로 그림자 → 캐릭터 → 입김 순서로 그린다 */
export function drawCharacter(ctx: CanvasRenderingContext2D, ch: Character, offsetX: number, options: DrawOptions = {}): void {
  const footX = Math.round(ch.x) - offsetX;
  const footY = Math.round(ch.y);

  if (options.shadow !== false) {
    ctx.save();
    ctx.globalAlpha = CHARACTER.shadowAlpha;
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(
      footX - CHARACTER.shadowWidth / 2,
      footY - CHARACTER.shadowHeight / 2,
      CHARACTER.shadowWidth,
      CHARACTER.shadowHeight,
    );
    ctx.restore();
  }

  const frame = options.pose ? { pose: options.pose, index: options.index ?? 0 } : getCharacterFrame(ch);
  const facing = options.facing ?? ch.facing;
  // 모자가 벗겨져 있으면 대머리 (주워 쓴 남의 모자가 있으면 그게 머리에 얹힌다)
  const look = headLook(ch);
  const sprite = getSpriteCanvas(frame.pose, frame.index, facing, ch.outfit, look.bald, ch.eyesClosed, look.color);
  const lift = Math.round(options.lift ?? 0);
  const left = footX - CHARACTER.spriteWidth / 2;
  const top = footY - CHARACTER.spriteHeight - lift;
  if (options.lie) {
    // 바닥에 드러눕기: 발밑을 기준으로 90° 돌려 눕힌다
    ctx.save();
    ctx.translate(footX, footY - CHARACTER.spriteWidth / 2);
    ctx.rotate((options.lie > 0 ? 1 : -1) * (Math.PI / 2));
    ctx.drawImage(sprite, -CHARACTER.spriteWidth / 2, -CHARACTER.spriteHeight + CHARACTER.spriteWidth / 2);
    ctx.restore();
  } else {
    const lean = (options.lean ?? 0) + ch.lean;
    drawLeaning(ctx, sprite, left, top, lean);
    if (look.above.length > 0) drawHatStack(ctx, look.above, left + lean, top + headTopRow(frame.pose, frame.index, facing), ch.moving, ch.animTime);
  }

  drawPuffs(ctx, ch.puffs, offsetX);
}
