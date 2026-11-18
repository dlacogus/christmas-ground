// 스프라이트를 캔버스에 굽고(캐시) 그린다.

import { CHARACTER, CHARACTER_BASE_PALETTE, COLORS, OUTFITS, type OutfitName } from '../constants';
import { drawPuffs } from './breath';
import { getCharacterFrame, type Character } from './character';
import { getFrame, type Facing, type PoseName } from './sprites';

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
  // 모자가 벗겨져 있으면 대머리
  const sprite = getSpriteCanvas(frame.pose, frame.index, options.facing ?? ch.facing, ch.outfit, ch.hat.get() !== 'on', ch.eyesClosed, ch.hatColor);
  const lift = Math.round(options.lift ?? 0);
  drawLeaning(ctx, sprite, footX - CHARACTER.spriteWidth / 2, footY - CHARACTER.spriteHeight - lift, (options.lean ?? 0) + ch.lean);

  drawPuffs(ctx, ch.puffs, offsetX);
}
