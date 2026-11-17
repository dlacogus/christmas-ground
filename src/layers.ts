// 깊이 레이어. 뒤에서 앞으로: 하늘(0) → 먼 건물(0.3) → 광장 건물(0.6) → 본 레이어(1) → 앞 눈 더미(1.3)
// 본 레이어 안에서는 발밑 y가 큰 것을 앞에 그린다.

import { layerOffsetX, type Camera } from './camera';
import { COLORS, GROUND, LAYER_FACTORS, PLACEHOLDER, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import {
  BUILDING_GAP,
  FAR_BUILDINGS,
  FOREGROUND_MOUNDS,
  MAP_WIDTH,
  PLAZA_BUILDINGS,
  WALK_AREA,
  type BuildingShape,
} from './world';
import type { DepthDrawable, Zone } from './zones/zone';

export interface Layer {
  readonly name: string;
  readonly factor: number;
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

/** 이 비율로 움직이는 레이어가 맵 끝까지 보여줘야 하는 너비 */
export function layerWidth(factor: number): number {
  return SCREEN_WIDTH + (MAP_WIDTH - SCREEN_WIDTH) * factor;
}

/** 발밑 y 오름차순 (뒤 → 앞) */
export function sortByDepth<T extends { footY: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.footY - b.footY);
}

function drawBuildingRow(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  shapes: readonly BuildingShape[],
  color: string,
  factor: number,
): void {
  const width = layerWidth(factor);
  ctx.fillStyle = color;
  let x = 0;
  for (let i = 0; x < width; i++) {
    const shape = shapes[i % shapes.length];
    const sx = x - offsetX;
    if (sx + shape.w > 0 && sx < SCREEN_WIDTH) ctx.fillRect(sx, WALK_AREA.y - shape.h, shape.w, shape.h);
    x += shape.w + BUILDING_GAP;
  }
}

function drawGround(ctx: CanvasRenderingContext2D): void {
  const walkBottom = WALK_AREA.y + WALK_AREA.h;
  ctx.fillStyle = COLORS.curb;
  ctx.fillRect(0, WALK_AREA.y - GROUND.curbHeight, SCREEN_WIDTH, GROUND.curbHeight);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, WALK_AREA.y, SCREEN_WIDTH, WALK_AREA.h);
  ctx.fillStyle = COLORS.snow;
  ctx.fillRect(0, walkBottom, SCREEN_WIDTH, SCREEN_HEIGHT - walkBottom);
}

function layer(name: string, factor: number, draw: (ctx: CanvasRenderingContext2D, camera: Camera) => void): Layer {
  return { name, factor, draw };
}

/** zones의 시설과 actors(캐릭터 등)를 본 레이어에서 함께 y 정렬한다 */
export function createLayers(zones: readonly Zone[], actors: readonly DepthDrawable[]): Layer[] {
  return [
    layer('sky', LAYER_FACTORS.sky, (ctx) => {
      ctx.fillStyle = COLORS.nightSky;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }),
    layer('farBuildings', LAYER_FACTORS.farBuildings, (ctx, camera) => {
      const f = LAYER_FACTORS.farBuildings;
      drawBuildingRow(ctx, layerOffsetX(camera, f), FAR_BUILDINGS, COLORS.farBuildings, f);
    }),
    layer('plazaBuildings', LAYER_FACTORS.plazaBuildings, (ctx, camera) => {
      const f = LAYER_FACTORS.plazaBuildings;
      drawBuildingRow(ctx, layerOffsetX(camera, f), PLAZA_BUILDINGS, COLORS.plazaBuildings, f);
    }),
    layer('main', LAYER_FACTORS.main, (ctx, camera) => {
      drawGround(ctx);
      for (const zone of zones) zone.draw(ctx, camera);
      const drawables = sortByDepth([...zones.flatMap((z) => z.props), ...actors]);
      for (const d of drawables) d.draw(ctx, camera);
    }),
    layer('foregroundSnow', LAYER_FACTORS.foregroundSnow, (ctx, camera) => {
      const ox = layerOffsetX(camera, LAYER_FACTORS.foregroundSnow);
      for (const m of FOREGROUND_MOUNDS) {
        const sx = m.x - ox;
        if (sx + m.w <= 0 || sx >= SCREEN_WIDTH) continue;
        ctx.fillStyle = COLORS.snowShade;
        ctx.fillRect(sx, SCREEN_HEIGHT - m.h, m.w, m.h);
        ctx.fillStyle = COLORS.snow;
        ctx.fillRect(
          sx + PLACEHOLDER.moundTopInset,
          SCREEN_HEIGHT - m.h - PLACEHOLDER.moundTopHeight,
          m.w - PLACEHOLDER.moundTopInset * 2,
          PLACEHOLDER.moundTopHeight + 1,
        );
      }
    }),
  ];
}

export function drawLayers(ctx: CanvasRenderingContext2D, camera: Camera, layers: readonly Layer[]): void {
  for (const l of layers) l.draw(ctx, camera);
}
