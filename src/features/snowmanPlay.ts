// 눈사람 만들기 조작: 스페이스를 한 번 누르면 눈덩이를 뭉쳐 방향키로 굴리고, 다시 누르면 놓는다. 놓여 있는 눈덩이에 대고 누르면 올려서 눈사람을 만든다.
// (모바일은 길게 눌러 시작, 누른 채 끌어 굴리고, 떼면 놓는다. 여기서는 '쥐고 있나(holding)'만 받는다 — 무엇으로 쥐는지는 game.ts가 정한다)
// 규칙과 목록은 snowman.ts, 그림은 snowmanDraw.ts. 여기서는 캐릭터를 움직이고(굴리기·올리기·기뻐하기) 반짝이·땀방울을 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { canStandAt, type Character, type MoveInput } from '../character/character';
import type { DrawOptions } from '../character/render';
import type { PoseName } from '../character/sprites';
import { CHARACTER, LAYER_FACTORS, SNOWBALL as B, SNOWMAN as M, SNOWMAN_COLORS as C } from '../constants';
import type { SnowField } from '../scenery/snowField';
import type { PlayHint } from '../zones/carouselPlay';
import type { DepthDrawable } from '../zones/zone';
import {
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
  squeak(d: number): void;
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
  /** 눈사람 주인 이름 (저장·공유) */
  owner: string;
  /** 눈사람 목록이 바뀌면 저장한다 (기본: localStorage) */
  save?: (world: SnowWorld) => void;
}

type Phase = 'idle' | 'gather' | 'roll' | 'lift' | 'pant' | 'cheer' | 'peek' | 'shrug';

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
  const save = deps.save ?? ((w: SnowWorld) => saveSnowmen(w.saved(deps.owner)));
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
    if (l.onto) {
      l.onto.tiers = l.tiers;
      snowman = l.onto;
    } else {
      if (l.bottom) world.removeBall(l.bottom);
      snowman = world.addSnowman(Math.round(l.base.x), Math.round(l.base.y), l.tiers, deps.owner);
    }
    // 거의 같은 크기면 위 눈덩이가 흔들흔들하다 자리를 잡는다
    const n = l.tiers.length;
    if (Math.abs(l.tiers[n - 1] - l.tiers[n - 2]) <= M.wobbleDiff) snowman.wobble = M.wobbleSeconds;
    const height = snowmanHeight(l.tiers);
    const kind = snowmanKind(height);
    sparkle(snowman.x, snowman.y - height * 0.6, M.sparkles[kind], kind === 'giant' ? 60 : kind === 'medium' ? 40 : 22);
    sounds.chime(kind);
    save(world);
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
    // 그 자리에 놓는다. 올릴 수 없는 것에 대고 있었으면 고개를 갸우뚱
    ball.x = Math.round(ball.x);
    ball.y = Math.round(ball.y);
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
    phase = 'roll';
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
    const len = Math.hypot(dir.x, dir.y);
    let moved = 0;
    let sign = 1;
    if (len > 0) {
      const ux = dir.x / len;
      const uy = dir.y / len;
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
        const speed = rollSpeed(b.d, b.pushers) * dt;
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
    if (moved <= 0) return;
    // 굴러간 만큼 눈을 걷어 커진다 (눈이 없는 곳에서는 안 커진다). 지붕 눈 더미 위에서는 2배
    const fp = footprint(b.d);
    const area = deps.field.take(b.x, b.y - fp.halfD, fp.halfW, fp.halfD);
    const pile = deps.takePile?.(b.x, b.y, fp.halfW) ?? 0;
    b.d = grow(grow(b.d, area), pile, B.pileBoost);
    const turn = moved / (b.d / 2);
    b.roll += turn * sign;
    rollAcc += turn;
    if (rollAcc >= Math.PI * 2) {
      rollAcc -= Math.PI * 2;
      sounds.squeak(b.d);
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
    get canStack() {
      return plan() !== null;
    },
    canStartHere() {
      return phase === 'idle' && deps.field.hasSnow(character.x, character.y);
    },
    nearestBall() {
      let best: { ball: Ball; distance: number } | null = null;
      for (const b of world.balls) {
        // 눈덩이 가장자리까지 (깊이 쪽은 납작하게 본다)
        const distance = Math.max(0, Math.hypot(b.x - character.x, (b.y - character.y) * 1.5) - b.d * 0.4);
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
      if (phase === 'idle') return;
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
          beginRoll(world.addBall(bx, by, B.startSize, deps.owner));
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
      if (ballFits(character.x + o.x, character.y + o.y, d)) world.addBall(Math.round(character.x + o.x), Math.round(character.y + o.y), d, deps.owner);
    },
  };
}
