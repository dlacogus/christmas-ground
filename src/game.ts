import { createCamera, layerOffsetX, snapCamera, updateCamera, type Camera } from './camera';
import { createCharacter, setDynamicObstacles, setWalkTarget } from './character/character';
import { drawCharacter, headLook } from './character/render';
import type { CharacterState } from './character/state';
import { BENCH_SIT, CAROUSEL, CHARACTER, COLD, EMOTE, EMOTES, FOOTPRINTS, SLEIGH, GIFT, HAT, HAT_CHASE, HINT, LAYER_FACTORS, PROPS, ROOF_SNOW, THROW, SANTA, SKATE, SNEEZE, SNOWBALL, SCENERY_SEED, SCREEN_HEIGHT, SCREEN_WIDTH, SOUND, TREE_DECOR, WARM_BUFFERS } from './constants';
import { createFpsMeter, drawDebugOverlay } from './debug';
import { createInput } from './input';
import { createLayers, drawLayers, updateLayers } from './layers';
import { warmBuffers } from './scenery/buffer';
import { createFootprints } from './scenery/footprints';
import { isSnowAt, snowField } from './scenery/ground';
import { createSanta } from './scenery/santa';
import { fitGameToWindow, frameDt, VIEW } from './screen';
import { createTouchPad } from './ui/touchPad';
import { createAmbience } from './audio/ambience';
import { advanceStepTimer, createFootsteps, createStepTimer } from './audio/footsteps';
import { createMusicBox } from './audio/musicBox';
import { createRinkSounds } from './audio/rinkSounds';
import { createSoundSystem } from './audio/soundSystem';
import { createRoofSnowSounds } from './audio/roofSnowSounds';
import { createSneezeSound } from './audio/sneezeSound';
import { createSnowmanSounds } from './audio/snowmanSounds';
import { createSnowWorld, footprint, loadSnowmen, snowmanHeight } from './features/snowman';
import { drawableFor } from './features/snowmanDraw';
import { createHatGift } from './features/hatGift';
import { createThrowPlay } from './features/throwPlay';
import { drawFaceSnow } from './features/snowmanDraw';
import { createPropsPlay } from './features/propsPlay';
import { createHatChase } from './features/hatChase';
import { createTreeDecor } from './features/treeDecorPlay';
import { createTreeDecorSounds } from './audio/treeDecorSounds';
import { createSleighPlay } from './features/sleighPlay';
import { createSnowmanPlay } from './features/snowmanPlay';
import { createSession } from './net/session';
import { createCold, isWarmAt } from './character/cold';
import { createBaldHead, createHat, createSneeze, drawRedNose } from './features/sneeze';
import { actionsFor, nearestInteraction, withoutSpace } from './input/interact';
import { createSkateSounds } from './audio/skateSounds';
import { createRoofSnow, createSnowHits } from './features/roofSnow';
import { createWind } from './audio/wind';
import { createHint } from './ui/hint';
import { drawSoundButton, hitSoundButton } from './ui/soundButton';
import { drawEmoteButton, hitEmoteButton } from './ui/emoteButton';
import { createEmoteWheel } from './ui/emoteUi';
import { emoteForDir, emoteForKey } from './features/emotes';
import { carouselGeometry } from './props/carousel';
import { gateGeometry } from './props/carouselEntrance';
import { CAROUSEL_GATE, CAROUSEL_X, INTERACTION_POINTS, SPAWN, TREE_X, WALK_AREA, getObstacle } from './world';
import { createWorldZones } from './zones';
import { benchAt, createBenchPlay, seatNear } from './zones/benchPlay';
import { canTakeOff, rinkExitInside, rinkGate } from './zones/skating';
import { MY_ID, createCarouselPlay, nearEntry, onCarousel, type PlayHint } from './zones/carouselPlay';
import { createSkatePlay } from './zones/skatePlay';
import { rinkBounds } from './props/iceRink';
import type { DepthDrawable } from './zones/zone';
import type { PointLight } from './scenery/lighting';
import type { Rect } from './world';

/** 노점이 무엇을 파는지: 곁을 지날 때와 구경하기 힌트 아래에 */
const STALL_SIGN_TEXT = '⛄ 눈사람 꾸미기 소품 가게';

function describeState(state: CharacterState): string {
  if (state.kind === 'riding') return `state riding mount ${state.mount} slot ${state.slot}`;
  if (state.kind === 'skating') return `state skating ${state.vx}, ${state.vy}`;
  if (state.kind === 'sitting') return `state sitting bench ${state.bench} slot ${state.slot}`;
  if (state.kind === 'pullingSleigh') return 'state pullingSleigh';
  if (state.kind === 'inSleigh') return `state inSleigh seat ${state.seat}`;
  return 'state walk';
}

