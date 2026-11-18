import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setWalkTarget } from './character/character';
import { drawCharacter } from './character/render';
import type { CharacterState } from './character/state';
import { BENCH_SIT, CAROUSEL, CHARACTER, FOOTPRINTS, HINT, LAYER_FACTORS, ROOF_SNOW, SANTA, SCENERY_SEED, SCREEN_HEIGHT, SCREEN_WIDTH, SOUND, WARM_BUFFERS } from './constants';
import { createFpsMeter, drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers, updateLayers } from './layers';
import { warmBuffers } from './scenery/buffer';
import { createFootprints } from './scenery/footprints';
import { isSnowAt } from './scenery/ground';
import { createSanta } from './scenery/santa';
import { fitCanvasToWindow, frameDt } from './screen';
import { createAmbience } from './audio/ambience';
import { advanceStepTimer, createFootsteps, createStepTimer } from './audio/footsteps';
import { createMusicBox } from './audio/musicBox';
import { createRinkSounds } from './audio/rinkSounds';
import { createSoundSystem } from './audio/soundSystem';
import { createRoofSnowSounds } from './audio/roofSnowSounds';
import { createSkateSounds } from './audio/skateSounds';
import { createRoofSnow, createSnowHits } from './features/roofSnow';
import { createWind } from './audio/wind';
import { createHint } from './ui/hint';
import { drawSoundButton, hitSoundButton } from './ui/soundButton';
import { carouselGeometry } from './props/carousel';
import { gateGeometry } from './props/carouselEntrance';
import { CAROUSEL_GATE, CAROUSEL_X, SPAWN, TREE_X, WALK_AREA, getObstacle } from './world';
import { createWorldZones } from './zones';
import { benchAt, createBenchPlay } from './zones/benchPlay';
import { MY_ID, createCarouselPlay, nearEntry, onCarousel, type PlayHint } from './zones/carouselPlay';
import { createSkatePlay } from './zones/skatePlay';
import { rinkBounds } from './props/iceRink';
import type { DepthDrawable } from './zones/zone';

