// 루돌프 썰매 조작과 그림: 밧줄 끝에서 Space = 끌기(눈가루 '평' → 루돌프 바디슈트), 썰매 옆에서 Space = 타기(앞자리부터).
// 끄는 사람 화면이 썰매 자리를 계산해 pos 메시지에 실어 보내고, 다른 화면은 그 자리를 따라 그린다. 자리는 서버가 정한다.
// 날 자국(눈 위 두 줄), 빨간 코 빛, 급회전 때 뒷자리부터 튕겨 나가 데굴데굴, 놓으면 스르르 멈춤, 아무도 안 쓰면 2분 뒤 제자리로.

import { layerOffsetX, type Camera } from '../camera';
import { canStandAt, createCharacter, setWalkTarget, updateCharacter, type Character, type MoveInput } from '../character/character';
import { drawCharacter, getSpriteCanvas, hatCanvas, headLook } from '../character/render';
import { REINDEER_NOSE_AT, REINDEER_ROPE_AT, getReindeerCanvas, reindeerBounce, reindeerOffset, type ReindeerPose } from '../character/reindeer';
import type { Facing } from '../character/sprites';
import { CHARACTER, LAYER_FACTORS, SCREEN_WIDTH, SLEIGH as K, SLEIGH_COLORS as SC } from '../constants';
import type { InputActions } from '../input';
import type { PointLight } from '../scenery/lighting';
import { isSnowAt } from '../scenery/ground';
import type { Act, SleighHow, WireSleigh } from '../shared/protocol';
import type { PlayHint } from '../zones/carouselPlay';
import type { DepthDrawable } from '../zones/zone';
import type { Rect } from '../world';
import {
  followRope,
  fromWireFacing,
  hitchOf,
  isSharpTurn,
  nextRamp,
  predictStop,
  restingPos,
  rideSpot,
  ropeEnd,
  ropeSlack,
  seatPos,
  sleighRect,
  sleighSpeedFactor,
  stowHat,
  throwVictim,
  toWireFacing,
  unstowHat,
  SLEIGH_HOME_REST,
  type SleighPos,
  type StowedHat,
} from './sleigh';

/** ?debug=1의 U: 내 화면에만 있는 가짜 친구 */
const FAKE_ID = 'sleigh-fake';
const OFFLINE_ME = 'me';

export interface RemoteView {
  ch: Character;
  /** 손 흔들기·환호 중인가 */
  cheer: boolean;
  /** 눈덩이에 맞아 얼굴에 눈이 묻어 있는 남은 시간 */
  faceSnow: number;
  /** 끄는 동안 받은 썰매 자리 (아직 못 받았으면 null) */
  sled: SleighPos | null;
  /** 털모자를 쓰고 있었나 (썰매 뒤에 싣는다)와 그 색 */
  hatOn: boolean;
  hatColor: number | null;
}

export interface SleighDeps {
  myId(): string | null;
  online(): boolean;
  /** 서버 시각 (ms) */
  now(): number;
  send: {
    grab(): void;
    sit(): void;
    leave(stop?: { x: number; y: number; f: 0 | 1 }): void;
    throwOut(who: string): void;
  };
  remote(id: string): RemoteView | null;
  act(a: Act): void;
  /** 내 얼굴에 묻은 눈 (남은 시간) */
  faceSnow(): number;
  /** 손에 든 것을 발밑에 내려놓는다 (밧줄을 잡으면 손이 바쁘다) */
  putDownHeld(): void;
  sound?: { poof?(): void; thud?(): void };
}

export interface SleighPlay {
  /** 내가 끄는 중 / 타는 중 / 아니면 null */
  readonly role: 'pull' | 'ride' | null;
  /** 튕겨 나가 구르거나 엎드려 있는 중, 옷을 갈아입는 '평' 중 (조작이 안 된다) */
  readonly locked: boolean;
  /** 걷는 중의 상호작용 후보: 밧줄 끝(끌기), 썰매 옆(타기)까지 거리 (할 수 없으면 Infinity) */
  grabDistance(): number;
  rideDistance(): number;
  grab(): void;
  sit(): void;
  /** 끄거나 타거나 구르는 동안의 입력 */
  handleInput(dt: number, dir: MoveInput, actions: InputActions): void;
  update(dt: number): void;
  /** 화면 탭: 처리했으면 true */
  tap(worldX: number, sy: number): boolean;
  hint(touch: boolean): PlayHint | null;
  /** 내 캐릭터를 대신 그린다 (루돌프·'평'·구르기, 타는 중이면 썰매가 그리니 아무것도 안 그린다). 그렸으면 true */
  drawSelf(ctx: CanvasRenderingContext2D, offsetX: number): boolean;
  /** 친구 캐릭터를 대신 그린다 (끄는 친구는 루돌프, '평', 구르기). 그렸으면 true */
  drawRemote(id: string, ch: Character, ctx: CanvasRenderingContext2D, offsetX: number): boolean;
  /** 썰매에 탄 친구의 자리 (remotePlayers가 그 자리에 둔다) */
  seatOf(id: string): { x: number; y: number; facing: Facing } | null;
  /** 지금 끄는 사람 id (없으면 null) */
  readonly puller: string | null;
  /** 내가 끄는 썰매 자리 (pos 메시지에 싣는다) */
  myPull(): { x: number; y: number; f: 0 | 1 } | null;
  /** 썰매 자리 (걸어 다니는 사람에게는 장애물). 내가 끌거나 타면 null */
  obstacle(): Rect | null;
  readonly drawables: readonly DepthDrawable[];
  /** 바닥 그림 (날 자국) */
  readonly floor: { draw(ctx: CanvasRenderingContext2D, offsetX: number): void };
  lights(): readonly PointLight[];
  /** 서버가 알려 준 썰매 자리 */
  onState(s: WireSleigh, how: SleighHow, by?: string, who?: string): void;
  /** 접속이 끊겼다: 친구들은 썰매에서 내린 것으로 */
  onOffline(): void;
  /** 눈덩이에 맞은 루돌프: 코가 잠깐 꺼진다 / 재채기: 코에서 빨간 빛이 반짝 */
  noseBlink(): void;
  noseFlash(): void;
  debugFriend(): void;
  debugLine(): string;
}

