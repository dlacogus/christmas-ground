// 노점 소품 조작: 노점 구경(고르기) → 건네받기 → 들고 다니기 → 눈사람에 달아주기.
// 규칙과 그림은 props.ts. 여기는 입력을 그 규칙에 잇고 캐릭터 몸짓·힌트를 정한다.
//
// - 노점 앞에서 구경하기: 노점 위에 소품 아이콘이 뜨고 ←→로 고른 뒤 스페이스로 받는다 (Esc·↑↓·멀어지면 닫힌다)
// - 한 번에 하나만 든다. 새로 받으면 들고 있던 것은 노점으로 돌아간다
// - 눈 굴리기·스케이트를 시작하면 발밑에 내려놓고, 재채기하면 손에서 튀어 나간다. 바닥의 소품은 스페이스로 줍는다
// - 소품을 들고 눈사람 곁에서 달아주기: 눈사람 키에 따라 쪼그려 앉거나 까치발, 머리가 높으면 폴짝 뛴다

import { layerOffsetX, type Camera } from '../camera';
import { canStandAt, setWalkTarget, type Character, type MoveInput } from '../character/character';
import type { DrawOptions } from '../character/render';
import { LAYER_FACTORS, MARKET_HUT, PROPS, PROP_COLORS, SCREEN_WIDTH, type Held, type PropId } from '../constants';
import type { InputActions } from '../input';
import type { DepthDrawable } from '../zones/zone';
import { HUTS, STALLS, STREET_LINE_Y, WALK_AREA } from '../world';
import { attachProp, attachStyle, canAttach, drawHeldItem, drawItemIcon, drawPropIcon, PROP_NAMES, PROP_SLOT, takeFromStall } from './props';
import { isOrnamentKind } from './treeDecor';
import { snowmanHeight, type Snowman, type SnowWorld } from './snowman';

export interface GroundProp {
  /** 노점 소품 또는 트리 장식 */
  prop: Held;
  /** 트리 장식이면 그 장식의 id */
  tag: string | null;
  x: number;
  y: number;
  drawable: DepthDrawable;
}

export interface PropsPlayDeps {
  /** 내 닉네임 (누가 달았는지 적는다) */
  me: () => string;
  /** 달아준 눈사람을 서버에 알린다 (저장된다) */
  put?: (snowman: Snowman) => void;
  /** '띠링' */
  ding?: () => void;
  /** 달아주는 몸짓을 친구들에게도 보인다 */
  onAttach?: () => void;
}

type Phase = 'idle' | 'browse' | 'take' | 'attach';

export interface PropsPlay {
  readonly phase: Phase;
  /** 캐릭터를 맡고 있나 (구경·건네받기·달아주기 중) */
  readonly busy: boolean;
  readonly holding: Held | null;
  /** 가까운 노점 (구경할 수 있는 거리 안이 아니어도 가장 가까운 것) */
  nearestStall(): { index: number; distance: number; x: number; y: number };
  nearestGround(): { item: GroundProp; distance: number } | null;
  /** 들고 있는 소품을 달 수 있는 가장 가까운 눈사람 */
  nearestSnowman(): { snowman: Snowman; distance: number } | null;
  open(stall: number): void;
  pickUp(item: GroundProp): void;
  decorate(snowman: Snowman): boolean;
  /** 들고 있던 소품을 발밑에 내려놓는다 (눈 굴리기·스케이트 시작) / 앞으로 떨어뜨린다 (재채기) */
  putDown(thrown?: boolean): void;
  /** 이 자리 바닥에 놓는다 (던진 장식이 튕겨 떨어졌을 때) */
  dropAt(item: Held, x: number, y: number, tag?: string | null): void;
  /** 화면을 탭했다 (맵 좌표): 처리했으면 true */
  tap(x: number, y: number): boolean;
  update(dt: number, dir: MoveInput, actions: InputActions): void;
  hint(touch: boolean): { text: string; sub?: string; anchor: 'point' | 'bottom'; at?: { x: number; y: number } } | null;
  pose(): DrawOptions | null;
  /** 손에 든 소품을 그린다 */
  drawHeld(ctx: CanvasRenderingContext2D, footX: number, footY: number, lift: number): void;
  /** 눈사람 위에 '♥ 닉네임'을 3초 띄운다 */
  showHeart(snowman: Snowman, name: string): void;
  /** 머리 위에 잠깐 뜨는 글자 — 맵 좌표 */
  labels(): readonly { x: number; y: number; text: string }[];
  /** 진열대와 고르는 화면 */
  readonly drawables: readonly DepthDrawable[];
  /** 바닥에 내려놓은 소품들 */
  readonly ground: readonly GroundProp[];
}

