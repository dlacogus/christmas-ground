// ?sprites=1 — 모든 자세를 4배로 확대해 격자로 보여주는 확인 화면.

import { getSpriteCanvas } from './character/render';
import { POSES, type Facing, type PoseName } from './character/sprites';
import { CHARACTER, COLORS, DEFAULT_OUTFIT, OUTFITS, SKATERS, SPRITE_SHEET, type OutfitName } from './constants';
import { fitCanvasToWindow, frameDt } from './screen';

interface Cell {
  label: string;
  sprite(time: number): HTMLCanvasElement;
}

const POSE_LABELS: Record<PoseName, string> = {
  idle: '서기',
  walk: '걷기',
  glide: '미끄럼',
  skateGlide: '글라이드',
  crouch: '쪼그림',
  ride: '말 타기',
  rideWave: '말·손',
  sit: '마차',
  sitWave: '마차·손',
};
const FACING_LABELS: Record<Facing, string> = { right: '→', left: '←' };

function poseCells(facing: Facing, bald = false): Cell[] {
  return (Object.keys(POSES) as PoseName[]).flatMap((pose) =>
    POSES[pose].map((_, i) => ({
      label: `${bald ? '대머리 ' : FACING_LABELS[facing] + ' '}${POSE_LABELS[pose]} ${i + 1}`,
      sprite: () => getSpriteCanvas(pose, i, facing, DEFAULT_OUTFIT, bald),
    })),
  );
}

function animatedCell(pose: PoseName, frameDuration: number, outfit: OutfitName): Cell {
  return {
    label: `${POSE_LABELS[pose]} (움직임)`,
    sprite: (time) => getSpriteCanvas(pose, Math.floor(time / frameDuration) % POSES[pose].length, 'right', outfit),
  };
}

export function startSpriteSheet(canvas: HTMLCanvasElement): void {
  const { scale, columns, padding, labelHeight, titleHeight } = SPRITE_SHEET;
  const cellW = CHARACTER.spriteWidth * scale;
  const cellH = CHARACTER.spriteHeight * scale;

  const outfitCells: Cell[] = (Object.keys(OUTFITS) as OutfitName[]).map((outfit) => ({
    label: `옷: ${outfit}`,
    sprite: () => getSpriteCanvas('idle', 0, 'right', outfit),
  }));
  const rows: Cell[][] = [
    poseCells('right'),
    poseCells('left'),
    poseCells('right', true),
    [
      ...outfitCells,
      animatedCell('idle', CHARACTER.idleFrameDuration, DEFAULT_OUTFIT),
      animatedCell('walk', CHARACTER.walkFrameDuration, DEFAULT_OUTFIT),
      animatedCell('glide', SKATERS.glideFrameDuration, SKATERS.list[0].outfit),
    ],
  ];

  const rowHeight = labelHeight + cellH + padding;
  canvas.width = padding + columns * (cellW + padding);
  canvas.height = titleHeight + padding + rows.length * rowHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  fitCanvasToWindow(canvas, canvas.width, canvas.height);

  let time = 0;
  let last = performance.now();
  const frame = (now: number) => {
    time += frameDt(now, last);
    last = now;

    ctx.fillStyle = COLORS.sheetBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = SPRITE_SHEET.font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.sheetLabel;
    ctx.fillText(`스프라이트 확인 (${scale}배)`, padding, padding);

    rows.forEach((row, r) => {
      const top = titleHeight + padding + r * rowHeight;
      row.forEach((cell, c) => {
        const left = padding + c * (cellW + padding);
        ctx.fillStyle = COLORS.sheetLabel;
        ctx.fillText(cell.label, left, top);

        const y = top + labelHeight;
        ctx.fillStyle = COLORS.sheetCell;
        ctx.fillRect(left, y, cellW, cellH);
        // 픽셀 격자
        ctx.fillStyle = COLORS.sheetGrid;
        for (let gx = scale; gx < cellW; gx += scale) ctx.fillRect(left + gx, y, 1, cellH);
        for (let gy = scale; gy < cellH; gy += scale) ctx.fillRect(left, y + gy, cellW, 1);

        ctx.drawImage(cell.sprite(time), left, y, cellW, cellH);
      });
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
