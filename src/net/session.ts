// 게임과 실시간 서버를 잇는다: 입장(닉네임·목도리 색), 내 위치·상태·동작 보내기, 친구들 그리기,
// 회전목마 자리(서버가 정한다)와 시계 맞추기, 지붕 눈 시각 맞추기, 눈덩이·눈사람 주고받기, 끊김·다시 붙기.
// 무료 한도를 아끼게 꼭 필요할 때만 보낸다 — 위치는 움직이는 동안 초당 최대 8번, 상태는 바뀔 때만.

import type { Character } from '../character/character';
import { NET, SNOWMAN } from '../constants';
import type { RoofSnow, SnowHits } from '../features/roofSnow';
import type { Ball, SnowThing, SnowWorld } from '../features/snowman';
import { emptySeats, type Act, type ServerMessage, type SnowmanData, type WireHat, type WireSeats, type WireState } from '../shared/protocol';
import { createNetUi, askProfile } from '../ui/netUi';
import type { CarouselZone } from '../zones/carousel';
import { MY_ID, type CarouselPlay } from '../zones/carouselPlay';
import { findSeat } from '../zones/carouselRide';
import type { SkatePlay } from '../zones/skatePlay';
import type { DepthDrawable } from '../zones/zone';
import { createNet, loadProfile, saveProfile, type NetStatus, type Profile } from './client';
import { createRemotePlayers, outfitOf } from './remotePlayers';

export interface SessionDeps {
  canvas: HTMLCanvasElement;
  character: Character;
  carousel: CarouselZone;
  play: CarouselPlay;
  skate: SkatePlay;
  snowHits: SnowHits;
  snowWorld: SnowWorld;
  roofSnow: RoofSnow;
  /** 지금 내가 굴리는 눈덩이 */
  rolling: () => Ball | null;
  /** 예전에 이 브라우저에만 저장해 둔 내 눈사람 (처음 접속 때 서버로 옮기고 지운다) */
  legacy: SnowmanData[];
}

export interface Session {
  /** 눈사람 주인으로 쓸 내 id (서버에 들어가 있으면 접속 id) */
  owner(): string;
  /** 눈덩이·눈사람을 서버에 알리는 고리 (snowmanPlay에 넘긴다) */
  readonly sync: { rolling(ball: Ball): void; put(thing: SnowThing): void; del(thing: SnowThing): void };
  /** 한 번짜리 동작을 알린다 (재채기처럼 게임이 직접 아는 것) */
  act(a: Act): void;
  /** 매 프레임: offsetX = 본 레이어가 왼쪽으로 밀린 정도 */
  tick(dt: number, offsetX: number): void;
  /** 친구 캐릭터들 */
  drawables(): readonly DepthDrawable[];
  /** ?debug=1: 접속자 수, 초당 보낸/받은 메시지 수 */
  debugLine(): string;
}

