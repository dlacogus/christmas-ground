// 깊이 레이어 (뒤 → 앞). 괄호 안은 카메라를 따라가는 비율.
//   하늘(0) → 먼 건물(0.3) → 먼 눈 → 광장 건물(0.6) → 중간 눈 → 본 레이어(1) → 가까운 눈 → 앞 눈 더미(1.3)
// 본 레이어 안에서는 발밑 y가 큰 것을 앞에 그린다.

import { layerOffsetX, type Camera } from './camera';
import { LAYER_FACTORS, SCENERY_SEED, SCREEN_WIDTH } from './constants';
import { createRng } from './random';
import { createFarCity } from './scenery/farCity';
import { createForeground } from './scenery/foreground';
import { createGround } from './scenery/ground';
import { createPlazaBuildings } from './scenery/plazaBuildings';
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

/** 발밑 y 오름차순 (뒤 → 앞) */
export function sortByDepth<T extends { footY: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.footY - b.footY);
}

/** zones의 시설과 actors(캐릭터 등)를 본 레이어에서 함께 y 정렬한다 */
export function createLayers(zones: readonly Zone[], actors: readonly DepthDrawable[], seed = SCENERY_SEED): Layer[] {
  const f = LAYER_FACTORS;
  const sky = createSky(createRng(seed));
  const farCity = createFarCity(createRng(seed + 1), layerWidth(f.farBuildings));
  const plaza = createPlazaBuildings(createRng(seed + 2), layerWidth(f.plazaBuildings));
  const ground = createGround(createRng(seed + 3), layerWidth(f.main));
  const foreground = createForeground(createRng(seed + 4), layerWidth(f.foregroundSnow));
  const snow = createSnowfall(createRng(seed + 5));
  const snowRng = createRng(seed + 6);

  return [
    {
      name: 'sky',
      factor: f.sky,
      update: (dt) => sky.update(dt),
      draw: (ctx) => sky.draw(ctx),
    },
    {
      name: 'farBuildings',
      factor: f.farBuildings,
      draw: (ctx, camera) => farCity.draw(ctx, layerOffsetX(camera, f.farBuildings)),
    },
    {
      name: 'snowFar',
      factor: f.farBuildings,
      // 눈 세 층은 여기서 한꺼번에 움직인다
      update: (dt, camera) => updateSnowfall(snow, dt, camera.x, snowRng),
      draw: (ctx) => drawSnowLayer(ctx, snow, 0),
    },
    {
      name: 'plazaBuildings',
      factor: f.plazaBuildings,
      update: (dt) => plaza.update(dt),
      draw: (ctx, camera) => plaza.draw(ctx, layerOffsetX(camera, f.plazaBuildings)),
    },
    {
      name: 'snowMid',
      factor: f.plazaBuildings,
      draw: (ctx) => drawSnowLayer(ctx, snow, 1),
    },
    {
      name: 'main',
      factor: f.main,
      draw: (ctx, camera) => {
        ground.draw(ctx, layerOffsetX(camera, f.main));
        for (const zone of zones) zone.draw(ctx, camera);
        const drawables = sortByDepth([...zones.flatMap((z) => z.props), ...actors]);
        for (const d of drawables) d.draw(ctx, camera);
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
      draw: (ctx, camera) => foreground.draw(ctx, layerOffsetX(camera, f.foregroundSnow)),
    },
  ];
}

export function updateLayers(layers: readonly Layer[], dt: number, camera: Camera): void {
  for (const l of layers) l.update?.(dt, camera);
}

export function drawLayers(ctx: CanvasRenderingContext2D, camera: Camera, layers: readonly Layer[]): void {
  for (const l of layers) l.draw(ctx, camera);
}
