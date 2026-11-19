// 재채기와 날아가는 털모자.
//   createSneeze — '흐… 흐…' 준비 2번(1초, 머리를 뒤로 젖힘, 걸음이 느려짐) → '에취!' 몸이 앞으로 확 꺾이고 큰 입김 구름과 침방울.
//   createHat    — 에취 순간 모자가 바라보는 쪽으로 포물선을 그리며 빙글빙글 날아가 통통 튀다 멈춘다.
//                  회전목마에서는 판 앞 바닥으로, 스케이트 중에는 얼음 위에 떨어져 내 속도로 미끄러진다 (벽에서 튕김).
//                  주울 때까지 그 자리에 남는다 (다른 사람이 주워 갈 수도 있다 — hatChase.ts). 상태는 character.hat('on' | {x, y} | …)에 적고,
//                  벗겨져 있는 동안 캐릭터는 대머리다.
//   createBaldHead — 대머리 위 반짝임(빛 근처에서 더 크게), 내려앉았다 녹는 눈송이, 추울 때 빨간 코끝.
// 계산은 DOM 없이 돌아가고(테스트 가능), 그리기는 받은 ctx에만 한다.

import type { Character } from '../character/character';
import { HAT_ROWS, type Facing } from '../character/sprites';
import { BALD, CHARACTER_BASE_PALETTE, HAT as H, SCREEN_WIDTH, SNEEZE as S, SNEEZE_COLORS as C } from '../constants';
import { hatColors } from '../character/render';
import { fillPixelEllipse, stampPixels } from '../props/pixel';
import { OBSTACLES, WALK_AREA } from '../world';
import { insideSkateArea, wallContact } from '../zones/skating';
import type { DepthDrawable } from '../zones/zone';

const sign = (facing: Facing) => (facing === 'right' ? 1 : -1);

// ───────────── 재채기 ─────────────

interface Puff {
  kind: 'cloud' | 'droplet';
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface Sneeze {
  readonly phase: 'idle' | 'windup' | 'achoo';
  readonly active: boolean;
  /** 재채기를 시작한다 (하는 중이면 무시). 시작했으면 true */
  start(): boolean;
  /** dt초 지나게 한다. '에취' 하는 순간 true (모자가 날아갈 때) */
  update(dt: number): boolean;
  /** 윗몸이 기우는 px: 준비 중에는 뒤로 젖혔다 돌아오기를 두 번, 에취 때는 앞으로 확 */
  lean(facing: Facing): number;
  /** 걷는 빠르기 배율 (준비 중에는 느려진다) */
  speedFactor(): number;
  /** 에취 순간 입 앞에 입김 구름과 침방울을 뿜는다 (x, y = 발밑) */
  burst(x: number, y: number, facing: Facing): void;
  draw(ctx: CanvasRenderingContext2D, offsetX: number): void;
}

export function createSneeze(random: () => number = Math.random): Sneeze {
  let phase: Sneeze['phase'] = 'idle';
  let t = 0;
  const puffs: Puff[] = [];

  return {
    get phase() {
      return phase;
    },
    get active() {
      return phase !== 'idle';
    },
    start() {
      if (phase !== 'idle') return false;
      phase = 'windup';
      t = 0;
      return true;
    },
    update(dt) {
      for (let k = puffs.length - 1; k >= 0; k--) {
        const p = puffs[k];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'droplet') p.vy += S.dropletGravity * dt;
        else p.vx *= Math.max(0, 1 - 3 * dt);
        if (p.age >= (p.kind === 'cloud' ? S.cloudSeconds : S.dropletLife)) puffs.splice(k, 1);
      }
      if (phase === 'idle') return false;
      t += dt;
      if (phase === 'windup' && t >= S.windupSeconds) {
        phase = 'achoo';
        t = 0;
        return true;
      }
      if (phase === 'achoo' && t >= S.achooSeconds) phase = 'idle';
      return false;
    },
    lean(facing) {
      const dir = sign(facing);
      if (phase === 'windup') {
        const each = S.windupSeconds / S.windupCount;
        return -dir * Math.round(S.windupLean * Math.sin((Math.PI * (t % each)) / each));
      }
      if (phase === 'achoo') return dir * Math.round(S.achooLean * (1 - t / S.achooSeconds));
      return 0;
    },
    speedFactor() {
      return phase === 'windup' ? S.windupSpeedFactor : 1;
    },
    burst(x, y, facing) {
      const dir = sign(facing);
      const mx = x + dir * S.mouthOffsetX;
      const my = y - S.mouthAbove;
      puffs.push({ kind: 'cloud', x: mx + dir * 3, y: my, vx: dir * S.cloudSpeed, vy: -4, age: 0 });
      for (let i = 0; i < S.dropletCount; i++) {
        puffs.push({
          kind: 'droplet',
          x: mx,
          y: my,
          vx: dir * S.dropletSpeed * (0.5 + random() * 0.5),
          vy: (random() - 0.6) * S.dropletSpeed * 0.6,
          age: 0,
        });
      }
    },
    draw(ctx, offsetX) {
      for (const p of puffs) {
        const x = Math.round(p.x) - offsetX;
        const y = Math.round(p.y);
        if (p.kind === 'droplet') {
          ctx.fillStyle = C.droplet;
          ctx.fillRect(x, y, 1, 1);
          continue;
        }
        // 큰 입김 구름: 부풀며 픽셀 계단으로 엷어진다
        const f = p.age / S.cloudSeconds;
        const r = Math.max(2, Math.round(S.cloudRadius * (0.5 + 0.5 * Math.min(1, f * 3))));
        ctx.globalAlpha = S.cloudAlphas[Math.min(S.cloudAlphas.length - 1, Math.floor(f * S.cloudAlphas.length))];
        ctx.fillStyle = C.cloud;
        fillPixelEllipse(ctx, x, y, r, Math.max(2, Math.round(r * 0.7)));
        fillPixelEllipse(ctx, x + Math.round(r * 0.7), y - 1, Math.round(r * 0.6), Math.round(r * 0.5));
        ctx.globalAlpha = 1;
      }
    },
  };
}