function describeState(state: CharacterState): string {
  if (state.kind === 'riding') return `state riding mount ${state.mount} slot ${state.slot}`;
  if (state.kind === 'skating') return `state skating ${state.vx}, ${state.vy}`;
  if (state.kind === 'sitting') return `state sitting bench ${state.bench} slot ${state.slot}`;
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
  const skateSounds = createSkateSounds();
  const roofSnowSounds = createRoofSnowSounds();
  const sound = createSoundSystem([
    roofSnowSounds,
    createAmbience(),
    musicBox,
    skateSounds,
    // 스케이트 날 소리·웃음은 링크 울타리 상자 어디서든 가까운 곳에서 들린다
    createRinkSounds(getObstacle('rink')),
    footsteps,
    wind,
  ]);
  const stepTimer = createStepTimer();

  // 스케이트 타기와 벤치 앉기
  const skate = createSkatePlay(character, world.rink.skaters, skateSounds);
  world.rink.setIceOverlay((c, cam) => skate.drawOnIce(c, cam));
  const bench = createBenchPlay(character);
  const rinkBox = rinkBounds();
  /** 화면에서 링크(울타리 위 스케이터 포함)를 눌렀나 (맵 좌표) */
  const onRink = (x: number, y: number) => x >= rinkBox.left && x < rinkBox.right && y >= rinkBox.top - CHARACTER.spriteHeight && y <= rinkBox.bottom;

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
    // 스케이트를 타는 동안: 입구에서 멈췄으면 벗고, 아니면 누르고 있는 쪽으로 민다 (매 프레임 따로 읽는다)
    if (skate.active) {
      skate.tapWhileSkating();
      return;
    }
    // 앉아 있으면 일어난다
    if (bench.seated) {
      bench.standUp();
      return;
    }
    // 회전목마를 탭하면 타거나 내린다. 타는 동안에는 어디를 탭해도 내리기
    if (play.boarding.phase === 'riding' || onCarousel(worldX, sy)) {
      play.tapCarousel();
      return;
    }
    if (play.boarding.phase !== 'none') return;
    // 링크를 탭하면 입구로 걸어가서 스케이트를 신는다
    if (onRink(worldX, sy)) {
      skate.tapRink();
      return;
    }
    // 벤치를 탭하면 걸어가서 앉는다
    const tappedBench = benchAt(worldX, sy);
    if (tappedBench >= 0) {
      bench.tapBench(tappedBench);
      return;
    }
    // 바닥을 탭했을 때만 그 자리로 걸어간다
    if (sy < WALK_AREA.y) return;
    setWalkTarget(character, worldX, sy);
  });
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());
  window.addEventListener('keydown', (e) => {
    if (e.code === SOUND.toggleKey && !e.repeat) sound.toggleMuted();
  });

  // 지붕에 쌓인 눈: 상태(쌓인 양·떨어짐 이벤트) → 화면(지붕 눈·덩어리·바닥 더미), 맞은 캐릭터(눈 모자·눈사람), 소리
  const roofSnow = createRoofSnow();
  const snowHits = createSnowHits();
  /** ?debug=1의 T: 시간 0.25배속 (눈이 떨어지는 과정을 천천히 본다) */
  let slowMotion = false;

  const characterDrawable: DepthDrawable = {
    get footY() {
      return character.y;
    },
    draw(c: CanvasRenderingContext2D, cam: Camera) {
      // 타는 동안에는 회전목마가 탈 것과 함께 그린다
      const kind = character.state.get().kind;
      if (kind === 'riding') return;
      const ox = layerOffsetX(cam, LAYER_FACTORS.main);
      const footX = Math.round(character.x) - ox;
      const footY = Math.round(character.y);
      if (skate.active) skate.drawCharacter(c, cam);
      else if (kind === 'sitting') bench.draw(c, cam);
      else if (snowHits.snowman) snowHits.drawSnowman(c, footX, footY);
      else drawCharacter(c, character, ox, { lean: snowHits.shakeLean() });
      snowHits.drawOver(c, footX, footY, ox);
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
  // 5분에 한 번 트리 위를 지나가는 산타 썰매
  const santa = createSanta();
  if (debug) {
    window.addEventListener('keydown', (e) => {
      if (e.code === SANTA.debugKey) santa.fly();
      // R: 캐릭터에게서 가장 가까운 지붕 눈을 가득 채워 바로 떨어뜨린다
      if (e.code === ROOF_SNOW.debugDropKey) {
        let nearest = 0;
        roofSnow.roofs.forEach((r, i) => {
          if (Math.abs(r.hut.x - character.x) < Math.abs(roofSnow.roofs[nearest].hut.x - character.x)) nearest = i;
        });
        roofSnow.fillAndDrop(nearest);
      }
      // T: 0.25배속 켜고 끄기
      if (e.code === ROOF_SNOW.debugSlowKey) slowMotion = !slowMotion;
    });
  }
  const layers = createLayers(
    zones,
    [characterDrawable, ...roofSnow.drawables],
    SCENERY_SEED,
    [footprints, { draw: (c, ox) => roofSnow.drawFloor(c, ox) }],
    [santa],
  );

  const fpsMeter = createFpsMeter();
  // 화면 밖 구역의 그림도 틈틈이 미리 그려 둔다 (처음 들어설 때 멈칫하지 않게)
  window.setTimeout(() => warmBuffers(WARM_BUFFERS.perStep, WARM_BUFFERS.stepMs), WARM_BUFFERS.delayMs);
  let lastTime = performance.now();
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime) * (slowMotion ? ROOF_SNOW.debugSlowFactor : 1);
    const fps = fpsMeter.tick((now - lastTime) / 1000);
    lastTime = now;

    const actions = input.takeActions();
    const dir = input.direction();
    if (debug && actions.debugFriend) play.toggleFriend();
    if (snowHits.frozen) {
      // 눈사람: 못 움직인다. 방향키를 연타하면 더 빨리 빠져나온다
      snowHits.struggle(actions.moveTaps ?? 0);
      character.moving = false;
      character.target = null;
    } else if (skate.active) {
      const p = input.pointer();
      const pointerWorld = p ? { x: p.sx + layerOffsetX(camera, LAYER_FACTORS.main), y: p.sy } : null;
      skate.handleInput(dir, actions, input.spaceHeld(), pointerWorld);
    } else if (bench.seated) {
      bench.handleSeated(dt, dir, actions);
    } else if (play.boarding.phase !== 'none' || !(skate.handleWalking(actions, dir) || bench.handleWalking(actions, dir))) {
      play.handleInput(dt, dir, actions);
    }
    for (const zone of zones) zone.update(dt);
    skate.update(dt);
    // 지붕 눈: 걸어 다닐 때만 맞는다 (회전목마·스케이트·벤치 중에는 안 맞는다)
    const roofEvents = roofSnow.update(dt, [
      {
        id: MY_ID,
        x: character.x,
        y: character.y,
        moving: character.moving,
        canBeHit: character.state.get().kind === 'walk' && !skate.active && play.boarding.phase === 'none',
      },
    ]);
    snowHits.handle(roofEvents, MY_ID);
    snowHits.follow(character.x, character.y);
    snowHits.update(dt);
    // 소리: 미끄러지는 동안 스르르, 덩어리가 닿을 때마다 퍽
    roofSnowSounds.setSlide(roofSnow.sliding());
    for (const ev of roofEvents) {
      if (ev.type === 'land') roofSnowSounds.thud(ev.x, ev.y, ev.size);
      if (ev.type === 'hat' || ev.type === 'snowman') roofSnowSounds.thud(ev.x, ev.y, ev.type === 'hat' ? 4 : 8);
      if (ev.type === 'drip') roofSnowSounds.rustle(ev.x, ev.y - CHARACTER.spriteHeight);
    }
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
    const walking = character.state.get().kind === 'walk' && !skate.active;
    if (advanceStepTimer(stepTimer, dt, walking && character.moving)) footsteps.step();
    // 걸은 거리만큼 발자국을 남긴다 (타고 내릴 때처럼 한 번에 멀리 옮겨지면 찍지 않는다)
    const movedX = character.x - lastX;
    const movedY = character.y - lastY;
    const moved = Math.hypot(movedX, movedY);
    if (!walking || moved > FOOTPRINTS.stride) walked = 0;
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
    if (debug) {
      drawDebugOverlay(ctx, camera, character, zones, fps, [describeState(character.state.get()), `B: friend  N: santa  R: roof snow  T: slow${slowMotion ? ' ON' : ''}`]);
      roofSnow.drawDebug(ctx, camera);
    }

    const h: PlayHint | null = skate.hint(touch) ?? bench.hint(touch) ?? play.hint(touch);
    if (!h) hint.show(null);
    else if (h.anchor === 'bottom') hint.show({ text: h.text, sub: h.sub, sx: SCREEN_WIDTH / 2, sy: HINT.bottomY });
    else if (h.anchor === 'arch') {
      // 타기 힌트는 입구 아치 위에
      hint.show({ text: h.text, sub: h.sub, sx: CAROUSEL_X - layerOffsetX(camera, LAYER_FACTORS.main), sy: gateGeometry().ornamentTopY - HINT.aboveArch });
    }
    else {
      const above = riding
        ? CAROUSEL.riderAboveSeat + (HINT.aboveHead - CAROUSEL.riderAboveSeat) / 2
        : HINT.aboveHead + (bench.seated ? BENCH_SIT.lift : 0);
      hint.show({ text: h.text, sub: h.sub, sx: character.x - layerOffsetX(camera, LAYER_FACTORS.main), sy: character.y - above });
    }

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
