// 내 털모자를 눈사람에게 씌워주기 (재채기·대머리 기능을 그대로 쓴다).
//
// - 모자를 쓰고 있고 손이 비어 있을 때만 씌워줄 수 있다. 씌워주면 나는 바로 대머리 (추위 2배 → 곧 재채기)
// - 눈사람이 이미 모자를 쓰고 있으면 바꿔 씌운다: 다른 사람 털모자는 내가 쓰고, 노점 모자(산타 모자·귀마개)는 내 손에 온다
// - 대머리일 때 모자 쓴 눈사람 곁에서 가져온다: 내 모자면 '돌려받기', 남의 모자면 '가져가기' (그 사람 모자 색을 쓴다)
// - 내가 나가도 모자는 눈사람에 남고, 다시 들어오면 새 모자를 쓰고 온다
// 위쪽은 규칙 (테스트 가능), 아래쪽은 조작과 연출.

import type { Character } from '../character/character';
import { hatColors, type DrawOptions } from '../character/render';
import type { HatState } from '../character/state';
import { CHARACTER, CHARACTER_BASE_PALETTE, HAT_GIFT as G, LAYER_FACTORS, PROPS, SCREEN_WIDTH, type PropId } from '../constants';
import { layerOffsetX } from '../camera';
import type { AttachedProp, SnowmanHat } from '../shared/protocol';
import type { DepthDrawable } from '../zones/zone';
import { attachStyle, PROP_SLOT } from './props';
import type { Hat } from './sneeze';
import { snowmanHeight, type Snowman, type SnowWorld } from './snowman';

// ───────────── 규칙 ─────────────

/** 씌워줄 수 있나: 모자를 쓰고 있고 손이 비어 있을 때만 (소품을 들고 있으면 달아주기가 먼저다) */
export function canGiveHat(hat: HatState, holding: PropId | null): boolean {
  return hat === 'on' && holding === null;
}

export interface GiveResult {
  /** 눈사람이 새로 쓰는 모자와 남은 소품 */
  hat: SnowmanHat;
  props: AttachedProp[];
  /** 눈사람이 쓰고 있던 다른 털모자 — 내가 쓴다 (없으면 null: 나는 대머리) */
  wear: SnowmanHat | null;
  /** 눈사람 머리에 있던 노점 모자 — 내 손에 온다 */
  hold: PropId | null;
}

/** 내 모자(mine)를 씌워준다. 이미 모자가 있으면 바꾼다 */
export function giveHat(snowman: { hat: SnowmanHat | null; props: readonly AttachedProp[] }, mine: SnowmanHat): GiveResult {
  const head = snowman.props.find((a) => PROP_SLOT[a.p] === 'head');
  return {
    hat: { ...mine },
    props: snowman.props.filter((a) => a !== head).map((a) => ({ ...a })),
    wear: snowman.hat ? { ...snowman.hat } : null,
    hold: head ? head.p : null,
  };
}

/** 눈사람 모자를 가져올 수 있나: 눈사람이 털모자를 쓰고 있고 내 머리가 비어 있을 때. 내 모자면 'back'(돌려받기), 남의 것이면 'take'(가져가기) */
export function takeKind(hat: HatState, snowmanHat: SnowmanHat | null, myName: string): 'back' | 'take' | null {
  if (hat === 'on' || !snowmanHat) return null;
  return snowmanHat.name === myName ? 'back' : 'take';
}

/** 광장에 들어올 때는 언제나 새 모자를 쓰고 온다 (눈사람에게 준 모자는 눈사람에 남는다) */
export function hatOnEntry(scarf: number): { hat: HatState; color: number; owner: null } {
  return { hat: 'on', color: scarf, owner: null };
}

// ───────────── 그림 ─────────────