// ───────────── 모자 ─────────────

/** 모자가 놓일 수 있는 바닥인가: 바닥 띠 안(가장자리 여유)이고 장애물 밖 */
export function hatCanRestAt(x: number, y: number): boolean {
  const m = H.margin;
  if (x < WALK_AREA.x + m || x > WALK_AREA.x + WALK_AREA.w - m || y < WALK_AREA.y + m || y > WALK_AREA.y + WALK_AREA.h - m) return false;
  return !OBSTACLES.some((o) => x >= o.x - m && x <= o.x + o.w + m && y >= o.y - m && y <= o.y + o.h + m);
}

/** p에서 가장 가까운, 모자가 놓일 수 있는 자리 (바닥 띠 맨 가장자리나 장애물에 붙어 서 있을 때) */
export function nearestRestSpot(p: { x: number; y: number }): { x: number; y: number } {
  const m = H.margin;
  const cx = Math.round(Math.min(Math.max(p.x, WALK_AREA.x + m), WALK_AREA.x + WALK_AREA.w - m));
  const cy = Math.round(Math.min(Math.max(p.y, WALK_AREA.y + m), WALK_AREA.y + WALK_AREA.h - m));
  for (let r = 0; r <= 60; r += 2) {
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI * 2 * k) / 16;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (hatCanRestAt(x, y)) return { x, y };
    }
  }
  return { x: cx, y: cy };
}

/** 어디서 날아가나 */
export type HatLaunch =
  /** 바닥에서: 바라보는 방향으로 날아가 통통 튄다 */
  | { kind: 'ground' }
  /** 회전목마 위에서: 판 앞 바닥(frontY 앞쪽)으로, 못 놓이면 safe(입구 앞) 쪽으로 당긴다 */
  | { kind: 'carousel'; frontY: number; safe: { x: number; y: number } }
  /** 얼음 위에서: 얼음에 떨어져 내 속도(vx, vy)를 받아 미끄러진다 */
  | { kind: 'ice'; vx: number; vy: number };

/**
 * 모자가 떨어질 자리. 바라보는 방향으로 30~60px 날아가되, 놓일 수 없는 곳(바닥 띠 밖, 장애물 안)이면
 * 놓일 수 있는 곳이 나올 때까지 안전한 쪽(출발한 자리 또는 safe)으로 당긴다.
 */
