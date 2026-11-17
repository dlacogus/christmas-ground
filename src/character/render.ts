// 스프라이트를 캔버스에 굽고(캐시) 그린다.

import { CHARACTER, CHARACTER_BASE_PALETTE, COLORS, OUTFITS, type OutfitName } from '../constants';
import { drawPuffs } from './breath';
import { getCharacterFrame, type Character } from './character';
import { getFrame, type Facing, type PoseName } from './sprites';

export function buildPalette(outfit: OutfitName): Record<string, string> {
  const colors = OUTFITS[outfit];
  return {
    ...CHARACTER_BASE_PALETTE,
    O: colors.coat,
    o: colors.coatShade,
    M: colors.scarf,
    m: colors.scarfShade,
  };
}

const cache = new Map<string, HTMLCanvasElement>();

/** 한 프레임을 1배 크기 캔버스로 구워 둔다 */
export function getSpriteCanvas(pose: PoseName, index: number, facing: Facing, outfit: OutfitName): HTMLCanvasElement {
  const key = `${outfit}|${pose}|${index}|${facing}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const rows = getFrame(pose, index, facing);
  const palette = buildPalette(outfit);
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER.spriteWidth;
  canvas.height = CHARACTER.spriteHeight;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  cache.set(key, canvas);
  return canvas;
}

/** 발밑 (x, y) 기준으로 그림자 → 캐릭터 → 입김 순서로 그린다 */
export function drawCharacter(ctx: CanvasRenderingContext2D, ch: Character, offsetX: number): void {
  const footX = Math.round(ch.x) - offsetX;
  const footY = Math.round(ch.y);

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

  const { pose, index } = getCharacterFrame(ch);
  const sprite = getSpriteCanvas(pose, index, ch.facing, ch.outfit);
  ctx.drawImage(sprite, footX - CHARACTER.spriteWidth / 2, footY - CHARACTER.spriteHeight);

  drawPuffs(ctx, ch.puffs, offsetX);
}
