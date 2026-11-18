import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setWalkTarget } from './character/character';
import { drawCharacter } from './character/render';
import type { CharacterState } from './character/state';
import { CAROUSEL, FOOTPRINTS, HINT, LAYER_FACTORS, SCENERY_SEED, SCREEN_HEIGHT, SCREEN_WIDTH, SOUND, WARM_BUFFERS } from './constants';
import { createFpsMeter, drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers, updateLayers } from './layers';
import { warmBuffers } from './scenery/buffer';
import { createFootprints } from './scenery/footprints';
import { isSnowAt } from './scenery/ground';
import { fitCanvasToWindow, frameDt } from './screen';
import { createAmbience } from './audio/ambience';
import { advanceStepTimer, createFootsteps, createStepTimer } from './audio/footsteps';
import { createMusicBox } from './audio/musicBox';
import { createRinkSounds } from './audio/rinkSounds';
import { createSoundSystem } from './audio/soundSystem';
import { createWind } from './audio/wind';
import { createHint } from './ui/hint';
import { drawSoundButton, hitSoundButton } from './ui/soundButton';
import { carouselGeometry } from './props/carousel';
import { gateGeometry } from './props/carouselEntrance';
import { CAROUSEL_GATE, CAROUSEL_X, SPAWN, TREE_X, WALK_AREA, getObstacle } from './world';
import { createWorldZones } from './zones';
import { createCarouselPlay, nearEntry, onCarousel } from './zones/carouselPlay';
import type { DepthDrawable } from './zones/zone';

function describeState(state: CharacterState): string {
  if (state.kind === 'riding') return `state riding mount ${state.mount} slot ${state.slot}`;
  if (state.kind === 'skating') return `state skating ${state.vx.toFixed(1)}, ${state.vy.toFixed(1)}`;
  return 'state walk';
}