export function hatLanding(
  from: { x: number; y: number },
  facing: Facing,
  launch: HatLaunch,
  random: () => number = Math.random,
): { x: number; y: number } {
  const distance = H.flyMinDistance + random() * (H.flyMaxDistance - H.flyMinDistance);
  let x = from.x + sign(facing) * distance;
  let y = from.y + (random() - 0.5) * H.flyDepthSpread;
  if (launch.kind === 'ice') {
    // 링크 안쪽으로만: 밖이면 출발한 자리 쪽으로 당긴다
    for (let k = 0; k < 40 && !insideSkateArea(x, y); k++) {
      x += (from.x - x) * 0.15;
      y += (from.y - y) * 0.15;
    }
    return insideSkateArea(x, y) ? { x: Math.round(x), y: Math.round(y) } : { x: Math.round(from.x), y: Math.round(from.y) };
  }
  let safe = from;
  if (launch.kind === 'carousel') {
    y = launch.frontY + H.carouselFrontMin + random() * (H.carouselFrontMax - H.carouselFrontMin);
    safe = launch.safe;
  }
  // 반올림한 자리(실제로 놓이는 칸)가 놓일 수 있는 곳이어야 한다
  const ok = () => hatCanRestAt(Math.round(x), Math.round(y));
  for (let k = 0; k < 60 && !ok(); k++) {
    const d = Math.hypot(safe.x - x, safe.y - y);
    if (d < 1) break;
    const step = Math.min(d, 3);
    x += ((safe.x - x) / d) * step;
    y += ((safe.y - y) / d) * step;
  }
  if (ok()) return { x: Math.round(x), y: Math.round(y) };
  return nearestRestSpot(safe);
}

export interface Hat extends DepthDrawable {
  /** 머리 위에 있나 (날아가지 않았다) */
  readonly on: boolean;
  /** 날거나 튀거나 미끄러지는 중인가 */
  readonly moving: boolean;
  /** 바닥에 가만히 떨어져 있나 (주울 수 있다) */
  readonly lying: boolean;
  /** 눈사람에게 씌워 줬다 (머리에도 바닥에도 없다) */
  giveAway(): void;
  /** 다른 사람이 주워 쓰고 있다 (머리에도 바닥에도 없다 — 그 사람 머리에 그려진다) */
  takenAway(): void;
  /** 바닥 위 자리 (발밑 기준)와 떠 있는 높이 */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 머리에서 튕겨 날아간다 (from = 발밑). 이미 벗겨져 있으면 아무 일도 없다 */
  launch(from: { x: number; y: number }, facing: Facing, launch: HatLaunch): void;
  update(dt: number): void;
  /** 이 자리에서 주울 수 있나 (가만히 놓여 있고 가까울 때) */
  canPickUp(x: number, y: number): boolean;
  /** 주워서 다시 쓴다 */
  putOn(): void;
  /** (친구 모자) 머리에서 to로 날아가 떨어진다 — 떨어질 자리는 그 친구 화면에서 이미 정해졌다 */
  flyTo(from: { x: number; y: number }, to: { x: number; y: number }): void;
  /** (친구 모자) 이미 떨어져 있던 모자를 그 자리에 둔다 */
  placeAt(to: { x: number; y: number }): void;
}

type HatMode = 'on' | 'flying' | 'bouncing' | 'sliding' | 'resting' | 'away';

