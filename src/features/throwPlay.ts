// 눈덩이 던지기 조작과 그림. 규칙은 throwing.ts.
// - 내가 던진 눈덩이만 맞았는지 판정한다 (눈사람 머리·몸통, 친구). 남이 던진 것은 같은 포물선으로 보여주기만 한다
// - 머리가 떨어지는 연출(뒤로 젖혀짐 → 떨어짐 → 데굴데굴)은 모든 화면에서 같은 계산으로 보여주고,
//   실제로 눈사람을 고치고 머리 눈덩이를 놓는 일은 맞힌 사람 화면이 한다 (서버에는 put으로 저장된다)

import { layerOffsetX } from '../camera';
import type { Character } from '../character/character';
import type { DrawOptions } from '../character/render';
import { LAYER_FACTORS, SCREEN_WIDTH, SNOWMAN, THROW as T } from '../constants';
import type { BallFace } from '../shared/protocol';
import { WALK_AREA } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { ballFits, type Ball, type Snowman, type SnowThing, type SnowWorld } from './snowman';
import { drawBall, drawBallFace } from './snowmanDraw';
import { aimPeak, flightAt, headOf, hitPart, hitPerson, hitsNeeded, knockOff, registerHit, throwDir, type Vec } from './throwing';

export interface ThrowSounds {
  /** 뭉치기 '뽀득' */
  scoop(): void;
  /** 던질 때 '휘익' */
  whoosh(): void;
  /** 맞았을 때 '퍽' */
  thud(): void;
  /** 머리가 떨어질 때 '통 데굴데굴' */
  bonk(): void;
}

export interface ThrowTarget {
  id: string;
  x: number;
  y: number;
  /** 발밑보다 위에 떠 있는 높이 (회전목마·벤치) */
  lift: number;
}

export interface ThrowDeps {
  /** 지금 시각 (초) */
  now: () => number;
  /** 이 자리에서 눈을 뭉칠 수 있나 (눈 쌓인 바닥) */
  canScoop: (x: number, y: number) => boolean;
  owner: () => string;
  /** 맞힐 수 있는 친구들 */
  targets?: () => Iterable<ThrowTarget>;
  sounds?: Partial<ThrowSounds>;
  send?: {
    throw(start: Vec, dir: Vec, peak: number): void;
    hit(snowman: Snowman, n: number, dir: number): void;
    splat(to: string, head: boolean, dir: number): void;
  };
  put?: (thing: SnowThing) => void;
}

