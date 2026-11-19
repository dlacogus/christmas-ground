// 게임과 실시간 서버를 잇는다: 입장(닉네임·목도리 색), 내 위치·상태·동작 보내기, 친구들 그리기,
// 회전목마 자리(서버가 정한다)와 시계 맞추기, 지붕 눈 시각 맞추기, 눈덩이·눈사람 주고받기, 선물 상자·트리 장식, 끊김·다시 붙기.
// 무료 한도를 아끼게 꼭 필요할 때만 보낸다 — 위치는 움직이는 동안 초당 최대 8번, 상태는 바뀔 때만.

import type { Character } from '../character/character';
import { COPUSH, HAT_GIFT, NET, SNOWMAN, THROW } from '../constants';
import { hatOnEntry } from '../features/hatGift';
import type { MoveInput } from '../character/character';
import type { SnowmanPlay } from '../features/snowmanPlay';
import type { TreeDecor } from '../features/treeDecorPlay';
import type { HatChase } from '../features/hatChase';
import type { RoofSnow, SnowHits } from '../features/roofSnow';
import type { Ball, Snowman, SnowThing, SnowWorld } from '../features/snowman';
import { emptySeats, type Act, type Maker, type ServerMessage, type SnowmanData, type WireHat, type WireSeats, type WireState } from '../shared/protocol';
import { createNetUi, askProfile } from '../ui/netUi';
import type { CarouselZone } from '../zones/carousel';
import { MY_ID, type CarouselPlay } from '../zones/carouselPlay';
import { findSeat } from '../zones/carouselRide';
import type { SkatePlay } from '../zones/skatePlay';
import type { DepthDrawable } from '../zones/zone';
import { createNet, loadProfile, saveProfile, type NetStatus, type Profile } from './client';
import { createRemotePlayers, outfitOf, type Remote } from './remotePlayers';

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
  /** 친구가 굴리는 눈덩이가 (x, y)를 지나갔다 (지름 d): 눈밭에 길이 난다 */
  trail?: (x: number, y: number, d: number) => void;
  /** 친구가 한 발 디뎠다: 발자국 */
  step?: (x: number, y: number, dx: number, dy: number) => void;
  /** 친구가 눈덩이를 던졌다 / 눈사람 머리를 맞혔다 / 누가 맞았다 (to가 나면 me = true) */
  thrown?: (start: { x: number; y: number }, dir: { x: number; y: number }, peak: number) => void;
  headHit?: (snowman: Snowman, n: number, dir: number) => void;
  splatted?: (at: { x: number; y: number; lift: number }, me: boolean, head: boolean, dir: number) => void;
  /** 다시 들어올 때 새 모자를 쓴다 */
  newHat?: () => void;
  /** 친구가 눈사람에 소품을 달아줬다 */
  decorated?: (snowman: Snowman, by: string) => void;
  /** 눈덩이 조작 (같이 밀기: 이어받기·놓치기·하이파이브) */
  snowPlay: () => SnowmanPlay;
  /** 트리 꾸미기 (선물 상자 열기, 장식 달기·떼기) */
  treeDecor?: () => TreeDecor;
  /** 남의 모자 주워 쓰기·조르기·돌려주기·잡기 (모자 자리는 서버가 정한다) */
  hatChase?: () => HatChase;
  /** 예전에 이 브라우저에만 저장해 둔 내 눈사람 (처음 접속 때 서버로 옮기고 지운다) */
  legacy: SnowmanData[];
}