interface Tumble {
  id: string;
  ch: Character | null;
  t: number;
  /** 구르는 방향 (화면 좌우 부호) */
  dir: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  dusted: boolean;
}

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

const facingOf = (f: number): Facing => (f > 0 ? 'right' : 'left');

// ───────────── 썰매 그림 (코드로 픽셀을 찍어 한 번 구워 둔다) ─────────────

/** 캔버스 크기와 기준점: 썰매 가운데 = 22열, 날 바닥 = 17줄 */
const ART_W = 44;
const ART_H = 18;
const ART_CX = 22;
const ART_BOTTOM = 17;

type Painter = (ctx: CanvasRenderingContext2D) => void;

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 뒤 등받이 (탄 사람보다 뒤에 그린다): 짧게 솟은 빨간 판, 금색 윗선 */
const paintBack: Painter = (ctx) => {
  px(ctx, SC.red, 3, 2, 6, 6);
  px(ctx, SC.redDark, 3, 2, 1, 6);
  px(ctx, SC.gold, 4, 1, 4, 1);
  px(ctx, SC.gold, 3, 2, 1, 1);
  px(ctx, SC.gold, 8, 2, 1, 1);
  // 안쪽 (앉는 자리 그늘)
  px(ctx, SC.inside, 9, 5, 24, 2);
};

/** 앞쪽 (탄 사람 앞에 그린다): 빨간 몸통, 금색 곡선 테두리, 앞이 둥글게 말린 나무 날 */
const paintFront: Painter = (ctx) => {
  // 몸통 (앞이 둥글다)
  px(ctx, SC.red, 4, 6, 27, 1);
  px(ctx, SC.red, 4, 7, 29, 1);
  px(ctx, SC.red, 4, 8, 31, 4);
  px(ctx, SC.red, 5, 12, 29, 1);
  px(ctx, SC.redLight, 6, 7, 22, 1);
  px(ctx, SC.redDark, 4, 11, 31, 1);
  px(ctx, SC.redDark, 5, 12, 29, 1);
  px(ctx, SC.redDark, 4, 6, 1, 6);
  // 금색 테두리: 윗선, 옆구리를 따라 물결치는 곡선, 앞쪽 소용돌이
  px(ctx, SC.gold, 9, 6, 22, 1);
  for (let x = 7; x <= 28; x++) px(ctx, x % 2 === 0 ? SC.gold : SC.goldDark, x, 9 + Math.round(Math.sin((x - 7) / 3.2)), 1, 1);
  for (const [x, y] of [
    [31, 7],
    [32, 8],
    [33, 9],
    [32, 10],
    [31, 10],
    [30, 9],
    [31, 9],
  ] as const)
    px(ctx, SC.gold, x, y);
  px(ctx, SC.goldDark, 5, 12, 29, 1);
  // 받침대
  for (const x of [8, 20, 31]) px(ctx, SC.woodDark, x, 13, 1, 3);
  // 날: 뒤에서 앞까지, 앞이 둥글게 말려 올라간다
  px(ctx, SC.wood, 3, 16, 35, 1);
  px(ctx, SC.woodDark, 3, 17, 35, 1);
  px(ctx, SC.wood, 2, 15, 1, 1);
  for (const [x, y] of [
    [38, 16],
    [39, 15],
    [40, 14],
    [41, 13],
    [41, 12],
    [40, 11],
    [39, 11],
    [39, 12],
  ] as const)
    px(ctx, SC.wood, x, y);
  px(ctx, SC.woodDark, 38, 17, 1, 1);
  px(ctx, SC.woodDark, 39, 16, 1, 1);
};

const artCache = new Map<string, HTMLCanvasElement>();

function sleighArt(part: 'back' | 'front', f: number): HTMLCanvasElement {
  const key = `${part}|${f}`;
  const hit = artCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = ART_W;
  canvas.height = ART_H;
  const ctx = canvas.getContext('2d')!;
  if (f < 0) {
    ctx.translate(ART_W, 0);
    ctx.scale(-1, 1);
  }
  (part === 'back' ? paintBack : paintFront)(ctx);
  artCache.set(key, canvas);
  return canvas;
}

/** 썰매 그림을 놓는 왼쪽 위 (왼쪽을 보면 좌우 반전이라 기준 열도 뒤집힌다) */
function artLeft(x: number, f: number): number {
  return Math.round(x) - (f > 0 ? ART_CX : ART_W - ART_CX);
}

// ───────────── 눈가루 '평'과 구르기 ─────────────