const NO_LABELS: readonly { x: number; y: number; text: string }[] = [];

/** 노점 앞에 서는 자리 */
export function stallFront(stall: number): { x: number; y: number } {
  return { x: HUTS[STALLS[stall].hut].x, y: WALK_AREA.y + PROPS.stallFront };
}

export function createPropsPlay(character: Character, world: SnowWorld, deps: PropsPlayDeps): PropsPlay {
  let phase: Phase = 'idle';
  let timer = 0;
  let time = 0;
  /** 구경 중인 노점과 고른 칸 */
  let stall = 0;
  let pick = 0;
  let lastDirX = 0;
  /** 건네받는 중인 소품 */
  let taking: PropId = 'carrot';
  /** 달아주는 중인 눈사람 */
  let onto: Snowman | null = null;
  let attached = false;
  /** 탭해서 걸어가는 중: 도착하면 연다 / 달아준다 */
  let arrive: { stall: number } | { snowman: Snowman } | null = null;
  const ground: GroundProp[] = [];
  const hearts: { snowman: Snowman; name: string; left: number }[] = [];
  const holding = () => character.holding.get();
  /** 들고 있는 것이 노점 소품일 때만 (트리 장식은 눈사람에 달 수 없다) */
  const heldProp = (): PropId | null => {
    const h = character.holding.get();
    return h && !isOrnamentKind(h) ? h : null;
  };

  const shelfX = (s: number, i: number) => HUTS[STALLS[s].hut].x + Math.round((i - (STALLS[s].props.length - 1) / 2) * PROPS.shelfGap);
  const shelfY = STREET_LINE_Y - MARKET_HUT.counterHeight - PROPS.shelfAbove;
  const menuX = (s: number, i: number) => HUTS[STALLS[s].hut].x + Math.round((i - (STALLS[s].props.length - 1) / 2) * PROPS.menuGap);
  const menuY = STREET_LINE_Y - PROPS.menuAbove;

  const close = () => {
    phase = 'idle';
    arrive = null;
  };

  const addGround = (prop: Held, x: number, y: number, tag: string | null = null) => {
    const item: GroundProp = {
      prop,
      tag,
      x,
      y,
      drawable: {
        get footY() {
          return item.y;
        },
        draw(ctx: CanvasRenderingContext2D, camera: Camera) {
          const sx = Math.round(item.x) - layerOffsetX(camera, LAYER_FACTORS.main);
          if (sx < -12 || sx > SCREEN_WIDTH + 12) return;
          drawItemIcon(ctx, item.prop, sx, Math.round(item.y) - 3);
        },
      },
    };
    ground.push(item);
  };

  const take = () => {
    taking = STALLS[stall].props[pick];
    phase = 'take';
    timer = PROPS.takeSeconds;
    deps.ding?.();
  };

  const finishAttach = () => {
    const s = onto!;
    const prop = heldProp();
    if (!prop || !world.snowmen.includes(s)) return;
    const result = attachProp(s.props, prop, deps.me());
    if (!result.ok) return;
    s.props = result.props;
    // 같은 자리에 있던 것은 떼어내 내 손으로 온다
    character.holding.set(result.removed);
    deps.put?.(s);
    deps.ding?.();
    // 친구 눈사람에 달아줬으면 '♥ 닉네임'
    const mine = s.makers.length > 0 ? s.makers.some((m) => m.name === deps.me()) : true;
    if (!mine) hearts.push({ snowman: s, name: deps.me(), left: PROPS.heartSeconds });
  };

  /** 노점 앞 자리 (미리 계산)와, 가까운 것 찾기의 결과를 담아 다시 쓰는 객체 */
  const fronts = STALLS.map((_, s) => stallFront(s));
  const stallResult = { index: 0, distance: Infinity, x: 0, y: 0 };
  const groundResult = { item: null as unknown as GroundProp, distance: 0 };
  const snowmanResult = { snowman: null as unknown as Snowman, distance: 0 };
  const distanceToSnowman = (s: Snowman) => Math.max(0, Math.hypot(s.x - character.x, (s.y - character.y) * 1.5) - s.tiers[0] / 2);

  const shelf: DepthDrawable = {
    // 노점(연석 바로 뒤) 바로 앞
    footY: STREET_LINE_Y + 0.5,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      for (let s = 0; s < STALLS.length; s++) {
        const cx = HUTS[STALLS[s].hut].x - ox;
        if (cx < -60 || cx > SCREEN_WIDTH + 60) continue;
        const list = STALLS[s].props;
        for (let i = 0; i < list.length; i++) {
          // 건네받는 중인 것은 진열대에서 손으로 넘어온다
          if (phase === 'take' && s === stall && i === pick) continue;
          drawPropIcon(ctx, list[i], shelfX(s, i) - ox, shelfY);
        }
      }
      if (phase === 'take') {
        // 노점 주인의 손이 계산대 너머로 건네준다: 진열대 → 내 손
        const t = 1 - timer / PROPS.takeSeconds;
        const f = character.facing === 'right' ? 1 : -1;
        const fromX = shelfX(stall, pick) - ox;
        const toX = Math.round(character.x) - ox + f * PROPS.handX;
        const toY = Math.round(character.y) - PROPS.handY;
        const x = Math.round(fromX + (toX - fromX) * t);
        const y = Math.round(shelfY + (toY - shelfY) * t - Math.sin(Math.PI * t) * 5);
        if (t < 0.6) {
          ctx.fillStyle = PROP_COLORS.hand;
          ctx.fillRect(x - 1, y + 3, 3, 2);
        }
        drawPropIcon(ctx, taking, x, y);
      }
    },
  };

  const menu: DepthDrawable = {
    // 고르는 화면은 모든 것 위에
    footY: 9999,
    draw(ctx, camera) {
      if (phase !== 'browse') return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const list = STALLS[stall].props;
      const half = PROPS.menuBox / 2;
      for (let i = 0; i < list.length; i++) {
        const x = menuX(stall, i) - ox;
        const bob = i === pick ? Math.round(Math.sin(time * 6)) : 0;
        ctx.fillStyle = PROP_COLORS.menuBack;
        ctx.fillRect(x - half, menuY - half + bob, PROPS.menuBox, PROPS.menuBox);
        ctx.fillStyle = i === pick ? PROP_COLORS.menuPick : PROP_COLORS.menuEdge;
        ctx.fillRect(x - half, menuY - half + bob, PROPS.menuBox, 1);
        ctx.fillRect(x - half, menuY + half - 1 + bob, PROPS.menuBox, 1);
        ctx.fillRect(x - half, menuY - half + bob, 1, PROPS.menuBox);
        ctx.fillRect(x + half - 1, menuY - half + bob, 1, PROPS.menuBox);
        drawPropIcon(ctx, list[i], x, menuY + bob, PROPS.menuScale);
      }
    },
  };

  const self: PropsPlay = {
    get phase() {
      return phase;
    },
    get busy() {
      return phase !== 'idle';
    },
    get holding() {
      return holding();
    },
    ground,
    drawables: [shelf, menu],
    // 아래 셋은 걸어 다니는 동안 매 프레임 불린다: 결과 객체를 하나씩 두고 다시 쓴다
    nearestStall() {
      let best = 0;
      let bestDistance = Infinity;
      for (let s = 0; s < fronts.length; s++) {
        const d = Math.hypot(fronts[s].x - character.x, (fronts[s].y - character.y) * 1.5);
        if (d < bestDistance) {
          best = s;
          bestDistance = d;
        }
      }
      stallResult.index = best;
      stallResult.distance = bestDistance;
      stallResult.x = fronts[best].x;
      stallResult.y = fronts[best].y;
      return stallResult;
    },
    nearestGround() {
      let best: GroundProp | null = null;
      let bestDistance = Infinity;
      for (const item of ground) {
        const distance = Math.hypot(item.x - character.x, item.y - character.y);
        if (distance < bestDistance) {
          best = item;
          bestDistance = distance;
        }
      }
      if (!best) return null;
      groundResult.item = best;
      groundResult.distance = bestDistance;
      return groundResult;
    },
    nearestSnowman() {
      const prop = heldProp();
      if (!prop) return null;
      const slot = PROP_SLOT[prop];
      let best: Snowman | null = null;
      let bestDistance = Infinity;
      for (const s of world.snowmen) {
        if (s.melt >= 0 || !canAttach(s.props, prop) || (s.hat && slot === 'head')) continue;
        if (s.headless && (slot === 'head' || slot === 'face')) continue;
        const distance = distanceToSnowman(s);
        if (distance < bestDistance) {
          best = s;
          bestDistance = distance;
        }
      }
      if (!best) return null;
      snowmanResult.snowman = best;
      snowmanResult.distance = bestDistance;
      return snowmanResult;
    },
    open(index) {
      if (phase !== 'idle') return;
      stall = index;
      pick = 0;
      lastDirX = 0;
      phase = 'browse';
      character.target = null;
      character.moving = false;
      character.facing = HUTS[STALLS[index].hut].x >= character.x ? 'right' : 'left';
    },
    pickUp(item) {
      const i = ground.indexOf(item);
      if (i < 0) return;
      // 들고 있던 것이 있으면 그 자리에 내려놓고 바꿔 든다
      const old = holding();
      const oldTag = character.heldTag;
      character.heldTag = item.tag;
      character.holding.set(item.prop);
      if (old) {
        item.prop = old;
        item.tag = oldTag;
      } else ground.splice(i, 1);
    },
    decorate(snowman) {
      const prop = heldProp();
      if (phase !== 'idle' || !prop || !canAttach(snowman.props, prop) || (snowman.hat && PROP_SLOT[prop] === 'head')) return false;
      onto = snowman;
      attached = false;
      phase = 'attach';
      timer = PROPS.attachSeconds;
      character.target = null;
      character.moving = false;
      character.facing = snowman.x >= character.x ? 'right' : 'left';
      deps.onAttach?.();
      return true;
    },
    putDown(thrown = false) {
      const prop = holding();
      if (!prop) return;
      const tag = character.heldTag;
      character.heldTag = null;
      character.holding.set(null);
      const f = character.facing === 'right' ? 1 : -1;
      const x = character.x + (thrown ? f * PROPS.sneezeThrow : 0);
      const y = Math.min(WALK_AREA.y + WALK_AREA.h - 2, Math.max(WALK_AREA.y + 2, character.y + 1));
      // 떨어질 수 없는 자리(장애물 안)면 발밑에
      addGround(prop, canStandAt(x, y) ? x : character.x, y, tag);
    },
    dropAt(item, x, y, tag = null) {
      addGround(item, x, Math.min(WALK_AREA.y + WALK_AREA.h - 2, Math.max(WALK_AREA.y + 2, y)), tag);
    },
    tap(x, y) {
      if (phase === 'browse') {
        // 아이콘을 누르면 받고, 다른 데를 누르면 닫는다
        const list = STALLS[stall].props;
        for (let i = 0; i < list.length; i++) {
          if (Math.abs(x - menuX(stall, i)) <= PROPS.menuBox / 2 + 2 && Math.abs(y - menuY) <= PROPS.menuBox / 2 + 2) {
            pick = i;
            take();
            return true;
          }
        }
        close();
        return true;
      }
      if (phase !== 'idle') return true;
      // 노점을 누르면 그 앞으로 걸어가 구경한다
      if (y < WALK_AREA.y) {
        for (let s = 0; s < STALLS.length; s++) {
          const hut = HUTS[STALLS[s].hut];
          if (Math.abs(x - hut.x) > hut.w / 2 || y < STREET_LINE_Y - 40) continue;
          const front = stallFront(s);
          if (Math.hypot(front.x - character.x, front.y - character.y) <= PROPS.stallRadius) self.open(s);
          else {
            setWalkTarget(character, front.x, front.y);
            arrive = { stall: s };
          }
          return true;
        }
        return false;
      }
      // 바닥의 소품을 누르면 (곁에 있을 때) 줍는다
      for (const item of ground) {
        if (Math.abs(x - item.x) <= 8 && Math.abs(y - item.y + 3) <= 8 && Math.hypot(item.x - character.x, item.y - character.y) <= PROPS.pickRadius) {
          self.pickUp(item);
          return true;
        }
      }
      // 소품을 들고 눈사람을 누르면 걸어가 달아준다
      const prop = heldProp();
      if (prop) {
        for (const s of world.snowmen) {
          if (Math.abs(x - s.x) > s.tiers[0] / 2 + 3 || y > s.y + 3 || y < s.y - snowmanHeight(s.tiers) - 4 || !canAttach(s.props, prop)) continue;
          if (distanceToSnowman(s) <= PROPS.attachRadius) self.decorate(s);
          else {
            const side = character.x <= s.x ? -1 : 1;
            setWalkTarget(character, s.x + side * (s.tiers[0] / 2 + 6), s.y);
            arrive = { snowman: s };
          }
          return true;
        }
      }
      return false;
    },
    update(dt, dir, actions) {
      time += dt;
      for (let i = hearts.length - 1; i >= 0; i--) {
        hearts[i].left -= dt;
        if (hearts[i].left <= 0 || !world.snowmen.includes(hearts[i].snowman)) hearts.splice(i, 1);
      }
      if (phase === 'idle') {
        // 탭해서 걸어가던 곳에 닿았나
        if (arrive && (dir.x !== 0 || dir.y !== 0)) arrive = null;
        if (arrive && !character.target) {
          const a = arrive;
          arrive = null;
          if ('stall' in a) {
            const front = stallFront(a.stall);
            if (Math.hypot(front.x - character.x, front.y - character.y) <= PROPS.stallRadius) self.open(a.stall);
          } else if (world.snowmen.includes(a.snowman) && distanceToSnowman(a.snowman) <= PROPS.attachRadius + 4) self.decorate(a.snowman);
        }
        return;
      }
      character.moving = false;
      character.target = null;
      if (phase === 'browse') {
        // ←→로 고르고, 스페이스로 받는다. Esc·↑↓로 닫는다
        const dx = Math.sign(dir.x);
        const count = STALLS[stall].props.length;
        if (dx !== 0 && dx !== lastDirX) pick = (pick + dx + count) % count;
        lastDirX = dx;
        if (actions.cancel || dir.y !== 0) close();
        else if (actions.tap || actions.hold) take();
        return;
      }
      timer -= dt;
      if (phase === 'take') {
        if (timer <= 0) {
          // 들고 있던 소품은 노점으로 돌아간다 (트리 장식은 발밑에 내려놓는다)
          if (!heldProp()) self.putDown();
          character.holding.set(takeFromStall(heldProp(), taking).holding);
          phase = 'idle';
        }
        return;
      }
      // 달아주는 중
      if (!attached && timer <= PROPS.attachSeconds * (1 - PROPS.attachAt)) {
        attached = true;
        finishAttach();
      }
      if (timer <= 0) {
        onto = null;
        phase = 'idle';
      }
    },
    hint(touch) {
      if (phase === 'browse') {
        const p = STALLS[stall].props[pick];
        return { text: touch ? `${PROP_NAMES[p]} — 눌러서 받기` : `←→ 고르기 · Space ${PROP_NAMES[p]} 받기`, anchor: 'bottom' };
      }
      return null;
    },
    pose() {
      if (phase === 'browse' || phase === 'take') return { pose: 'idle', index: 0 };
      if (phase !== 'attach' || !onto) return null;
      const style = attachStyle(snowmanHeight(onto.tiers));
      const t = 1 - timer / PROPS.attachSeconds;
      if (style === 'crouch') return { pose: 'crouch', index: 0 };
      if (style === 'tiptoe') return { pose: 'cheer', index: 0, lift: PROPS.tiptoe };
      // 머리가 한참 높다: 팔을 쭉 뻗고 폴짝 뛴다
      return { pose: 'cheer', index: 0, lift: Math.round(Math.sin(Math.PI * Math.min(1, t / PROPS.attachAt)) * PROPS.jumpHeight) };
    },
    drawHeld(ctx, footX, footY, lift) {
      const prop = holding();
      if (!prop) return;
      if (phase === 'attach' && onto && !isOrnamentKind(prop)) {
        // 달아주는 동안은 손에서 눈사람 쪽으로 들어 올린다
        if (attached) return;
        const f = character.facing === 'right' ? 1 : -1;
        const style = attachStyle(snowmanHeight(onto.tiers));
        const up = style === 'crouch' ? 4 : 26 + (this.pose()?.lift ?? 0);
        drawPropIcon(ctx, prop, footX + f * (PROPS.handX + 1), footY - up, 1, f);
        return;
      }
      drawHeldItem(ctx, prop, footX, footY, character.facing, lift);
    },
    showHeart(snowman, name) {
      hearts.push({ snowman, name, left: PROPS.heartSeconds });
    },
    labels() {
      if (hearts.length === 0) return NO_LABELS;
      return hearts.map((h) => ({ x: h.snowman.x, y: h.snowman.y - snowmanHeight(h.snowman.tiers) - 8, text: `♥ ${h.name}` }));
    },
  };
  return self;
}