export function createHat(character: Character, random: () => number = Math.random): Hat {
  let mode: HatMode = 'on';
  let x = 0;
  let y = 0;
  let z = 0;
  let t = 0;
  let from = { x: 0, y: 0 };
  let to = { x: 0, y: 0 };
  let dir = 1;
  let onIce = false;
  let bouncesLeft = 0;
  let bounceIndex = 0;
  let slideVx = 0;
  let slideVy = 0;
  let spin = 0;
  const sprites = new Map<string, HTMLCanvasElement>();

  /** 모자 그림 (quarter = 90°씩 돌린 모습 0~3) */
  const sprite = (quarter: number): HTMLCanvasElement => {
    const key = `${quarter}|${character.hatColor}`;
    const cached = sprites.get(key);
    if (cached) return cached;
    const w = HAT_ROWS[0].length;
    const h = HAT_ROWS.length;
    const size = Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(size / 2, size / 2);
    ctx.rotate((Math.PI / 2) * quarter);
    stampPixels(ctx, HAT_ROWS, { ...CHARACTER_BASE_PALETTE, ...hatColors(character.hatColor) }, -w / 2, -h / 2);
    sprites.set(key, canvas);
    return canvas;
  };

  const rest = () => {
    mode = 'resting';
    z = 0;
    x = Math.round(x);
    y = Math.round(y);
    character.hat.set({ x, y });
  };

  return {
    get on() {
      return mode === 'on';
    },
    get lying() {
      return mode === 'resting';
    },
    giveAway() {
      mode = 'away';
      z = 0;
      character.hat.set('onSnowman');
    },
    takenAway() {
      mode = 'away';
      z = 0;
      character.hat.set('taken');
    },
    get moving() {
      return mode === 'flying' || mode === 'bouncing' || mode === 'sliding';
    },
    get x() {
      return x;
    },
    get y() {
      return y;
    },
    get z() {
      return z;
    },
    get footY() {
      return y;
    },
    launch(start, facing, launch) {
      if (mode !== 'on') return;
      from = { x: start.x, y: start.y };
      to = hatLanding(start, facing, launch, random);
      dir = to.x >= from.x ? 1 : -1;
      onIce = launch.kind === 'ice';
      if (launch.kind === 'ice') {
        // 내 속도를 받아 미끄러진다 (서 있었으면 바라보던 쪽으로 조금)
        slideVx = launch.vx * H.slideKeep;
        slideVy = launch.vy * H.slideKeep;
        if (Math.hypot(slideVx, slideVy) < H.slideMinSpeed) {
          slideVx = sign(facing) * H.slideMinSpeed;
          slideVy = 0;
        }
      }
      bouncesLeft = H.bounceMin + Math.floor(random() * (H.bounceMax - H.bounceMin + 1));
      bounceIndex = 0;
      mode = 'flying';
      t = 0;
      x = from.x;
      y = from.y;
      z = H.headHeight;
      // 벗겨진 순간부터 대머리. 떨어질 자리를 바로 알린다 (멈추면 한 번 더)
      character.hat.set({ x: to.x, y: to.y });
    },
    update(dt) {
      if (mode === 'on' || mode === 'resting' || mode === 'away') return;
      t += dt;
      if (mode === 'flying') {
        // 포물선을 그리며 빙글빙글
        const f = Math.min(1, t / H.flySeconds);
        x = from.x + (to.x - from.x) * f;
        y = from.y + (to.y - from.y) * f;
        z = H.headHeight * (1 - f) + H.flyArc * 4 * f * (1 - f);
        spin = f * H.spinTurns * 4;
        if (f >= 1) {
          t = 0;
          mode = onIce ? 'sliding' : bouncesLeft > 0 ? 'bouncing' : 'resting';
          if (mode === 'resting') rest();
        }
        return;
      }
      if (mode === 'bouncing') {
        // 통통: 튈 때마다 낮고 짧게, 조금씩 앞으로 (놓일 수 있는 곳으로만)
        const scale = H.bounceDecay ** bounceIndex;
        const length = H.bounceSeconds * Math.sqrt(scale);
        const f = Math.min(1, t / length);
        z = H.bounceHeight * scale * 4 * f * (1 - f);
        const nx = x + ((dir * H.bounceDrift * scale) / length) * dt;
        if (hatCanRestAt(nx, y)) x = nx;
        spin += dt * 6 * scale;
        if (f >= 1) {
          t = 0;
          bounceIndex++;
          if (--bouncesLeft <= 0) rest();
        }
        return;
      }
      // 얼음 위: 쭉 미끄러지다 멈춘다. 링크 벽에서는 튕긴다
      z = 0;
      const speed = Math.hypot(slideVx, slideVy);
      const next = Math.max(0, speed - H.slideFriction * dt);
      if (next <= 0) {
        rest();
        return;
      }
      slideVx *= next / speed;
      slideVy *= next / speed;
      x += slideVx * dt;
      y += slideVy * dt;
      const hit = wallContact(x, y);
      if (hit) {
        x = hit.x;
        y = hit.y;
        const into = slideVx * hit.nx + slideVy * hit.ny;
        if (into > 0) {
          slideVx = (slideVx - 2 * into * hit.nx) * H.slideBounce;
          slideVy = (slideVy - 2 * into * hit.ny) * H.slideBounce;
        }
      }
    },
    canPickUp(px, py) {
      return mode === 'resting' && Math.hypot(px - x, py - y) <= H.pickRadius;
    },
    flyTo(start, end) {
      from = { x: start.x, y: start.y };
      to = { x: end.x, y: end.y };
      dir = to.x >= from.x ? 1 : -1;
      onIce = false;
      bouncesLeft = H.bounceMin;
      bounceIndex = 0;
      mode = 'flying';
      t = 0;
      x = from.x;
      y = from.y;
      z = H.headHeight;
      character.hat.set({ x: to.x, y: to.y });
    },
    placeAt(end) {
      x = end.x;
      y = end.y;
      rest();
    },
    putOn() {
      mode = 'on';
      z = 0;
      character.hat.set('on');
    },
    draw(ctx, camera) {
      if (mode === 'on' || mode === 'away') return;
      const sx = Math.round(x) - Math.round(camera.x);
      if (sx < -16 || sx > SCREEN_WIDTH + 16) return;
      const sy = Math.round(y);
      // 바닥 그림자 (높이 뜰수록 작게)
      const shadow = Math.max(4, Math.round(H.shadowWidth - z / 4));
      ctx.globalAlpha = H.shadowAlpha;
      ctx.fillStyle = C.hatShadow;
      ctx.fillRect(sx - Math.floor(shadow / 2), sy - 1, shadow, 2);
      ctx.globalAlpha = 1;
      const quarter = mode === 'resting' || mode === 'sliding' ? 0 : ((Math.floor(spin) % 4) + 4) % 4;
      const img = sprite(quarter);
      ctx.drawImage(img, sx - img.width / 2, sy - Math.round(z) - img.height + (quarter === 0 ? 2 : 4));
    },
  };
}

