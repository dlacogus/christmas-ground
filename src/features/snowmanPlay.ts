// 눈사람 만들기 조작: 스페이스를 한 번 누르면 눈덩이를 뭉쳐 방향키로 굴리고, 다시 누르면 놓는다. 놓여 있는 눈덩이에 대고 누르면 올려서 눈사람을 만든다.
// (모바일은 길게 눌러 시작, 누른 채 끌어 굴리고, 떼면 놓는다. 여기서는 '쥐고 있나(holding)'만 받는다 — 무엇으로 쥐는지는 game.ts가 정한다)
// 규칙과 목록은 snowman.ts, 그림은 snowmanDraw.ts. 여기서는 캐릭터를 움직이고(굴리기·올리기·기뻐하기) 반짝이·땀방울을 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { canStandAt, type Character, type MoveInput } from '../character/character';
import type { DrawOptions } from '../character/render';
import type { PoseName } from '../character/sprites';
import { CHARACTER, COPUSH, LAYER_FACTORS, SNOWBALL as B, SNOWMAN as M, SNOWMAN_COLORS as C } from '../constants';
import type { Act, Maker } from '../shared/protocol';
import type { SnowField } from '../scenery/snowField';
import type { PlayHint } from '../zones/carouselPlay';
import type { DepthDrawable } from '../zones/zone';
import { restoreFace } from './throwing';
import {
  addMaker,
  combinePush,
  mergeMakers,
  ballFits,
  ballRect,
  fitsScreen,
  footprint,
  grow,
  rollSpeed,
  saveSnowmen,
  sizeTier,
  snowmanHeight,
  snowmanKind,
  stackBalls,
  stackOnSnowman,
  type Ball,
  type SizeTier,
  type SnowmanKind,
  type Snowman,
  type SnowThing,
  type SnowWorld,
} from './snowman';
import { drawBall } from './snowmanDraw';

export interface SnowmanSoundHooks {
  /** 한 바퀴 굴러갈 때마다 '뽀득' (지름이 클수록 낮고 둔하게) */
  squeak(d: number, loud?: boolean): void;
  /** 하이파이브 '짝!' */
  clap?(): void;
  /** '영차' */
  grunt(): void;
  /** 완성 종소리 */
  chime(kind: SnowmanKind): void;
}

export const silentSnowmanSounds: SnowmanSoundHooks = { squeak() {}, grunt() {}, chime() {} };

export interface SnowmanPlayDeps {
  field: SnowField;
  /** 지붕 눈 더미에서 걷은 넓이(px²) — 여기서는 2배 빨리 커진다 */
  takePile?: (x: number, y: number, halfW: number) => number;
  sounds?: SnowmanSoundHooks;
  random?: () => number;
  /** 눈사람 주인 (서버에 들어가 있으면 내 접속 id) */
  owner: string | (() => string);
  /** 서버에 알린다: 굴리는 눈덩이(자주), 놓았거나 합쳐진 결과, 없어진 것 */
  sync?: {
    rolling(ball: Ball): void;
    put(thing: SnowThing): void;
    del(thing: SnowThing): void;
    /** 눈덩이를 잡는다 / 손을 뗀다 (서버가 허락한다, 한 눈덩이에 최대 2명) */
    grab?(ball: Ball): void;
    drop?(ball: Ball): void;
    /** 같이 미는 사람의 방향 입력 */
    push?(ball: Ball, dir: MoveInput): void;
    act?(a: Act): void;
  };
  /** 나 (만든 사람으로 적힌다) */
  me?: () => Maker;
  /** 같은 눈덩이를 미는 다른 사람의 지금 자리 (없으면 null) */
  partner?: (ball: Ball) => { x: number; y: number; facing: 'left' | 'right' } | null;
  /** 이 눈사람을 같이 만든 사람이 지금 내 곁(하이파이브 거리)에 있나 */
  nearCoMaker?: (snowman: Snowman) => boolean;
  /** 눈사람 목록이 바뀌면 저장한다 (기본: localStorage) */
  save?: (world: SnowWorld) => void;
}

type Phase = 'idle' | 'gather' | 'roll' | 'help' | 'lift' | 'pant' | 'cheer' | 'peek' | 'shrug';