export function startGame(canvas: HTMLCanvasElement, debug: boolean): void {
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  fitCanvasToWindow(canvas, SCREEN_WIDTH, SCREEN_HEIGHT);

  const camera = createCamera();
  const world = createWorldZones();
  const zones = world.all;
  const character = createCharacter(SPAWN.x, SPAWN.y);
  // 처음 들어오면 트리를 화면 가운데에 둔다
  snapCamera(camera, TREE_X);

  // 회전목마 타기
  const play = createCarouselPlay(character, world.carousel);
  const hint = createHint(canvas);
  const touch = window.matchMedia('(pointer: coarse)').matches;

  // 소리: 광장 배경 + 구역별 소리(거리에 따라 크기·좌우) + 발자국. 브라우저 규칙상 첫 클릭·키 입력 뒤에만 켠다
  const footsteps = createFootsteps();
  const wind = createWind();
  // 오르골은 회전목마 판 가운데에서 울린다
  const musicBox = createMusicBox({ x: CAROUSEL_X, y: carouselGeometry().platformY });
  const sound = createSoundSystem([
    createAmbience(),
    musicBox,
    // 스케이트 날 소리·웃음은 링크 울타리 상자 어디서든 가까운 곳에서 들린다
    createRinkSounds(getObstacle('rink')),
    footsteps,
    wind,
  ]);
  const stepTimer = createStepTimer();

  // 상태가 바뀔 때 알림을 받는다 — 나중에 네트워크로 보낼 자리. 지금은 타는 동안 오르골을 키우는 데만 쓴다
  character.state.onChange((next) => musicBox.setRiding(next.kind === 'riding'));

  const input = createInput(canvas, SCREEN_WIDTH, SCREEN_HEIGHT, (sx, sy) => {
    if (hitSoundButton(sx, sy)) {
      // 아직 소리가 안 켜졌으면 이번 누름은 켜기만 한다 (바로 꺼지지 않게). 지난번에 꺼 두었다면 다시 켠다
      if (sound.started || sound.muted) sound.toggleMuted();
      sound.unlock();
      return;
    }
    const worldX = sx + layerOffsetX(camera, LAYER_FACTORS.main);
    // 회전목마를 탭하면 타거나 내린다. 타는 동안에는 어디를 탭해도 내리기
    if (play.boarding.phase === 'riding' || onCarousel(worldX, sy)) {
      play.tapCarousel();
      return;
    }
    // 바닥을 탭했을 때만 그 자리로 걸어간다
    if (sy < WALK_AREA.y || play.boarding.phase !== 'none') return;
    setWalkTarget(character, worldX, sy);
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
      // 타는 동안에는 회전목마가 탈 것과 함께 그린다
      if (character.state.get().kind === 'riding') return;
      drawCharacter(c, character, layerOffsetX(cam, LAYER_FACTORS.main));
    },
  };
  // 눈 위 발자국 (입구 카펫과 벽돌이 드러난 곳에는 남지 않는다)
  const footprints = createFootprints();
  const gate = gateGeometry();
  const onCarpet = (x: number, y: number) =>
    Math.abs(x - gate.cx) <= CAROUSEL_GATE.carpetHalfWidth && y >= gate.rimBottom && y <= gate.carpetEndY;
  let lastX = character.x;
  let lastY = character.y;
  let walked = 0;
  const layers = createLayers(zones, [characterDrawable], SCENERY_SEED, [footprints]);

  const fpsMeter = createFpsMeter();
  // 화면 밖 구역의 그림도 틈틈이 미리 그려 둔다 (처음 들어설 때 멈칫하지 않게)
  window.setTimeout(() => warmBuffers(WARM_BUFFERS.perStep, WARM_BUFFERS.stepMs), WARM_BUFFERS.delayMs);
  let lastTime = performance.now();
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime);
    const fps = fpsMeter.tick((now - lastTime) / 1000);
    lastTime = now;

    const actions = input.takeActions();
    if (debug && actions.debugFriend) play.toggleFriend();
    play.handleInput(dt, input.direction(), actions);
    for (const zone of zones) zone.update(dt);
    for (const event of play.update()) {
      if (event === 'passedFront') wind.whoosh();
      // 올라타는 순간 입구 오른쪽 줄이 잠깐 풀린다
      if (event === 'boarded') world.carousel.openEntranceRope();
    }
    // 입구 가까이 오면 아치가 밝아진다
    world.carousel.setEntranceNear(play.boarding.phase !== 'riding' && nearEntry(character));

    const riding = play.boarding.phase === 'riding';
    // 타는 동안 카메라는 회전목마 가운데에 부드럽게 머문다 (도는 캐릭터를 따라 흔들리지 않게)
    updateCamera(camera, riding ? CAROUSEL_X : character.x, dt);
    updateLayers(layers, dt, camera);
    sound.setListener(character.x, character.y);
    if (advanceStepTimer(stepTimer, dt, !riding && character.moving)) footsteps.step();
    // 걸은 거리만큼 발자국을 남긴다 (타고 내릴 때처럼 한 번에 멀리 옮겨지면 찍지 않는다)
    const movedX = character.x - lastX;
    const movedY = character.y - lastY;
    const moved = Math.hypot(movedX, movedY);
    if (riding || moved > FOOTPRINTS.stride) walked = 0;
    else if (moved > 0) {
      walked += moved;
      if (walked >= FOOTPRINTS.stride) {
        walked = 0;
        if (isSnowAt(character.x, character.y) && !onCarpet(character.x, character.y)) {
          footprints.add(character.x, character.y, movedX, movedY);
        }
      }
    }
    footprints.update(dt);
    lastX = character.x;
    lastY = character.y;

    drawLayers(ctx, camera, layers);
    drawSoundButton(ctx, sound.started && !sound.muted);
    if (debug) drawDebugOverlay(ctx, camera, character, zones, fps, [describeState(character.state.get()), 'B: friend']);

    const h = play.hint(touch);
    if (!h) hint.show(null);
    else if (h.anchor === 'bottom') hint.show({ text: h.text, sub: h.sub, sx: SCREEN_WIDTH / 2, sy: HINT.bottomY });
    else if (h.anchor === 'arch') {
      // 타기 힌트는 입구 아치 위에
      hint.show({ text: h.text, sub: h.sub, sx: CAROUSEL_X - layerOffsetX(camera, LAYER_FACTORS.main), sy: gateGeometry().ornamentTopY - HINT.aboveArch });
    }
    else {
      const above = riding ? CAROUSEL.riderAboveSeat + (HINT.aboveHead - CAROUSEL.riderAboveSeat) / 2 : HINT.aboveHead;
      hint.show({ text: h.text, sub: h.sub, sx: character.x - layerOffsetX(camera, LAYER_FACTORS.main), sy: character.y - above });
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