/** 옷을 갈아입는 '평': 몸을 가리는 눈가루 구름 (t = 0~1) */
export function drawPoof(ctx: CanvasRenderingContext2D, footX: number, footY: number, t: number): void {
  const cy = footY - CHARACTER.spriteHeight / 2;
  ctx.fillStyle = SC.dust;
  // 가운데는 꽉 찬 구름 (몸을 가린다)
  const core = Math.round(9 - 3 * t);
  ctx.globalAlpha = 0.95;
  for (let dy = -core - 4; dy <= core + 4; dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, 1 - (dy / (core + 4)) ** 2)) * (core - 1));
    if (half > 0) ctx.fillRect(footX - half, cy + dy, half * 2, 1);
  }
  // 퍼져 나가는 알갱이
  for (let i = 0; i < K.poofDust; i++) {
    const a = i * 2.39996;
    const r = 6 + t * 12 + (i % 3);
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.fillRect(Math.round(footX + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 1.2), 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 튕겨 나가 데굴데굴 (t초): 굴러가는 동안은 몸을 돌려 그리고, 다 구르면 엎드린다 */
function drawTumbling(ctx: CanvasRenderingContext2D, ch: Character, offsetX: number, t: number, dir: number): void {
  const footX = Math.round(ch.x) - offsetX;
  const footY = Math.round(ch.y);
  if (t < K.tumbleSeconds) {
    const look = headLook(ch);
    const sprite = getSpriteCanvas('crouch', 0, ch.facing, ch.outfit, look.bald, true, look.color);
    const angle = dir * (t / K.tumbleSeconds) * K.tumbleTurns * Math.PI * 2;
    ctx.save();
    ctx.translate(footX, footY - 10);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -CHARACTER.spriteWidth / 2, -CHARACTER.spriteHeight + 10);
    ctx.restore();
    return;
  }
  // 엎드려 1초 (눈을 질끈)
  const closed = ch.eyesClosed;
  ch.eyesClosed = true;
  drawCharacter(ctx, ch, offsetX, { lie: dir > 0 ? 1 : -1, shadow: false });
  ch.eyesClosed = closed;
}

/** 루돌프 바디슈트를 입은 사람 (끄는 사람): run = 달리는 정도 (0~1) */
function drawReindeer(ctx: CanvasRenderingContext2D, ch: Character, offsetX: number, run: number, noseOn: boolean): void {
  const footX = Math.round(ch.x) - offsetX;
  const footY = Math.round(ch.y);
  ctx.globalAlpha = CHARACTER.shadowAlpha;
  ctx.fillStyle = '#000';
  ctx.fillRect(footX - CHARACTER.shadowWidth / 2, footY - CHARACTER.shadowHeight / 2, CHARACTER.shadowWidth, CHARACTER.shadowHeight);
  ctx.globalAlpha = 1;
  const pose: ReindeerPose = !ch.moving ? 'idle' : run > 0.5 ? 'run' : 'walk';
  const duration = pose === 'idle' ? CHARACTER.idleFrameDuration : pose === 'run' ? K.runFrameSeconds : K.walkFrameSeconds;
  const index = Math.floor(ch.animTime / duration) % (pose === 'idle' ? 2 : 4);
  const sprite = getReindeerCanvas(pose, index, ch.facing, noseOn, ch.eyesClosed);
  const lift = reindeerBounce(pose, index, K.walkBounce, K.runBounce);
  ctx.drawImage(sprite, footX - CHARACTER.spriteWidth / 2 + Math.round(ch.lean), footY - CHARACTER.spriteHeight - lift);
}

/** 루돌프의 어깨 밧줄이 몸에서 나가는 자리 (월드) */
function ropePoint(ch: Character): { x: number; y: number } {
  const o = reindeerOffset(REINDEER_ROPE_AT, ch.facing);
  return { x: ch.x + o.dx, y: ch.y + o.dy };
}

/** 빨간 코 자리 (월드) */
function nosePoint(ch: Character, run: number): { x: number; y: number } {
  const o = reindeerOffset(REINDEER_NOSE_AT, ch.facing);
  const lean = run > 0.5 && ch.moving ? (ch.facing === 'right' ? K.runLean : -K.runLean) : 0;
  return { x: ch.x + o.dx + lean, y: ch.y + o.dy };
}

// ───────────── 조작 ─────────────

export function createSleighPlay(character: Character, deps: SleighDeps): SleighPlay {
  /** 서버가 정한 썰매 자리 (접속이 없으면 내 화면에서만 정한다) */
  let wire: WireSleigh = { p: null, s: [null, null], x: SLEIGH_HOME_REST.x, y: SLEIGH_HOME_REST.y, f: SLEIGH_HOME_REST.f, since: 0 };
  /** 화면에 그리는 썰매 자리와 속도 */
  const sled: SleighPos & { vx: number; vy: number } = { x: wire.x, y: wire.y, f: fromWireFacing(wire.f), vx: 0, vy: 0 };
  /** 놓았을 때 멈출 자리까지 스르르 */
  let slide: { from: SleighPos; to: SleighPos; t: number } | null = null;
  /** 끄는 동안: 속도 단계, 마지막으로 최대 속도로 달린 방향과 때, 썰매에 실은 모자 */
  let ramp = 0;
  let lastRun: { x: number; y: number } | null = null;
  let lastRunAt = 0;
  let stowed: StowedHat | null = null;
  let time = 0;
  let shakeLeft = 0;
  let cheerLeft = 0;
  let noseOffLeft = 0;
  let flashLeft = 0;
  /** '평' (id → 남은 시간). 끄기를 시작하거나 그만둘 때 */
  const poofs = new Map<string, number>();
  const tumbles: Tumble[] = [];
  const dust: Dust[] = [];
  /** 이 화면에서 본, 사람마다 마지막으로 튕겨 나간 때 (서버 시각 ms) */
  const thrownAt: Record<string, number> = {};
  /** 걸어가서 탈 / 잡을 (탭) */
  let onArrive: 'grab' | 'ride' | null = null;
  /** 가짜 친구 (?debug=1의 U) */
  let fake: Character | null = null;
  /** 날 자국: x, y, 나이 (고리 버퍼) */
  const trailX = new Float32Array(K.trailMax);
  const trailY = new Float32Array(K.trailMax);
  const trailAge = new Float32Array(K.trailMax).fill(K.trailLife);
  let trailHead = 0;
  let lastMarkX = sled.x;
  let lastMarkY = sled.y;
  const lightList: PointLight[] = [];

  const me = () => deps.myId() ?? OFFLINE_ME;
  const pulling = () => wire.p !== null && wire.p === me();
  const mySeat = () => wire.s.indexOf(me());
  /** 화면에서 보는 자리 (가짜 친구 포함) */
  const seatIds = (): (string | null)[] => [wire.s[0] ?? (fake ? FAKE_ID : null), wire.s[1] ?? null];
  const myTumble = () => tumbles.find((t) => t.id === me() && t.ch === character) ?? null;

  const markTrail = () => {
    const d = Math.hypot(sled.x - lastMarkX, sled.y - lastMarkY);
    if (d > 30) {
      lastMarkX = sled.x;
      lastMarkY = sled.y;
      return;
    }
    if (d < K.trailGap) return;
    lastMarkX = sled.x;
    lastMarkY = sled.y;
    // 날 뒤끝이 지나간 자리 (눈 위에만)
    const bx = sled.x - sled.f * K.halfLength * 0.8;
    if (!isSnowAt(bx, sled.y)) return;
    trailX[trailHead] = bx;
    trailY[trailHead] = sled.y;
    trailAge[trailHead] = 0;
    trailHead = (trailHead + 1) % K.trailMax;
  };

  const spawnDust = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 10 + Math.random() * 18;
      dust.push({ x, y: y - 2, vx: Math.cos(a) * v, vy: -Math.abs(Math.sin(a)) * v - 6, age: 0, life: 0.5 + Math.random() * 0.4 });
    }
  };

  const startPoof = (id: string) => {
    poofs.set(id, K.poofSeconds);
    deps.sound?.poof?.();
  };

  /** 구를 길: 썰매 뒤쪽 옆으로, 막히면 그 앞까지 */
  const tumblePath = (from: { x: number; y: number }, dir: number) => {
    const steps = Math.ceil(K.tumbleDistance);
    let to = { ...from };
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = from.x + dir * K.tumbleDistance * k;
      const y = from.y + K.tumbleDistance * 0.45 * k + 4;
      if (!canStandAt(x, y)) break;
      to = { x, y };
    }
    return to;
  };

  /** seat = 튕겨 나간 자리 */
  const startTumble = (id: string, ch: Character | null, seat: number) => {
    const from = seatPos(sled, seat < 0 ? 1 : seat);
    const dir = -sled.f;
    tumbles.push({ id, ch, t: 0, dir, from, to: tumblePath(from, dir), dusted: false });
    shakeLeft = K.shakeSeconds;
    deps.sound?.thud?.();
  };

  // ── 내 역할이 바뀔 때

  const beginPull = () => {
    deps.putDownHeld();
    stowed = stowHat(character.hat.get());
    ramp = 0;
    lastRun = null;
    character.target = null;
    character.state.set({ kind: 'pullingSleigh' });
    startPoof(me());
  };

  const endPull = () => {
    if (stowed) character.hat.set(unstowHat(stowed, character.hat.get()));
    stowed = null;
    character.speedFactor = 1;
    if (character.state.get().kind === 'pullingSleigh') character.state.set({ kind: 'walk' });
    startPoof(me());
  };

  const beginRide = (seat: number) => {
    character.target = null;
    character.moving = false;
    cheerLeft = 0;
    character.state.set({ kind: 'inSleigh', seat });
  };

  /** 내리기: 앉아 있던 자리(seat) 옆 바닥으로 */
  const getOff = (seatIndex: number) => {
    const seat = seatPos(sled, Math.max(0, seatIndex));
    const spots = [
      { x: seat.x, y: seat.y + K.getOffFront },
      { x: seat.x, y: seat.y - K.depth - 4 },
      { x: sled.x + sled.f * (K.halfLength + 8), y: sled.y + 2 },
      { x: sled.x - sled.f * (K.halfLength + 8), y: sled.y + 2 },
    ];
    const spot = spots.find((p) => canStandAt(p.x, p.y)) ?? spots[0];
    character.x = spot.x;
    character.y = spot.y;
    character.moving = false;
    if (character.state.get().kind === 'inSleigh') character.state.set({ kind: 'walk' });
  };

  /** 접속이 없을 때: 서버 대신 내 화면에서 바로 정한다 */
  const local = (next: Partial<WireSleigh>, how: SleighHow, who?: string) => {
    const s: WireSleigh = { ...wire, ...next, s: next.s ?? [...wire.s] };
    const empty = !s.p && !s.s[0] && !s.s[1];
    s.since = empty ? deps.now() : null;
    onState(s, how, OFFLINE_ME, who);
  };

  /** 서버가 알려 준 썰매 자리 (내 화면에서 정한 것도 여기로) */
  const onState = (s: WireSleigh, how: SleighHow, _by?: string, who?: string) => {
    const prev = wire;
    const meId = me();
    wire = { ...s, s: [s.s[0] ?? null, s.s[1] ?? null] };
    // 끄는 사람이 바뀌었다
    if (prev.p !== wire.p) {
      if (prev.p === meId) endPull();
      else if (prev.p) startPoof(prev.p);
      if (prev.p) {
        // 놓았다: 멈출 자리까지 스르르
        slide = { from: { x: sled.x, y: sled.y, f: sled.f }, to: { x: wire.x, y: wire.y, f: fromWireFacing(wire.f) }, t: 0 };
        sled.vx = sled.vy = 0;
      }
      if (wire.p === meId) {
        slide = null;
        sled.x = wire.x;
        sled.y = wire.y;
        sled.f = fromWireFacing(wire.f);
        beginPull();
      } else if (wire.p) startPoof(wire.p);
    }
    // 내 자리
    const was = prev.s.indexOf(meId);
    const now = wire.s.indexOf(meId);
    if (now >= 0 && now !== was) beginRide(now);
    if (was >= 0 && now < 0) {
      if (how === 'throw' && who === meId) {
        if (character.state.get().kind === 'inSleigh') character.state.set({ kind: 'walk' });
        startTumble(meId, character, was);
      } else getOff(was);
    }
    // 친구가 튕겨 나갔다
    if (how === 'throw' && who && who !== meId) {
      thrownAt[who] = deps.now();
      startTumble(who, null, prev.s.indexOf(who));
    }
    if (how === 'throw' && who === meId) thrownAt[meId] = deps.now();
    // 쓰는 사람이 없어졌으면 놓인 자리에서 (2분 뒤 돌아가는 것은 매 프레임 계산)
    if (!wire.p && !slide) {
      sled.x = wire.x;
      sled.y = wire.y;
      sled.f = fromWireFacing(wire.f);
    }
  };

  /** 끄는 사람이 놓는다: 썰매가 미끄러져 멈출 자리를 보낸다 */
  const release = () => {
    const stop = predictStop(sled, sled.vx, sled.vy);
    const msg = { x: Math.round(stop.x * 10) / 10, y: Math.round(stop.y * 10) / 10, f: toWireFacing(stop.f) };
    sled.vx = sled.vy = 0;
    if (deps.online()) deps.send.leave(msg);
    else local({ p: null, ...msg }, 'leave');
  };

  const leaveSeat = () => {
    if (deps.online()) deps.send.leave();
    else {
      const seats = [...wire.s];
      seats[mySeat()] = null;
      local({ s: seats }, 'leave');
    }
  };

  /** 급회전: 뒷자리부터 한 명이 튕겨 나간다 (같은 사람은 10초에 한 번) */
  const sharpTurn = () => {
    shakeLeft = K.shakeSeconds;
    const ids = seatIds();
    const seat = throwVictim(ids, thrownAt, deps.now());
    if (seat === null) return;
    const who = ids[seat]!;
    if (who === FAKE_ID) {
      thrownAt[FAKE_ID] = deps.now();
      const ch = fake!;
      fake = null;
      startTumble(FAKE_ID, ch, 0);
      return;
    }
    if (deps.online()) deps.send.throwOut(who);
    else {
      const seats = [...wire.s];
      seats[seat] = null;
      local({ s: seats }, 'throw', who);
    }
  };

  // ── 그림

  const riderView = (id: string): { ch: Character; cheer: boolean; faceSnow: number } | null => {
    if (id === me()) return { ch: character, cheer: cheerLeft > 0, faceSnow: deps.faceSnow() };
    if (id === FAKE_ID) return fake ? { ch: fake, cheer: false, faceSnow: 0 } : null;
    const r = deps.remote(id);
    return r ? { ch: r.ch, cheer: r.cheer, faceSnow: r.faceSnow } : null;
  };

  /** 끄는 사람의 캐릭터 (나 또는 친구) */
  const pullerCh = (): Character | null => {
    if (!wire.p) return null;
    if (wire.p === me()) return character;
    return deps.remote(wire.p)?.ch ?? null;
  };

  /** 끄는 사람이 달리는 정도 (0~1): 썰매 속도로 */
  const runness = () => Math.min(1, Math.max(0, (Math.hypot(sled.vx, sled.vy) / CHARACTER.speed - 1) / (K.runFrom - 1 + 0.2)));

  const sleighDrawable: DepthDrawable = {
    get footY() {
      return sled.y;
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const sx = Math.round(sled.x) - ox;
      if (sx < -60 || sx > SCREEN_WIDTH + 60) return;
      const shake = shakeLeft > 0 ? (Math.floor(time * 30) % 2 === 0 ? 1 : -1) : 0;
      const left = artLeft(sled.x, sled.f) - ox + shake;
      const top = Math.round(sled.y) - ART_BOTTOM;
      // 그림자
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#000';
      ctx.fillRect(sx - K.halfLength, Math.round(sled.y), K.length, 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(sleighArt('back', sled.f), left, top);
      // 탄 사람: 뒷자리 → 앞자리 (앞사람이 뒷사람을 살짝 가린다)
      const ids = seatIds();
      for (const seat of [1, 0]) {
        const id = ids[seat];
        if (!id) continue;
        const v = riderView(id);
        if (!v) continue;
        const p = seatPos(sled, seat);
        v.ch.x = p.x + shake;
        v.ch.y = p.y;
        v.ch.facing = facingOf(sled.f);
        drawCharacter(ctx, v.ch, ox, { pose: v.cheer ? 'sitCheer' : 'sit', lift: K.riderLift, shadow: false, facing: v.ch.facing });
      }
      ctx.drawImage(sleighArt('front', sled.f), left, top);
      // 끄는 사람의 털모자는 썰매 뒤쪽에 실려 있다
      const hat = carriedHat();
      if (hat !== undefined) {
        const img = hatCanvas(hat);
        ctx.drawImage(img, Math.round(sled.x - sled.f * (K.halfLength - 7)) - ox - img.width / 2 + shake, top + 1);
      }
      drawRope(ctx, ox);
    },
  };

  /** 썰매에 실린 모자 색 (없으면 undefined) */
  const carriedHat = (): number | null | undefined => {
    if (!wire.p) return undefined;
    if (wire.p === me()) return stowed?.onSleigh ? character.hatColor : undefined;
    const r = deps.remote(wire.p);
    return r && r.hatOn ? r.hatColor : undefined;
  };

  /** 밧줄: 썰매 앞 끝에서 끄는 사람 어깨까지 (팽팽하면 직선, 가까우면 처진다). 아무도 안 끌면 바닥에 늘어진다 */
  const drawRope = (ctx: CanvasRenderingContext2D, ox: number) => {
    const hitch = hitchOf(sled);
    const ax = hitch.x;
    const ay = hitch.y - 9;
    const p = pullerCh();
    let bx: number;
    let by: number;
    let sag: number;
    if (p && poofs.get(wire.p ?? '') === undefined) {
      const rp = ropePoint(p);
      bx = rp.x;
      by = rp.y;
      sag = ropeSlack(Math.hypot(p.x - hitch.x, p.y - hitch.y)) * K.ropeSag;
    } else {
      const end = ropeEnd(sled);
      bx = end.x;
      by = end.y;
      sag = 3;
    }
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t + sag * 4 * t * (1 - t);
      ctx.fillStyle = i % 3 === 0 ? SC.ropeDark : SC.rope;
      ctx.fillRect(Math.round(x) - ox, Math.round(y), 1, 1);
    }
  };

  /** 튕겨 나간 가짜 친구, 눈가루 (본 레이어 맨 앞) */
  const overlay: DepthDrawable = {
    footY: 9001,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      for (const tb of tumbles) if (tb.id === FAKE_ID && tb.ch) drawTumbling(ctx, tb.ch, ox, tb.t, tb.dir);
      if (dust.length === 0) return;
      ctx.fillStyle = SC.dust;
      for (const d of dust) {
        ctx.globalAlpha = Math.max(0, 1 - d.age / d.life);
        ctx.fillRect(Math.round(d.x) - ox, Math.round(d.y), 1, 1);
      }
      ctx.globalAlpha = 1;
    },
  };

  const drawSpecial = (id: string, ch: Character, ctx: CanvasRenderingContext2D, ox: number): boolean => {
    const poof = poofs.get(id);
    if (poof !== undefined) {
      drawPoof(ctx, Math.round(ch.x) - ox, Math.round(ch.y), 1 - poof / K.poofSeconds);
      return true;
    }
    const tb = tumbles.find((t) => t.id === id);
    if (tb) {
      drawTumbling(ctx, ch, ox, tb.t, tb.dir);
      return true;
    }
    if (id === wire.p) {
      drawReindeer(ctx, ch, ox, runness(), noseOffLeft <= 0);
      return true;
    }
    return false;
  };

  const play: SleighPlay = {
    get role() {
      if (pulling()) return 'pull';
      return mySeat() >= 0 ? 'ride' : null;
    },
    get locked() {
      return myTumble() !== null || poofs.has(me());
    },
    get puller() {
      return wire.p;
    },
    grabDistance() {
      if (wire.p || mySeat() >= 0) return Infinity;
      const end = ropeEnd(sled);
      return Math.hypot(character.x - end.x, character.y - end.y);
    },
    rideDistance() {
      if (wire.p === me() || mySeat() >= 0) return Infinity;
      const ids = seatIds();
      if (ids[0] && ids[1]) return Infinity;
      const spot = rideSpot(sled);
      return Math.hypot(character.x - spot.x, character.y - spot.y);
    },
    grab() {
      onArrive = null;
      if (deps.online()) deps.send.grab();
      else local({ p: OFFLINE_ME, x: sled.x, y: sled.y, f: toWireFacing(sled.f) }, 'grab');
    },
    sit() {
      onArrive = null;
      if (deps.online()) {
        deps.send.sit();
        return;
      }
      const seats = [...wire.s];
      const free = seatIds()[0] ? 1 : 0;
      if (seats[free]) return;
      seats[free] = OFFLINE_ME;
      local({ s: seats }, 'sit');
    },
    handleInput(dt, dir, actions) {
      if (play.locked) {
        character.moving = false;
        character.target = null;
        return;
      }
      if (pulling()) {
        // Space·Esc = 놓기 (그래서 Space 연타로 빨라지지는 않는다 — 방향키를 계속 누르면 서서히 달린다)
        if (actions.tap || actions.hold || actions.cancel) {
          release();
          return;
        }
        const pressing = dir.x !== 0 || dir.y !== 0;
        if (pressing && isSharpTurn(lastRun, lastRunAt, dir, time)) {
          sharpTurn();
          ramp *= 0.3;
          lastRun = null;
        }
        ramp = nextRamp(ramp, pressing || character.target !== null, dt);
        if (pressing && ramp >= K.sharpTurnRamp) {
          lastRun = { x: dir.x, y: dir.y };
          lastRunAt = time;
        }
        const base = character.speedFactor;
        character.speedFactor = base * sleighSpeedFactor(ramp, seatIds().filter((id) => id !== null).length);
        updateCharacter(character, dt, dir);
        character.speedFactor = base;
        const { pullBack } = followRope(sled, character, dt);
        if (pullBack && canStandAt(pullBack.x, pullBack.y, character)) {
          character.x = pullBack.x;
          character.y = pullBack.y;
        }
        markTrail();
        return;
      }
      if (mySeat() >= 0) {
        // 타는 동안: ↑ = 두 팔 들고 환호, Space·Esc = 내리기
        if (actions.up) {
          cheerLeft = K.cheerSeconds;
          deps.act('cheer');
          return;
        }
        if (actions.tap || actions.hold || actions.cancel) leaveSeat();
      }
    },
    update(dt) {
      time += dt;
      shakeLeft = Math.max(0, shakeLeft - dt);
      cheerLeft = Math.max(0, cheerLeft - dt);
      noseOffLeft = Math.max(0, noseOffLeft - dt);
      flashLeft = Math.max(0, flashLeft - dt);
      for (const [id, left] of poofs) {
        if (left - dt <= 0) poofs.delete(id);
        else poofs.set(id, left - dt);
      }
      // 썰매 자리: 내가 끌면 handleInput이, 친구가 끌면 그 친구가 보낸 자리, 아니면 놓인 자리 (스르르 → 2분 뒤 돌아감)
      if (!pulling()) {
        const before = { x: sled.x, y: sled.y };
        if (wire.p) {
          const at = deps.remote(wire.p)?.sled;
          if (at) {
            sled.x = at.x;
            sled.y = at.y;
            sled.f = at.f;
          }
        } else if (slide) {
          slide.t += dt;
          const k = Math.min(1, slide.t / K.releaseSlideSeconds);
          const e = 1 - (1 - k) * (1 - k);
          sled.x = slide.from.x + (slide.to.x - slide.from.x) * e;
          sled.y = slide.from.y + (slide.to.y - slide.from.y) * e;
          sled.f = slide.to.f;
          if (k >= 1) slide = null;
        } else {
          const at = restingPos({ x: wire.x, y: wire.y, f: wire.f, since: wire.since ?? 0 }, wire.since, deps.now());
          sled.x = at.x;
          sled.y = at.y;
          sled.f = at.f;
        }
        if (dt > 0) {
          sled.vx = (sled.x - before.x) / dt;
          sled.vy = (sled.y - before.y) / dt;
        }
        markTrail();
      }
      // 타고 있으면 내 자리에 붙어 간다
      const seat = mySeat();
      if (seat >= 0) {
        const p = seatPos(sled, seat);
        character.x = p.x;
        character.y = p.y;
        character.facing = facingOf(sled.f);
        character.moving = false;
      }
      // 구르기: 굴러가 → 엎드려 1초 → 일어난다
      for (let i = tumbles.length - 1; i >= 0; i--) {
        const tb = tumbles[i];
        tb.t += dt;
        const k = Math.min(1, tb.t / K.tumbleSeconds);
        if (tb.ch) {
          tb.ch.x = tb.from.x + (tb.to.x - tb.from.x) * k;
          tb.ch.y = tb.from.y + (tb.to.y - tb.from.y) * k;
          tb.ch.facing = tb.dir > 0 ? 'right' : 'left';
        }
        if (k >= 1 && !tb.dusted) {
          tb.dusted = true;
          if (isSnowAt(tb.to.x, tb.to.y)) spawnDust(tb.to.x, tb.to.y, K.tumbleDust);
        }
        if (tb.t >= K.tumbleSeconds + K.lieSeconds) {
          tumbles.splice(i, 1);
          if (tb.ch === character) character.moving = false;
        }
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.age += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 40 * dt;
        if (d.age >= d.life) dust.splice(i, 1);
      }
      for (let i = 0; i < K.trailMax; i++) if (trailAge[i] < K.trailLife) trailAge[i] += dt;
      // 탭해서 걸어간 뒤 도착하면 잡거나 탄다
      if (onArrive && !character.target && character.state.get().kind === 'walk') {
        const what = onArrive;
        onArrive = null;
        if (what === 'grab' && play.grabDistance() <= K.grabRadius) play.grab();
        if (what === 'ride' && play.rideDistance() <= K.rideRadius) play.sit();
      }
    },
    tap(worldX, sy) {
      // 타는 중이면 어디를 눌러도 내린다, 끄는 중이면 누른 곳으로 걸어간다
      if (mySeat() >= 0) {
        leaveSeat();
        return true;
      }
      if (pulling()) {
        setWalkTarget(character, worldX, sy);
        return true;
      }
      if (character.state.get().kind !== 'walk') return false;
      const end = ropeEnd(sled);
      if (Math.hypot(worldX - end.x, sy - end.y) <= 8 && play.grabDistance() < Infinity) {
        if (play.grabDistance() <= K.grabRadius) play.grab();
        else {
          setWalkTarget(character, end.x, end.y);
          onArrive = 'grab';
        }
        return true;
      }
      const onBody = Math.abs(worldX - sled.x) <= K.halfLength && sy <= sled.y + 2 && sy >= sled.y - 22;
      if (onBody && play.rideDistance() < Infinity) {
        if (play.rideDistance() <= K.rideRadius) play.sit();
        else {
          const spot = rideSpot(sled);
          setWalkTarget(character, spot.x, spot.y);
          onArrive = 'ride';
        }
        return true;
      }
      return false;
    },
    hint(touch) {
      if (play.locked) return null;
      if (pulling()) return { text: touch ? '탭한 곳으로 끌기 · Space 놓기' : '방향키 끌기 (계속 누르면 달리기) · Space 놓기', anchor: 'head' };
      if (mySeat() >= 0) return { text: touch ? '↑ 환호 · 탭해서 내리기' : '↑ 환호 · Space 내리기', anchor: 'head' };
      return null;
    },
    drawSelf(ctx, ox) {
      if (drawSpecial(me(), character, ctx, ox)) return true;
      return mySeat() >= 0;
    },
    drawRemote(id, ch, ctx, ox) {
      if (drawSpecial(id, ch, ctx, ox)) return true;
      return wire.s.includes(id);
    },
    seatOf(id) {
      const seat = wire.s.indexOf(id);
      if (seat < 0) return null;
      const p = seatPos(sled, seat);
      return { x: p.x, y: p.y, facing: facingOf(sled.f) };
    },
    myPull() {
      if (!pulling()) return null;
      return { x: Math.round(sled.x * 10) / 10, y: Math.round(sled.y * 10) / 10, f: toWireFacing(sled.f) };
    },
    obstacle() {
      if (pulling() || mySeat() >= 0) return null;
      return sleighRect(sled.x, sled.y);
    },
    drawables: [sleighDrawable, overlay],
    floor: {
      draw(ctx, offsetX) {
        ctx.fillStyle = SC.trail;
        for (let i = 0; i < K.trailMax; i++) {
          const age = trailAge[i];
          if (age >= K.trailLife) continue;
          const x = Math.round(trailX[i]) - offsetX;
          if (x < -2 || x > SCREEN_WIDTH + 2) continue;
          // 처음 절반은 또렷하게, 그 뒤 서서히 눈에 덮인다
          ctx.globalAlpha = K.trailAlpha * Math.min(1, (K.trailLife - age) / (K.trailLife * K.trailFadeFrom));
          const y = Math.round(trailY[i]);
          ctx.fillRect(x, y, 1, 1);
          ctx.fillRect(x, y - K.trailSpread, 1, 1);
        }
        ctx.globalAlpha = 1;
      },
    },
    lights() {
      lightList.length = 0;
      const p = pullerCh();
      if (!p || poofs.has(wire.p ?? '') || noseOffLeft > 0) return lightList;
      const run = runness();
      const nose = nosePoint(p, run);
      // 가만히 있으면 숨쉬듯, 달릴수록 크고 밝게
      const breath = p.moving ? 1 : 0.7 + 0.3 * Math.sin((time / K.noseBreathSeconds) * Math.PI * 2);
      const radius = K.noseRadius + (K.noseRunRadius - K.noseRadius) * run;
      lightList.push(
        { x: nose.x, y: nose.y, radius: radius * K.noseBloomRatio, alpha: K.noseBloomAlpha * breath, color: SC.nose, floor: false },
        { x: nose.x, y: p.y, radius, alpha: K.noseAlpha * 0.6 * breath, color: SC.nose, floor: true },
      );
      if (flashLeft > 0) {
        const k = flashLeft / K.noseFlashSeconds;
        lightList.push({ x: nose.x, y: nose.y, radius: K.noseFlashRadius * (1.2 - k * 0.4), alpha: k, color: SC.nose, floor: false });
      }
      return lightList;
    },
    onState,
    onOffline() {
      const meId = me();
      const keep = (id: string | null) => (id === meId ? id : null);
      wire = { ...wire, p: keep(wire.p), s: wire.s.map(keep) };
    },
    noseBlink() {
      noseOffLeft = K.noseOffSeconds;
    },
    noseFlash() {
      flashLeft = K.noseFlashSeconds;
    },
    debugFriend() {
      if (fake) {
        fake = null;
        return;
      }
      if (wire.s[0]) return;
      fake = createCharacter(sled.x, sled.y, 'red');
    },
    debugLine() {
      const ids = seatIds();
      let marks = 0;
      for (let i = 0; i < K.trailMax; i++) if (trailAge[i] < K.trailLife) marks++;
      return `sleigh p ${wire.p ?? '-'} seats ${ids[0] ?? '-'} / ${ids[1] ?? '-'}  ramp ${ramp.toFixed(2)}  x ${sled.x.toFixed(0)} y ${sled.y.toFixed(0)}  trail ${marks}`;
    },
  };
  return play;
}