/** 털모자 하나 (가운데 아래가 (cx, bottom)): 둥근 모자 + 띠 + 방울. 폭 w에 맞춘다 */
export function drawBeanie(ctx: CanvasRenderingContext2D, cx: number, bottom: number, w: number, color: number | null): void {
  const { H, h } = hatColors(color);
  const width = Math.max(4, Math.round(w));
  const height = Math.max(3, Math.round(width * 0.6));
  const left = cx - Math.floor(width / 2);
  const band = width >= 12 ? 2 : 1;
  for (let r = 0; r < height - band; r++) {
    // 위로 갈수록 좁아지는 둥근 윗부분
    const t = 1 - r / Math.max(1, height - band);
    const inset = Math.round((1 - Math.sqrt(1 - t * t)) * (width / 2) * 0.8);
    const y = bottom - height + r;
    ctx.fillStyle = H;
    ctx.fillRect(left + inset, y, width - inset * 2, 1);
    ctx.fillStyle = h;
    ctx.fillRect(left + width - inset - Math.max(1, Math.round(width / 6)), y, Math.max(1, Math.round(width / 6)), 1);
  }
  ctx.fillStyle = CHARACTER_BASE_PALETTE.b;
  ctx.fillRect(left, bottom - band, width, band);
  const pom = Math.max(2, Math.round(width / 4));
  ctx.fillStyle = CHARACTER_BASE_PALETTE.P;
  ctx.fillRect(cx - Math.floor(pom / 2), bottom - height - pom + 1, pom, pom);
  ctx.fillStyle = CHARACTER_BASE_PALETTE.p;
  ctx.fillRect(cx - Math.floor(pom / 2) + pom - 1, bottom - height + 0, 1, 1);
}

/** 눈사람 머리에 씌운 털모자: 머리 크기에 맞춘다. 미니는 헐렁해서 눈까지 덮는다 */
export function drawSnowmanBeanie(ctx: CanvasRenderingContext2D, hat: SnowmanHat, hx: number, hy: number, hr: number, mini: boolean): number {
  const w = Math.round(hr * 2) + (mini ? 3 : 1);
  const bottom = mini ? hy + 1 : hy - Math.round(hr * 0.45);
  drawBeanie(ctx, hx, bottom, w, hat.color);
  return bottom - Math.max(3, Math.round(Math.max(4, w) * 0.6)) - Math.max(2, Math.round(Math.max(4, w) / 4));
}

// ───────────── 조작 ─────────────

export interface HatGiftDeps {
  me: () => { name: string; scarf: number };
  put?: (snowman: Snowman) => void;
  /** 씌워주는 몸짓을 친구들에게도 보인다 */
  onAct?: () => void;
  ding?: () => void;
}

type Phase = 'idle' | 'give' | 'take' | 'shiver';

export interface HatGift {
  readonly phase: Phase;
  readonly busy: boolean;
  /** 씌워줄 / 가져올 수 있는 가장 가까운 눈사람 */
  nearestToGive(): { snowman: Snowman; distance: number } | null;
  nearestToTake(): { snowman: Snowman; distance: number; kind: 'back' | 'take' } | null;
  give(snowman: Snowman): boolean;
  take(snowman: Snowman): boolean;
  update(dt: number): void;
  pose(): DrawOptions | null;
  readonly drawables: readonly DepthDrawable[];
}

export function snowmanDistance(character: { x: number; y: number }, s: Snowman): number {
  return Math.max(0, Math.hypot(s.x - character.x, (s.y - character.y) * 1.5) - s.tiers[0] / 2);
}

