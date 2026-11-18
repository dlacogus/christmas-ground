import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setWalkTarget, updateCharacter } from './character/character';
import { drawCharacter } from './character/render';
import { LAYER_FACTORS, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import { drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers, updateLayers } from './layers';
import { fitCanvasToWindow, frameDt } from './screen';
import { createMusicBox } from './audio/musicBox';
import { createRinkSounds } from './audio/rinkSounds';
import { carouselGeometry } from './props/carousel';
import { CAROUSEL_X, SPAWN, TREE_X, WALK_AREA, getObstacle } from './world';
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
  // 처음 들어오면 트리를 화면 가운데에 둔다
  snapCamera(camera, TREE_X);

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

  // 오르골은 회전목마 판 가운데에서 울린다. 브라우저 규칙상 첫 클릭·키 입력 뒤에만 켠다
  const musicBox = createMusicBox({ x: CAROUSEL_X, y: carouselGeometry().platformY });
  // 스케이트 날 소리·웃음은 링크 울타리 상자 어디서든 가까운 곳에서 들린다
  const rinkSounds = createRinkSounds(getObstacle('rink'));
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, () => {
      musicBox.unlock();
      rinkSounds.unlock();
    });
  }

  let lastTime = performance.now();
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime);
    lastTime = now;

    updateCharacter(character, dt, input.direction());
    for (const zone of zones) zone.update(dt);
    updateCamera(camera, character.x, dt);
    updateLayers(layers, dt, camera);
    musicBox.setListener(character.x, character.y);
    rinkSounds.setListener(character.x, character.y);

    drawLayers(ctx, camera, layers);
    if (debug) drawDebugOverlay(ctx, camera, character, zones);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