export interface Session {
  /** 눈사람 주인으로 쓸 내 id (서버에 들어가 있으면 접속 id) */
  owner(): string;
  /** 눈덩이·눈사람을 서버에 알리는 고리 (snowmanPlay에 넘긴다) */
  readonly sync: {
    rolling(ball: Ball): void;
    put(thing: SnowThing): void;
    del(thing: SnowThing): void;
    grab(ball: Ball): void;
    drop(ball: Ball): void;
    push(ball: Ball, dir: MoveInput): void;
    act(a: Act): void;
  };
  /** 던지기: 시작 자리·방향, 눈사람 머리 맞힘, 친구 맞힘을 서버에 보낸다 */
  readonly throwing: {
    throw(start: { x: number; y: number }, dir: { x: number; y: number }, peak: number): void;
    hit(snowman: Snowman, n: number, dir: number): void;
    splat(to: string, head: boolean, dir: number): void;
  };
  /** 선물 상자 열기, 트리 장식 달기·떼기를 서버에 보낸다 */
  readonly decor: {
    open(id: string): void;
    hang(id: string, x: number, y: number): void;
    unhang(id: string): void;
    debugGift(x: number, y: number): void;
  };
  /** 서버에 붙어 있나, 서버가 준 내 접속 id, 서버 시각 (ms — 접속이 없으면 내 시계) */
  online(): boolean;
  /** 털모자 주고받기를 서버에 보낸다 */
  readonly hats: {
    pick(owner: string, sm?: string): void;
    beg(n: number): void;
    give(to: string): void;
    catch(from: string): void;
    fall(owner: string, x: number, y: number): void;
    snowman(owner: string): void;
    home(): void;
  };
  /** 지금 광장에 있는 다른 사람들, 그 가운데 한 사람 */
  others(): Iterable<Remote>;
  findOther(id: string): Remote | undefined;
  myId(): string | null;
  serverNow(): number;
  /** 눈덩이로 맞힐 수 있는 친구들 */
  targets(): { id: string; x: number; y: number; lift: number }[];
  /** 나 (닉네임과 목도리 색) — 만든 사람으로 적힌다 */
  me(): Maker;
  /** 같은 눈덩이를 미는 다른 사람의 지금 자리 */
  partner(ball: Ball): { x: number; y: number; facing: 'left' | 'right' } | null;
  /** 이 눈사람을 같이 만든 사람이 내 곁에 있나 (하이파이브) */
  nearCoMaker(snowman: Snowman): boolean;
  /** 한 번짜리 동작을 알린다 (재채기처럼 게임이 직접 아는 것) */
  act(a: Act): void;
  /** 매 프레임: offsetX = 본 레이어가 왼쪽으로 밀린 정도 */
  tick(dt: number, offsetX: number, labels?: readonly { x: number; y: number; text: string }[]): void;
  /** 친구 캐릭터들 */
  drawables(): readonly DepthDrawable[];
  /** ?debug=1: 접속자 수, 초당 보낸/받은 메시지 수 */
  debugLine(): string;
}

