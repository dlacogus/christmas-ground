// 스케이트 타기 조작: 왼쪽 입구에서 스페이스로 신고(0.8초 주저앉는 연출) 얼음 위로 나가고, 오른쪽 출구 안쪽에서 천천히 멈춰 스페이스로 벗고 나온다.
// 얼음 위에서는 방향키(모바일은 누르고 있는 쪽)로 가속하고, 스페이스 짧게 = 점프, 꾹 = 스핀.
// 움직임 규칙은 skating.ts, 여기서는 입력·캐릭터·NPC·자국·소리·그리기를 잇는다. DOM은 그릴 때 받은 ctx만 쓴다.

import { layerOffsetX, type Camera } from '../camera';
import { setWalkTarget, type Character, type MoveInput } from '../character/character';
import { drawCharacter, getSpriteCanvas, type DrawOptions } from '../character/render';
import type { PoseName } from '../character/sprites';
import { CHARACTER, COLORS, LAYER_FACTORS, SKATE as S, SKATE_COLORS as C } from '../constants';
import type { InputActions } from '../input';
import { drawSpriteReflection, type Skater } from '../props/skater';
import type { PlayHint } from './carouselPlay';
import {
  bumpSkate,
  canTakeOff,
  createSkate,
  jumpLift,
  nearEntranceInside,
  nearExitOutside,
  nearGate,
  nearInside,
  rinkExit,
  rinkGate,
  rinkInside,
  speedOf,
  stepSkate,
  stopSpin,
  touching,
  tryAirSpin,
  tryJump,
  tryStartSpin,
  type Skate,
  type SkateEvent,
} from './skating';

/** 소리를 내는 쪽 (테스트에서는 아무것도 안 하는 것을 넘긴다) */
export interface SkateSoundHooks {
  setGlide(speed: number): void;
  brake(): void;
  land(): void;
  fall(): void;
}

export const silentSkateSounds: SkateSoundHooks = { setGlide() {}, brake() {}, land() {}, fall() {} };

interface Mark {
  x: number;
  y: number;
  age: number;
}

interface Spray {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  /** 공중 스핀 착지 반짝이 (금색) */
  star?: boolean;
}

export type SkatePhaseOuter = 'off' | 'puttingOn' | 'on';