export function startGame(canvas: HTMLCanvasElement, debug: boolean): void {
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // 휴대폰을 세로로 들면 게임 화면을 위쪽에 크게(양옆은 잘라서) 두고, 아래쪽에 조작 패드를 보인다
  const hint = createHint(canvas);
  const touchPad = createTouchPad();
  fitGameToWindow(canvas, SCREEN_WIDTH, SCREEN_HEIGHT, (top) => {
    touchPad.place(top);
    hint.setPad(top !== null);
  });

  const camera = createCamera();
  const world = createWorldZones();
  const zones = world.all;
  const character = createCharacter(SPAWN.x, SPAWN.y);
  // 처음 들어오면 트리를 화면 가운데에 둔다
  snapCamera(camera, TREE_X);

  // 회전목마 타기
  const play = createCarouselPlay(character, world.carousel);
  /** 손가락으로 쓰는 기기 (탭 조작 힌트를 보인다 — 아래 조작 패드를 쓰는 동안은 키보드 힌트를 패드 버튼 이름으로) */
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  // 소리: 광장 배경 + 구역별 소리(거리에 따라 크기·좌우) + 발자국. 브라우저 규칙상 첫 클릭·키 입력 뒤에만 켠다
  const footsteps = createFootsteps();
  const wind = createWind();
  // 오르골은 회전목마 판 가운데에서 울린다
  const musicBox = createMusicBox({ x: CAROUSEL_X, y: carouselGeometry().platformY });
  const skateSounds = createSkateSounds();
  const roofSnowSounds = createRoofSnowSounds();
  const sneezeSound = createSneezeSound();
  const snowmanSounds = createSnowmanSounds();
  const decorSounds = createTreeDecorSounds();
  const sound = createSoundSystem([
    snowmanSounds,
    decorSounds,
    sneezeSound,
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
    // 웃는 얼굴 버튼: 이모트 바퀴를 열고 닫는다. 바퀴가 열려 있을 때 화면을 누르면 닫기만 한다
    if (hitEmoteButton(sx, sy)) {
      if (emoteWheel.isOpen) emoteWheel.close();
      else emoteWheel.open();
      return;
    }
    if (emoteWheel.isOpen) {
      emoteWheel.close();
      return;
    }
    const worldX = sx + layerOffsetX(camera, LAYER_FACTORS.main);
    // 선물 상자를 열거나 장식 달 자리를 고르는 중: 미리보기를 누르면 달고, 트리의 다른 곳을 누르면 옮긴다
    if (treeDecor.busy) {
      treeDecor.tap(worldX, sy);
      return;
    }
    // 노점을 구경하는 중: 아이콘을 누르면 받고, 다른 데를 누르면 닫는다
    if (propsPlay.busy) {
      propsPlay.tap(worldX, sy);
      return;
    }
    // 썰매: 타는 중이면 내리고, 끄는 중이면 누른 곳으로 걸어간다
    if (sleighPlay.role) {
      sleighPlay.tap(worldX, sy);
      return;
    }
    if (sleighPlay.locked) return;
    // 스케이트를 타는 동안: 모자 곁이면 낚아채고, 출구에서 멈췄으면 벗고, 아니면 누르고 있는 쪽으로 민다 (매 프레임 따로 읽는다)
    if (skate.active) {
      if (hat.canPickUp(character.x, character.y)) {
        hat.putOn();
        skate.swoop(HAT.swoopSeconds);
      } else skate.tapWhileSkating();
      return;
    }
    // 앉아 있으면 일어난다
    if (bench.seated) {
      bench.standUp();
      return;
    }
    // 떨어진 모자를 탭하면 걸어가서 줍는다
    if (play.boarding.phase === 'none' && hat.lying && Math.abs(worldX - hat.x) <= 10 && sy >= hat.y - 14 && sy <= hat.y + 5) {
      if (hat.canPickUp(character.x, character.y)) startPickup();
      else {
        setWalkTarget(character, hat.x, hat.y);
        pickOnArrive = true;
      }
      return;
    }
    // 회전목마를 탭하면 타거나 내린다. 타는 동안에는 어디를 탭해도 내리기
    if (play.boarding.phase === 'riding' || onCarousel(worldX, sy)) {
      play.tapCarousel();
      return;
    }
    if (play.boarding.phase !== 'none') return;
    // 선물 상자를 탭하면 걸어가서 열고, 장식을 들고 트리를 탭하면 그 자리에 미리보기가 뜬다
    if (treeDecor.tap(worldX, sy)) return;
    // 바닥에 떨어진 남의 모자를 탭하면 줍고, 내 모자를 쓴 사람을 탭하면 잡거나 조르고, 모자 주인을 탭하면 돌려준다
    if (hatChase.busy) return;
    if (hatChase.tap(worldX, sy, (x, y) => setWalkTarget(character, x, y))) return;
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
    // 노점을 탭하면 걸어가 구경하고, 소품을 들고 눈사람을 탭하면 걸어가 달아준다
    if (propsPlay.tap(worldX, sy)) return;
    // 썰매·밧줄 끝을 누르면 걸어가 타거나 끈다
    if (sleighPlay.tap(worldX, sy)) return;
    // 눈사람을 탭하면 (곁에 있을 때) 내 모자를 씌워주거나 돌려받는다
    if (!propsPlay.holding && sy >= WALK_AREA.y - 40) {
      const give = hatGift.nearestToGive();
      const take = hatGift.nearestToTake();
      const near = take && take.distance <= PROPS.attachRadius ? take : give && give.distance <= PROPS.attachRadius ? give : null;
      if (near && Math.abs(worldX - near.snowman.x) <= near.snowman.tiers[0] / 2 + 3 && sy <= near.snowman.y + 3 && sy >= near.snowman.y - snowmanHeight(near.snowman.tiers) - 6) {
        if (near === take) hatGift.take(near.snowman);
        else hatGift.give(near.snowman);
        return;
      }
    }
    // 바닥을 탭했을 때만 그 자리로 걸어간다
    if (sy < WALK_AREA.y) return;
    // 바닥을 빠르게 두 번 탭하면 그쪽으로 눈덩이를 던진다
    const tapAt = performance.now() / 1000;
    if (tapAt - lastGroundTap <= THROW.doubleTapSeconds) {
      lastGroundTap = -9;
      character.target = null;
      character.facing = worldX >= character.x ? 'right' : 'left';
      throwAim = Math.abs(sy - character.y) > Math.abs(worldX - character.x) * 0.5 ? Math.sign(sy - character.y) : 0;
      throwWanted = true;
      return;
    }
    lastGroundTap = tapAt;
    setWalkTarget(character, worldX, sy);
  });
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());
  window.addEventListener('keydown', (e) => {
    // (?debug=1에서는 M이 눈덩이 놓기라 음소거는 스피커 버튼으로만)
    if (e.code === SOUND.toggleKey && !e.repeat && !debug) sound.toggleMuted();
  });

  // 지붕에 쌓인 눈: 상태(쌓인 양·떨어짐 이벤트) → 화면(지붕 눈·덩어리·바닥 더미), 맞은 캐릭터(눈 모자·눈사람), 소리
  const roofSnow = createRoofSnow();
  const snowHits = createSnowHits();
  /** ?debug=1의 T: 시간 0.25배속 (눈이 떨어지는 과정을 천천히 본다) */
  let slowMotion = false;

  // 추위 → 재채기 → 모자가 날아감 → 대머리 → 주워서 다시 쓰기
  const cold = createCold();
  const sneeze = createSneeze();
  const hat = createHat(character);
  const baldHead = createBaldHead();
  const carouselEntry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;
  /** 줍는 동작이 끝나기까지 남은 시간 (허리를 굽혀 줍고 → 털어서 쓴다) */
  let pickLeft = 0;
  /** 모자를 탭해서 걸어가는 중 — 도착하면 줍는다 */
  let pickOnArrive = false;
  /** 스케이트로 낚아챈 스페이스가 떼질 때 점프가 나가지 않게 한 번 삼킨다 */
  let swallowSpace = false;
  let wasFrozen = false;
  /** 이번 프레임에 고른 상호작용 (힌트도 이것만 띄운다) */
  let choice: 'hat' | 'carousel' | 'skate' | 'bench' | 'exit' | 'ball' | 'stall' | 'prop' | 'decorate' | 'giveHat' | 'takeHat' | 'gift' | 'hang' | 'pickOther' | 'catchHat' | 'begHat' | 'returnHat' | 'sleighGrab' | 'sleighRide' | null = null;

  /** 루돌프 썰매 (세션이 만들어지는 동안에는 아직 없다 — 아래에서 만든다) */
  let sleighRef: ReturnType<typeof createSleighPlay> | null = null;
  // 눈사람 만들기: 눈덩이·눈사람 목록(내 눈사람은 저장해 둔 것을 불러온다)과 굴리기 조작
  const snowWorld = createSnowWorld();
  // 실시간 서버: 친구들과 같은 광장. 눈덩이·눈사람은 서버에 저장한다 (예전에 이 브라우저에 저장한 것은 처음 접속 때 옮긴다)
  const session = createSession({
    canvas,
    character,
    carousel: world.carousel,
    play,
    skate,
    snowHits,
    snowWorld,
    roofSnow,
    rolling: () => snowPlay.rolling,
    snowPlay: () => snowPlay,
    treeDecor: () => treeDecor,
    hatChase: () => hatChase,
    // 세션이 만들어지는 동안에는 아직 썰매가 없다
    sleigh: () => sleighRef,
    legacy: loadSnowmen(),
    decorated: (snowman, by) => propsPlay.showHeart(snowman, by),
    newHat: () => hat.putOn(),
    thrown: (start, dir, peak) => throwPlay.remoteThrow(start, dir, peak),
    headHit: (snowman, n, dir) => throwPlay.remoteHit(snowman, n, dir),
    splatted: (at, me, head, dir) => {
      throwPlay.splatAt(at.x, at.y, head ? 26 : 14);
      if (!me) return;
      // 썰매: 끄는 루돌프는 코가 잠깐 꺼지고, 탄 사람은 얼굴에 눈만 묻는다
      if (sleighPlay.role === 'pull') {
        sleighPlay.noseBlink();
        return;
      }
      if (sleighPlay.role === 'ride') {
        faceSnowLeft = THROW.faceSnowSeconds;
        cold.add(THROW.cold);
        return;
      }
      // 내가 맞았다: 1초 동안 얼굴에 눈이 묻어 눈을 질끈 감고, 추워진다
      faceSnowLeft = THROW.faceSnowSeconds;
      cold.add(THROW.cold);
      // 머리(모자)에 맞으면 가끔 모자가 날아간다
      const hitLaunch = skate.skate ? ({ kind: 'ice', vx: skate.skate.vx, vy: skate.skate.vy } as const) : ({ kind: 'ground' } as const);
      if (head && character.extraHats.length > 0) {
        if (Math.random() < THROW.extraHatFlyChance) hatChase.dropTop(dir > 0 ? 'right' : 'left', hitLaunch);
      } else if (head && hat.on && Math.random() < THROW.hatFlyChance) {
        hat.launch({ x: character.x, y: character.y }, dir > 0 ? 'right' : 'left', hitLaunch);
      }
      // 스케이트 중이면 살짝 밀린다
      if (skate.skate) skate.skate.vx += dir * THROW.skaterPush;
    },
    // 친구가 굴리는 눈덩이도 내 화면의 눈밭에 길을 내고, 친구도 발자국을 남긴다
    trail: (x, y, d) => {
      const fp = footprint(d);
      snowField().take(x, y - fp.halfD, fp.halfW, fp.halfD);
    },
    step: (x, y, dx, dy) => {
      if (isSnowAt(x, y) && !onCarpet(x, y)) footprints.add(x, y, dx, dy);
    },
  });
  // 이모트: E(패드 😊, 화면 오른쪽 위 웃는 얼굴)로 바퀴를 열어 고르거나, 숫자 키로 바로 보낸다
  const sendEmote = (i: number) => {
    session.emote(i);
    emoteWheel.close();
  };
  const emoteWheel = createEmoteWheel(canvas, sendEmote);
  /** 바퀴를 가리키던 방향 (대각선에서 손을 뗄 때 한 축만 먼저 떼어져도 가리킨 칸이 바뀌지 않게) */
  let wheelDir = { x: 0, y: 0 };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === EMOTE.key) {
      if (!emoteWheel.isOpen) emoteWheel.open();
      else if (emoteWheel.picked !== null) sendEmote(emoteWheel.picked);
      else emoteWheel.close();
      return;
    }
    const quick = emoteForKey(e.code);
    if (quick !== null) sendEmote(quick);
  });
  const snowPlay = createSnowmanPlay(character, snowWorld, {
    field: snowField(),
    takePile: (x, y, halfW) => roofSnow.takePile(x, y, halfW),
    sounds: snowmanSounds,
    owner: () => session.owner(),
    sync: session.sync,
    me: () => session.me(),
    partner: (ball) => session.partner(ball),
    nearCoMaker: (snowman) => session.nearCoMaker(snowman),
    save: () => {},
  });
  // 노점 소품: 구경하고 받아서 들고 다니다 눈사람에 달아준다
  const propsPlay = createPropsPlay(character, snowWorld, {
    me: () => session.me().name,
    put: (snowman) => session.sync.put(snowman),
    ding: () => snowmanSounds.ding(),
    onAttach: () => session.act('decorate'),
  });
  // 트리 꾸미기: 산타가 떨어뜨린 선물 상자를 열어 나온 장식을 트리에 단다 (손은 노점 소품과 같이 쓴다)
  const treeDecor = createTreeDecor(character, {
    tree: world.plaza.tree,
    now: () => session.serverNow(),
    online: () => session.online(),
    me: () => session.me().name,
    myId: () => session.myId(),
    send: session.decor,
    hands: {
      putDown: () => propsPlay.putDown(),
      dropAt: (item, x, y, tag) => propsPlay.dropAt(item, x, y, tag),
      has: (tag) => propsPlay.ground.some((g) => g.tag === tag),
    },
    sounds: decorSounds,
    act: (a) => session.act(a),
  });
  let nearGift: ReturnType<typeof treeDecor.nearestGift> = null;
  // 남의 모자 주워 쓰고 달아나기 / 돌려달라고 조르기 / 잡아서 되찾기 / 돌려주기 (모자 자리는 서버가 정한다)
  const hatChase = createHatChase(character, hat, {
    myId: () => session.myId(),
    myScarf: () => session.me().scarf,
    others: () => session.others(),
    find: (id) => session.findOther(id),
    now: () => session.serverNow(),
    online: () => session.online(),
    skating: () => skate.active,
    send: session.hats,
    cold: (amount) => cold.add(amount),
    sound: (kind) => {
      if (kind === 'pick' || kind === 'give') snowmanSounds.ding();
      else if (kind === 'catch') snowmanSounds.clap();
      else if (kind === 'beg') snowmanSounds.grunt();
      else snowmanSounds.thud();
    },
  });
  // 루돌프 썰매: 밧줄 끝에서 Space = 끌기 (루돌프 바디슈트), 썰매 옆에서 Space = 타기 (자리는 서버가 정한다)
  const sleighPlay = createSleighPlay(character, {
    myId: () => session.myId(),
    online: () => session.online(),
    now: () => session.serverNow(),
    send: session.sleighSend,
    remote: (id) => session.remoteView(id),
    act: (a) => session.act(a),
    faceSnow: () => faceSnowLeft,
    putDownHeld: () => propsPlay.putDown(),
    sound: { poof: () => snowmanSounds.squeak(SNOWBALL.startSize), thud: () => snowmanSounds.thud() },
  });
  sleighRef = sleighPlay;
  if (debug) {
    window.addEventListener('keydown', (e) => {
      // U: 가짜 친구를 썰매 앞자리에 앉히거나 내보낸다
      if (e.code === SLEIGH.debugKey && !e.repeat) sleighPlay.debugFriend();
    });
  }
  // ?debug=1: 콘솔에서 모자 자리를 들여다볼 수 있게
  if (debug) Object.assign(window, { hatChase, sleighPlay, me: character });
  let nearOtherHat: ReturnType<typeof hatChase.nearestGroundHat> = null;
  let wearer: ReturnType<typeof hatChase.myHatWearer> = null;
  let nearOwner: ReturnType<typeof hatChase.nearestOwner> = null;
  // 눈덩이 던지기: F 키 (모바일은 바닥을 두 번 탭)
  const throwPlay = createThrowPlay(character, snowWorld, {
    now: () => performance.now() / 1000,
    canScoop: (x, y) => isSnowAt(x, y) && !onCarpet(x, y),
    owner: () => session.owner(),
    targets: () => session.targets(),
    sounds: {
      scoop: () => snowmanSounds.squeak(SNOWBALL.startSize),
      whoosh: () => snowmanSounds.whoosh(),
      thud: () => snowmanSounds.thud(),
      bonk: () => snowmanSounds.bonk(),
    },
    send: session.throwing,
    put: (thing) => session.sync.put(thing),
  });
  /** F를 눌렀다 (이번 프레임에 던진다) / 두 번 탭해 던질 방향 */
  let throwWanted = false;
  let throwAim: number | null = null;
  let lastGroundTap = -9;
  /** 눈덩이에 맞아 얼굴에 눈이 묻어 있는 남은 시간 */
  let faceSnowLeft = 0;
  window.addEventListener('keydown', (e) => {
    if (e.code === THROW.key && !e.repeat) throwWanted = true;
  });
  // 내 털모자를 눈사람에게 씌워주기 / 돌려받기
  const hatGift = createHatGift(character, hat, snowWorld, {
    topExtra: () => hatChase.topExtra(),
    gaveExtra: (owner) => hatChase.gaveToSnowman(owner),
    takeOnline: (snowman, h) => {
      const owner = hatChase.onlineOwnerByName(h.name);
      if (!owner) return false;
      hatChase.pickFromSnowman(owner, snowman.netId);
      return true;
    },
    me: () => session.me(),
    put: (snowman) => session.sync.put(snowman),
    onAct: () => session.act('decorate'),
    ding: () => snowmanSounds.ding(),
  });
  let nearGive: ReturnType<typeof hatGift.nearestToGive> = null;
  let nearTake: ReturnType<typeof hatGift.nearestToTake> = null;
  let nearStall: ReturnType<typeof propsPlay.nearestStall> | null = null;
  let nearProp: ReturnType<typeof propsPlay.nearestGround> = null;
  let nearSnowman: ReturnType<typeof propsPlay.nearestSnowman> = null;
  /** 스페이스 한 번으로 굴리기 시작해 굴리는 중인가 (다시 누르면 놓는다) */
  let keyRolling = false;
  /** (모바일) 손가락을 이어서 누르고 있던 시간, 가만히 서 있던 시간 */
  let holdTime = 0;
  let stillTime = 0;
  /** 이어 굴릴 수 있는 눈덩이 (이번 프레임) */
  let nearBall: ReturnType<typeof snowPlay.nearestBall> = null;
  const startSneeze = () => {
    if (!sneeze.start()) return;
    sneezeSound.windup();
    session.act('sneeze');
  };
  const startPickup = () => {
    pickLeft = HAT.pickSeconds;
    pickOnArrive = false;
    character.target = null;
    character.moving = false;
  };
  const distanceTo = (p: { x: number; y: number }) => Math.hypot(character.x - p.x, character.y - p.y);

  const characterDrawable: DepthDrawable = {
    get footY() {
      return character.y;
    },
    draw(c: CanvasRenderingContext2D, cam: Camera) {
      const kind = character.state.get().kind;
      const ox = layerOffsetX(cam, LAYER_FACTORS.main);
      // 썰매: 끄는 동안은 루돌프, 타는 동안은 썰매가 함께 그린다 ('평'·구르기도)
      if (sleighPlay.drawSelf(c, ox)) {
        sneeze.draw(c, ox);
        return;
      }
      // 타는 동안에는 회전목마가 탈 것과 함께 그린다
      if (kind !== 'riding') {
        const footX = Math.round(character.x) - ox;
        const footY = Math.round(character.y);
        const bending = pickLeft > HAT.pickSeconds - HAT.pickBendSeconds;
        if (skate.active) skate.drawCharacter(c, cam);
        else if (kind === 'sitting') bench.draw(c, cam);
        else if (snowHits.snowman) snowHits.drawSnowman(c, footX, footY);
        else drawCharacter(c, character, ox, bending ? { pose: 'crouch', index: 0 } : (snowPlay.pose() ?? propsPlay.pose() ?? hatGift.pose() ?? throwPlay.pose() ?? treeDecor.pose() ?? hatChase.pose() ?? { lean: snowHits.shakeLean(), lift: session.myHop() }));
        // 손에 든 노점 소품·트리 장식 (다는 동안은 treeDecor가 손에서 자리로 옮겨 그린다)
        if (!skate.active && !snowHits.snowman && !bending && !treeDecor.hidesHeld) propsPlay.drawHeld(c, footX, footY, kind === 'sitting' ? BENCH_SIT.lift : 0);
        if (!snowHits.snowman && !bending) {
          const lift = kind === 'sitting' ? BENCH_SIT.lift : 0;
          if (headLook(character).bald) baldHead.draw(c, footX, footY, character.facing, lift);
          if (cold.redNose) drawRedNose(c, footX, footY, character.facing, lift);
          if (faceSnowLeft > 0) drawFaceSnow(c, footX, footY, character.facing, lift);
        }
        snowHits.drawOver(c, footX, footY, ox);
      }
      sneeze.draw(c, ox);
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
  // 3분에 한 번 트리 위를 지나가는 산타 썰매 — 서버 시각에 맞춰 모든 화면에서 같은 때 지나가고, 지날 때마다 선물을 떨어뜨린다
  const santa = createSanta(() => session.serverNow() / 1000);
  if (debug) {
    window.addEventListener('keydown', (e) => {
      if (e.code === SANTA.debugKey) santa.fly();
      // P: 내 앞에 선물 상자를 바로 떨어뜨린다
      if (e.code === GIFT.debugKey && !e.repeat) treeDecor.debugDrop();
      // N: 즉시 재채기
      if (e.code === SNEEZE.debugKey) startSneeze();
      // H: 내 모자를 바로 앞 바닥에 떨어뜨린다
      if (e.code === HAT_CHASE.debugKey && !e.repeat && hat.on) hat.launch({ x: character.x, y: character.y }, character.facing, { kind: 'ground' });
      // M: 발 앞에 눈덩이 놓기 (누를 때마다 작음 → 중간 → 큼)
      if (e.code === SNOWBALL.debugKey && !e.repeat) snowPlay.debugDrop();
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
  const pointLights: PointLight[] = [];
  // 발밑 y로 앞뒤 정렬되는 것들. 눈덩이·눈사람은 매 프레임 뒤에 덧붙인다
  const actors: DepthDrawable[] = [characterDrawable, hat, ...sleighPlay.drawables, ...roofSnow.drawables, ...snowPlay.drawables, ...propsPlay.drawables, ...hatGift.drawables, ...throwPlay.drawables, ...hatChase.drawables];
  const fixedActors = actors.length;
  const layers = createLayers(
    zones,
    actors,
    SCENERY_SEED,
    [footprints, sleighPlay.floor, { draw: (c, ox) => roofSnow.drawFloor(c, ox) }],
    [santa, treeDecor.sky],
    () => {
      // 선물 상자·빛나는 장식 + 루돌프의 빨간 코 (매 프레임 같은 배열을 다시 채운다)
      const decor = treeDecor.lights();
      const nose = sleighPlay.lights();
      if (nose.length === 0) return decor;
      pointLights.length = 0;
      for (const l of decor) pointLights.push(l);
      for (const l of nose) pointLights.push(l);
      return pointLights;
    },
  );

  const fpsMeter = createFpsMeter();
  // 화면 밖 구역의 그림도 틈틈이 미리 그려 둔다 (처음 들어설 때 멈칫하지 않게)
  window.setTimeout(() => warmBuffers(WARM_BUFFERS.perStep, WARM_BUFFERS.stepMs), WARM_BUFFERS.delayMs);
  let lastTime = performance.now();
  const dynamicObstacles: Rect[] = [];
  const frame = (now: number) => {
    const dt = frameDt(now, lastTime) * (slowMotion ? ROOF_SNOW.debugSlowFactor : 1);
    const fps = fpsMeter.tick((now - lastTime) / 1000);
    lastTime = now;

    let actions = input.takeActions();
    let dir = input.direction();
    // 이모트 바퀴가 열려 있으면 방향키·스페이스·Esc는 바퀴가 쓴다 (캐릭터는 멈춰 있다)
    if (emoteWheel.isOpen) {
      const count = Math.abs(dir.x) + Math.abs(dir.y);
      const released = count === 1 && Math.abs(wheelDir.x) + Math.abs(wheelDir.y) === 2 && (dir.x === wheelDir.x || dir.y === wheelDir.y);
      const pointed = emoteForDir(dir.x, dir.y);
      if (pointed !== null && !released) emoteWheel.highlight(pointed);
      wheelDir = dir;
      if (actions.tap || actions.hold) {
        if (emoteWheel.picked !== null) sendEmote(emoteWheel.picked);
        else emoteWheel.close();
      } else if (actions.cancel) emoteWheel.close();
      actions = { tap: false, hold: false, cancel: false, up: false, debugFriend: actions.debugFriend };
      dir = { x: 0, y: 0 };
    } else wheelDir = { x: 0, y: 0 };
    if (debug && actions.debugFriend) play.toggleFriend();

    // 추위와 재채기 (회전목마·스케이트 중에도 한다)
    const kindNow = character.state.get().kind;
    if (wasFrozen && !snowHits.frozen) cold.sneezeIn(COLD.afterSnowmanSeconds);
    wasFrozen = snowHits.frozen;
    const lit = isWarmAt(character.x, character.y);
    const suited = sleighPlay.role === 'pull';
    // 루돌프 바디슈트(털옷)를 입고 있으면 추위가 오르지 않는다
    if (cold.update(dt, { warm: lit, bald: headLook(character).bald && !suited, canSneeze: !sneeze.active && !snowHits.frozen && pickLeft <= 0 && !treeDecor.busy && !sleighPlay.locked, insulated: suited })) startSneeze();
    if (sneeze.update(dt)) {
      // 에취! 입김 구름이 터지고 모자가 날아간다
      sneezeSound.achoo();
      cold.add(-COLD.sneezeRelief);
      sneeze.burst(character.x, character.y - (kindNow === 'sitting' ? BENCH_SIT.lift : 0), character.facing);
      const s = skate.skate;
      if (sleighPlay.role === 'pull') {
        // 루돌프는 모자 대신 코에서 빨간 빛이 반짝 터진다
        sleighPlay.noseFlash();
      } else {
      // 들고 있던 소품도 손에서 튀어 나간다
      propsPlay.putDown(true);
      const launch = s ? ({ kind: 'ice', vx: s.vx, vy: s.vy } as const) : kindNow === 'riding' ? ({ kind: 'carousel', frontY: carouselGeometry().rimBottom, safe: carouselEntry } as const) : ({ kind: 'ground' } as const);
      if (!hatChase.dropTop(character.facing, launch)) hat.launch({ x: character.x, y: character.y }, character.facing, launch);
      }
    }
    hat.update(dt);
    baldHead.update(dt, lit);
    // 줍는 동작: 허리를 굽혀 줍고, 털어서 다시 쓴다
    let pickShake = 0;
    if (pickLeft > 0) {
      const before = pickLeft;
      pickLeft = Math.max(0, pickLeft - dt);
      const putOnAt = HAT.pickSeconds - HAT.pickBendSeconds;
      if (before > putOnAt && pickLeft <= putOnAt) hat.putOn();
      if (pickLeft > 0 && pickLeft <= putOnAt) pickShake = Math.floor(pickLeft / 0.05) % 2 === 0 ? 1 : -1;
    }
    character.lean = sneeze.lean(character.facing) + cold.shiverLean() + pickShake + treeDecor.lean();
    character.speedFactor = sneeze.speedFactor() * hatChase.speedFactor();
    if (skate.skate) skate.skate.maxSpeedFactor = hatChase.speedFactor();
    // 재채기하는 동안('흐… 흐… 에취')은 눈을 감는다
    faceSnowLeft = Math.max(0, faceSnowLeft - dt);
    character.eyesClosed = sneeze.active || faceSnowLeft > 0;

    // 눈밭: 걷힌 눈이 다시 쌓이고, 놓아둔 눈덩이·눈사람은 걸어서 못 지나간다
    snowField().update(dt);
    // 썰매도 걸어 다니는 사람에게는 장애물 (내가 끌거나 탈 때는 빼고)
    const snowObstacles = snowWorld.obstacles(snowPlay.rolling ?? snowPlay.helping);
    const sleighBox = sleighPlay.obstacle();
    if (sleighBox) {
      dynamicObstacles.length = 0;
      for (const o of snowObstacles) dynamicObstacles.push(o);
      dynamicObstacles.push(sleighBox);
      setDynamicObstacles(dynamicObstacles);
    } else setDynamicObstacles(snowObstacles);
    // 굴리기: 스페이스를 한 번 누르면 시작해 계속 굴리고, 다시 누르면 놓는다 (닿아 있으면 올린다).
    // 모바일은 바닥을 길게 눌러 시작하고, 누른 채 끌면 그쪽으로 굴리고, 떼면 놓는다
    const press = input.pointer();
    const pressing = press !== null && press.sy >= WALK_AREA.y;
    const spacePressed = actions.tap || actions.hold;
    if (snowPlay.phase !== 'gather' && snowPlay.phase !== 'roll' && snowPlay.phase !== 'help') keyRolling = false;
    if (keyRolling && (snowPlay.rolling || snowPlay.helping) && spacePressed) keyRolling = false;
    const holding = keyRolling || pressing;
    holdTime = pressing ? holdTime + dt : 0;
    let rollDir = dir;
    if (dir.x === 0 && dir.y === 0 && pressing && (snowPlay.rolling || snowPlay.helping)) {
      const dx = press.sx + layerOffsetX(camera, LAYER_FACTORS.main) - character.x;
      const dy = press.sy - character.y;
      const d = Math.hypot(dx, dy);
      if (d > SKATE.pointerDeadZone) rollDir = { x: dx / d, y: dy / d };
    }
    const snowBusy = snowPlay.busy;
    snowPlay.update(dt, rollDir, holding);
    // 노점 소품: 눈 굴리기·스케이트를 시작하면 발밑에 내려놓는다
    if (propsPlay.holding && (skate.active || snowPlay.phase === 'gather' || snowPlay.phase === 'roll' || snowPlay.phase === 'help')) propsPlay.putDown();
    const propsBusy = propsPlay.busy || hatGift.busy || throwPlay.busy || treeDecor.busy || (hatChase.busy && hatChase.phase !== 'pat' && hatChase.phase !== 'scratch');
    propsPlay.update(dt, dir, actions);
    hatGift.update(dt);
    hatChase.update(dt);
    treeDecor.update(dt, dir, actions, stillTime);
    throwPlay.update(dt, throwAim ?? dir.y);
    const wantThrow = throwWanted;
    const aimNow = throwAim ?? dir.y;
    throwWanted = false;
    if (!throwPlay.busy) throwAim = null;

    choice = null;
    const hatLying = hat.lying;
    if (snowHits.frozen) {
      // 눈사람: 못 움직인다. 방향키를 연타하면 더 빨리 빠져나온다
      snowHits.struggle(actions.moveTaps ?? 0);
      character.moving = false;
      character.target = null;
    } else if (pickLeft > 0) {
      character.moving = false;
      character.target = null;
    } else if (sleighPlay.role || sleighPlay.locked) {
      // 썰매를 끌거나 타는 중, 튕겨 나가 구르는 중 (눈 굴리기·던지기·모자 줍기·소품 달기는 못 한다)
      sleighPlay.handleInput(dt, dir, actions);
    } else if (snowBusy) {
      // 눈덩이를 굴리거나 올리는 중: 캐릭터는 snowPlay가 움직인다
      character.target = null;
    } else if (propsBusy) {
      // 노점을 구경하거나 소품을 달아주는 중, 선물을 열거나 트리에 장식을 다는 중: 캐릭터는 그쪽이 맡는다
      character.target = null;
    } else if (skate.active) {
      const p = input.pointer();
      const pointerWorld = p ? { x: p.sx + layerOffsetX(camera, LAYER_FACTORS.main), y: p.sy } : null;
      const s = skate.skate;
      // 얼음 위: 모자 줍기와 출구에서 벗기 가운데 가까운 쪽만. 줍기는 점프·스핀보다 먼저
      wearer = hatChase.myHatWearer();
      if (s) {
        choice = nearestInteraction([
          { id: 'catchHat', distance: wearer?.canCatch ? wearer.distance : Infinity, radius: HAT_CHASE.catchRadius },
          { id: 'hat', distance: hatLying ? distanceTo(hat) : Infinity, radius: HAT.pickRadius },
          { id: 'exit', distance: canTakeOff(s) ? distanceTo(rinkExitInside()) : Infinity, radius: SKATE.exitRadius },
        ]);
      }
      let skateActions = actions;
      if (swallowSpace && (actions.tap || actions.hold)) {
        swallowSpace = false;
        skateActions = withoutSpace(actions);
      }
      if (choice === 'catchHat' && wearer) {
        if (actions.spaceDown || actions.tap || actions.hold) {
          hatChase.catch(wearer.id);
          swallowSpace = actions.spaceDown === true && !actions.tap;
        }
        skateActions = withoutSpace(actions);
      }
      if (choice === 'hat') {
        // 미끄러지면서 낚아채듯 줍는다
        if (actions.spaceDown || actions.tap || actions.hold) {
          hat.putOn();
          skate.swoop(HAT.swoopSeconds);
          swallowSpace = actions.spaceDown === true && !actions.tap;
        }
        skateActions = withoutSpace(actions);
      }
      skate.handleInput(dir, skateActions, choice === 'hat' || choice === 'catchHat' || swallowSpace || emoteWheel.isOpen ? false : input.spaceHeld(), pointerWorld);
    } else if (bench.seated) {
      bench.handleSeated(dt, dir, actions);
    } else if (play.boarding.phase !== 'none') {
      play.handleInput(dt, dir, actions);
    } else {
      // 걸어 다니는 중: 스페이스는 가장 가까운 상호작용 하나에만 간다
      const seat = seatNear(character.x, character.y);
      nearBall = snowPlay.nearestBall();
      nearStall = propsPlay.nearestStall();
      nearProp = propsPlay.nearestGround();
      nearSnowman = propsPlay.nearestSnowman();
      nearGive = hatGift.nearestToGive();
      nearTake = hatGift.nearestToTake();
      nearGift = treeDecor.nearestGift();
      nearOtherHat = hatChase.nearestGroundHat();
      wearer = hatChase.myHatWearer();
      nearOwner = hatChase.nearestOwner();
      choice = nearestInteraction([
        // 붙어 있으면 조르기보다 잡기가 먼저 (거리가 같으면 앞에 적은 쪽)
        { id: 'catchHat', distance: wearer?.canCatch ? wearer.distance : Infinity, radius: HAT_CHASE.catchRadius },
        { id: 'begHat', distance: wearer ? wearer.distance : Infinity, radius: HAT_CHASE.begRadius },
        { id: 'returnHat', distance: nearOwner ? nearOwner.distance : Infinity, radius: HAT_CHASE.giveRadius },
        { id: 'pickOther', distance: nearOtherHat ? nearOtherHat.distance : Infinity, radius: HAT.pickRadius },
        { id: 'gift', distance: nearGift ? nearGift.distance : Infinity, radius: GIFT.openRadius },
        { id: 'hang', distance: treeDecor.hangDistance(), radius: TREE_DECOR.hangRadius },
        { id: 'hat', distance: hatLying ? distanceTo(hat) : Infinity, radius: HAT.pickRadius },
        { id: 'carousel', distance: distanceTo(carouselEntry), radius: CAROUSEL.entryRadius },
        { id: 'skate', distance: distanceTo(rinkGate()), radius: SKATE.gateRadius },
        { id: 'bench', distance: seat ? Math.hypot(character.x - seat.frontX, character.y - seat.frontY) : Infinity, radius: BENCH_SIT.sitRadius },
        { id: 'ball', distance: nearBall ? nearBall.distance : Infinity, radius: SNOWBALL.continueRadius },
        { id: 'decorate', distance: nearSnowman ? nearSnowman.distance : Infinity, radius: PROPS.attachRadius },
        { id: 'giveHat', distance: nearGive ? nearGive.distance : Infinity, radius: PROPS.attachRadius },
        { id: 'takeHat', distance: nearTake ? nearTake.distance : Infinity, radius: PROPS.attachRadius },
        { id: 'prop', distance: nearProp ? nearProp.distance : Infinity, radius: PROPS.pickRadius },
        { id: 'stall', distance: nearStall.distance, radius: PROPS.stallRadius },
        { id: 'sleighGrab', distance: sleighPlay.grabDistance(), radius: SLEIGH.grabRadius },
        { id: 'sleighRide', distance: sleighPlay.rideDistance(), radius: SLEIGH.rideRadius },
      ]);
      // 스페이스(모바일은 길게 누르기): 눈덩이 곁이면 이어 굴리고, 더 가까운 상호작용이 없는 눈밭이면 새로 뭉친다
      let startedRolling = false;
      const longPress = holdTime >= SNOWBALL.holdSeconds;
      if (spacePressed || longPress) {
        // 남이 밀고 있는 눈덩이면 같이 밀고, 놓여 있는 것이면 (누가 놓고 간 것이든) 이어 굴린다
        if (choice === 'ball' && nearBall) startedRolling = nearBall.ball.heldBy ? snowPlay.joinAsHelper(nearBall.ball) : snowPlay.continueWith(nearBall.ball);
        else if (choice === null) startedRolling = snowPlay.start();
        if (startedRolling && spacePressed) keyRolling = true;
      }
      if (actions.tap || actions.hold) {
        if (choice === 'stall') propsPlay.open(nearStall.index);
        else if (choice === 'prop' && nearProp) propsPlay.pickUp(nearProp.item);
        else if (choice === 'decorate' && nearSnowman) propsPlay.decorate(nearSnowman.snowman);
        else if (choice === 'giveHat' && nearGive) hatGift.give(nearGive.snowman);
        else if (choice === 'takeHat' && nearTake) hatGift.take(nearTake.snowman);
        else if (choice === 'gift' && nearGift) treeDecor.open(nearGift.id);
        else if (choice === 'hang') treeDecor.startPick();
        else if (choice === 'pickOther' && nearOtherHat) hatChase.pick(nearOtherHat.owner);
        else if (choice === 'catchHat' && wearer) hatChase.catch(wearer.id);
        else if (choice === 'begHat') hatChase.beg();
        else if (choice === 'returnHat' && nearOwner) hatChase.give(nearOwner.owner);
        else if (choice === 'sleighGrab') sleighPlay.grab();
        else if (choice === 'sleighRide') sleighPlay.sit();
      }
      // F: 눈을 한 줌 뭉쳐 던진다 (눈 쌓인 바닥에서, 다른 일을 시작하지 않았을 때)
      if (wantThrow && !startedRolling && pickLeft <= 0 && !propsPlay.busy && !hatGift.busy && !treeDecor.busy && !hatChase.busy) throwPlay.start(aimNow);
      if (dir.x !== 0 || dir.y !== 0) pickOnArrive = false;
      if (choice === 'hat' && (actions.tap || actions.hold)) startPickup();
      else if (pickOnArrive && !character.target) {
        pickOnArrive = false;
        if (hat.canPickUp(character.x, character.y)) startPickup();
      }
      if (pickLeft <= 0 && !startedRolling && !(skate.handleWalking(actionsFor('skate', choice, actions), dir) || bench.handleWalking(actionsFor('bench', choice, actions), dir))) {
        play.handleInput(dt, dir, actionsFor('carousel', choice, actions));
      }
    }
    for (const zone of zones) zone.update(dt);
    skate.update(dt);
    sleighPlay.update(dt);
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
    snowHits.handle(roofEvents, MY_ID, (amount) => cold.add(amount));
    snowHits.follow(character.x, character.y);
    snowHits.update(dt);
    // 소리: 미끄러지는 동안 스르르, 덩어리가 닿을 때마다 퍽
    roofSnowSounds.setSlide(roofSnow.sliding());
    for (const ev of roofEvents) {
      if (ev.type === 'land') {
        roofSnowSounds.thud(ev.x, ev.y, ev.size);
        // 지붕 눈이 눈사람 위에 떨어지면 머리에 눈이 얹힌다
        for (const s of snowWorld.snowmen) {
          if (Math.abs(s.x - ev.x) <= s.tiers[0] / 2 + 2 && Math.abs(s.y - ev.y) <= 10) s.capped = true;
        }
      }
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
    // 달 자리를 고르거나 다는 동안은 트리에 고정한다
    updateCamera(camera, riding ? CAROUSEL_X : (treeDecor.cameraFocus ?? character.x), dt);
    updateLayers(layers, dt, camera);
    sound.setListener(character.x, character.y);
    const kindAfter = character.state.get().kind;
    const walking = (kindAfter === 'walk' || kindAfter === 'pullingSleigh') && !skate.active && !sleighPlay.locked;
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

    actors.length = fixedActors;
    for (const b of snowWorld.balls) actors.push(drawableFor(b));
    for (const s of snowWorld.snowmen) actors.push(drawableFor(s));
    // 친구들: 위치·상태를 주고받고 함께 그린다
    for (const item of propsPlay.ground) actors.push(item.drawable);
    const pushLabels = snowPlay.labels();
    const heartLabels = propsPlay.labels();
    const decorLabels = treeDecor.labels();
    const chaseLabels = hatChase.labels();
    let labels = heartLabels.length === 0 ? pushLabels : pushLabels.length === 0 ? heartLabels : pushLabels.concat(heartLabels);
    if (decorLabels.length > 0) labels = labels.length === 0 ? decorLabels : labels.concat(decorLabels);
    if (chaseLabels.length > 0) labels = labels.length === 0 ? chaseLabels : labels.concat(chaseLabels);
    for (const d of treeDecor.drawables()) actors.push(d);
    session.tick(dt, layerOffsetX(camera, LAYER_FACTORS.main), labels);
    for (const d of session.drawables()) actors.push(d);
    stillTime = walking && !character.moving && !snowPlay.busy ? stillTime + dt : 0;
    drawLayers(ctx, camera, layers);
    drawSoundButton(ctx, sound.started && !sound.muted);
    drawEmoteButton(ctx, emoteWheel.isOpen);
    // 바퀴는 내 캐릭터 몸 가운데를 둘러싼다
    emoteWheel.place(character.x - layerOffsetX(camera, LAYER_FACTORS.main), character.y - CHARACTER.spriteHeight / 2);
    if (debug) {
      drawDebugOverlay(ctx, camera, character, zones, fps, [describeState(character.state.get()), `cold ${cold.value.toFixed(0)}  B: friend  H: santa  N: sneeze  R: roof snow  T: slow${slowMotion ? ' ON' : ''}`, treeDecor.debugLine(), sleighPlay.debugLine() + '  U: sleigh friend']);
      roofSnow.drawDebug(ctx, camera);
      treeDecor.drawDebug(ctx, camera);
      ctx.fillStyle = '#7fd6ff';
      ctx.font = '7px monospace';
      ctx.fillText(session.debugLine(), 200, 262);
    }

    // 힌트도 고른 상호작용 하나만. 조작 패드를 쓰는 동안은 패드가 키보드 역할이라 키보드 힌트를 (버튼 이름으로 바꿔) 보인다
    const touch = coarsePointer && !touchPad.active;
    let h: PlayHint | null;
    if (sleighPlay.role || sleighPlay.locked) h = sleighPlay.hint(touch);
    else if (snowPlay.busy) h = snowPlay.hint(touch);
    else if (propsPlay.busy) h = propsPlay.hint(touch);
    else if (treeDecor.busy) h = treeDecor.hint(touch);
    else if (choice === 'gift' && nearGift) h = { text: touch ? '탭해서 열기' : 'Space 열기', anchor: 'point', at: { x: nearGift.x, y: nearGift.y - GIFT.height - 8 } };
    else if (choice === 'hang') h = { text: touch ? '트리를 탭해서 달기' : 'Space 달기', anchor: 'head' };
    else if (choice === 'catchHat' && wearer) h = { text: touch ? '탭해서 잡기!' : 'Space 잡기!', anchor: 'point', at: { x: wearer.x, y: wearer.y - HINT.aboveHead } };
    else if (choice === 'begHat' && wearer) h = { text: touch ? '탭해서 돌려줘!' : 'Space 돌려줘!', anchor: 'head' };
    else if (choice === 'sleighGrab') h = { text: touch ? '밧줄 끝을 탭해서 끌기' : 'Space 끌기', anchor: 'head' };
    else if (choice === 'sleighRide') h = { text: touch ? '썰매를 탭해서 타기' : 'Space 타기', anchor: 'head' };
    else if (choice === 'returnHat' && nearOwner) h = { text: touch ? '탭해서 돌려주기' : 'Space 돌려주기', anchor: 'point', at: { x: nearOwner.x, y: nearOwner.y - HINT.aboveHead }, scale: nearOwner.begging ? HAT_CHASE.bigHint : undefined };
    else if (choice === 'pickOther' && nearOtherHat) h = { text: touch ? '탭해서 줍기' : 'Space 줍기', anchor: 'point', at: { x: nearOtherHat.x, y: nearOtherHat.y - HAT.hintAbove } };
    else if (choice === 'giveHat' && nearGive) h = { text: touch ? '눈사람을 탭해서 내 모자 씌워주기' : 'Space 내 모자 씌워주기', anchor: 'point', at: { x: nearGive.snowman.x, y: nearGive.snowman.y - snowmanHeight(nearGive.snowman.tiers) - 10 } };
    else if (choice === 'takeHat' && nearTake) h = { text: (touch ? '눈사람을 탭해서 ' : 'Space ') + (nearTake.kind === 'back' ? '모자 돌려받기' : '모자 가져가기'), anchor: 'point', at: { x: nearTake.snowman.x, y: nearTake.snowman.y - snowmanHeight(nearTake.snowman.tiers) - 10 } };
    else if (choice === 'stall' && nearStall) h = { text: touch ? '탭해서 구경하기' : 'Space 구경하기', sub: STALL_SIGN_TEXT, anchor: 'point', at: { x: nearStall.x, y: nearStall.y - HINT.aboveHead - 6 } };
    else if (choice === 'prop' && nearProp) h = { text: touch ? '탭해서 줍기' : 'Space 줍기', anchor: 'point', at: { x: nearProp.item.x, y: nearProp.item.y - HAT.hintAbove } };
    else if (choice === 'decorate' && nearSnowman) h = { text: touch ? '눈사람을 탭해서 달아주기' : 'Space 달아주기', anchor: 'point', at: { x: nearSnowman.snowman.x, y: nearSnowman.snowman.y - snowmanHeight(nearSnowman.snowman.tiers) - 10 } };
    else if (choice === 'ball' && nearBall) {
      const together = nearBall.ball.heldBy !== null;
      h = { text: touch ? (together ? '길게 눌러 같이 밀기' : '길게 눌러 이어 굴리기') : together ? 'Space 같이 밀기' : 'Space 이어 굴리기', anchor: 'point', at: { x: nearBall.ball.x, y: nearBall.ball.y - nearBall.ball.d - 8 } };
    } else if (choice === 'hat') h = { text: touch ? '탭해서 줍기' : 'Space 줍기', anchor: 'point', at: { x: hat.x, y: hat.y - HAT.hintAbove } };
    else if (choice === 'skate' || choice === 'exit') h = skate.hint(touch);
    else if (choice === 'bench') h = bench.hint(touch);
    else if (choice === 'carousel') h = play.hint(touch);
    else h = skate.hint(touch) ?? bench.hint(touch) ?? play.hint(touch);
    // 노점 곁을 지나가면 무엇을 파는지 알려 준다 (구경할 거리보다 넓게)
    if (!h && walking && choice === null && !propsPlay.busy && nearStall && nearStall.distance <= PROPS.signNoticeRadius) {
      h = { text: STALL_SIGN_TEXT, anchor: 'point', at: { x: nearStall.x, y: nearStall.y - HINT.aboveHead - 6 } };
    }
    // 더 가까운 상호작용이 없는 눈밭에 가만히 서 있으면 눈 굴리기를 알려 준다
    if (!h && choice === null && !propsPlay.busy && !hatGift.busy && !throwPlay.busy && !treeDecor.busy && !hatChase.busy && stillTime >= SNOWBALL.hintAfter && snowPlay.canStartHere()) {
      h = { text: touch ? '길게 눌러 눈 굴리기 · 두 번 탭해 던지기' : 'Space 눈 굴리기 · F 던지기 · E 표현', anchor: 'head' };
    }
    // 이모트 바퀴를 여는 동안은 화면 위쪽 가운데에 (바퀴 칸을 가리지 않게)
    if (emoteWheel.isOpen) hint.show({ text: touch ? '눌러서 보내기 · 가운데 ✕ 닫기' : touchPad.active ? '방향키 고르기 · Space 보내기 · Esc 닫기' : `방향키 고르기 · Space 보내기 · 1~${EMOTES.length} 바로 · Esc 닫기`, sx: (VIEW.left + VIEW.right) / 2, sy: EMOTE.hintY });
    else if (!h || pickLeft > 0) hint.show(null);
    else if (h.anchor === 'point' && h.at) hint.show({ text: h.text, sub: h.sub, sx: h.at.x - layerOffsetX(camera, LAYER_FACTORS.main), sy: h.at.y, scale: h.scale });
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