export function createHatGift(character: Character, hat: Hat, world: SnowWorld, deps: HatGiftDeps): HatGift {
  let phase: Phase = 'idle';
  let timer = 0;
  let time = 0;
  let onto: Snowman | null = null;
  let done = false;
  /** 눈사람에게 가는 중인 모자 (내가 쓰고 있던 것) */
  let flying: SnowmanHat | null = null;
  /** 하트: 나에게서 눈사람 쪽으로 */
  let heart: { from: { x: number; y: number }; to: { x: number; y: number }; t: number } | null = null;

  const myHat = (): SnowmanHat => ({ name: character.hatOwner ?? deps.me().name, color: character.hatColor ?? deps.me().scarf });
  const headOf = (s: Snowman) => ({ x: s.x, y: s.y - snowmanHeight(s.tiers) });
  const wear = (h: SnowmanHat) => {
    character.hatColor = h.color;
    character.hatOwner = h.name === deps.me().name ? null : h.name;
    hat.putOn();
  };
  const begin = (s: Snowman, next: Phase, seconds: number) => {
    onto = s;
    done = false;
    phase = next;
    timer = seconds;
    character.target = null;
    character.moving = false;
    character.facing = s.x >= character.x ? 'right' : 'left';
    deps.onAct?.();
  };

  const overlay: DepthDrawable = {
    footY: 9998,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      if (phase === 'give' && flying && onto && !done) {
        // 두 손으로 들어 눈사람 머리로 옮긴다
        const t = Math.min(1, (1 - timer / G.giveSeconds) / G.giveAt);
        const to = headOf(onto);
        const fromY = character.y - CHARACTER.spriteHeight + 6;
        const x = Math.round(character.x + (to.x - character.x) * t) - ox;
        const y = Math.round(fromY + (to.y + 4 - fromY) * t - Math.sin(Math.PI * t) * 6);
        if (x > -20 && x < SCREEN_WIDTH + 20) drawBeanie(ctx, x, y, 12, flying.color);
      }
      if (heart) {
        const t = heart.t / G.heartSeconds;
        const x = Math.round(heart.from.x + (heart.to.x - heart.from.x) * t + Math.sin(t * 9) * 2) - ox;
        const y = Math.round(heart.from.y + (heart.to.y - heart.from.y) * t - Math.sin(Math.PI * t) * 8);
        ctx.globalAlpha = Math.min(1, (1 - t) * 3);
        ctx.fillStyle = G.heartColor;
        ctx.fillRect(x - 2, y - 1, 2, 2);
        ctx.fillRect(x + 1, y - 1, 2, 2);
        ctx.fillRect(x - 2, y, 5, 2);
        ctx.fillRect(x - 1, y + 2, 3, 1);
        ctx.fillRect(x, y + 3, 1, 1);
        ctx.globalAlpha = 1;
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
    drawables: [overlay],
    nearestToGive() {
      if (!canGiveHat(character.hat.get(), character.holding.get())) return null;
      let best: { snowman: Snowman; distance: number } | null = null;
      for (const s of world.snowmen) {
        if (s.melt >= 0 || s.headless) continue;
        const distance = snowmanDistance(character, s);
        if (!best || distance < best.distance) best = { snowman: s, distance };
      }
      return best;
    },
    nearestToTake() {
      let best: { snowman: Snowman; distance: number; kind: 'back' | 'take' } | null = null;
      for (const s of world.snowmen) {
        const kind = takeKind(character.hat.get(), s.hat, deps.me().name);
        if (!kind) continue;
        const distance = snowmanDistance(character, s);
        if (!best || distance < best.distance) best = { snowman: s, distance, kind };
      }
      return best;
    },
    give(s) {
      if (phase !== 'idle' || !canGiveHat(character.hat.get(), character.holding.get())) return false;
      flying = myHat();
      begin(s, 'give', G.giveSeconds);
      // 나는 바로 대머리가 된다
      hat.giveAway();
      return true;
    },
    take(s) {
      if (phase !== 'idle' || !takeKind(character.hat.get(), s.hat, deps.me().name)) return false;
      begin(s, 'take', G.takeSeconds);
      return true;
    },
    update(dt) {
      time += dt;
      if (heart) {
        heart.t += dt;
        if (heart.t >= G.heartSeconds) heart = null;
      }
      if (phase === 'idle') return;
      character.moving = false;
      character.target = null;
      timer -= dt;
      const s = onto;
      const alive = s !== null && world.snowmen.includes(s);
      if (phase === 'give' && !done && timer <= G.giveSeconds * (1 - G.giveAt)) {
        done = true;
        if (alive && flying) {
          const result = giveHat(s, flying);
          s.hat = result.hat;
          s.props = result.props;
          if (result.hold) character.holding.set(result.hold);
          // 다른 사람 털모자를 쓰고 있었으면 내가 바꿔 쓴다
          if (result.wear) wear(result.wear);
          deps.put?.(s);
          deps.ding?.();
          heart = { from: { x: character.x, y: character.y - CHARACTER.spriteHeight }, to: headOf(s), t: 0 };
        } else if (flying) wear(flying);
        flying = null;
      }
      if (phase === 'take' && !done && timer <= G.takeSeconds * 0.4) {
        done = true;
        if (alive && s.hat && character.hat.get() !== 'on') {
          wear(s.hat);
          s.hat = null;
          deps.put?.(s);
        }
      }
      if (timer > 0) return;
      if (phase === 'give' && character.hat.get() !== 'on') {
        // 머리를 만져 보고 부르르 떤다
        phase = 'shiver';
        timer = G.shiverSeconds;
        return;
      }
      onto = null;
      phase = 'idle';
    },
    pose() {
      if (phase === 'idle') return null;
      if (phase === 'shiver') return { pose: 'cheer', index: 0, lean: Math.floor(time / 0.05) % 2 === 0 ? 1 : -1 };
      const style = onto ? attachStyle(snowmanHeight(onto.tiers)) : 'tiptoe';
      if (style === 'crouch') return { pose: 'crouch', index: 0 };
      const total = phase === 'give' ? G.giveSeconds : G.takeSeconds;
      const t = 1 - timer / total;
      return { pose: 'cheer', index: 0, lift: style === 'jump' ? Math.round(Math.sin(Math.PI * Math.min(1, t)) * PROPS.jumpHeight) : PROPS.tiptoe };
    },
  };
}
