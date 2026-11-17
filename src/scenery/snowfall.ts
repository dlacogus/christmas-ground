// 내리는 눈: 먼 눈(1px, 느림) / 중간 눈 / 가까운 눈(2px, 빠름) 세 층.
// 화면 좌표로 움직이고, 카메라가 움직이면 층마다 parallax만큼 반대로 밀린다.

import { SCREEN_HEIGHT, SCREEN_WIDTH, SNOWFALL } from '../constants';
import { randRange, type Rng } from '../random';

export type SnowLayerConfig = (typeof SNOWFALL.layers)[number];

export interface Flake {
  x: number;
  y: number;
  speed: number;
  phase: number;
  freq: number;
}

export interface SnowLayer {
  config: SnowLayerConfig;
  flakes: Flake[];
}

export interface Snowfall {
  layers: SnowLayer[];
  time: number;
  lastCameraX: number | null;
}

function wrapX(x: number): number {
  return ((x % SCREEN_WIDTH) + SCREEN_WIDTH) % SCREEN_WIDTH;
}

function newFlake(rng: Rng, config: SnowLayerConfig, y: number): Flake {
  return {
    x: rng() * SCREEN_WIDTH,
    y,
    speed: randRange(rng, config.minSpeed, config.maxSpeed),
    phase: rng() * Math.PI * 2,
    freq: randRange(rng, SNOWFALL.minSwayFreq, SNOWFALL.maxSwayFreq),
  };
}

export function createSnowfall(rng: Rng): Snowfall {
  let budget = SNOWFALL.maxParticles;
  const layers = SNOWFALL.layers.map((config) => {
    const count = Math.min(config.count, budget);
    budget -= count;
    return { config, flakes: Array.from({ length: count }, () => newFlake(rng, config, rng() * SCREEN_HEIGHT)) };
  });
  return { layers, time: 0, lastCameraX: null };
}

export function updateSnowfall(snow: Snowfall, dt: number, cameraX: number, rng: Rng): void {
  const cameraDx = snow.lastCameraX === null ? 0 : cameraX - snow.lastCameraX;
  snow.lastCameraX = cameraX;
  snow.time += dt;
  for (const layer of snow.layers) {
    const { config } = layer;
    for (const flake of layer.flakes) {
      flake.y += flake.speed * dt;
      flake.x = wrapX(flake.x - cameraDx * config.parallax);
      if (flake.y >= SCREEN_HEIGHT) Object.assign(flake, newFlake(rng, config, -config.size));
    }
  }
}

/** 좌우로 살짝 흔들린 화면 x (정수) */
export function flakeScreenX(flake: Flake, config: SnowLayerConfig, time: number): number {
  const sway = Math.sin(time * flake.freq * Math.PI * 2 + flake.phase) * config.swayAmp;
  return wrapX(Math.round(flake.x + sway));
}

export function drawSnowLayer(ctx: CanvasRenderingContext2D, snow: Snowfall, index: number): void {
  const layer = snow.layers[index];
  const { size, color } = layer.config;
  ctx.fillStyle = color;
  for (const flake of layer.flakes) {
    ctx.fillRect(flakeScreenX(flake, layer.config, snow.time), Math.round(flake.y), size, size);
  }
}

export function totalFlakes(snow: Snowfall): number {
  return snow.layers.reduce((sum, l) => sum + l.flakes.length, 0);
}