interface Lift {
  /** 들어 올리는 눈덩이 (목록에서 빼고 여기서 그린다) */
  ball: Ball;
  from: { x: number; y: number };
  base: { x: number; y: number };
  /** 올라갈 높이 (눈사람 발밑에서) */
  topZ: number;
  style: SizeTier;
  t: number;
  duration: number;
  /** 끝나면: 있던 눈사람에 한 단 더, 또는 아래 눈덩이와 합쳐 새 눈사람 */
  onto: Snowman | null;
  bottom: Ball | null;
  tiers: number[];
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
}

/** 큼: 옆면을 타고 굴려 올리는 진행도 — 중간에 한 번 살짝 밀려 내려왔다 다시 올라간다 */
export function largeLiftProgress(u: number): number {
  const a = M.slipAt;
  const peak = 0.6;
  const low = peak - M.slipBack;
  if (u < a) return (u / a) * peak;
  if (u < a + 0.12) return peak - M.slipBack * ((u - a) / 0.12);
  return low + ((u - a - 0.12) / (1 - a - 0.12)) * (1 - low);
}

/** 미는 방향에 따라 눈덩이가 발 앞에 붙는 자리 (캐릭터 발밑 기준) */
export function pushOffset(ux: number, uy: number, d: number): { x: number; y: number } {
  const depth = Math.max(B.minDepth, d * B.footprintDepth);
  return {
    x: ux * (d * 0.4 + CHARACTER.footHalfWidth + B.gap),
    // 위로 밀 때는 눈덩이가 발 상자 뒤에, 아래로 밀 때는 눈덩이 상자가 발 앞에 오게
    y: uy < 0 ? uy * (CHARACTER.footHeight + B.depthGap) : uy * (depth + B.depthGap) + (uy === 0 ? 1 : 0),
  };
}

export interface SnowmanPlay {
  readonly phase: Phase;
  /** 캐릭터를 맡고 있나 (굴리기·올리기·기뻐하기 중) */
  readonly busy: boolean;
  readonly rolling: Ball | null;
  /** 남이 굴리는 눈덩이를 같이 밀고 있으면 그 눈덩이 */
  readonly helping: Ball | null;
  /** 남이 미는 눈덩이 곁에 붙어 같이 민다 */
  joinAsHelper(ball: Ball): boolean;
  /** (내가 먼저 잡은 사람일 때) 같이 미는 사람의 방향 입력. 없으면 null */
  setHelperDir(dir: MoveInput | null): void;
  /** 먼저 잡은 사람이 손을 뗐다: 같이 밀던 내가 이어받아 굴린다 */
  promote(): void;
  /** 눈덩이를 놓친다 (서버가 잡기를 거절했거나, 같이 밀던 눈덩이가 놓였다) */
  dismiss(): void;
  /** 곁에서 누가 하이파이브를 청했다: 두 손을 든다 */
  cheer(): void;
  /** 머리 위에 잠깐 뜨는 글자 ('영차', '짝!') — 월드 좌표 */
  labels(): { x: number; y: number; text: string }[];
  /** 닿아 있는 눈덩이·눈사람과, 올릴 수 있나 */
  readonly target: SnowThing | null;
  readonly canStack: boolean;
  /** 지금 자리에서 새로 굴리기 시작할 수 있나 (눈 쌓인 바닥 위) */
  canStartHere(): boolean;
  /** 이어 굴릴 수 있는 가장 가까운 놓인 눈덩이와 거리 (가장자리까지) */
  nearestBall(): { ball: Ball; distance: number } | null;
  /** 주저앉아 눈을 뭉치기 시작한다 */
  start(): boolean;
  /** 놓여 있던 눈덩이를 이어 굴린다 */
  continueWith(ball: Ball): boolean;
  /** dir = 방향키(모바일은 누르는 쪽), holding = 눈덩이를 쥐고 있나 (false가 되면 놓거나 올린다) */
  update(dt: number, dir: MoveInput, holding: boolean): void;
  hint(touch: boolean): PlayHint | null;
  /** 캐릭터를 그릴 자세 (맡고 있지 않으면 null) */
  pose(): DrawOptions | null;
  /** 들어 올리는 눈덩이, 반짝이·땀방울 */
  readonly drawables: readonly DepthDrawable[];
  /** ?debug=1: 발 앞에 눈덩이를 놓는다 (누를 때마다 작음 → 중간 → 큼) */
  debugDrop(): void;
}