export interface SkatePlay {
  readonly phase: SkatePhaseOuter;
  /** 신는 중이거나 타는 중 */
  readonly active: boolean;
  readonly skate: Skate | null;
  readonly marks: readonly Mark[];
  /** 걸어 다니는 중: 입구에서 스페이스를 누르면 신기 시작한다. 처리했으면 true */
  handleWalking(actions: InputActions, dir: MoveInput): boolean;
  /** 신는 중·타는 중의 입력. spaceHeld = 스페이스를 누르고 있나, pointer = 모바일에서 누르고 있는 월드 좌표 */
  handleInput(dir: MoveInput, actions: InputActions, spaceHeld: boolean, pointer: { x: number; y: number } | null): void;
  /** 움직이고, 부딪히고, 자국을 남긴다 (구역 update 뒤에) */
  update(dt: number): void;
  /** 모바일: 링크를 탭 (걷는 중이면 입구로 걸어가서 신는다) */
  tapRink(): void;
  /** 모바일: 타는 중 탭 — 벗을 수 있으면 벗는다. 처리했으면 true */
  tapWhileSkating(): boolean;
  hint(touch: boolean): PlayHint | null;
  /** 캐릭터를 그린다 (신는 중·타는 중) */
  drawCharacter(ctx: CanvasRenderingContext2D, camera: Camera): void;
  /** 얼음 위에 납작하게: 날 자국과 비친 모습 */
  drawOnIce(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

export function createSkatePlay(character: Character, skaters: readonly Skater[], sounds: SkateSoundHooks = silentSkateSounds): SkatePlay {
  let phase: SkatePhaseOuter = 'off';
  let skate: Skate | null = null;
  let putOnLeft = 0;
  let time = 0;
  let tipsLeft = 0;
  let bumpCooldown = 0;
  let spinHeld = false;
  let pressedInAir = false;
  let startOnArrive = false;
  let sprayTimer = 0;
  let lastMark: { x: number; y: number } | null = null;
  let dir: MoveInput = { x: 0, y: 0 };
  const marks: Mark[] = [];
  const spray: Spray[] = [];
  const events: SkateEvent[] = [];

  const addMark = (x: number, y: number) => {
    marks.push({ x, y, age: 0 });
    if (marks.length > S.trailMax) marks.shift();
  };

  /** 지난 자국에서 지금 자리까지 trailSpacing 간격으로 이어 찍는다 */
  const trace = (x: number, y: number) => {
    if (!lastMark) {
      lastMark = { x, y };
      addMark(x, y);
      return;
    }
    const d = Math.hypot(x - lastMark.x, y - lastMark.y);
    const steps = Math.floor(d / S.trailSpacing);
    for (let i = 1; i <= steps; i++) {
      const t = (i * S.trailSpacing) / d;
      addMark(lastMark.x + (x - lastMark.x) * t, lastMark.y + (y - lastMark.y) * t);
    }
    if (steps > 0) lastMark = { x: lastMark.x + ((x - lastMark.x) * steps * S.trailSpacing) / d, y: lastMark.y + ((y - lastMark.y) * steps * S.trailSpacing) / d };
  };

  /** 스핀 자리 작은 동그라미 */
  const ring = (x: number, y: number) => {
    for (let i = 0; i < S.ringPoints; i++) {
      const a = (Math.PI * 2 * i) / S.ringPoints;
      addMark(x + S.ringRadiusX * Math.cos(a), y + S.ringRadiusY * Math.sin(a));
    }
  };

  const syncCharacter = () => {
    if (!skate) return;
    character.x = skate.x;
    character.y = skate.y;
    character.facing = skate.facing;
    character.state.set({ kind: 'skating', vx: Math.round(skate.vx), vy: Math.round(skate.vy) });
  };

  const start = () => {
    phase = 'puttingOn';
    putOnLeft = S.putOnSeconds;
    const g = rinkGate();
    character.x = g.x;
    character.y = g.y;
    character.target = null;
    character.moving = false;
    character.puffs.length = 0;
    startOnArrive = false;
  };

  const takeOff = () => {
    // 출구 밖에 선다
    const g = rinkExit();
    phase = 'off';
    skate = null;
    lastMark = null;
    spinHeld = false;
    for (const s of skaters) s.clearAvoid();
    sounds.setGlide(0);
    character.x = g.x;
    character.y = g.y;
    character.facing = 'right';
    character.moving = false;
    character.animTime = 0;
    character.state.set({ kind: 'walk' });
  };

  return {
    get phase() {
      return phase;
    },
    get active() {
      return phase !== 'off';
    },
    get skate() {
      return skate;
    },
    marks,
    handleWalking(actions, walkDir) {
      if (phase !== 'off') return false;
      if (walkDir.x !== 0 || walkDir.y !== 0) startOnArrive = false;
      if (character.state.get().kind !== 'walk') return false;
      if (nearGate(character.x, character.y) && (actions.tap || actions.hold)) {
        start();
        return true;
      }
      if (startOnArrive && !character.target) {
        startOnArrive = false;
        if (nearGate(character.x, character.y)) {
          start();
          return true;
        }
      }
      return false;
    },
    handleInput(keys, actions, spaceHeld, pointer) {
      dir = { x: 0, y: 0 };
      if (phase !== 'on' || !skate) return;
      // 출구 안쪽에서 천천히 멈췄으면 스페이스 = 벗기 (점프·스핀은 나가지 않는다)
      if (canTakeOff(skate) && (actions.tap || actions.hold)) {
        takeOff();
        return;
      }
      if (!nearInside(skate)) {
        // 점프 중 알맞은 때 다시 누르면 공중 스핀 (그 누름이 떼질 때 또 점프하지 않게)
        if (actions.spaceDown && skate.jump !== null) {
          tryAirSpin(skate);
          pressedInAir = true;
        }
        if (actions.tap && pressedInAir) pressedInAir = false;
        else if (actions.tap && tryJump(skate)) lastMark = null;
        if (actions.hold && spaceHeld && tryStartSpin(skate)) {
          spinHeld = true;
          ring(skate.x, skate.y);
        }
      }
      if (spinHeld && !spaceHeld) {
        spinHeld = false;
        stopSpin(skate);
      }
      if (keys.x !== 0 || keys.y !== 0) dir = keys;
      else if (pointer) {
        // 모바일: 누르고 있는 쪽으로 민다
        const dx = pointer.x - skate.x;
        const dy = pointer.y - skate.y;
        const d = Math.hypot(dx, dy);
        if (d > S.pointerDeadZone) dir = { x: dx / d, y: dy / d };
      }
    },
    update(dt) {
      time += dt;
      bumpCooldown = Math.max(0, bumpCooldown - dt);
      tipsLeft = Math.max(0, tipsLeft - dt);
      for (const m of marks) m.age += dt;
      while (marks.length > 0 && marks[0].age >= S.trailSeconds) marks.shift();
      for (const p of spray) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += S.sprayGravity * dt;
      }
      while (spray.length > 0 && spray[0].age >= S.sprayLife) spray.shift();

      if (phase === 'puttingOn') {
        putOnLeft -= dt;
        if (putOnLeft <= 0) {
          // 얼음 위 입구 안쪽으로 나간다
          const p = rinkInside();
          skate = createSkate(p.x, p.y, 'right');
          phase = 'on';
          tipsLeft = S.tipsSeconds;
          lastMark = null;
          syncCharacter();
        }
        return;
      }
      if (phase !== 'on' || !skate) return;

      if (spinHeld && skate.phase !== 'spinning') spinHeld = false;
      events.length = 0;
      stepSkate(skate, dt, dir, events);

      // NPC와 부딪히기, 가까우면 NPC가 비켜 돈다
      for (const npc of skaters) {
        npc.setAvoid(skate.x, skate.y);
        if (bumpCooldown > 0 || skate.jump !== null || !touching(skate.x, skate.y, npc.x, npc.y)) continue;
        let nx = skate.x - npc.x;
        let ny = skate.y - npc.y;
        const d = Math.hypot(nx, ny);
        if (d === 0) {
          nx = 1;
          ny = 0;
        } else {
          nx /= d;
          ny /= d;
        }
        bumpSkate(skate, nx, ny);
        npc.bump(-nx, -ny);
        bumpCooldown = S.bumpCooldown;
      }

      for (const e of events) {
        if (e === 'brake' && speedOf(skate) > S.sprayMinSpeed) sounds.brake();
        if (e === 'land' || e === 'spinLand') sounds.land();
        // 공중 스핀 뒤 착지: 발밑에 반짝이
        if (e === 'spinLand') {
          for (let i = 0; i < S.airSpinSparkles; i++) {
            const a = (Math.PI * 2 * i) / S.airSpinSparkles;
            spray.push({ x: skate.x, y: skate.y - 2, vx: Math.cos(a) * 28, vy: Math.sin(a) * 14 - 18, age: 0, star: true });
          }
        }
        if (e === 'fall') sounds.fall();
      }

      // 얼음 가루: 브레이크를 거는 동안 발 앞으로 튄다
      if (skate.braking && speedOf(skate) > S.sprayMinSpeed / 2) {
        sprayTimer -= dt;
        if (sprayTimer <= 0 && spray.length < S.sprayMax) {
          sprayTimer = S.sprayEvery;
          const sign = skate.facing === 'right' ? 1 : -1;
          spray.push({
            x: skate.x + sign * 4,
            y: skate.y - 1,
            vx: sign * (10 + Math.random() * 25) + skate.vx * 0.3,
            vy: -(12 + Math.random() * 18),
            age: 0,
          });
        }
      }

      // 날 자국: 땅에 서서 움직일 때만 (점프하는 동안은 끊긴다)
      if (skate.jump === null && skate.phase !== 'fallen') trace(skate.x, skate.y);
      else lastMark = null;

      sounds.setGlide(skate.jump === null && skate.phase !== 'fallen' ? speedOf(skate) : 0);
      syncCharacter();
    },
    tapRink() {
      if (phase !== 'off' || character.state.get().kind !== 'walk') return;
      if (nearGate(character.x, character.y)) {
        start();
        return;
      }
      const g = rinkGate();
      setWalkTarget(character, g.x, g.y);
      startOnArrive = true;
    },
    tapWhileSkating() {
      if (phase === 'on' && skate && canTakeOff(skate)) {
        takeOff();
        return true;
      }
      return false;
    },
    hint(touch) {
      if (phase === 'off') {
        if (character.state.get().kind !== 'walk') return null;
        if (nearExitOutside(character.x, character.y)) return { text: '출구예요', sub: '입구는 왼쪽 ←', anchor: 'head' };
        if (!nearGate(character.x, character.y)) return null;
        return touch
          ? { text: '입구', sub: '링크를 탭해 스케이트 신기', anchor: 'head' }
          : { text: '입구', sub: 'Space 스케이트 신기', anchor: 'head' };
      }
      if (phase === 'puttingOn' || !skate) return null;
      if (canTakeOff(skate)) return touch ? { text: '출구', sub: '탭해서 벗기', anchor: 'head' } : { text: '출구', sub: 'Space 벗기', anchor: 'head' };
      // 입구 안쪽에서 멈춰 있으면 출구를 알려 준다
      if (tipsLeft <= 0 && nearEntranceInside(skate) && speedOf(skate) < S.exitMaxSpeed) {
        return { text: '출구는 오른쪽 →', anchor: 'head' };
      }
      if (tipsLeft > 0) {
        return touch
          ? { text: '누르고 있는 쪽으로 미끄러져요', anchor: 'bottom' }
          : { text: '방향키로 밀기', sub: 'Space 점프 · 꾹 스핀', anchor: 'bottom' };
      }
      return null;
    },
    drawCharacter(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      if (phase === 'puttingOn') {
        drawCharacter(ctx, character, ox, { pose: 'crouch', index: Math.floor(time / S.crouchFrameSeconds) });
        return;
      }
      if (!skate) return;
      if (skate.phase === 'fallen' && skate.timer > S.getUpSeconds) {
        // 벌러덩: 뒤로 젖혀지며 눕고, 머리 위로 별이 돈다
        const tip = Math.min(1, (S.fallSeconds - skate.timer) / S.fallTipSeconds);
        drawLying(ctx, getSpriteCanvas('skateGlide', 0, skate.facing, character.outfit), Math.round(skate.x) - ox, Math.round(skate.y), skate.facing, tip, time);
      } else {
        drawCharacter(ctx, character, ox, skateDrawOptions(skate, time));
      }
      if (spray.length > 0) {
        for (const p of spray) {
          ctx.fillStyle = p.star ? C.star : C.spray;
          ctx.globalAlpha = 1 - p.age / S.sprayLife;
          ctx.fillRect(Math.round(p.x) - ox, Math.round(p.y), p.age < S.sprayLife / 2 ? 2 : 1, 1);
        }
        ctx.globalAlpha = 1;
      }
    },
    drawOnIce(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      if (marks.length > 0) {
        ctx.fillStyle = C.trail;
        for (const m of marks) {
          ctx.globalAlpha = S.trailAlpha * (1 - m.age / S.trailSeconds);
          ctx.fillRect(Math.round(m.x) - ox, Math.round(m.y), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      // 누워 있을 때는 비친 모습을 그리지 않는다 (누운 몸은 얼음에 붙어 있다)
      if (phase === 'on' && skate && !(skate.phase === 'fallen' && skate.timer > S.getUpSeconds)) {
        const opts = skateDrawOptions(skate, time);
        const sprite = getSpriteCanvas(opts.pose!, opts.index ?? 0, opts.facing ?? skate.facing, character.outfit);
        drawSpriteReflection(ctx, sprite, skate.x, skate.y + Math.round(opts.lift ?? 0), ox);
      }
    },
  };
}

/** 지금 상태에 맞는 자세 */
export function skateDrawOptions(skate: Skate, time: number): DrawOptions & { pose: PoseName } {
  const speed = speedOf(skate);
  // 넘어진 끝에 일어나는 동작 (누워 있는 동안은 drawLying으로 따로 그린다)
  if (skate.phase === 'fallen') return { pose: 'crouch' };
  if (skate.phase === 'spinning' || (skate.jump !== null && skate.airSpin)) {
    // 좌우가 빠르게 바뀌며 빙글빙글
    const flip = Math.floor(time / S.spinFlipSeconds) % 2 === 0;
    return { pose: 'glide', index: 1, facing: flip ? 'right' : 'left', lift: jumpLift(skate) };
  }
  if (skate.phase === 'dizzy') {
    const progress = 1 - skate.timer / S.dizzySeconds;
    const lean = Math.round(S.dizzyLean * Math.sin(progress * Math.PI * S.dizzySwings) * (1 - progress) * 2);
    return { pose: 'skateGlide', lean };
  }
  const sign = skate.facing === 'right' ? 1 : -1;
  const lean = speed >= S.fastSpeed ? S.leanFast * sign : 0;
  if (skate.jump !== null) return { pose: 'skateGlide', lift: jumpLift(skate), lean };
  // 미는 동안은 발로 밀어내는 2프레임, 아니면 팔을 벌린 글라이드
  if (skate.pushing) return { pose: 'glide', index: Math.floor(skate.pushTime / S.pushFrameSeconds), lean };
  return { pose: 'skateGlide', lean };
}

/**
 * 벌러덩 누운 모습: 서 있는 그림을 발 쪽을 축으로 뒤로 90° 젖혀 눕힌다 (얼굴이 하늘을 본다).
 * tip = 0 → 서 있음, 1 → 다 누움. 오른쪽을 보다 넘어지면 머리가 왼쪽(뒤)으로 간다.
 */
function drawLying(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  footX: number,
  footY: number,
  facing: 'left' | 'right',
  tip: number,
  time: number,
): void {
  const back = facing === 'right' ? -1 : 1;
  const e = 1 - (1 - tip) * (1 - tip);
  const W = CHARACTER.spriteWidth;
  const H = CHARACTER.spriteHeight;
  // 누운 몸 그림자
  ctx.globalAlpha = CHARACTER.shadowAlpha;
  ctx.fillStyle = COLORS.shadow;
  const shadowW = Math.round(CHARACTER.shadowWidth + (S.lyingShadowWidth - CHARACTER.shadowWidth) * e);
  ctx.fillRect(Math.round(footX + back * (shadowW / 2 - S.lyingShiftX) * e) - shadowW / 2, footY - 1, shadowW, CHARACTER.shadowHeight);
  ctx.globalAlpha = 1;
  ctx.save();
  // 발을 축으로 젖히고, 누운 몸이 바닥 위에 오도록 옮긴다
  ctx.translate(footX - back * S.lyingShiftX * e, footY - (W / 2) * e);
  ctx.rotate((back * Math.PI * e) / 2);
  ctx.drawImage(sprite, -W / 2, -H);
  ctx.restore();
  // 다 누우면 머리 위로 별
  if (tip >= 1) {
    const headX = footX + back * (H - S.lyingShiftX - 8);
    drawStars(ctx, headX, footY - W / 2 + H - 14, time);
  }
}

/** 머리 위를 도는 작은 별 (+ 모양) */
function drawStars(ctx: CanvasRenderingContext2D, footX: number, footY: number, time: number): void {
  const headY = footY - CHARACTER.spriteHeight + 5 - S.starAboveHead;
  ctx.fillStyle = C.star;
  for (let i = 0; i < S.starCount; i++) {
    const a = (Math.PI * 2 * time) / S.starPeriod + (Math.PI * 2 * i) / S.starCount;
    const x = Math.round(footX + S.starRadiusX * Math.cos(a));
    const y = Math.round(headY + S.starRadiusY * Math.sin(a));
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
  }
}
