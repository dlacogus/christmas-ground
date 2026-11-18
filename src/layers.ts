// 깊이 레이어 (뒤 → 앞). 괄호 안은 카메라를 따라가는 비율.
//   하늘(0) → 먼 건물(0.3) → 먼 눈 → 나무 줄·시계탑(0.6) → 중간 눈 → 본 레이어(1) → 가까운 눈 → 앞 눈 더미(1.3)
// 조명·분위기(scenery/lighting)는 층 사이에 덧입힌다: 하늘 뒤 노을빛·달, 먼 건물 뒤 안개, 바닥 위 불빛, 시설 위 빛 번짐, 맨 위 가장자리 어둡게.
// 본 레이어 안에서는 발밑 y가 큰 것을 앞에 그린다.

import { layerOffsetX, type Camera } from './camera';
import { LAYER_FACTORS, SCENERY_SEED, SCREEN_WIDTH } from './constants';
import { createRng } from './random';
import { createFarCity } from './scenery/farCity';
import { createForeground } from './scenery/foreground';
import { createGround } from './scenery/ground';
import { createFog, createGroundLight, createSkyGlow, createVignette, drawClockHalo } from './scenery/lighting';
import { createTreeLine } from './scenery/treeLine';
import { createSky } from './scenery/sky';
import { createSnowfall, drawSnowLayer, updateSnowfall } from './scenery/snowfall';
import { MAP_WIDTH } from './world';
import type { DepthDrawable, Zone } from './zones/zone';

export interface Layer {
  readonly name: string;
  readonly factor: number;
  update?(dt: number, camera: Camera): void;
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

/** 이 비율로 움직이는 레이어가 맵 끝까지 보여줘야 하는 너비 */
export function layerWidth(factor: number): number {
  return SCREEN_WIDTH + (MAP_WIDTH - SCREEN_WIDTH) * factor;
}

/** 이 구역이 지금 화면에 걸쳐 있나. 구역의 그림은 모두 자기 x 범위 안에 있어야 한다 */
export function zoneVisible(zone: { startX: number; endX: number }, cameraX: number): boolean {
  return zone.endX > cameraX && zone.startX < cameraX + SCREEN_WIDTH;
}

/** 발밑 y 오름차순 (뒤 → 앞) */
export function sortByDepth<T extends { footY: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.footY - b.footY);
}

/** zones의 시설과 actors(캐릭터 등)를 본 레이어에서 함께 y 정렬한다 */
/** 바닥에 납작하게 남는 자국 (발자국 등): 바닥 바로 위, 바닥 불빛 아래에 그린다 */
export interface FloorMarks {
  draw(ctx: CanvasRenderingContext2D, offsetX: number): void;
}

export function createLayers(
  zones: readonly Zone[],
  actors: readonly DepthDrawable[],
  seed = SCENERY_SEED,
  floorMarks: readonly FloorMarks[] = [],
): Layer[] {
  const f = LAYER_FACTORS;
  const sky = createSky(createRng(seed));
  const farCity = createFarCity(createRng(seed + 1), layerWidth(f.farBuildings));
  const treeLine = createTreeLine(createRng(seed + 2), layerWidth(f.treeLine));
  const ground = createGround(createRng(seed + 3), layerWidth(f.main));
  const foreground = createForeground(createRng(seed + 4), layerWidth(f.foregroundSnow));
  const snow = createSnowfall(createRng(seed + 5));
  const snowRng = createRng(seed + 6);
  // 기존 그림 위에 덧입히는 조명·분위기 층
  const skyGlow = createSkyGlow(createRng(seed + 7));
  const fog = createFog();
  const light = createGroundLight(createRng(seed + 8));
  const vignette = createVignette();

  return [
    {
      name: 'sky',
      factor: f.sky,
      update: (dt) => {
        sky.update(dt);
        skyGlow.update(dt);
      },
      draw: (ctx) => {
        sky.draw(ctx);
        skyGlow.draw(ctx);
      },
    },
    {
      name: 'farBuildings',
      factor: f.farBuildings,
      draw: (ctx, camera) => {
        farCity.draw(ctx, layerOffsetX(camera, f.farBuildings));
        fog.draw(ctx);
      },
    },
    {
      name: 'snowFar',
      factor: f.farBuildings,
      // 눈 세 층은 여기서 한꺼번에 움직인다
      update: (dt, camera) => updateSnowfall(snow, dt, camera.x, snowRng),
      draw: (ctx) => drawSnowLayer(ctx, snow, 0),
    },
    {
      name: 'treeLine',
      factor: f.treeLine,
      draw: (ctx, camera) => {
        treeLine.draw(ctx, layerOffsetX(camera, f.treeLine));
        drawClockHalo(ctx, layerOffsetX(camera, f.treeLine));
      },
    },
    {
      name: 'snowMid',
      factor: f.treeLine,
      draw: (ctx) => drawSnowLayer(ctx, snow, 1),
    },
    {
      name: 'main',
      factor: f.main,
      draw: (ctx, camera) => {
        ground.draw(ctx, layerOffsetX(camera, f.main));
        for (const marks of floorMarks) marks.draw(ctx, layerOffsetX(camera, f.main));
        light.drawGround(ctx, layerOffsetX(camera, f.main));
        // 화면 밖 구역은 건너뛴다
        const visible = zones.filter((z) => zoneVisible(z, camera.x));
        for (const zone of visible) zone.draw(ctx, camera);
        const drawables = sortByDepth([...visible.flatMap((z) => z.props), ...actors]);
        for (const d of drawables) d.draw(ctx, camera);
        light.drawBloom(ctx, layerOffsetX(camera, f.main));
      },
    },
    {
      name: 'snowNear',
      factor: f.foregroundSnow,
      draw: (ctx) => drawSnowLayer(ctx, snow, 2),
    },
    {
      name: 'foregroundSnow',
      factor: f.foregroundSnow,
      draw: (ctx, camera) => {
        foreground.draw(ctx, layerOffsetX(camera, f.foregroundSnow));
        vignette.draw(ctx);
      },
    },
  ];
}

export function updateLayers(layers: readonly Layer[], dt: number, camera: Camera): void {
  for (const l of layers) l.update?.(dt, camera);
}

export function drawLayers(ctx: CanvasRenderingContext2D, camera: Camera, layers: readonly Layer[]): void {
  for (const l of layers) l.draw(ctx, camera);
}