export function createSession(deps: SessionDeps): Session {
  const { character, carousel, snowWorld } = deps;
  const ui = createNetUi(deps.canvas);
  const remotes = createRemotePlayers(carousel.seats, () => carousel.rideTime());
  let profile: Profile | null = loadProfile();
  let legacy = deps.legacy;
  let lastSeats: WireSeats = emptySeats();
  const seconds = () => performance.now() / 1000;

  // ── 회전목마 자리: 서버가 정한 배열을 그대로 앉힌다 (내 자리는 내 화면이 맡는다)
  const applySeats = (wire: WireSeats) => {
    lastSeats = wire;
    const seats = carousel.seats;
    wire.forEach((slots, mount) => {
      slots.forEach((id, slot) => {
        if (!seats[mount] || slot >= seats[mount].length) return;
        if (seats[mount][slot]?.id === MY_ID) return;
        seats[mount][slot] = id && id !== net.id ? (remotes.get(id)?.occupant ?? null) : null;
      });
    });
  };

  // ── 눈덩이·눈사람
  const ballData = (b: Ball) => ({ x: b.x, y: b.y, d: b.d, roll: b.roll, seed: b.seed, owner: b.owner });
  const put = (thing: SnowThing) => {
    if (net.status !== 'online') return;
    thing.synced = true;
    if (thing.kind === 'ball') net.send({ t: 'put', id: thing.netId, kind: 'ball', data: ballData(thing) });
    else net.send({ t: 'put', id: thing.netId, kind: 'snowman', data: { x: thing.x, y: thing.y, tiers: thing.tiers, seed: thing.seed, owner: thing.owner } });
  };
  let lastBallSent = 0;

  const loadWorld = (message: Extract<ServerMessage, { t: 'welcome' }>) => {
    const rolling = deps.rolling();
    // 서버에서 받았던 것은 비우고 새로 받는다. 접속 없이 만들어 둔 것(아직 안 알린 것)은 남겼다가 올린다
    for (let k = snowWorld.balls.length - 1; k >= 0; k--) {
      const b = snowWorld.balls[k];
      if (b !== rolling && b.synced) snowWorld.balls.splice(k, 1);
    }
    for (let k = snowWorld.snowmen.length - 1; k >= 0; k--) if (snowWorld.snowmen[k].synced) snowWorld.snowmen.splice(k, 1);
    for (const o of message.objects) {
      if (o.kind === 'ball') snowWorld.upsertBall(o.id, o.data, null, Math.max(0, (message.now - o.updatedAt) / 1000));
      else snowWorld.upsertSnowman(o.id, o.data);
    }
    for (const r of message.rolling) snowWorld.upsertBall(r.id, { ...r, owner: r.owner }, r.owner);
    for (const thing of [...snowWorld.balls, ...snowWorld.snowmen]) {
      if (thing.synced || thing === rolling) continue;
      thing.owner = message.id;
      put(thing);
    }
  };

  // ── 내 상태 보내기 (바뀔 때만)
  let sentState = '';
  let sentRiding = false;
  const wireState = (): WireState => {
    const s = character.state.get();
    if (s.kind === 'riding') return { kind: 'riding', mount: s.mount, slot: s.slot };
    if (s.kind === 'sitting') return { kind: 'sitting', bench: s.bench, slot: s.slot };
    return { kind: s.kind };
  };
  const sendState = (force = false) => {
    if (net.status !== 'online') return;
    const state = wireState();
    const hat: WireHat = character.hat.get();
    const text = JSON.stringify([state, hat]);
    if (!force && text === sentState) return;
    sentState = text;
    net.send({ t: 'state', state, hat });
    // 회전목마 자리는 서버에 물어본다
    if (state.kind === 'riding') {
      net.send({ t: 'sit', mount: state.mount, slot: state.slot });
      sentRiding = true;
    } else if (sentRiding) {
      net.send({ t: 'stand' });
      sentRiding = false;
    }
  };

  const onMessage = (message: ServerMessage) => {
    const now = seconds();
    switch (message.t) {
      case 'welcome':
        remotes.clear();
        for (const p of message.players) remotes.add(p, now, false);
        applySeats(message.seats);
        loadWorld(message);
        // 옮긴 눈사람은 이 브라우저에서 지운다
        if (legacy.length > 0) {
          legacy = [];
          try {
            localStorage.removeItem(SNOWMAN.storageKey);
          } catch {
            // 못 지워도 다음 접속 때 서버가 같은 것을 다시 받을 뿐이다
          }
        }
        sentRiding = false;
        sendState(true);
        break;
      case 'joined':
        remotes.add(message.player, now, true);
        break;
      case 'left':
        remotes.remove(message.id);
        for (const b of snowWorld.balls) if (b.heldBy === message.id) b.heldBy = null;
        break;
      case 'pos':
      case 'state':
      case 'act':
        remotes.handle(message, now);
        break;
      case 'seats':
        applySeats(message.seats);
        break;
      case 'seatDenied':
        // 다른 사람이 먼저 앉았다: 내려서 그 사람을 앉힌다
        deps.play.kick();
        applySeats(lastSeats);
        break;
      case 'ball':
        snowWorld.upsertBall(message.id, { ...message, owner: message.owner }, message.owner);
        break;
      case 'put':
        if (message.object.kind === 'ball') snowWorld.upsertBall(message.object.id, message.object.data, null);
        else snowWorld.upsertSnowman(message.object.id, message.object.data);
        break;
      case 'del':
        if (snowWorld.findNet(message.id) !== deps.rolling()) snowWorld.removeNet(message.id);
        break;
      case 'full':
        break;
    }
  };

  const onStatus = (status: NetStatus) => {
    if (status !== 'online') {
      // 접속이 없는 동안 친구들은 보이지 않는다 (혼자 돌아다닐 수는 있다)
      remotes.clear();
      applySeats(emptySeats());
    }
    ui.status(status === 'reconnecting' ? '다시 연결 중…' : status === 'connecting' ? '연결 중…' : null);
    if (status === 'full') ui.notice('광장이 꽉 찼어요 (8명)', '다시 시도', () => enter());
    else if (status === 'idle') ui.notice('오래 쉬어서 연결을 끊었어요', '다시 들어가기', () => enter());
    else ui.notice(null);
  };

  /** 마지막으로 키·터치 입력이 있던 때 */
  let lastInput = seconds();
  const net = createNet(onMessage, onStatus);

  const enter = () => {
    if (!profile) return;
    ui.notice(null);
    lastInput = seconds();
    character.outfit = outfitOf(profile.scarf);
    net.connect(profile, legacy);
  };

  // 처음이면 닉네임과 목도리 색을 묻는다. 다음부터는 바로 입장
  if (profile) enter();
  else {
    void askProfile(null).then((p) => {
      profile = p;
      saveProfile(p);
      enter();
    });
  }

  character.state.onChange(() => sendState());
  character.hat.onChange(() => sendState());

  // 10분 동안 아무 입력이 없으면 연결을 끊는다
  for (const type of ['keydown', 'pointerdown'] as const) window.addEventListener(type, () => (lastInput = seconds()));

  // 위치: 움직이는 동안만 초당 최대 8번, 멈추면 마지막 위치 한 번
  let lastX = character.x;
  let lastY = character.y;
  let lastPosSent = 0;
  let sentMoving = false;
  const sendPosition = (now: number) => {
    const moved = character.x !== lastX || character.y !== lastY;
    lastX = character.x;
    lastY = character.y;
    // 탭을 숨겼거나 회전목마를 타는 중(자리로 정해진다)이면 보내지 않는다
    if (document.hidden || character.state.get().kind === 'riding') return;
    if (!moved && !sentMoving) return;
    if (moved && now - lastPosSent < 1 / NET.positionsPerSecond) return;
    lastPosSent = now;
    sentMoving = moved;
    const s = deps.skate.skate;
    net.send({
      t: 'pos',
      x: Math.round(character.x * 10) / 10,
      y: Math.round(character.y * 10) / 10,
      f: character.facing === 'right' ? 1 : 0,
      m: moved ? 1 : 0,
      ...(s && moved ? { vx: Math.round(s.vx), vy: Math.round(s.vy) } : {}),
    });
  };

  // 한 번짜리 동작: 눈사람 됨, 넘어짐, 점프·스핀, 손 흔들기
  let wasFrozen = false;
  let wasFallen = false;
  let wasJumping = false;
  let wasSpinning = false;
  let lastWave = 0;
  const sendActs = () => {
    const frozen = deps.snowHits.frozen;
    if (frozen && !wasFrozen) net.send({ t: 'act', a: 'snowman' });
    wasFrozen = frozen;
    const s = deps.skate.skate;
    const fallen = s?.phase === 'fallen';
    const jumping = s ? s.jump !== null : false;
    const spinning = s?.phase === 'spinning' || (jumping && s !== null && s.airSpin);
    if (fallen && !wasFallen) net.send({ t: 'act', a: 'fall' });
    if (jumping && !wasJumping) net.send({ t: 'act', a: 'jump' });
    if (spinning !== wasSpinning) net.send({ t: 'act', a: spinning ? 'spin' : 'spinEnd' });
    wasFallen = fallen;
    wasJumping = jumping;
    wasSpinning = spinning === true;
    const at = findSeat(carousel.seats, MY_ID);
    const wave = at ? (carousel.seats[at.mount][at.slot]?.waveLeft ?? 0) : 0;
    if (wave > lastWave) net.send({ t: 'act', a: 'wave' });
    lastWave = wave;
  };

  return {
    owner: () => net.id ?? MY_ID,
    sync: {
      rolling(ball) {
        const now = seconds();
        if (net.status !== 'online' || now - lastBallSent < 1 / NET.ballsPerSecond) return;
        lastBallSent = now;
        net.send({ t: 'ball', id: ball.netId, x: Math.round(ball.x), y: Math.round(ball.y), d: Math.round(ball.d * 10) / 10, roll: Math.round(ball.roll * 100) / 100, seed: ball.seed });
      },
      put,
      del(thing) {
        if (net.status === 'online') net.send({ t: 'del', id: thing.netId });
      },
    },
    act(a) {
      net.send({ t: 'act', a });
    },
    tick(dt, offsetX) {
      const now = seconds();
      net.tick(dt);
      remotes.update(dt, now);
      ui.names(remotes.names(offsetX));
      if (net.status !== 'online') return;
      // 회전목마 각도와 지붕 눈이 떨어지는 때를 서버 시각에 맞춘다 (모두 같은 화면)
      const serverSeconds = net.serverNow() / 1000;
      carousel.syncRideTime(serverSeconds);
      deps.roofSnow.syncTo(serverSeconds);
      sendPosition(now);
      sendActs();
      if (now - lastInput > NET.idleSeconds) net.close('idle');
    },
    drawables: () => remotes.drawables(),
    debugLine() {
      const { sent, received } = net.stats();
      return `net ${net.status}  players ${net.status === 'online' ? remotes.count + 1 : 0}  sent ${sent}/s  recv ${received}/s`;
    },
  };
}