export function createSession(deps: SessionDeps): Session {
  const { character, carousel, snowWorld } = deps;
  const ui = createNetUi(deps.canvas);
  const remotes = createRemotePlayers(
    carousel.seats,
    () => carousel.rideTime(),
    (x, y, dx, dy) => deps.step?.(x, y, dx, dy),
    // 친구가 조르거나 엉덩방아를 찧는 자세
    (id) => deps.hatChase?.().poseFor(id) ?? null,
  );
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
  const ballData = (b: Ball) => ({ x: b.x, y: b.y, d: b.d, roll: b.roll, seed: b.seed, owner: b.owner, makers: b.makers, face: b.face });
  const put = (thing: SnowThing) => {
    if (net.status !== 'online') return;
    thing.synced = true;
    if (thing.kind === 'ball') net.send({ t: 'put', id: thing.netId, kind: 'ball', data: ballData(thing) });
    else net.send({ t: 'put', id: thing.netId, kind: 'snowman', data: { x: thing.x, y: thing.y, tiers: thing.tiers, seed: thing.seed, owner: thing.owner, makers: thing.makers, props: thing.props, hat: thing.hat, headless: thing.headless, born: thing.born } });
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
      else snowWorld.upsertSnowman(o.id, { ...o.data, born: o.data.born ?? o.updatedAt });
    }
    for (const r of message.rolling) snowWorld.upsertBall(r.id, { ...r, owner: r.owner }, r.owner).holders = [r.owner];
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
    const hold = character.holding.get();
    const hc = character.hatColor;
    const ho = character.hatOwner;
    const text = JSON.stringify([state, hat, hold, hc, ho]);
    if (!force && text === sentState) return;
    sentState = text;
    net.send({ t: 'state', state, hat, hold, hc, ho });
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
        // 모두의 털모자가 지금 어디 있는지 (서버가 정한다)
        deps.hatChase?.().reset(message.players, message.id);
        // 트리 장식 전체와 이미 열린 선물 상자, 열어 놓고 아직 달지 않은 내 장식
        if (deps.treeDecor) {
          const decor = deps.treeDecor();
          decor.setTree(message.tree);
          decor.setOpened(message.opened);
          decor.restoreMine(message.mine);
        }
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
        deps.hatChase?.().joined(message.player.id, message.player.hl);
        break;
      case 'left':
        deps.hatChase?.().left(message.id);
        remotes.remove(message.id);
        for (const b of snowWorld.balls) if (b.heldBy === message.id) b.heldBy = null;
        break;
      case 'pos':
        remotes.handle(message, now);
        break;
      case 'state':
        remotes.handle(message, now);
        deps.hatChase?.().onOwnerState(message.id, message.hat);
        break;
      case 'hat':
        deps.hatChase?.().onHat(message.owner, message.spot, message.how, message.by);
        break;
      case 'hatBeg':
        deps.hatChase?.().onBeg(message.id, message.n);
        break;
      case 'act': {
        remotes.handle(message, now);
        // 곁에서 하이파이브를 청하면 나도 두 손을 든다
        const from = remotes.get(message.id);
        if (message.a === 'highfive' && from && Math.hypot(from.ch.x - character.x, from.ch.y - character.y) <= COPUSH.highFiveRadius) {
          deps.snowPlay().cheer();
          net.send({ t: 'act', a: 'cheer' });
        }
        break;
      }
      case 'seats':
        applySeats(message.seats);
        break;
      case 'seatDenied':
        // 다른 사람이 먼저 앉았다: 내려서 그 사람을 앉힌다
        deps.play.kick();
        applySeats(lastSeats);
        break;
      case 'ball': {
        const old = snowWorld.findNet(message.id);
        const fromX = old ? old.x : message.x;
        const fromY = old ? old.y : message.y;
        const ball = snowWorld.upsertBall(message.id, { ...message, owner: message.owner }, message.owner);
        // 지나간 자리에 눈길을 낸다 (받은 위치 사이를 촘촘히 이어서)
        if (deps.trail) {
          const gap = Math.hypot(ball.x - fromX, ball.y - fromY);
          const steps = gap > 60 ? 0 : Math.max(1, Math.ceil(gap / 2));
          for (let k = 1; k <= steps; k++) deps.trail(fromX + ((ball.x - fromX) * k) / steps, fromY + ((ball.y - fromY) * k) / steps, ball.d);
        }
        if (ball.holders.length === 0) ball.holders = [message.owner];
        break;
      }
      case 'holders': {
        // 이 눈덩이를 지금 밀고 있는 사람들 (서버가 정한다)
        const thing = snowWorld.findNet(message.id);
        if (!thing || thing.kind !== 'ball') break;
        thing.holders = message.holders;
        thing.heldBy = message.holders.length > 0 && message.holders[0] !== net.id ? message.holders[0] : null;
        const play = deps.snowPlay();
        if (play.rolling === thing) {
          // 같이 미는 사람이 생겼으면 만든 사람으로 적고, 떠났으면 그 사람의 입력을 지운다
          const helper = message.holders.find((id) => id !== net.id);
          const info = helper ? remotes.get(helper)?.info : undefined;
          if (info && thing.makers.length < COPUSH.maxMakers && !thing.makers.some((m) => m.name === info.name)) thing.makers.push({ name: info.name, scarf: info.scarf });
          if (!helper) play.setHelperDir(null);
        } else if (play.helping === thing) {
          // 먼저 잡은 사람이 손을 뗐으면 내가 이어받고, 눈덩이가 놓였으면 나도 손을 뗀다
          if (message.holders[0] === net.id) play.promote();
          else if (!message.holders.includes(net.id ?? '')) play.dismiss();
        }
        break;
      }
      case 'throw':
        deps.thrown?.({ x: message.x, y: message.y }, { x: message.dx, y: message.dy }, message.p);
        break;
      case 'hit': {
        // 내가 맞힌 것은 이미 내 화면에서 처리했다
        if (message.by === net.id) break;
        const thing = snowWorld.findNet(message.id);
        if (thing && thing.kind === 'snowman') deps.headHit?.(thing, message.n, message.dir);
        break;
      }
      case 'splat': {
        if (message.to === net.id) deps.splatted?.({ x: character.x, y: character.y, lift: 0 }, true, message.head === 1, message.dir);
        else {
          const r = remotes.get(message.to);
          if (!r) break;
          r.faceSnow = THROW.faceSnowSeconds;
          deps.splatted?.({ x: r.ch.x, y: r.ch.y, lift: 0 }, false, message.head === 1, message.dir);
        }
        break;
      }
      case 'grabDenied': {
        const play = deps.snowPlay();
        const held = play.rolling ?? play.helping;
        if (held && held.netId === message.id) play.dismiss();
        break;
      }
      case 'push': {
        const play = deps.snowPlay();
        if (play.rolling && play.rolling.netId === message.id) play.setHelperDir({ x: message.dx, y: message.dy });
        break;
      }
      case 'put':
        if (message.object.kind === 'ball') snowWorld.upsertBall(message.object.id, message.object.data, null);
        else {
          const old = snowWorld.findNet(message.object.id);
          const before = old && old.kind === 'snowman' ? old.props.map((a) => `${a.p}:${a.by}`) : [];
          const snowman = snowWorld.upsertSnowman(message.object.id, { ...message.object.data, born: message.object.data.born ?? message.object.updatedAt });
          // 누가 소품을 달아줬다: 만든 사람이 아닌 친구가 달았으면 '♥ 닉네임'
          for (const a of snowman.props) {
            if (before.includes(`${a.p}:${a.by}`)) continue;
            if (snowman.makers.length > 0 && !snowman.makers.some((m) => m.name === a.by)) deps.decorated?.(snowman, a.by);
          }
        }
        break;
      case 'del': {
        const thing = snowWorld.findNet(message.id);
        if (thing === deps.rolling()) break;
        // 같이 밀던 눈덩이가 눈사람이 되어 없어졌으면 손을 뗀다
        if (thing && deps.snowPlay().helping === thing) deps.snowPlay().dismiss();
        snowWorld.removeNet(message.id);
        break;
      }
      case 'opened':
        deps.treeDecor?.().onOpened(message.id, message.by, message.kind);
        break;
      case 'openDenied':
        deps.treeDecor?.().onOpenDenied(message.id);
        break;
      case 'hung':
        deps.treeDecor?.().onHung(message.o, message.milestone);
        break;
      case 'hangDenied':
        deps.treeDecor?.().onHangDenied(message.id);
        break;
      case 'unhung':
        deps.treeDecor?.().onUnhung(message.id, message.by);
        break;
      case 'gift':
        deps.treeDecor?.().addDebugGift(message.gift);
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
  // 눈사람 나이는 서버 시각으로 잰다 (모든 화면에서 같은 때 녹는다)
  snowWorld.setClock(() => net.serverNow());

  const enter = () => {
    if (!profile) return;
    ui.notice(null);
    lastInput = seconds();
    character.outfit = outfitOf(profile.scarf);
    // 들어올 때는 언제나 새 모자 (내 목도리 색). 눈사람에게 준 모자는 눈사람에 남아 있다
    const fresh = hatOnEntry(profile.scarf);
    // 눈사람에게 줬거나 남이 쓰고 있던 모자는 거기 남거나 주인에게 돌아왔다
    if (character.hat.get() === 'onSnowman' || character.hat.get() === 'taken') deps.newHat?.();
    if (character.hatOwner === null) character.hatColor = fresh.color;
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
  character.holding.onChange(() => sendState());
  /** 모자 색·주인이 바뀌었으면 (남의 모자를 썼다) 알린다 */
  let sentHatColor: number | null = character.hatColor;
  let sentHatOwner: string | null = character.hatOwner;
  type Tag = { id: string; name: string; sx: number; sy: number };
  /** 내 모자를 쓴 사람(wearer)이 모자 주인(owner) 가까이 있으면 주인 머리 위에 '?!' */
  const noticeOwner = (tags: Tag[], offsetX: number, wearer: { x: number; y: number }, owner: string | null | undefined) => {
    if (!owner) return;
    if (owner === profile?.name) {
      if (Math.hypot(wearer.x - character.x, wearer.y - character.y) <= HAT_GIFT.noticeRadius) tags.push({ id: 'notice-me', name: '?!', sx: character.x - offsetX, sy: character.y - NET.nameAbove - 6 });
      return;
    }
    for (const o of remotes.all()) {
      if (o.info.name !== owner || Math.hypot(wearer.x - o.ch.x, wearer.y - o.ch.y) > HAT_GIFT.noticeRadius) continue;
      tags.push({ id: `notice-${o.info.id}`, name: '?!', sx: o.ch.x - offsetX, sy: o.ch.y - NET.nameAbove - 8 });
    }
  };

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
      grab(ball) {
        if (net.status !== 'online') return;
        // 서버 답을 기다리는 동안은 나를 넣어 둔다
        const id = net.id ?? '';
        if (!ball.holders.includes(id)) ball.holders = [...ball.holders, id];
        net.send({ t: 'grab', id: ball.netId });
      },
      drop(ball) {
        net.send({ t: 'drop', id: ball.netId });
      },
      push(ball, dir) {
        net.send({ t: 'push', id: ball.netId, dx: Math.sign(dir.x), dy: Math.sign(dir.y) });
      },
      act(a) {
        net.send({ t: 'act', a });
      },
    },
    throwing: {
      throw(start, dir, peak) {
        net.send({ t: 'throw', x: Math.round(start.x), y: Math.round(start.y), dx: dir.x, dy: dir.y, p: peak });
      },
      hit(snowman, n, dir) {
        net.send({ t: 'hit', id: snowman.netId, n: Math.min(5, n), dir });
      },
      splat(to, head, dir) {
        net.send({ t: 'splat', to, head: head ? 1 : 0, dir });
      },
    },
    decor: {
      open(id) {
        net.send({ t: 'open', id });
      },
      hang(id, x, y) {
        net.send({ t: 'hang', id, x, y });
      },
      unhang(id) {
        net.send({ t: 'unhang', id });
      },
      debugGift(x, y) {
        net.send({ t: 'debugGift', x, y });
      },
    },
    online: () => net.status === 'online',
    hats: {
      pick(owner, sm) {
        net.send(sm === undefined ? { t: 'hatPick', owner } : { t: 'hatPick', owner, sm });
      },
      beg(n) {
        net.send({ t: 'hatBeg', n });
      },
      give(to) {
        net.send({ t: 'hatGive', to });
      },
      catch(from) {
        net.send({ t: 'hatCatch', from });
      },
      fall(owner, x, y) {
        net.send({ t: 'hatFall', owner, x: Math.round(x), y: Math.round(y) });
      },
      snowman(owner) {
        net.send({ t: 'hatSnowman', owner });
      },
      home() {
        net.send({ t: 'hatHome' });
      },
    },
    others: () => remotes.all(),
    findOther: (id) => remotes.get(id),
    myId: () => net.id,
    serverNow: () => net.serverNow(),
    targets() {
      const out: { id: string; x: number; y: number; lift: number }[] = [];
      for (const r of remotes.all()) out.push({ id: r.info.id, x: r.ch.x, y: r.ch.y, lift: r.info.state.kind === 'sitting' ? 6 : 0 });
      return out;
    },
    me: () => ({ name: profile?.name ?? '나', scarf: profile?.scarf ?? 0 }),
    partner(ball) {
      const other = ball.holders.find((id) => id !== net.id);
      const r = other ? remotes.get(other) : undefined;
      return r ? { x: r.ch.x, y: r.ch.y, facing: r.ch.facing } : null;
    },
    nearCoMaker(snowman) {
      const mine = profile?.name;
      for (const m of snowman.makers) {
        if (m.name === mine) continue;
        for (const r of remotes.all()) {
          if (r.info.name === m.name && Math.hypot(r.ch.x - character.x, r.ch.y - character.y) <= COPUSH.highFiveRadius) return true;
        }
      }
      return false;
    },
    act(a) {
      net.send({ t: 'act', a });
    },
    tick(dt, offsetX, labels = []) {
      if (character.hatColor !== sentHatColor || character.hatOwner !== sentHatOwner) {
        sentHatColor = character.hatColor;
        sentHatOwner = character.hatOwner;
        sendState();
      }
      const now = seconds();
      net.tick(dt);
      remotes.update(dt, now);
      const tags = remotes.names(offsetX);
      // 잠깐 뜨는 글자 ('영차', '짝!')
      for (let i = 0; i < labels.length; i++) tags.push({ id: `label-${i}`, name: labels[i].text, sx: labels[i].x - offsetX, sy: labels[i].y });
      // 남이 놓고 간 눈덩이 곁에 가면 만든 사람 닉네임이 작게 뜬다
      for (const b of snowWorld.balls) {
        if (b.heldBy || b === deps.rolling() || b.makers.length === 0) continue;
        if (b.makers.length === 1 && b.makers[0].name === profile?.name) continue;
        if (Math.hypot(b.x - character.x, b.y - character.y) > COPUSH.nameRadius + b.d / 2) continue;
        tags.push({ id: `ball-${b.netId}`, name: b.makers.map((m) => m.name).join(' · '), sx: b.x - offsetX, sy: b.y - b.d - 5 });
      }
      // 내 모자를 쓴 사람이 가까이 있으면 모자 주인 머리 위에 '?!'
      if (character.hatOwner && character.hat.get() === 'on') noticeOwner(tags, offsetX, character, character.hatOwner);
      for (const r of remotes.all()) if (r.info.ho && r.info.hat === 'on') noticeOwner(tags, offsetX, r.ch, r.info.ho);
      ui.names(tags);
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

