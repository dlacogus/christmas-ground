import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setWalkTarget, updateCharacter } from './character/character';
import { drawCharacter } from './character/render';
import { LAYER_FACTORS, SCREEN_HEIGHT, SCREEN_WIDTH, SOUND, WARM_BUFFERS } from './constants';
import { createFpsMeter, drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers, updateLayers } from './layers';
import { warmBuffers } from './scenery/buffer';
import { fitCanvasToWindow, frameDt } from './screen';
import { createAmbience } from './audio/ambience';
import { advanceStepTimer, createFootsteps, createStepTimer } from './audio/footsteps';
import { createMusicBox } from './audio/musicBox';
import { createRinkSounds } from './audio/rinkSounds';
import { createSoundSystem } from './audio/soundSystem';
import { drawSoundButton, hitSoundButton } from './ui/soundButton';
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

  // 소리: 광장 배경 + 구역별 소리(거리에 따라 크기·좌우) + 발자국. 브라우저 규칙상 첫 클릭·키 입력 뒤에만 켠다
  const footsteps = createFootsteps();
  const sound = createSoundSystem([
    createAmbience(),
    // 오르골은 회전목마 판 가운데에서 울린다
    createMusicBox({ x: CAROUSEL_X, y: carouselGeometry().platformY }),
    // 스케이트 날 소리·웃음은 링크 울타리 상자 어디서든 가까운 곳에서 들린다
    createRinkSounds(getObstacle('rink')),
    footsteps,
  ]);
  const stepTimer = createStepTimer();

  const input = createInput(canvas, SCREEN_WIDTH, SCREEN_HEIGHT, (sx, sy) => {
    if (hitSoundButton(sx, sy)) {
      // 아직 소리가 안 켜졌으면 이번 누름은 켜기만 한다 (바로 꺼지지 않게). 지난번에 꺼 두었다면 다시 켠다
      if (sound.started || sound.muted) sound.toggleMuted();
      sound.unlock();
      return;
    }
    // 바닥을 탭했을 때만 그 자리로 걸어간다
    if (sy < WALK_AREA.y) return;
    setWalkTarget(character, sx + layerOffsetX(camera, LAYER_FACTORS.main), sy);
  });
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());
  window.addEventListener('keydown', (e) => {
    if (e.code === SOUND.toggleKey && !e.repeat) sound.toggleMuted();
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

  const fpsMeter = createFpsMeter();
  // 화면 밖 구역의 그림도 틈틈이 미리 그려 둔다 (처음 들어설 때 멈칫하지 않게)
  window.setTimeout(() => warmBuffers(WARM_BUFFERS.perStep, WARM_BUFFERS.stepMs), WARM_BUFFERS.delayMs);
  let lastTime = performance.now();
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime);
    const fps = fpsMeter.tick((now - lastTime) / 1000);
    lastTime = now;

    updateCharacter(character, dt, input.direction());
    for (const zone of zones) zone.update(dt);
    updateCamera(camera, character.x, dt);
    updateLayers(layers, dt, camera);
    sound.setListener(character.x, character.y);
    if (advanceStepTimer(stepTimer, dt, character.moving)) footsteps.step();

    drawLayers(ctx, camera, layers);
    drawSoundButton(ctx, sound.started && !sound.muted);
    if (debug) drawDebugOverlay(ctx, camera, character, zones, fps);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
