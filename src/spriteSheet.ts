// ?sprites=1 — 모든 자세를 4배로 확대해 격자로 보여주는 확인 화면.

import { getSpriteCanvas } from './character/render';
import { POSES, type Facing, type PoseName } from './character/sprites';
import { REINDEER_POSES, getReindeerCanvas, type ReindeerPose } from './character/reindeer';
import { CHARACTER, COLORS, DEFAULT_OUTFIT, ORNAMENT_KINDS, OUTFITS, PROP_IDS, SKATERS, SPRITE_SHEET, type OrnamentKind, type OutfitName, type PropId } from './constants';
import { drawOrnament, drawPropIcon, PROP_NAMES, propSize } from './features/props';
import { ORNAMENT_NAMES, isSpecial } from './features/treeDecor';
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
  push: '밀기',
  cheer: '두 손 들기',
  ride: '말 타기',
  rideWave: '말·손',
  sit: '마차',
  sitWave: '마차·손',
  sitCheer: '썰매·환호',
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

const REINDEER_LABELS: Record<ReindeerPose, string> = { idle: '서기', walk: '걷기', run: '달리기' };

/** 루돌프 바디슈트 (썰매를 끄는 사람): 모든 자세 좌우 */
function reindeerCells(): Cell[] {
  return (['right', 'left'] as const).flatMap((facing) =>
    (Object.keys(REINDEER_POSES) as ReindeerPose[]).flatMap((pose) =>
      REINDEER_POSES[pose].map((_, i) => ({
        label: `🦌${FACING_LABELS[facing]} ${REINDEER_LABELS[pose]} ${i + 1}`,
        sprite: () => getReindeerCanvas(pose, i, facing),
      })),
    ),
  );
}

/** 노점 소품: 한 칸에 세 가지 크기(미니·중간·엄청 큰 눈사람용)를 위에서부터 */
function propCell(prop: PropId): Cell {
  // 칸을 절반 배율로 쓴다 (3배 크기까지 들어가게)
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER.spriteWidth * 2;
  canvas.height = CHARACTER.spriteHeight * 2;
  const g = canvas.getContext('2d')!;
  let top = 2;
  for (const scale of [1, 2, 3]) {
    const h = propSize(prop, scale).h;
    drawPropIcon(g, prop, canvas.width / 2, top + h / 2, scale);
    top += h + 3;
  }
  return { label: PROP_NAMES[prop], sprite: () => canvas };
}

/** 트리 장식: 칸 가운데에 실제 크기로 (특별한 장식은 이름 앞에 ★) */
function ornamentCell(kind: OrnamentKind): Cell {
  const canvas = document.createElement('canvas');
  canvas.width = CHARACTER.spriteWidth;
  canvas.height = CHARACTER.spriteHeight;
  drawOrnament(canvas.getContext('2d')!, kind, canvas.width / 2, canvas.height / 2);
  return { label: (isSpecial(kind) ? '★' : '') + ORNAMENT_NAMES[kind], sprite: () => canvas };
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
    reindeerCells(),
    PROP_IDS.map(propCell),
    ORNAMENT_KINDS.map(ornamentCell),
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