export function createSnowmanPlay(character: Character, world: SnowWorld, deps: SnowmanPlayDeps): SnowmanPlay {
  const sounds = deps.sounds ?? silentSnowmanSounds;
  const random = deps.random ?? Math.random;
  const owner = () => (typeof deps.owner === 'function' ? deps.owner() : deps.owner);
  const save = deps.save ?? ((w: SnowWorld) => saveSnowmen(w.saved(owner())));
  let phase: Phase = 'idle';
  let timer = 0;
  let ball: Ball | null = null;
  /** 눈덩이가 캐릭터 발밑에서 떨어진 자리 */
  let off = { x: 0, y: 0 };
  let target: SnowThing | null = null;
  let lift: Lift | null = null;
  let rollAcc = 0;
  let maxed = false;
  let sweatTimer = 0;
  let tilt = 0;
  let time = 0;
  let debugIndex = 0;
  let afterPant: Phase = 'cheer';
  const meMaker = (): Maker => deps.me?.() ?? { name: owner(), scarf: 0 };
  /** 같이 미는 사람의 방향 입력 (내가 먼저 잡은 사람일 때) */
  let helperDir: MoveInput | null = null;
  /** 내가 같이 밀고 있는 남의 눈덩이 */
  let helping: Ball | null = null;
  /** 서로 반대로 밀어 버티는 중 */
  let stuck = false;
  let lastPushKey = '';
  let pushTimer = 0;
  let highFive = 0;
  let lastCount = world.snowmen.length;
  const bits: Bit[] = [];

  const sparkle = (x: number, y: number, count: number, spread: number) => {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const speed = 12 + random() * spread;
      bits.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 14, age: 0, life: M.sparkleLife * (0.6 + random() * 0.6), color: C.sparkle });
    }
  };

  /** 닿아 있는 것 위에 올리면 어떻게 되나 (못 올리면 null) */
  const plan = (): { tiers: number[]; base: { x: number; y: number }; lifted: Ball; onto: Snowman | null; bottom: Ball | null } | null => {
    if (!ball || !target) return null;
    if (target.kind === 'snowman') {
      if (target.melt >= 0) return null;
      const tiers = stackOnSnowman(target.tiers, ball.d, target.y);
      return tiers ? { tiers, base: { x: target.x, y: target.y }, lifted: ball, onto: target, bottom: null } : null;
    }
    // 누가 밀고 있는 눈덩이와는 합칠 수 없다 (그 사람 화면에서는 계속 굴리고 있어 눈사람 속에 끼인다)
    if (target.heldBy || target.holders.some((id) => id !== owner())) return null;
    // 눈덩이끼리: 작은 쪽이 위로. 내가 굴리던 게 더 크면 놓여 있던 것을 들어 내 눈덩이 위에 올린다
    const tiers = stackBalls(ball.d, target.d);
    const mineBelow = ball.d > target.d;
    const bottom = mineBelow ? ball : target;
    if (!fitsScreen(bottom.y, tiers)) return null;
    return { tiers, base: { x: bottom.x, y: bottom.y }, lifted: mineBelow ? target : ball, onto: null, bottom };
  };

  const finishLift = () => {
    const l = lift!;
    lift = null;
    let snowman: Snowman;
    const makers = mergeMakers(l.onto?.makers ?? [], l.bottom?.makers ?? [], l.ball.makers);
    if (l.onto) {
      l.onto.tiers = l.tiers;
      snowman = l.onto;
    } else {
      if (l.bottom) world.removeBall(l.bottom);
      snowman = world.addSnowman(Math.round(l.base.x), Math.round(l.base.y), l.tiers, owner());
      deps.sync?.del(l.bottom!);
    }
    snowman.makers = makers;
    // 머리가 다시 생겼다. 얼굴이 붙은 머리를 올렸으면 그 얼굴·소품·모자가 그대로 돌아온다
    snowman.headless = false;
    snowman.hits = 0;
    if (l.ball.face) {
      const back = restoreFace(snowman, l.ball.face);
      snowman.seed = back.seed;
      snowman.props = back.props;
      snowman.hat = back.hat;
    }
    // 같이 만든 사람이 곁에 있으면 하이파이브 '짝!'
    if (makers.length >= 2 && deps.nearCoMaker?.(snowman)) {
      highFive = COPUSH.highFiveSeconds;
      sounds.clap?.();
      deps.sync?.act?.('highfive');
    }
    // 거의 같은 크기면 위 눈덩이가 흔들흔들하다 자리를 잡는다
    const n = l.tiers.length;
    if (Math.abs(l.tiers[n - 1] - l.tiers[n - 2]) <= M.wobbleDiff) snowman.wobble = M.wobbleSeconds;
    const height = snowmanHeight(l.tiers);
    const kind = snowmanKind(height);
    sparkle(snowman.x, snowman.y - height * 0.6, M.sparkles[kind], kind === 'giant' ? 60 : kind === 'medium' ? 40 : 22);
    sounds.chime(kind);
    save(world);
    // 서버에: 올린 눈덩이는 없어지고, 눈사람이 생겼다(또는 한 단 늘었다)
    deps.sync?.del(l.ball);
    deps.sync?.put(snowman);
    character.facing = snowman.x >= character.x ? 'right' : 'left';
    // 큰 눈덩이를 올렸으면 주저앉아 헉헉, 미니는 쪼그려 들여다보고, 아니면 뿌듯하게 두 손
    const after: Phase = kind === 'mini' ? 'peek' : 'cheer';
    if (l.style === 'large') {
      phase = 'pant';
      timer = M.pantSeconds;
      afterPant = after;
    } else {
      phase = after;
      timer = after === 'peek' ? M.peekSeconds : M.cheerSeconds;
    }
  };

  const startLift = (p: NonNullable<ReturnType<typeof plan>>) => {
    const moving = p.lifted;
    world.removeBall(moving);
    // 내 눈덩이가 아래에 남는 경우: 놓인 채로 둔다 (끝나면 눈사람이 된다)
    const style = sizeTier(moving.d);
    lift = {
      ball: moving,
      from: { x: moving.x, y: moving.y },
      base: p.base,
      topZ: snowmanHeight(p.tiers) - moving.d,
      style,
      t: 0,
      duration: style === 'small' ? M.liftSmall : style === 'medium' ? M.liftMedium : M.liftLarge,
      onto: p.onto,
      bottom: p.bottom,
      tiers: p.tiers,
    };
    if (style !== 'small') sounds.grunt();
    character.facing = p.base.x >= character.x ? 'right' : 'left';
    character.moving = style === 'large';
    ball = null;
    target = null;
    phase = 'lift';
  };

  const release = () => {
    if (!ball) {
      phase = 'idle';
      return;
    }
    const p = plan();
    if (p) {
      startLift(p);
      return;
    }
    helperDir = null;
    stuck = false;
    // 같이 밀던 사람이 있으면 놓지 않고 손만 뗀다: 그 사람이 이어받아 혼자 민다
    if (ball.holders.length > 1) {
      ball.heldBy = ball.holders.find((id) => id !== owner()) ?? null;
      deps.sync?.drop?.(ball);
      ball = null;
      target = null;
      character.moving = false;
      phase = 'idle';
      return;
    }
    // 그 자리에 놓는다. 올릴 수 없는 것에 대고 있었으면 고개를 갸우뚱
    ball.x = Math.round(ball.x);
    ball.y = Math.round(ball.y);
    deps.sync?.put(ball);
    const refused = target !== null;
    ball = null;
    target = null;
    character.moving = false;
    phase = refused ? 'shrug' : 'idle';
    timer = M.shrugSeconds;
  };

  const beginRoll = (b: Ball) => {
    ball = b;
    b.idle = 0;
    off = { x: b.x - character.x, y: b.y - character.y };
    target = null;
    rollAcc = 0;
    maxed = b.d >= B.maxSize;
    helperDir = null;
    helping = null;
    phase = 'roll';
    // 만든 사람으로 적고 (처음 만든 사람 + 이어서 굴린 사람들), 서버에 잡았다고 알린다
    addMaker(b.makers, meMaker());
    deps.sync?.grab?.(b);
  };

  /** 캐릭터를 (dx, dy)만큼, 눈덩이와 함께 옮길 수 있으면 옮긴다 */
  const tryStep = (dx: number, dy: number): boolean => {
    const b = ball!;
    const nx = character.x + dx;
    const ny = character.y + dy;
    if (!canStandAt(nx, ny, character)) return false;
    const bx = nx + off.x;
    const by = ny + off.y;
    if (!ballFits(bx, by, b.d)) return false;
    const other = world.touching(ballRect(bx, by, b.d), b);
    if (other) {
      target = other;
      return false;
    }
    character.x = nx;
    character.y = ny;
    return true;
  };

  const updateRoll = (dt: number, dir: MoveInput, holding: boolean) => {
    const b = ball!;
    if (!holding) {
      release();
      return;
    }
    tilt = Math.max(0, tilt - dt);
    // 방향은 나와 같이 미는 사람의 입력을 더해 정한다: 같은 쪽이면 2배, 반대면 제자리에서 버틴다
    const combo = combinePush(dir.x !== 0 || dir.y !== 0 ? dir : null, b.holders.length > 1 ? helperDir : null);
    stuck = combo.stuck;
    const len = combo.factor;
    let moved = 0;
    let sign = 1;
    if (len > 0) {
      const ux = combo.x;
      const uy = combo.y;
      if (ux > 0.1) character.facing = 'right';
      else if (ux < -0.1) character.facing = 'left';
      sign = Math.abs(ux) >= Math.abs(uy) ? Math.sign(ux) : Math.sign(uy);
      // 눈덩이를 미는 쪽 발 앞으로 옮긴다 (뒤돌면 반대편으로 돌아간다)
      const want = pushOffset(ux, uy, b.d);
      const gap = Math.hypot(want.x - off.x, want.y - off.y);
      if (gap > 1) {
        const step = Math.min(gap, B.swingSpeed * dt);
        const nox = off.x + ((want.x - off.x) / gap) * step;
        const noy = off.y + ((want.y - off.y) / gap) * step;
        const bx = character.x + nox;
        const by = character.y + noy;
        if (ballFits(bx, by, b.d) && !world.touching(ballRect(bx, by, b.d), b)) off = { x: nox, y: noy };
      } else {
        off = want;
        const speed = rollSpeed(b.d) * combo.factor * dt;
        const fromX = character.x;
        const fromY = character.y;
        // 닿아 있던 것은 다시 밀어 봐야 닿는다
        target = null;
        tryStep(ux * speed, 0);
        tryStep(0, uy * speed);
        moved = Math.hypot(character.x - fromX, character.y - fromY);
      }
    }
    b.x = character.x + off.x;
    b.y = character.y + off.y;
    // 살짝 떨어져 있어도 닿은 것으로 본다 (멈춘 뒤에도 힌트가 남게)
    if (!target) {
      const r = ballRect(b.x, b.y, b.d);
      target = world.touching({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, b);
      if (target && !plan() && tilt <= 0) tilt = M.shrugSeconds;
    }
    character.moving = moved > 0;
    character.animTime += dt;
    deps.sync?.rolling(b);
    if (moved <= 0) return;
    // 굴러간 만큼 눈을 걷어 커진다 (눈이 없는 곳에서는 안 커진다). 지붕 눈 더미 위에서는 2배
    const fp = footprint(b.d);
    const area = deps.field.take(b.x, b.y - fp.halfD, fp.halfW, fp.halfD);
    const pile = deps.takePile?.(b.x, b.y, fp.halfW) ?? 0;
    // 떨어진 머리를 눈 위로 굴리면 얼굴이 눈에 묻혀 그냥 눈덩이가 된다
    if (b.face && (area > 0 || pile > 0)) b.face = null;
    b.d = grow(grow(b.d, area), pile, B.pileBoost);
    const turn = moved / (b.d / 2);
    b.roll += turn * sign;
    rollAcc += turn;
    if (rollAcc >= Math.PI * 2) {
      rollAcc -= Math.PI * 2;
      sounds.squeak(b.d, b.holders.length > 1);
    }
    // 최대에 닿으면 반짝 하고 더 커지지 않는다
    if (!maxed && b.d >= B.maxSize) {
      maxed = true;
      sparkle(b.x, b.y - b.d / 2, 16, 50);
    }
    // 큰 눈덩이는 낑낑: 가끔 이마에 땀방울
    if (sizeTier(b.d) === 'large') {
      sweatTimer -= dt;
      if (sweatTimer <= 0) {
        sweatTimer = B.sweatEvery * (0.6 + random() * 0.8);
        const dirX = character.facing === 'right' ? 1 : -1;
        bits.push({ x: character.x - dirX * 2, y: character.y - 22, vx: -dirX * 8, vy: -20, age: 0, life: 0.6, color: C.sweat });
      }
    }
  };

  /** 남이 굴리는 눈덩이를 같이 민다: 눈덩이는 먼저 잡은 사람 화면이 움직이고, 나는 곁에 붙어 방향 입력만 보낸다 */
  const updateHelp = (dt: number, dir: MoveInput, holding: boolean) => {
    const b = helping!;
    if (!holding || !world.balls.includes(b)) {
      if (world.balls.includes(b)) deps.sync?.drop?.(b);
      helping = null;
      character.moving = false;
      phase = 'idle';
      return;
    }
    const p = deps.partner?.(b) ?? null;
    if (p) {
      // 먼저 잡은 사람 곁에 나란히 선다
      const tx = p.x - (p.facing === 'right' ? 2 : -2);
      const spots = [p.y + COPUSH.helperDepth, p.y - COPUSH.helperDepth];
      // 곁자리가 막혀 있으면 (벽, 다른 눈사람) 먼저 잡은 사람과 같은 자리에 겹쳐 선다 — 뒤에 남겨지지 않게
      const ty = spots.find((y) => canStandAt(tx, y, character)) ?? p.y;
      character.moving = Math.hypot(tx - character.x, ty - character.y) > 0.05;
      character.x = tx;
      character.y = ty;
      character.facing = p.facing;
    }
    character.animTime += dt;
    // 방향 입력은 바뀔 때, 그리고 누르고 있는 동안 가끔 보낸다
    pushTimer -= dt;
    const key = `${dir.x},${dir.y}`;
    if (key !== lastPushKey || (pushTimer <= 0 && (dir.x !== 0 || dir.y !== 0))) {
      lastPushKey = key;
      pushTimer = COPUSH.pushEvery;
      deps.sync?.push?.(b, dir);
    }
    // 밀고 있는데 안 움직이면 서로 반대로 미는 중: 발을 동동
    stuck = (dir.x !== 0 || dir.y !== 0) && !character.moving;
  };

  const updateBits = (dt: number) => {
    for (let k = bits.length - 1; k >= 0; k--) {
      const p = bits[k];
      p.age += dt;
      p.vy += 90 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life) bits.splice(k, 1);
    }
  };

  /** 들어 올리는 눈덩이가 지금 있는 자리와 높이 */
  const liftPosition = (l: Lift): { x: number; y: number; z: number } => {
    const u = Math.min(1, l.t / l.duration);
    if (l.style === 'large') {
      // 아래 눈덩이 옆면을 타고 굴러 올라간다 (둥근 길)
      const a = (largeLiftProgress(u) * Math.PI) / 2;
      return { x: l.from.x + (l.base.x - l.from.x) * (1 - Math.cos(a)), y: l.from.y + (l.base.y - l.from.y) * (1 - Math.cos(a)), z: l.topZ * Math.sin(a) };
    }
    const e = u * u * (3 - 2 * u);
    const arc = l.style === 'small' ? 4 : 7;
    return { x: l.from.x + (l.base.x - l.from.x) * e, y: l.from.y + (l.base.y - l.from.y) * e, z: l.topZ * e + arc * 4 * e * (1 - e) };
  };

  const liftDrawable: DepthDrawable = {
    get footY() {
      return lift ? lift.base.y + 0.5 : -1000;
    },
    draw(ctx, camera: Camera) {
      if (!lift) return;
      const p = liftPosition(lift);
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const u = lift.t / lift.duration;
      drawBall(ctx, Math.round(p.x) - ox, Math.round(p.y), lift.ball.d, lift.ball.roll + (lift.style === 'large' ? largeLiftProgress(u) * 4 : 0), lift.ball.seed, p.z, false);
    },
  };

  const bitsDrawable: DepthDrawable = {
    footY: 10000,
    draw(ctx, camera: Camera) {
      if (bits.length === 0) return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      for (const p of bits) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x) - ox, Math.round(p.y), 1, 1);
      }
      ctx.globalAlpha = 1;
    },
  };

  return {
    get phase() {
      return phase;
    },
    get busy() {
      return phase !== 'idle';
    },
    get rolling() {
      return ball;
    },
    get target() {
      return target;
    },
    get helping() {
      return helping;
    },
    joinAsHelper(b) {
      if (phase !== 'idle' || !world.balls.includes(b) || b.holders.length >= COPUSH.maxPushers) return false;
      helping = b;
      lastPushKey = '';
      pushTimer = 0;
      character.target = null;
      phase = 'help';
      addMaker(b.makers, meMaker());
      deps.sync?.grab?.(b);
      return true;
    },
    setHelperDir(dir) {
      helperDir = dir && (dir.x !== 0 || dir.y !== 0) ? dir : null;
    },
    promote() {
      if (phase !== 'help' || !helping) return;
      const b = helping;
      b.heldBy = null;
      beginRoll(b);
    },
    dismiss() {
      if (phase !== 'roll' && phase !== 'help' && phase !== 'gather') return;
      ball = null;
      helping = null;
      target = null;
      helperDir = null;
      stuck = false;
      character.moving = false;
      phase = 'idle';
    },
    cheer() {
      highFive = COPUSH.highFiveSeconds;
      sounds.clap?.();
      if (phase !== 'idle') return;
      phase = 'cheer';
      timer = COPUSH.highFiveSeconds;
    },
    labels() {
      const out: { x: number; y: number; text: string }[] = [];
      const head = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - CHARACTER.spriteHeight - 4 });
      // 둘이 밀 때 '영차'가 두 사람 머리 위에 번갈아 뜬다
      const shared = phase === 'help' ? helping : ball && ball.holders.length > 1 ? ball : null;
      if (shared && (character.moving || stuck)) {
        const mine = Math.floor(time / COPUSH.chantEvery) % 2 === 0;
        const other = deps.partner?.(shared) ?? null;
        const at = mine || !other ? head(character) : head(other);
        out.push({ ...at, text: '영차' });
      }
      if (highFive > 0) out.push({ ...head(character), text: '짝!' });
      return out;
    },
    get canStack() {
      return plan() !== null;
    },
    canStartHere() {
      return phase === 'idle' && deps.field.hasSnow(character.x, character.y);
    },
    nearestBall() {
      let best: { ball: Ball; distance: number } | null = null;
      for (const b of world.balls) {
        // 다른 사람이 굴리는 중이면 같이 밀 수 있다 (둘까지). 이미 둘이 밀고 있으면 끼어들 수 없다
        if (b.heldBy && b.holders.length >= COPUSH.maxPushers) continue;
        // 눈덩이 가장자리까지 (깊이 쪽은 납작하게 본다)
        let distance = Math.max(0, Math.hypot(b.x - character.x, (b.y - character.y) * 1.5) - b.d * 0.4);
        // 남이 밀고 있으면 그 사람 곁에만 가도 같이 밀 수 있다 (눈덩이는 그 사람 앞에 있어 닿기 어렵다)
        const pusher = b.heldBy ? (deps.partner?.(b) ?? null) : null;
        if (pusher) distance = Math.min(distance, Math.max(0, Math.hypot(pusher.x - character.x, pusher.y - character.y) - COPUSH.joinReach));
        if (!best || distance < best.distance) best = { ball: b, distance };
      }
      return best;
    },
    start() {
      if (phase !== 'idle' || !deps.field.hasSnow(character.x, character.y)) return false;
      phase = 'gather';
      timer = B.gatherSeconds;
      character.target = null;
      character.moving = false;
      return true;
    },
    continueWith(b) {
      if (phase !== 'idle' || !world.balls.includes(b)) return false;
      character.target = null;
      character.facing = b.x >= character.x ? 'right' : 'left';
      beginRoll(b);
      return true;
    },
    update(dt, dir, holding) {
      time += dt;
      updateBits(dt);
      world.update(dt, ball);
      // 눈사람이 녹아 없어지면 저장도 고친다
      if (world.snowmen.length !== lastCount) {
        lastCount = world.snowmen.length;
        save(world);
      }
      highFive = Math.max(0, highFive - dt);
      if (phase === 'idle') return;
      if (phase === 'help') {
        updateHelp(dt, dir, holding);
        return;
      }
      if (phase === 'gather') {
        timer -= dt;
        if (timer > 0) return;
        // 주저앉아 뭉친 작은 눈덩이를 바라보는 쪽 발 앞에 (막혀 있으면 반대쪽)
        const sides = character.facing === 'right' ? [1, -1] : [-1, 1];
        for (const side of sides) {
          const o = pushOffset(side, 0, B.startSize);
          const bx = character.x + o.x;
          const by = character.y + o.y;
          if (!ballFits(bx, by, B.startSize) || world.touching(ballRect(bx, by, B.startSize))) continue;
          character.facing = side > 0 ? 'right' : 'left';
          beginRoll(world.addBall(bx, by, B.startSize, owner()));
          return;
        }
        phase = 'idle';
        return;
      }
      if (phase === 'roll') {
        updateRoll(dt, dir, holding);
        return;
      }
      if (phase === 'lift') {
        const l = lift!;
        l.t += dt;
        character.animTime += dt;
        if (l.t >= l.duration) finishLift();
        return;
      }
      timer -= dt;
      character.moving = false;
      character.animTime += dt;
      if (timer > 0) return;
      if (phase === 'pant') {
        phase = afterPant;
        timer = afterPant === 'peek' ? M.peekSeconds : M.cheerSeconds;
      } else phase = 'idle';
    },
    hint(touch) {
      if (phase === 'help') return { text: touch ? '손을 떼면 놓기' : 'Space 놓기', anchor: 'bottom' };
      if (phase !== 'roll') return null;
      if (target && plan()) return { text: touch ? '손을 떼면 올리기' : 'Space 올리기', anchor: 'head' };
      // 올릴 수 없는 것에 대고 있으면 힌트 없이 고개만 갸우뚱
      if (target) return null;
      return { text: touch ? '손을 떼면 놓기' : 'Space 놓기', anchor: 'bottom' };
    },
    pose() {
      if (phase === 'idle') return null;
      const dirX = character.facing === 'right' ? 1 : -1;
      const walkFrame = Math.floor(character.animTime / CHARACTER.walkFrameDuration);
      const crouchFrame = Math.floor(time / 0.25);
      if (phase === 'gather' || phase === 'peek') return { pose: 'crouch', index: phase === 'peek' ? 0 : crouchFrame };
      if (phase === 'pant') return { pose: 'crouch', index: Math.floor(time / 0.14) };
      if (phase === 'cheer') return { pose: 'cheer', index: 0, lift: Math.floor(time / 0.15) % 2 };
      if (phase === 'shrug') return { pose: 'idle', index: 0, lean: Math.floor(time / 0.18) % 2 === 0 ? 1 : -1 };
      if (phase === 'lift') {
        const l = lift!;
        // 작음: 톡 올려놓는다. 중간: 안아 올리며 파르르. 큼: 어깨로 밀어 올린다
        if (l.style === 'small') return { pose: 'push', index: 1 };
        if (l.style === 'medium') return { pose: 'push', index: 1, lean: -dirX + (Math.floor(time / 0.04) % 2), lift: 0 };
        return { pose: 'push' as PoseName, index: walkFrame, lean: dirX * B.leanLarge + (Math.floor(time / 0.05) % 2) };
      }
      // 서로 반대로 밀어 버티는 중: 제자리에서 부르르 떨며 발을 동동
      if (stuck) return { pose: 'push', index: Math.floor(time / 0.07), lean: Math.floor(time / 0.05) % 2 === 0 ? 1 : -1 };
      if (phase === 'help') {
        const tier = sizeTier(helping!.d);
        return { pose: 'push', index: character.moving ? walkFrame : 1, lean: tier === 'small' ? 0 : dirX * (tier === 'medium' ? B.leanMedium : B.leanLarge) };
      }
      // 굴리는 중: 중간은 몸을 숙이고 두 팔로, 큼은 어깨로 밀며 낑낑
      const tier = sizeTier(ball!.d);
      const lean = tier === 'small' ? 0 : dirX * (tier === 'medium' ? B.leanMedium : B.leanLarge);
      // 올릴 수 없는 것에 대면 고개를 갸우뚱
      const tiltLean = tilt > 0 ? (Math.floor(time / 0.18) % 2 === 0 ? 1 : -1) : 0;
      return { pose: 'push', index: character.moving ? walkFrame : 1, lean: tilt > 0 ? tiltLean : lean };
    },
    drawables: [liftDrawable, bitsDrawable],
    debugDrop() {
      const d = B.debugSizes[debugIndex % B.debugSizes.length];
      debugIndex++;
      const side = character.facing === 'right' ? 1 : -1;
      const o = pushOffset(side, 0, d);
      if (ballFits(character.x + o.x, character.y + o.y, d)) deps.sync?.put(world.addBall(Math.round(character.x + o.x), Math.round(character.y + o.y), d, owner()));
    },
  };
}
