import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setWalkTarget, updateCharacter } from './character/character';
import { drawCharacter } from './character/render';
import { LAYER_FACTORS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import { drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers } from './layers';
import { fitCanvasToWindow, frameDt } from './screen';
import { SPAWN, WALK_AREA } from './world';
import { createZones } from './zones';
import type { DepthDrawable } from './zones/zone';

export function startGame(canvas: HTMLCanvasElement, debug: boolean): void {
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  fitCanvasToWindow(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);

  const camera = createCamera();
  const zones = createZones();
  const character = createCharacter(SPAWN.x, SPAWN.y);
  snapCamera(camera, character.x);

  const input = createInput(canvas, SCREEN_WIDTH, SCREEN_HEIGHT, (sx, sy) => {
    // 바닥을 탭했을 때만 그 자리로 걸어간다
    if (sy < WALK_AREA.y) return;
    setWalkTarget(character, sx + layerOffsetX(camera, LAYER_FACTORS.main), sy);
  });

  const characterDrawable: DepthDrawable = {
    get footY() {
      return character.y;
    },
    draw(c: CanvasRenderingContext2D, cam: Camera) {
      drawCharacter(c, character, layerOffsetX(cam, LAYER_FACTORS.main));
    },
  };
  const layers = createLayers(zones, [characterDrawable]);

  let lastTime = performance.now();
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime);
    lastTime = now;

    updateCharacter(character, dt, input.direction());
    for (const zone of zones) zone.update(dt);
    updateCamera(camera, character.x, dt);

    drawLayers(ctx, camera, layers);
    if (debug) drawDebugOverlay(ctx, camera, character, zones);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