// ───────────── 대머리 ─────────────

export interface BaldHead {
  /** lit = 가로등·트리 빛 근처 (더 자주, 더 크게 반짝인다) */
  update(dt: number, lit: boolean): void;
  /** 대머리 위 반짝임과 눈송이 (footX, footY = 화면에서 발밑, lift = 몸이 떠 있는 높이) */
  draw(ctx: CanvasRenderingContext2D, footX: number, footY: number, facing: Facing, lift: number): void;
}

export function createBaldHead(random: () => number = Math.random): BaldHead {
  let gleamLeft = 0;
  let gleamBig = false;
  let nextGleam: number = BALD.gleamEvery;
  let flakeLeft = 0;
  let flakeDx = 0;
  let nextFlake: number = BALD.flakeEvery;

  return {
    update(dt, lit) {
      gleamLeft = Math.max(0, gleamLeft - dt);
      nextGleam -= dt;
      if (nextGleam <= 0) {
        gleamBig = lit;
        gleamLeft = lit ? BALD.litGleamSeconds : BALD.gleamSeconds;
        nextGleam = (lit ? BALD.litGleamEvery : BALD.gleamEvery) * (0.7 + random() * 0.6);
      }
      flakeLeft = Math.max(0, flakeLeft - dt);
      nextFlake -= dt;
      if (nextFlake <= 0) {
        flakeLeft = BALD.flakeSeconds;
        flakeDx = Math.round((random() - 0.5) * 2 * BALD.flakeSpread);
        nextFlake = BALD.flakeEvery * (0.6 + random() * 0.8);
      }
    },
    draw(ctx, footX, footY, facing, lift) {
      const dir = sign(facing);
      const cx = footX + dir * BALD.crownForward;
      const cy = footY - BALD.crownAbove - Math.round(lift);
      if (gleamLeft > 0) {
        // 반짝: 십자 (빛 근처에서는 더 크게)
        ctx.fillStyle = C.gleam;
        const r = gleamBig ? 2 : 1;
        ctx.fillRect(cx - r, cy, r * 2 + 1, 1);
        ctx.fillRect(cx, cy - r, 1, r * 2 + 1);
      }
      if (flakeLeft > 0) {
        // 내려앉은 눈송이가 녹는다
        ctx.globalAlpha = flakeLeft / BALD.flakeSeconds;
        ctx.fillStyle = C.flake;
        ctx.fillRect(footX + flakeDx, cy + (Math.abs(flakeDx) > 3 ? 1 : 0), 1, 1);
        ctx.globalAlpha = 1;
      }
    },
  };
}

/** 추울 때 빨개진 코끝 (1px) */
export function drawRedNose(ctx: CanvasRenderingContext2D, footX: number, footY: number, facing: Facing, lift: number): void {
  ctx.fillStyle = C.nose;
  ctx.fillRect(footX + (facing === 'right' ? BALD.noseForward : -BALD.noseForward - 1), footY - BALD.noseAbove - Math.round(lift), 1, 1);
}