interface Shot {
  start: Vec;
  dir: Vec;
  t: number;
  mine: boolean;
  /** 포물선 꼭대기 높이 */
  peak: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/** 떨어져 구르는 머리 (연출) */
interface Fall {
  x: number;
  y: number;
  /** 머리 가운데 높이, 지름 */
  z: number;
  d: number;
  /** 몸통 가장자리까지, 그 뒤로 굴러가는 거리와 쪽 */
  edge: number;
  dir: number;
  distance: number;
  face: BallFace;
  seed: number;
  t: number;
  /** 내가 맞혔으면 끝나고 눈덩이를 놓는다 */
  mine: { makers: Snowman['makers'] } | null;
}

type Phase = 'idle' | 'scoop' | 'follow';

export interface ThrowPlay {
  readonly phase: Phase;
  readonly busy: boolean;
  /** 지금 던질 수 있나 (눈 쌓인 바닥, 쉬는 시간 지남) */
  canStart(): boolean;
  /** 주저앉아 뭉친 뒤 던진다. vertical = ↑(-1) ↓(1) 대각선 */
  start(vertical: number): boolean;
  update(dt: number, vertical: number): void;
  /** 친구가 던졌다 */
  remoteThrow(start: Vec, dir: Vec, peak?: number): void;
  /** 서버가 알려 준 맞힘 (남이 맞혔다) */
  remoteHit(snowman: Snowman, n: number, dir: number): void;
  /** 누가 맞았다: 그 자리에 눈이 튄다 */
  splatAt(x: number, y: number, z: number): void;
  pose(): DrawOptions | null;
  readonly drawables: readonly DepthDrawable[];
  /** 날고 있는 눈덩이 수 (테스트용) */
  readonly flying: number;
}

const FALL_TOTAL = T.tiltSeconds + T.fallSeconds + T.rollSeconds;

/** 떨어지는 머리의 지금 자리: 바닥 위 x와 떠 있는 높이 z(아래쪽), 굴러간 각도 */
export function fallAt(f: { x: number; z: number; d: number; edge: number; dir: number; distance: number }, t: number): { x: number; z: number; roll: number } {
  const r = f.d / 2;
  const top = f.z - r;
  if (t <= T.tiltSeconds) {
    // 뒤로 젖혀진다
    const u = t / T.tiltSeconds;
    return { x: f.x + f.dir * u * Math.min(3, r), z: top, roll: f.dir * u * 0.5 };
  }
  if (t <= T.tiltSeconds + T.fallSeconds) {
    // 몸통 옆으로 떨어진다
    const u = (t - T.tiltSeconds) / T.fallSeconds;
    return { x: f.x + f.dir * (Math.min(3, r) + (f.edge - Math.min(3, r)) * u), z: top * (1 - u * u), roll: f.dir * (0.5 + u) };
  }
  // 데굴데굴 (점점 느려진다)
  const u = Math.min(1, (t - T.tiltSeconds - T.fallSeconds) / T.rollSeconds);
  const eased = 1 - (1 - u) * (1 - u);
  return { x: f.x + f.dir * (f.edge + f.distance * eased), z: 0, roll: f.dir * (1.5 + (f.distance * eased) / r) };
}

export function createThrowPlay(character: Character, world: SnowWorld, deps: ThrowDeps): ThrowPlay {
  let phase: Phase = 'idle';
  let timer = 0;
  let cooldown = 0;
  let aim = 0;
  const shots: Shot[] = [];
  const bits: Bit[] = [];
  const falls: Fall[] = [];

  const splat = (x: number, y: number, z: number) => {
    for (let i = 0; i < T.splatBits; i++) {
      const a = (i / T.splatBits) * Math.PI * 2 + x;
      bits.push({ x, y: y - z, vx: Math.cos(a) * (14 + (i % 3) * 8), vy: Math.sin(a) * 12 - 16, age: 0 });
    }
  };

  /** 머리가 떨어지는 연출을 시작한다 (모든 화면에서 같다) */
  const startFall = (s: Snowman, dir: number, mine: boolean): void => {
    const head = headOf(s);
    const k = knockOff(s, dir);
    falls.push({
      x: s.x,
      y: s.y,
      z: head.z,
      d: k.head.d,
      edge: s.tiers[0] / 2 + k.head.d / 2 + 1,
      dir: k.dir,
      distance: k.distance,
      face: k.head.face,
      seed: s.seed,
      t: 0,
      mine: mine ? { makers: s.makers.map((m) => ({ ...m })) } : null,
    });
    deps.sounds?.bonk?.();
    if (!mine) return;
    // 맞힌 사람 화면이 눈사람을 고친다: 머리와 머리에 붙은 것들이 떨어져 나간다
    s.tiers = k.tiers;
    s.props = k.props;
    s.hat = null;
    s.headless = true;
    s.hits = 0;
    s.capped = false;
    deps.put?.(s);
  };

  const hitHead = (s: Snowman, dir: number) => {
    const n = registerHit(s, deps.now());
    s.wobble = SNOWMAN.wobbleSeconds * 0.4;
    deps.send?.hit(s, n, dir);
    if (n >= hitsNeeded(s.tiers[s.tiers.length - 1])) startFall(s, dir, true);
  };

  /** 떨어진 머리가 멈춘 자리에 눈덩이로 놓인다 */
  const landHead = (f: Fall) => {
    const end = fallAt(f, FALL_TOTAL);
    let x = Math.round(end.x);
    const y = Math.min(WALK_AREA.y + WALK_AREA.h - 1, Math.max(WALK_AREA.y + 4, Math.round(f.y)));
    // 놓을 수 없는 자리면 몸통 쪽으로 당긴다
    for (let k = 0; k < 40 && !ballFits(x, y, f.d); k++) x -= f.dir;
    const ball: Ball = world.addBall(x, y, f.d, deps.owner(), end.roll);
    ball.seed = f.seed;
    ball.face = f.face;
    ball.makers = f.mine?.makers ?? [];
    deps.put?.(ball);
  };

  const overlay: DepthDrawable = {
    footY: 9997,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      for (const s of shots) {
        const p = flightAt(s.start, s.dir, s.t, s.peak);
        const sx = Math.round(p.x) - ox;
        if (sx < -8 || sx > SCREEN_WIDTH + 8) continue;
        // 바닥 그림자가 따라간다
        ctx.globalAlpha = T.shadowAlpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - 1, Math.round(p.y), 3, 1);
        ctx.globalAlpha = 1;
        const sy = Math.round(p.y - p.z);
        ctx.fillStyle = T.ballColor;
        ctx.fillRect(sx - 1, sy - 1, T.ballSize, T.ballSize);
        ctx.fillStyle = T.ballShade;
        ctx.fillRect(sx + 1, sy + 1, 1, 1);
      }
      ctx.fillStyle = T.ballColor;
      for (const b of bits) {
        const sx = Math.round(b.x) - ox;
        if (sx < 0 || sx > SCREEN_WIDTH) continue;
        ctx.globalAlpha = 1 - b.age / T.splatSeconds;
        ctx.fillRect(sx, Math.round(b.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      for (const f of falls) {
        const p = fallAt(f, f.t);
        const sx = Math.round(p.x) - ox;
        if (sx < -70 || sx > SCREEN_WIDTH + 70) continue;
        drawBall(ctx, sx, Math.round(f.y), f.d, p.roll, f.seed, Math.round(p.z));
        // 구르는 동안은 얼굴이 돌아가며 보였다 안 보였다 한다
        const turned = Math.abs(p.roll) % (Math.PI * 2);
        const faceUp = p.z > 0 || turned < 1.2 || turned > Math.PI * 2 - 1.2;
        if (faceUp && !(f.t >= FALL_TOTAL - 0.05 && f.face.down)) drawBallFace(ctx, sx, Math.round(f.y) - Math.round(p.z), f.d, f.face);
      }
    },
  };

  return {
    get phase() {
      return phase;
    },
    get busy() {
      return phase !== 'idle';
    },
    get flying() {
      return shots.length;
    },
    drawables: [overlay],
    canStart() {
      return phase === 'idle' && cooldown <= 0 && deps.canScoop(character.x, character.y);
    },
    start(vertical) {
      if (!this.canStart()) return false;
      phase = 'scoop';
      timer = T.scoopSeconds;
      aim = Math.sign(vertical);
      cooldown = T.cooldown;
      character.target = null;
      character.moving = false;
      deps.sounds?.scoop?.();
      return true;
    },
    remoteThrow(start, dir, peak = T.peak) {
      shots.push({ start: { ...start }, dir: { ...dir }, t: 0, mine: false, peak });
    },
    remoteHit(s, n, dir) {
      s.hits = n;
      s.hitAt = deps.now();
      s.wobble = SNOWMAN.wobbleSeconds * 0.4;
      deps.sounds?.thud?.();
      // 머리가 떨어지는 연출만 — 눈사람은 맞힌 사람이 보낸 put으로 바뀐다
      if (!s.headless && n >= hitsNeeded(s.tiers[s.tiers.length - 1])) startFall(s, dir, false);
    },
    splatAt(x, y, z) {
      splat(x, y, z);
      deps.sounds?.thud?.();
    },
    update(dt, vertical) {
      cooldown = Math.max(0, cooldown - dt);
      if (phase !== 'idle') {
        character.moving = false;
        character.target = null;
        if (vertical !== 0) aim = Math.sign(vertical);
        timer -= dt;
        if (timer <= 0 && phase === 'scoop') {
          // 던진다: 시작 자리와 방향만 서버에 보낸다
          const f = character.facing === 'right' ? 1 : -1;
          const start = { x: character.x + f * 4, y: character.y };
          const dir = throwDir(character.facing, aim);
          // 앞에 눈사람이 있으면 그 머리 높이로 던진다
          const peak = Math.round(aimPeak(start, dir, world.snowmen) * 10) / 10;
          shots.push({ start, dir, t: 0, mine: true, peak });
          deps.send?.throw(start, dir, peak);
          deps.sounds?.whoosh?.();
          phase = 'follow';
          timer = T.followSeconds;
        } else if (timer <= 0) phase = 'idle';
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.t += dt;
        const p = flightAt(s.start, s.dir, s.t, s.peak);
        const dir = s.dir.x >= 0 ? 1 : -1;
        let gone = false;
        // 손에서 막 떠난 동안은 아무것도 맞지 않는다
        if (s.t > 0.06) {
          for (const sm of world.snowmen) {
            if (sm.melt >= 0) continue;
            const part = hitPart(p, sm);
            if (!part) continue;
            gone = true;
            if (s.mine) {
              deps.sounds?.thud?.();
              if (part === 'head') hitHead(sm, dir);
            }
            break;
          }
          if (!gone && s.mine && deps.targets) {
            for (const target of deps.targets()) {
              const part = hitPerson(p, target, target.lift);
              if (!part) continue;
              gone = true;
              deps.send?.splat(target.id, part === 'head', dir);
              break;
            }
          }
        }
        if (gone || p.done) {
          // 떨어진 자리에 톡 하고 퍼진다
          splat(p.x, p.y, p.z);
          shots.splice(i, 1);
        }
      }
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += 90 * dt;
        if (b.age >= T.splatSeconds) bits.splice(i, 1);
      }
      for (let i = falls.length - 1; i >= 0; i--) {
        const f = falls[i];
        f.t += dt;
        if (f.t < FALL_TOTAL) continue;
        if (f.mine) landHead(f);
        falls.splice(i, 1);
      }
    },
    pose() {
      if (phase === 'scoop') return { pose: 'crouch', index: 0 };
      if (phase === 'follow') return { pose: 'push', index: 1, lean: character.facing === 'right' ? 1 : -1 };
      return null;
    },
  };
}
