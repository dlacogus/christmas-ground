// 트리 꾸미기 조작과 그림. 규칙은 treeDecor.ts — 여기는 입력을 그 규칙에 잇고, 선물 상자·장식·사다리를 그린다.
//
// - 선물 상자: 산타 썰매에서 톡 튀어나와 낙하산을 펴고 내려온다 (떨어질 자리에 그림자가 점점 진해진다).
//   닿으면 낙하산이 접히고 한 번 통 튄다. 화면 밖이면 가장자리에 작은 선물 아이콘과 화살표.
// - 상자 열기 (1.5초): 덜컹덜컹 → 리본이 풀리고 → 뚜껑이 폭 → 장식이 떠올라 손으로. 한 상자는 한 사람만 (서버가 정한다).
// - 달기: 화단 앞에서 스페이스 → 달 자리 고르기(방향키, 다시 스페이스, Esc) → 높이에 따라 까치발 / 사다리 / 던지기.
// - 달린 장식: 바람에 살짝 흔들리고, 장식볼에는 가까운 전구 빛이 1px 비친다. 빛나는 장식은 작은 빛을 더한다.

import { falloffVolume } from '../audio/falloff';
import type { TreeDecorSounds } from '../audio/treeDecorSounds';
import { layerOffsetX, type Camera } from '../camera';
import type { Character, MoveInput } from '../character/character';
import type { DrawOptions } from '../character/render';
import { GIFT, GIFT_COLORS as GC, LAYER_FACTORS, ORNAMENT, ORNAMENT_COLORS as OC, PROPS, SCREEN_WIDTH, TREE, TREE_DECOR as D, type OrnamentKind } from '../constants';
import type { InputActions } from '../input';
import { fillPixelEllipse } from '../props/pixel';
import type { TreeLight, TreeProp } from '../props/tree';
import type { PointLight } from '../scenery/lighting';
import { VIEW } from '../screen';
import { debugGiftId } from '../shared/plazaCore';
import type { Act, WireGift, WireOrnament } from '../shared/protocol';
import { TREE_X, WALK_AREA, getObstacle } from '../world';
import type { DepthDrawable } from '../zones/zone';
import { drawOrnament } from './props';
import {
  ORNAMENT_NAMES,
  TREE_FOOT_Y,
  canUnhang,
  checkHang,
  giftFlight,
  glows,
  hangHalfWidth,
  hangSeconds,
  hangStyle,
  isBall,
  isOrnamentKind,
  isSpecial,
  liveGifts,
  milestoneAt,
  nextSantaIn,
  rollOrnament,
  starIsBright,
  type Gift,
  type HangCheck,
  type HangStyle,
  type TreeOrnament,
} from './treeDecor';

export interface TreeDecorDeps {
  tree: TreeProp;
  /** 서버 시각 (ms). 접속이 없으면 내 시계 */
  now: () => number;
  /** 서버에 붙어 있나 (아니면 내 화면에서만 열고 단다) */
  online: () => boolean;
  /** 내 닉네임과 접속 id */
  me: () => string;
  myId: () => string | null;
  send: {
    open(id: string): void;
    hang(id: string, x: number, y: number): void;
    unhang(id: string): void;
    debugGift(x: number, y: number): void;
  };
  /** 손에 든 것을 내려놓거나 바닥에 놓는다 (노점 소품과 같은 손·같은 바닥) */
  hands: {
    putDown(): void;
    dropAt(item: OrnamentKind, x: number, y: number, tag: string | null): void;
    has(tag: string): boolean;
  };
  sounds?: TreeDecorSounds;
  /** 다는 몸짓을 친구들에게도 보인다 */
  act?: (a: Act) => void;
  random?: () => number;
}

type Phase = 'idle' | 'opening' | 'pick' | 'approach' | 'tiptoe' | 'ladder' | 'toss' | 'miss' | 'proud';

interface Box {
  gift: Gift;
  fallSeconds: number;
  /** air = 떨어지는 중, ground = 바닥, opening = 열리는 중, empty = 빈 상자가 접힌다, vanish = 오래돼 반짝이며 사라진다 */
  state: 'air' | 'ground' | 'opening' | 'empty' | 'vanish';
  /** 지금 상태가 된 뒤 지난 시간 */
  t: number;
  /** 열려서 나온 장식, 내가 열고 있나, 뚜껑이 이미 튀었나 */
  kind: OrnamentKind | null;
  mine: boolean;
  popped: boolean;
  trailIn: number;
  drawable: DepthDrawable;
}

interface Hung extends TreeOrnament {
  /** 바람에 흔들리는 박자 (장식마다 다르다) */
  swayPhase: number;
  swayHz: number;
  /** 달린 뒤 지난 시간 (자리 잡으며 흔들린다) */
  settle: number;
  /** 가까운 트리 전구 (장식볼에 하이라이트로 비친다) */
  light: TreeLight | null;
  /** 서버 답을 기다리는 중 */
  pending: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  snow: boolean;
}

export interface TreeDecor {
  readonly phase: Phase;
  /** 캐릭터를 맡고 있나 (열기·자리 고르기·달기) */
  readonly busy: boolean;
  /** 달 자리를 고르거나 다는 동안 카메라를 트리에 고정한다 */
  readonly cameraFocus: number | null;
  /** 손에 든 장식을 내가 따로 그리는 중 (기본 손 그림은 숨긴다) */
  readonly hidesHeld: boolean;
  readonly count: number;
  /** 열 수 있는 가장 가까운 선물 상자 */
  nearestGift(): { id: string; x: number; y: number; distance: number } | null;
  /** 장식을 들고 있을 때 화단 앞까지의 거리 (달 수 없으면 Infinity) */
  hangDistance(): number;
  open(id: string): boolean;
  startPick(at?: { x: number; y: number }): boolean;
  /** 화면을 탭했다 (맵 좌표): 처리했으면 true */
  tap(x: number, y: number): boolean;
  update(dt: number, dir: MoveInput, actions: InputActions, stillTime: number): void;
  hint(touch: boolean): { text: string; sub?: string; anchor: 'point' | 'bottom'; at?: { x: number; y: number } } | null;
  pose(): DrawOptions | null;
  /** 윗몸을 기울이는 px (꽉 찬 트리 앞에서 갸우뚱, 높은 사다리에서 흔들흔들) */
  lean(): number;
  /** 머리 위·장식 옆에 잠깐 뜨는 글자 — 맵 좌표 */
  labels(): readonly { x: number; y: number; text: string }[];
  /** 발밑 y로 앞뒤 정렬해 그릴 것들 */
  drawables(): readonly DepthDrawable[];
  /** 하늘에서 내려오는 상자와 화면 가장자리 화살표 (시설보다 앞에 그린다) */
  readonly sky: { update(dt: number): void; draw(ctx: CanvasRenderingContext2D, offsetX: number): void };
  /** 선물 상자와 빛나는 장식이 내는 작은 빛 */
  lights(): readonly PointLight[];
  // ── 서버가 알려 준 것
  setTree(list: readonly WireOrnament[]): void;
  setOpened(ids: readonly string[]): void;
  restoreMine(list: readonly { id: string; kind: OrnamentKind }[]): void;
  onOpened(id: string, by: string, kind: OrnamentKind): void;
  onOpenDenied(id: string): void;
  onHung(o: WireOrnament, milestone?: number): void;
  onHangDenied(id: string): void;
  onUnhung(id: string, by: string): void;
  addDebugGift(gift: WireGift): void;
  // ── 개발용 (?debug=1)
  debugDrop(): void;
  debugLine(): string;
  drawDebug(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

const NO_LABELS: readonly { x: number; y: number; text: string }[] = [];
const STAND_Y = TREE_FOOT_Y + D.standFront;
const SHAKE_END = GIFT.openSeconds * GIFT.shakeUntil;
const POP_AT = GIFT.openSeconds * GIFT.popAt;
const FLOAT_END = GIFT.openSeconds * GIFT.floatUntil;
/** 서버 답을 이만큼 기다려도 없으면 그만둔다 (초) */
const OPEN_TIMEOUT = 2.5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 글자열에서 늘 같은 0~1 값 (장식마다 다른 흔들림 박자) */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// ───────────── 그림 ─────────────

/** 선물 상자: 바닥 가운데 (cx, bottom). lidUp = 뚜껑이 떠오른 높이 (음수면 뚜껑 없음), bow = 리본 매듭이 있나, height = 접히는 중이면 줄어든 높이 */
function drawGiftBox(ctx: CanvasRenderingContext2D, cx: number, bottom: number, color: number, lidUp = 0, bow = true, height: number = GIFT.height): void {
  const c = GC.boxes[color] ?? GC.boxes[0];
  const w = GIFT.width;
  const left = cx - w / 2;
  const top = bottom - height;
  ctx.fillStyle = c.base;
  ctx.fillRect(left, top, w, height);
  ctx.fillStyle = c.shade;
  ctx.fillRect(left + w - 1, top, 1, height);
  ctx.fillRect(left, bottom - 1, w, 1);
  ctx.fillStyle = c.ribbon;
  ctx.fillRect(cx - 1, top, 2, height);
  if (height < GIFT.height) return;
  if (lidUp !== 0) {
    // 뚜껑이 열렸다: 상자 안쪽이 어둡게 보인다
    ctx.fillStyle = c.shade;
    ctx.fillRect(left + 1, top, w - 2, 1);
  }
  if (lidUp < 0) return;
  // 뚜껑 (위 두 줄, 살짝 넓다)과 리본 매듭
  const lidTop = top - lidUp;
  ctx.fillStyle = c.base;
  ctx.fillRect(left - 1, lidTop, w + 2, 2);
  ctx.fillStyle = c.shade;
  ctx.fillRect(left - 1, lidTop + 1, w + 2, 1);
  ctx.fillStyle = c.ribbon;
  ctx.fillRect(cx - 1, lidTop, 2, 2);
  if (!bow) return;
  ctx.fillRect(cx - 3, lidTop - 2, 2, 2);
  ctx.fillRect(cx + 1, lidTop - 2, 2, 2);
  ctx.fillRect(cx - 1, lidTop - 1, 2, 1);
}

/** 빨간 천 낙하산: 상자 위 (cx, 상자 윗선 top). open = 펴진 정도 (1 = 활짝, 0 = 접힘) */
function drawChute(ctx: CanvasRenderingContext2D, cx: number, top: number, open: number): void {
  const half = Math.max(1, Math.round(GIFT.chuteHalfWidth * open));
  const canopyBottom = top - GIFT.chuteLines;
  // 줄: 천 양 끝에서 상자 윗모서리로
  ctx.fillStyle = GC.string;
  for (let i = 1; i < GIFT.chuteLines; i++) {
    const f = i / GIFT.chuteLines;
    const dx = Math.round(half + (GIFT.width / 2 - 1 - half) * f);
    ctx.fillRect(cx - dx, canopyBottom + i, 1, 1);
    ctx.fillRect(cx + dx - 1, canopyBottom + i, 1, 1);
  }
  // 천: 위가 둥근 반달
  const h = Math.max(1, Math.round(GIFT.chuteHeight * (0.4 + 0.6 * open)));
  for (let r = 0; r < h; r++) {
    const rowHalf = Math.max(1, Math.round(half * Math.sqrt(1 - ((h - 1 - r) / h) ** 2)));
    ctx.fillStyle = r === h - 1 ? GC.chuteShade : GC.chute;
    ctx.fillRect(cx - rowHalf, canopyBottom - h + 1 + r, rowHalf * 2, 1);
  }
  ctx.fillStyle = GC.chuteStripe;
  ctx.fillRect(cx - 1, canopyBottom - h + 1, 2, h - 1);
}

/** 화면 가장자리의 작은 선물 아이콘 */
const POINTER_ICON = ['.R.R.', 'RRRRR', 'BBRBB', 'BBRBB', 'BBRBB'];

// ───────────── 조작 ─────────────

export function createTreeDecor(character: Character, deps: TreeDecorDeps): TreeDecor {
  const random = deps.random ?? Math.random;
  const bed = getObstacle('tree-bed');
  let phase: Phase = 'idle';
  let time = 0;

  // ── 선물 상자
  const boxes = new Map<string, Box>();
  const opened = new Set<string>();
  const debugGifts: (Gift & { at: number })[] = [];
  let syncIn = 0;
  /** 내가 열고 있는 상자와, 서버가 준 장식 (아직 답이 없으면 null), 기다린 시간 */
  let openBox: Box | null = null;
  let granted: OrnamentKind | null = null;
  let waited = 0;
  /** 놓쳤을 때 '…', 장식 이름을 띄우는 남은 시간 */
  let deniedLeft = 0;
  let nameLeft = 0;
  let nameText = '';
  /** 탭해서 걸어가는 중: 도착하면 연다 / 달 자리를 고른다 */
  let arrive: { box: string } | { pick: { x: number; y: number } } | null = null;

  // ── 트리 장식
  const hung: Hung[] = [];
  const musicBoxes: Hung[] = [];
  /** 접속이 없을 때 내 화면에서 축하한 가장 큰 개수 */
  let celebrated = 0;

  // ── 달 자리 고르기와 달기
  const cursor = { x: TREE_X, y: TREE_FOOT_Y - 30 };
  let cursorCheck: HangCheck = 'outside';
  let undoTarget: Hung | null = null;
  const spot = { x: 0, y: 0 };
  let style: HangStyle = 'tiptoe';
  let duration = 0;
  let t = 0;
  let standX = TREE_X;
  let attached = false;
  let missed = false;
  let hangKind: OrnamentKind = 'ballRed';
  let hangId = '';
  /** 날아가는(손에서 자리로 옮겨 가는) 장식의 지금 자리 */
  const flying = { on: false, x: 0, y: 0 };
  const missTo = { x: 0, y: 0 };
  let lift = 0;
  let puzzledLeft = 0;
  let wasNearFull = false;
  let lastStill = 0;

  const sparks: Spark[] = [];
  const lightList: PointLight[] = [];
  let lightsDirty = true;

  const heldOrnament = (): OrnamentKind | null => {
    const h = character.holding.get();
    return h && isOrnamentKind(h) ? h : null;
  };
  const facingSign = () => (character.facing === 'right' ? 1 : -1);
  const handX = () => character.x + facingSign() * PROPS.handX;
  const handY = () => character.y - PROPS.handY - lift;
  const nowSeconds = () => deps.now() / 1000;
  const levelAt = (x: number) => falloffVolume(Math.abs(x - character.x), 80, 520, 1);

  const burst = (x: number, y: number, count: number, snow: boolean) => {
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const speed = snow ? 10 + random() * 16 : 14 + random() * 34;
      sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * (snow ? 0.5 : 1) - (snow ? 8 : 16), age: 0, life: (snow ? 0.5 : GIFT.sparkleLife) * (0.6 + random() * 0.6), snow });
    }
  };

  /** 손에 장식을 쥐여 준다 (뭔가 들고 있었으면 발밑에 내려놓는다) */
  const giveOrnament = (id: string, kind: OrnamentKind) => {
    if (character.holding.get() !== null) deps.hands.putDown();
    character.heldTag = id;
    character.holding.set(kind);
  };

  // ── 상자 만들기·맞추기

  const makeBox = (gift: Gift, fallSeconds: number): Box => {
    const box: Box = {
      gift,
      fallSeconds,
      state: 'air',
      t: 0,
      kind: null,
      mine: false,
      popped: false,
      trailIn: 0,
      drawable: {
        footY: gift.y,
        draw(ctx, camera) {
          drawBoxOnGround(ctx, box, layerOffsetX(camera, LAYER_FACTORS.main));
        },
      },
    };
    return box;
  };

  /** 지금 있어야 할 상자들에 맞춘다 (서버 시각으로 계산 — 모든 화면이 같다) */
  const syncBoxes = (now: number) => {
    const wanted = liveGifts(now, opened);
    for (let i = debugGifts.length - 1; i >= 0; i--) {
      const g = debugGifts[i];
      if (opened.has(g.id)) debugGifts.splice(i, 1);
      else wanted.push(g);
    }
    // 바닥에는 최근 3개까지: 더 떨어지면 가장 오래된 상자가 사라진다
    wanted.sort((a, b) => a.landAt - b.landAt);
    let landed = 0;
    for (const g of wanted) if (g.landAt <= now) landed++;
    while (landed > GIFT.maxOnGround) {
      wanted.shift();
      landed--;
    }
    for (const g of wanted) {
      if (boxes.has(g.id)) continue;
      const box = makeBox(g, g.landAt - g.dropAt - GIFT.popSeconds);
      boxes.set(g.id, box);
      lightsDirty = true;
      const since = now - g.dropAt;
      if (since < 0.5) {
        // 막 썰매에서 튀어나왔다: 톡, 그리고 작은 '호호'
        deps.sounds?.pop(levelAt(g.x));
        deps.sounds?.hoho(levelAt(g.x));
      }
      if (g.landAt <= now) {
        box.state = 'ground';
        box.t = now - g.landAt + 10;
      }
    }
    for (const box of boxes.values()) {
      if (box.state !== 'air' && box.state !== 'ground') continue;
      if (wanted.some((g) => g.id === box.gift.id)) continue;
      if (opened.has(box.gift.id) || box.state === 'air') {
        boxes.delete(box.gift.id);
      } else {
        // 새 상자에 밀려난 가장 오래된 상자: 반짝이며 사라진다
        box.state = 'vanish';
        box.t = 0;
      }
      lightsDirty = true;
    }
  };

  const landEffects = (box: Box) => {
    deps.sounds?.land(levelAt(box.gift.x));
    burst(box.gift.x, box.gift.y - 1, GIFT.puffCount, true);
  };

  const updateBoxes = (dt: number, now: number) => {
    for (const box of boxes.values()) {
      const g = box.gift;
      if (box.state === 'air') {
        if (now >= g.landAt) {
          box.state = 'ground';
          box.t = now - g.landAt;
          if (box.t < 1) landEffects(box);
          continue;
        }
        // 뒤로 반짝이 꼬리
        box.trailIn -= dt;
        if (box.trailIn <= 0) {
          box.trailIn = GIFT.trailEvery;
          const p = giftFlight(g, now - g.dropAt, box.fallSeconds);
          sparks.push({ x: p.x + (random() - 0.5) * 6, y: p.y - GIFT.height - random() * 6, vx: (random() - 0.5) * 4, vy: -3, age: 0, life: GIFT.trailLife, snow: false });
        }
      } else if (box.state === 'ground') {
        box.t += dt;
      } else if (box.state === 'opening') {
        // 내가 여는 중이고 서버 답이 아직 없으면 덜컹거리며 기다린다
        const hold = box.mine && granted === null;
        box.t = hold ? Math.min(box.t + dt, SHAKE_END) : box.t + dt;
        if (!box.popped && box.t >= POP_AT) {
          box.popped = true;
          const special = box.kind !== null && isSpecial(box.kind);
          burst(g.x, g.y - GIFT.height, special ? GIFT.specialSparkleCount : GIFT.sparkleCount, false);
          if (box.mine || levelAt(g.x) > 0.3) deps.sounds?.open(special);
        }
        if (box.t >= GIFT.openSeconds) {
          if (box.mine) receive(box);
          box.state = 'empty';
          box.t = 0;
          lightsDirty = true;
        }
      } else {
        box.t += dt;
        if (box.state === 'vanish' && random() < dt * 14) burst(g.x + (random() - 0.5) * 8, g.y - 4 - random() * 6, 1, false);
        if (box.t >= (box.state === 'empty' ? GIFT.emptySeconds : GIFT.vanishSeconds)) {
          boxes.delete(g.id);
          lightsDirty = true;
        }
      }
    }
  };

  /** 열기가 끝났다: 장식이 손으로 들어오고, 이름이 머리 위에 2초 뜬다 */
  const receive = (box: Box) => {
    if (box.kind) {
      giveOrnament(box.gift.id, box.kind);
      nameText = ORNAMENT_NAMES[box.kind];
      nameLeft = GIFT.nameSeconds;
    }
    openBox = null;
    granted = null;
    if (phase === 'opening') phase = 'idle';
  };

  /** 늦었다: 다른 사람이 먼저 열었다. 머리 위에 작은 말풍선 '…' */
  const deny = () => {
    if (openBox && openBox.state === 'opening' && openBox.mine) {
      openBox.mine = false;
      openBox.state = 'ground';
      openBox.t = 10;
    }
    openBox = null;
    granted = null;
    deniedLeft = GIFT.deniedSeconds;
    if (phase === 'opening') phase = 'idle';
  };

  // ── 트리 장식

  const makeHung = (o: TreeOrnament, settle: number, pending: boolean): Hung => {
    let light: TreeLight | null = null;
    if (isBall(o.kind)) {
      let best: number = D.shineRadius;
      for (const l of deps.tree.lights) {
        const d = Math.hypot(l.x - o.x, l.y - o.y);
        if (d <= best && d > 0) {
          best = d;
          light = l;
        }
      }
    }
    return { ...o, swayPhase: hash01(o.id, 1) * Math.PI * 2, swayHz: D.swayMinHz + (D.swayMaxHz - D.swayMinHz) * hash01(o.id, 2), settle, light, pending };
  };

  /** 장식 목록이 바뀌었다: 오르골 목록·빛·별 밝기를 다시 맞춘다 */
  const treeChanged = () => {
    musicBoxes.length = 0;
    for (const o of hung) if (o.kind === 'musicBox') musicBoxes.push(o);
    lightsDirty = true;
    deps.tree.setBright(starIsBright(hung.length));
  };

  const celebrate = () => {
    deps.tree.celebrate();
    deps.sounds?.celebrate();
  };

  const removeHung = (id: string): Hung | null => {
    const i = hung.findIndex((o) => o.id === id);
    if (i < 0) return null;
    const [gone] = hung.splice(i, 1);
    treeChanged();
    return gone;
  };

  const rebuildLights = () => {
    lightsDirty = false;
    lightList.length = 0;
    for (const box of boxes.values()) {
      if (box.state !== 'ground' && box.state !== 'opening') continue;
      lightList.push({ x: box.gift.x, y: box.gift.y - 1, radius: GIFT.glowRadius, alpha: GIFT.glowAlpha, color: GC.glow, floor: true });
    }
    for (const o of hung) {
      if (glows(o.kind)) lightList.push({ x: o.x, y: o.y, radius: D.glowRadius, alpha: D.glowAlpha, color: OC.glow, floor: false });
    }
  };

  // ── 달기

  /** 화단 앞까지의 거리 (화단 상자 앞선에서, 뒤쪽이면 Infinity) */
  const bedDistance = (): number => {
    if (character.y < TREE_FOOT_Y) return Infinity;
    const dx = Math.max(0, Math.abs(character.x - TREE_X) - bed.w / 2);
    return Math.hypot(dx, character.y - TREE_FOOT_Y);
  };
  const isFull = () => hung.length >= ORNAMENT.max;

  const refreshCursor = () => {
    const x = Math.round(cursor.x);
    const y = Math.round(cursor.y);
    // 내가 방금(1분 안에) 단 장식에 갖다 대면 뗄 수 있다
    undoTarget = null;
    const me = deps.me();
    const now = deps.now();
    for (const o of hung) {
      if (o.pending || Math.hypot(o.x - x, o.y - y) > D.undoRadius || !canUnhang(o, me, now)) continue;
      undoTarget = o;
      break;
    }
    cursorCheck = checkHang(x, y, hung);
  };

  const beginPick = (at?: { x: number; y: number }): boolean => {
    if (phase !== 'idle' || !heldOrnament() || isFull()) return false;
    phase = 'pick';
    arrive = null;
    character.target = null;
    character.moving = false;
    cursor.x = at ? at.x : clamp(character.x, TREE_X - 60, TREE_X + 60);
    // 처음에는 캐릭터 머리 바로 위, 손이 닿는 높이에서 시작한다
    cursor.y = at ? at.y : TREE_FOOT_Y - ORNAMENT.reachHeight + 2;
    refreshCursor();
    return true;
  };

  const startHang = () => {
    const kind = heldOrnament();
    if (!kind || !character.heldTag) return;
    hangKind = kind;
    hangId = character.heldTag;
    spot.x = Math.round(cursor.x);
    spot.y = Math.round(cursor.y);
    style = hangStyle(spot.y);
    duration = hangSeconds(spot.y);
    standX = clamp(spot.x, TREE_X - D.standMaxSide, TREE_X + D.standMaxSide);
    attached = false;
    // 별 바로 아래는 던져서 걸친다: 가끔 잎에 튕겨 떨어진다
    missed = style === 'toss' && random() < ORNAMENT.tossMissChance;
    lift = 0;
    t = 0;
    flying.on = false;
    phase = 'approach';
  };

  const unhangNow = (o: Hung) => {
    phase = 'idle';
    if (deps.online()) deps.send.unhang(o.id);
    else if (removeHung(o.id)) giveOrnament(o.id, o.kind);
  };

  /** 장식이 자리에 걸렸다 */
  const attach = () => {
    attached = true;
    flying.on = false;
    character.heldTag = null;
    character.holding.set(null);
    const online = deps.online();
    hung.push(makeHung({ id: hangId, kind: hangKind, x: spot.x, y: spot.y, by: deps.me(), at: deps.now() }, 0, online));
    treeChanged();
    deps.sounds?.hang();
    deps.act?.('decorate');
    if (online) deps.send.hang(hangId, spot.x, spot.y);
    else {
      const m = milestoneAt(hung.length, celebrated);
      if (m !== null) {
        celebrated = m;
        celebrate();
      }
    }
  };

  const toProud = () => {
    phase = 'proud';
    t = 0;
    lift = 0;
  };

  const updateHanging = (dt: number) => {
    if (phase === 'approach') {
      // 달 자리 아래(화단 앞)로 걸어간다
      const dx = standX - character.x;
      const dy = STAND_Y - character.y;
      const dist = Math.hypot(dx, dy);
      const step = D.approachSpeed * dt;
      if (dist <= step) {
        character.x = standX;
        character.y = STAND_Y;
        character.moving = false;
        character.facing = spot.x >= character.x ? 'right' : 'left';
        phase = style;
        t = 0;
        if (style === 'ladder') deps.sounds?.pop();
        return;
      }
      character.x += (dx / dist) * step;
      character.y += (dy / dist) * step;
      if (Math.abs(dx) > 0.5) character.facing = dx > 0 ? 'right' : 'left';
      if (!character.moving) {
        character.moving = true;
        character.animTime = 0;
      }
      character.animTime += dt;
      return;
    }
    t += dt;
    const f = Math.min(1, t / duration);
    if (phase === 'tiptoe') {
      // 까치발을 들고 걸어준다
      lift = D.tiptoeLift;
      const u = Math.min(1, f / 0.7);
      if (!attached) {
        flying.on = true;
        flying.x = handX() + (spot.x - handX()) * u;
        flying.y = handY() + (spot.y - handY()) * u;
        if (u >= 1) attach();
      }
      if (f >= 1) toProud();
    } else if (phase === 'ladder') {
      // 사다리를 한 칸씩 올라가 걸고 내려온다
      const top = Math.max(0, STAND_Y - spot.y - D.handUp);
      if (f < D.climbUntil) lift = Math.round((top * (f / D.climbUntil)) / D.rungGap) * D.rungGap;
      else if (f < D.hangUntil) lift = top;
      else lift = Math.round((top * (1 - (f - D.hangUntil) / (1 - D.hangUntil))) / D.rungGap) * D.rungGap;
      lift = Math.min(top, lift);
      if (!attached) {
        flying.on = true;
        const u = clamp((f - D.climbUntil) / (D.hangUntil - D.climbUntil), 0, 1);
        flying.x = handX() + (spot.x - handX()) * u;
        flying.y = handY() + (spot.y - handY()) * u;
        if (f >= D.hangUntil) attach();
      }
      if (f >= 1) toProud();
    } else if (phase === 'toss') {
      // 톡 던져 걸친다
      const u = clamp((f - 0.2) / 0.8, 0, 1);
      flying.on = true;
      flying.x = handX() + (spot.x - handX()) * u;
      flying.y = handY() + (spot.y - handY()) * u - Math.sin(Math.PI * u) * D.tossArc;
      if (u < 1) return;
      if (missed) {
        // 잎에 튕겨 떨어진다: 바닥에서 다시 줍는다
        character.heldTag = null;
        character.holding.set(null);
        missTo.x = clamp(spot.x + (random() < 0.5 ? -1 : 1) * (8 + random() * 8), TREE_X - D.standMaxSide, TREE_X + D.standMaxSide);
        missTo.y = STAND_Y + 4;
        deps.sounds?.miss();
        phase = 'miss';
        t = 0;
      } else {
        attach();
        // 한 번에 걸렸다: 작게 환호
        deps.act?.('cheer');
        toProud();
      }
    } else if (phase === 'miss') {
      const u = Math.min(1, t / D.missFallSeconds);
      flying.x = spot.x + (missTo.x - spot.x) * u;
      flying.y = spot.y + (missTo.y - 3 - spot.y) * u * u;
      if (u >= 1) {
        flying.on = false;
        deps.hands.dropAt(hangKind, missTo.x, missTo.y, hangId);
        phase = 'idle';
      }
    } else if (phase === 'proud') {
      // 한 발 물러서서 뿌듯
      character.y = Math.min(STAND_Y + D.stepBack, character.y + (D.stepBack / 0.25) * dt);
      if (t >= D.proudSeconds) phase = 'idle';
    }
  };

  // ── 그리기

  function drawBoxOnGround(ctx: CanvasRenderingContext2D, box: Box, ox: number): void {
    const g = box.gift;
    const sx = Math.round(g.x) - ox;
    if (sx < -20 || sx > SCREEN_WIDTH + 20) return;
    const now = nowSeconds();
    if (box.state === 'air') {
      // 떨어질 자리의 그림자: 가까워질수록 진해지고 커진다
      const p = giftFlight(g, now - g.dropAt, box.fallSeconds).progress;
      if (p <= 0) return;
      ctx.globalAlpha = GIFT.shadowAlpha * p;
      ctx.fillStyle = GC.shadow;
      fillPixelEllipse(ctx, sx, g.y, Math.max(2, Math.round(GIFT.shadowHalfWidth * (0.4 + 0.6 * p))), 2);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalAlpha = GIFT.shadowAlpha * 0.7;
    ctx.fillStyle = GC.shadow;
    fillPixelEllipse(ctx, sx, g.y, GIFT.shadowHalfWidth, 2);
    ctx.globalAlpha = 1;
    if (box.state === 'ground') {
      // 닿자마자 한 번 통 튀고, 낙하산이 접히며 사라진다
      const hop = box.t < GIFT.bounceSeconds ? Math.round(Math.sin((Math.PI * box.t) / GIFT.bounceSeconds) * GIFT.bounceHeight) : 0;
      if (box.t < GIFT.foldSeconds) {
        const open = 1 - box.t / GIFT.foldSeconds;
        ctx.globalAlpha = open;
        drawChute(ctx, sx, g.y - GIFT.height - hop + Math.round((1 - open) * GIFT.chuteLines), open);
        ctx.globalAlpha = 1;
      }
      drawGiftBox(ctx, sx, g.y - hop, g.color);
      // 가끔 반짝
      const phaseT = (time + hash01(g.id, 3) * GIFT.twinkleEvery) % GIFT.twinkleEvery;
      if (phaseT < GIFT.twinkleSeconds) {
        ctx.fillStyle = GC.sparkle;
        const tx = sx + GIFT.width / 2 - 1;
        const ty = g.y - GIFT.height - 1;
        ctx.fillRect(tx - 1, ty, 3, 1);
        ctx.fillRect(tx, ty - 1, 1, 3);
      }
      return;
    }
    if (box.state === 'opening') {
      if (box.t < SHAKE_END) {
        // 덜컹덜컹
        const k = Math.floor(box.t / 0.07);
        drawGiftBox(ctx, sx + (k % 2 === 0 ? 1 : -1), g.y - (k % 4 === 0 ? 1 : 0), g.color);
      } else if (box.t < POP_AT) {
        // 리본이 풀려 양옆으로 흘러내린다
        const u = (box.t - SHAKE_END) / (POP_AT - SHAKE_END);
        drawGiftBox(ctx, sx, g.y, g.color, 0, false);
        ctx.fillStyle = (GC.boxes[g.color] ?? GC.boxes[0]).ribbon;
        const drop = Math.round(u * 5);
        ctx.fillRect(sx - 4 - Math.round(u * 2), g.y - GIFT.height - 2 + drop, 2, 1);
        ctx.fillRect(sx + 2 + Math.round(u * 2), g.y - GIFT.height - 2 + drop, 2, 1);
      } else {
        // 뚜껑이 폭 튀어 오르고, 장식이 위로 떠오른다
        const u = (box.t - POP_AT) / (GIFT.openSeconds - POP_AT);
        if (u < 0.5) {
          ctx.globalAlpha = 1 - u * 2;
          drawGiftBox(ctx, sx, g.y, g.color, Math.round(u * 28) + 1, false);
          ctx.globalAlpha = 1;
        }
        drawGiftBox(ctx, sx, g.y, g.color, -1);
      }
      return;
    }
    if (box.state === 'empty') {
      // 빈 상자는 납작하게 접혀 사라진다
      const h = Math.max(1, Math.round(GIFT.height * (1 - box.t / GIFT.emptySeconds)));
      drawGiftBox(ctx, sx, g.y, g.color, -1, false, h);
      return;
    }
    // 오래된 상자: 깜빡이며 옅어진다
    ctx.globalAlpha = Math.max(0, 1 - box.t / GIFT.vanishSeconds) * (Math.floor(box.t / 0.1) % 2 === 0 ? 1 : 0.5);
    drawGiftBox(ctx, sx, g.y, g.color);
    ctx.globalAlpha = 1;
  }

  /** 트리 잎 위의 장식들 (트리 바로 다음에 그린다) */
  const treeLayer: DepthDrawable = {
    footY: deps.tree.footY + 0.01,
    draw(ctx, camera) {
      if (hung.length === 0) return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const treeX = TREE_X - ox;
      if (treeX + TREE.baseHalfWidth < -8 || treeX - TREE.baseHalfWidth > SCREEN_WIDTH + 8) return;
      for (const o of hung) {
        // 내리는 눈과 같은 느린 바람에 아주 살짝, 장식마다 다른 박자로 흔들린다. 막 달린 것은 조금 크게 흔들리다 자리를 잡는다
        let dx = Math.round(Math.sin(time * o.swayHz * Math.PI * 2 + o.swayPhase) * 0.7);
        if (o.settle < D.settleSeconds) dx = Math.round(Math.sin(o.settle * 20) * D.settleSwing * (1 - o.settle / D.settleSeconds));
        const x = o.x - ox + dx;
        drawOrnament(ctx, o.kind, x, o.y);
        // 가까운 전구가 밝을 때 장식볼에 1px 하이라이트
        if (o.light && deps.tree.levelOf(o.light) >= D.shineLevel) {
          ctx.fillStyle = OC.shine;
          ctx.fillRect(x + Math.sign(o.light.x - o.x), o.y + Math.sign(o.light.y - o.y), 1, 1);
        }
      }
    },
  };

  /** 나무 사다리 (캐릭터 바로 뒤에 그린다) */
  const ladderLayer: DepthDrawable = {
    footY: STAND_Y - 0.5,
    draw(ctx, camera) {
      if (phase !== 'ladder') return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const top = Math.max(0, STAND_Y - spot.y - D.handUp);
      // 톡 나타났다가, 내려오면 사라진다
      const grow = Math.min(1, t / D.ladderPopSeconds, (duration - t) / D.ladderPopSeconds);
      const height = Math.max(0, Math.round((top + 16) * grow));
      const x = Math.round(character.x) - ox;
      const wobbly = top >= D.wobbleFromHeight - D.handUp && lift >= top * 0.6;
      const sway = wobbly ? Math.round(Math.sin(t * D.wobbleHz * Math.PI * 2)) : 0;
      for (let h = 0; h < height; h++) {
        // 높은 사다리는 위쪽이 살짝 흔들흔들
        const dx = h > height * 0.55 ? sway : 0;
        const y = STAND_Y - h;
        ctx.fillStyle = OC.ladderShade;
        ctx.fillRect(x - D.ladderHalfWidth + dx, y, 1, 1);
        ctx.fillRect(x + D.ladderHalfWidth + dx, y, 1, 1);
        if (h % D.rungGap === D.rungGap - 2) {
          ctx.fillStyle = OC.ladder;
          ctx.fillRect(x - D.ladderHalfWidth + 1 + dx, y, D.ladderHalfWidth * 2 - 1, 1);
        }
      }
    },
  };

  /** 모든 것 위: 반짝이·눈가루, 미리보기, 손에서 자리로 가는 장식, 상자에서 떠오르는 장식 */
  const overlay: DepthDrawable = {
    footY: 9998,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      // 상자에서 떠오르는 장식
      for (const box of boxes.values()) {
        if (box.state !== 'opening' || box.kind === null || box.t < POP_AT) continue;
        const g = box.gift;
        const up = g.y - GIFT.height - 2;
        let x = g.x;
        let y = up - GIFT.floatHeight * Math.min(1, (box.t - POP_AT) / (FLOAT_END - POP_AT));
        if (box.t > FLOAT_END) {
          const u = (box.t - FLOAT_END) / (GIFT.openSeconds - FLOAT_END);
          if (box.mine) {
            // 내 손으로 들어온다
            x += (handX() - x) * u;
            y += (handY() - y) * u;
          } else ctx.globalAlpha = 1 - u;
        }
        drawOrnament(ctx, box.kind, x - ox, y);
        ctx.globalAlpha = 1;
      }
      if (flying.on) drawOrnament(ctx, hangKind, flying.x - ox, flying.y);
      if (phase === 'pick') {
        const kind = heldOrnament();
        const x = Math.round(cursor.x) - ox;
        const y = Math.round(cursor.y);
        const ok = cursorCheck === 'ok' || undoTarget !== null;
        const blink = 0.5 + 0.5 * Math.sin(time * D.blinkHz * Math.PI * 2);
        // 달 수 있으면 밝게, 잎 밖이거나 다른 장식과 겹치면 흐리게
        if (kind && !undoTarget) {
          ctx.globalAlpha = ok ? D.brightAlpha - 0.25 * blink : D.dimAlpha;
          drawOrnament(ctx, kind, x, y);
        }
        ctx.globalAlpha = ok ? 0.6 + 0.4 * blink : 0.5;
        ctx.fillStyle = undoTarget ? OC.cursorUndo : ok ? OC.cursorOk : OC.cursorBad;
        const cx = undoTarget ? undoTarget.x - ox : x;
        const cy = undoTarget ? undoTarget.y : y;
        // 네 귀퉁이 꺾쇠
        for (const sxn of [-1, 1]) {
          for (const syn of [-1, 1]) {
            ctx.fillRect(cx + sxn * 5 - (sxn > 0 ? 1 : 0), cy + syn * 5, 2, 1);
            ctx.fillRect(cx + sxn * 5, cy + syn * 5 - (syn > 0 ? 1 : 0), 1, 2);
          }
        }
        ctx.globalAlpha = 1;
      }
      if (sparks.length === 0) return;
      for (const s of sparks) {
        const sx = Math.round(s.x) - ox;
        if (sx < 0 || sx >= SCREEN_WIDTH) continue;
        ctx.globalAlpha = Math.max(0, 1 - s.age / s.life);
        ctx.fillStyle = s.snow ? GC.puff : GC.sparkle;
        ctx.fillRect(sx, Math.round(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;
    },
  };

  const drawList: DepthDrawable[] = [];
  /** 가까운 상자 찾기의 결과를 담아 다시 쓰는 객체 (걸어 다니는 동안 매 프레임 불린다) */
  const giftResult = { id: '', x: 0, y: 0, distance: 0 };

  const sky = {
    update(): void {},
    draw(ctx: CanvasRenderingContext2D, offsetX: number): void {
      if (boxes.size === 0) return;
      const now = nowSeconds();
      for (const box of boxes.values()) {
        const g = box.gift;
        if (box.state === 'air') {
          // 낙하산을 펴고 내려오는 상자
          const p = giftFlight(g, now - g.dropAt, box.fallSeconds);
          const sx = Math.round(p.x) - offsetX;
          if (sx > -20 && sx < SCREEN_WIDTH + 20) {
            const y = Math.round(p.y);
            if (p.chute) drawChute(ctx, sx, y - GIFT.height, Math.min(1, p.progress * 12));
            drawGiftBox(ctx, sx, y, g.color);
          }
        }
        // 화면 밖에 있으면 가장자리에 작은 선물 아이콘과 화살표
        const fresh = box.state === 'air' || (box.state === 'ground' && now - g.landAt < GIFT.pointerSeconds);
        if (!fresh) continue;
        const gx = g.x - offsetX;
        // 보이는 부분 기준 (휴대폰 세로에서는 캔버스 양옆이 잘린다)
        if (gx >= VIEW.left && gx < VIEW.right) continue;
        const left = gx < VIEW.left;
        const ix = left ? VIEW.left + GIFT.pointerInset + 5 : VIEW.right - GIFT.pointerInset - 5;
        const iy = clamp(g.y - 20, 80, 236);
        const c = GC.boxes[g.color] ?? GC.boxes[0];
        for (let r = 0; r < POINTER_ICON.length; r++) {
          for (let k = 0; k < 5; k++) {
            const ch = POINTER_ICON[r][k];
            if (ch === '.') continue;
            ctx.fillStyle = ch === 'R' ? c.ribbon : c.base;
            ctx.fillRect(ix - 2 + k, iy - 2 + r, 1, 1);
          }
        }
        // 화살표는 가리키는 쪽으로 까딱인다
        const nudge = Math.floor(time * 3) % 2;
        ctx.fillStyle = GC.pointer;
        const ax = left ? ix - 6 - nudge : ix + 6 + nudge;
        const dir = left ? 1 : -1;
        ctx.fillRect(ax, iy, 1, 1);
        ctx.fillRect(ax + dir, iy - 1, 1, 3);
        ctx.fillRect(ax + dir * 2, iy - 2, 1, 5);
      }
    },
  };

  const self: TreeDecor = {
    get phase() {
      return phase;
    },
    get busy() {
      return phase !== 'idle';
    },
    get cameraFocus() {
      return phase === 'idle' || phase === 'opening' ? null : TREE_X;
    },
    get hidesHeld() {
      return phase === 'tiptoe' || phase === 'ladder' || phase === 'toss' || phase === 'miss';
    },
    get count() {
      return hung.length;
    },
    sky,
    nearestGift() {
      let best: Box | null = null;
      let bestDistance = Infinity;
      for (const box of boxes.values()) {
        if (box.state !== 'ground') continue;
        const d = Math.hypot(box.gift.x - character.x, box.gift.y - character.y);
        if (d < bestDistance) {
          best = box;
          bestDistance = d;
        }
      }
      if (!best) return null;
      giftResult.id = best.gift.id;
      giftResult.x = best.gift.x;
      giftResult.y = best.gift.y;
      giftResult.distance = bestDistance;
      return giftResult;
    },
    hangDistance() {
      if (phase !== 'idle' || !heldOrnament() || isFull()) return Infinity;
      return bedDistance();
    },
    open(id) {
      const box = boxes.get(id);
      if (phase !== 'idle' || !box || box.state !== 'ground') return false;
      phase = 'opening';
      arrive = null;
      openBox = box;
      granted = null;
      waited = 0;
      box.state = 'opening';
      box.t = 0;
      box.mine = true;
      box.kind = null;
      box.popped = false;
      character.target = null;
      character.moving = false;
      if (Math.abs(box.gift.x - character.x) > 1) character.facing = box.gift.x > character.x ? 'right' : 'left';
      deps.sounds?.rattle();
      if (deps.online()) deps.send.open(id);
      else {
        // 접속이 없으면 내 화면에서만 연다
        granted = rollOrnament(random(), random());
        box.kind = granted;
        opened.add(id);
      }
      return true;
    },
    startPick(at) {
      return beginPick(at);
    },
    tap(x, y) {
      if (phase === 'pick') {
        // 미리보기를 한 번 더 누르면 달고, 트리의 다른 곳을 누르면 그리로 옮긴다. 트리 밖을 누르면 그만둔다
        const onTree = Math.abs(x - TREE_X) <= TREE.baseHalfWidth + 8 && y >= TREE.tipY - 6 && y <= TREE.foliageBottomY + 8;
        if (Math.hypot(x - cursor.x, y - cursor.y) <= D.tapRadius) {
          if (undoTarget) unhangNow(undoTarget);
          else if (cursorCheck === 'ok') startHang();
        } else if (onTree) {
          cursor.x = x;
          cursor.y = y;
          refreshCursor();
        } else phase = 'idle';
        return true;
      }
      if (phase !== 'idle') return true;
      // 선물 상자를 누르면 걸어가서 연다
      for (const box of boxes.values()) {
        if (box.state !== 'ground' || Math.abs(x - box.gift.x) > 9 || y > box.gift.y + 4 || y < box.gift.y - GIFT.height - 8) continue;
        if (Math.hypot(box.gift.x - character.x, box.gift.y - character.y) <= GIFT.openRadius) self.open(box.gift.id);
        else {
          character.target = { x: box.gift.x + (character.x <= box.gift.x ? -8 : 8), y: clamp(box.gift.y + 2, WALK_AREA.y + 4, WALK_AREA.y + WALK_AREA.h) };
          arrive = { box: box.gift.id };
        }
        return true;
      }
      // 장식을 들고 트리를 누르면 그 자리에 미리보기
      if (heldOrnament() && !isFull() && hangHalfWidth(Math.round(y)) >= 0 && Math.abs(x - TREE_X) <= hangHalfWidth(Math.round(y)) + 6) {
        const at = { x, y };
        if (bedDistance() <= D.hangRadius) beginPick(at);
        else {
          character.target = { x: clamp(x, TREE_X - bed.w / 2, TREE_X + bed.w / 2), y: STAND_Y + 3 };
          arrive = { pick: at };
        }
        return true;
      }
      return false;
    },
    update(dt, dir, actions, stillTime) {
      time += dt;
      lastStill = stillTime;
      const now = nowSeconds();
      syncIn -= dt;
      if (syncIn <= 0) {
        syncIn = 0.25;
        syncBoxes(now);
      }
      updateBoxes(dt, now);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += (s.snow ? 60 : 40) * dt;
        if (s.age >= s.life) sparks.splice(i, 1);
      }
      for (const o of hung) if (o.settle < D.settleSeconds) o.settle += dt;
      deniedLeft = Math.max(0, deniedLeft - dt);
      nameLeft = Math.max(0, nameLeft - dt);
      puzzledLeft = Math.max(0, puzzledLeft - dt);

      // 오르골 장식: 가까이 가면 아주 작은 선율
      if (deps.sounds) {
        let nearest = Infinity;
        for (const o of musicBoxes) nearest = Math.min(nearest, Math.hypot(o.x - character.x, STAND_Y - character.y));
        deps.sounds.setMusicDistance(nearest);
      }

      // 꽉 찬 트리 앞에 장식을 들고 오면 고개를 갸우뚱 (달 자리가 없다)
      const nearFull = phase === 'idle' && isFull() && heldOrnament() !== null && bedDistance() <= D.hangRadius;
      if (nearFull && !wasNearFull) puzzledLeft = D.puzzledSeconds;
      wasNearFull = nearFull;

      if (phase === 'idle') {
        // 탭해서 걸어가던 곳에 닿았나
        if (arrive && (dir.x !== 0 || dir.y !== 0)) arrive = null;
        if (arrive && !character.target) {
          const a = arrive;
          arrive = null;
          if ('box' in a) {
            const box = boxes.get(a.box);
            if (box && Math.hypot(box.gift.x - character.x, box.gift.y - character.y) <= GIFT.openRadius + 4) self.open(a.box);
          } else if (bedDistance() <= D.hangRadius + 6) beginPick(a.pick);
        }
        return;
      }
      character.target = null;
      if (phase === 'opening') {
        character.moving = false;
        if (granted === null) {
          waited += dt;
          if (waited > OPEN_TIMEOUT) deny();
        }
        return;
      }
      if (phase === 'pick') {
        character.moving = false;
        if (!heldOrnament()) {
          phase = 'idle';
          return;
        }
        // 방향키로 미리보기를 옮긴다
        if (dir.x !== 0 || dir.y !== 0) {
          const len = Math.hypot(dir.x, dir.y);
          cursor.x = clamp(cursor.x + (dir.x / len) * D.cursorSpeed * dt, TREE_X - TREE.baseHalfWidth - 4, TREE_X + TREE.baseHalfWidth + 4);
          cursor.y = clamp(cursor.y + (dir.y / len) * D.cursorSpeed * dt, TREE.tipY, TREE.foliageBottomY + 4);
        }
        refreshCursor();
        // 캐릭터는 미리보기 쪽으로 고개를 돌린다
        if (Math.abs(cursor.x - character.x) > 2) character.facing = cursor.x > character.x ? 'right' : 'left';
        if (actions.cancel) phase = 'idle';
        else if (actions.tap || actions.hold) {
          if (undoTarget) unhangNow(undoTarget);
          else if (cursorCheck === 'ok') startHang();
        }
        return;
      }
      updateHanging(dt);
    },
    hint(touch) {
      if (phase !== 'pick') return null;
      if (undoTarget) return { text: touch ? '한 번 더 눌러 떼기' : 'Space 떼기', sub: '방금 내가 단 장식', anchor: 'bottom' };
      if (cursorCheck === 'ok') return { text: touch ? '한 번 더 눌러 달기' : 'Space 달기', sub: touch ? '트리를 눌러 자리 옮기기' : '방향키 자리 고르기 · Esc 취소', anchor: 'bottom' };
      return {
        text: cursorCheck === 'overlap' ? '다른 장식과 너무 가까워요' : '잎 위에만 달 수 있어요',
        sub: touch ? '트리를 눌러 자리 옮기기' : '방향키 자리 고르기 · Esc 취소',
        anchor: 'bottom',
      };
    },
    pose() {
      if (phase === 'idle' || phase === 'approach') return null;
      if (phase === 'opening') {
        // 상자 앞에 쪼그려 앉아 열고, 장식이 떠오르면 일어나 두 손으로 받는다
        const box = openBox;
        if (!box || box.t < POP_AT) return { pose: 'crouch', index: 0 };
        return box.t > FLOAT_END ? { pose: 'cheer', index: 0 } : { pose: 'idle', index: 0 };
      }
      if (phase === 'pick') return { pose: 'idle', index: 0 };
      if (phase === 'tiptoe') return { pose: 'cheer', index: 0, lift };
      if (phase === 'ladder') {
        const f = t / duration;
        const reaching = f >= D.climbUntil && f < D.hangUntil + 0.06;
        return reaching ? { pose: 'cheer', index: 0, lift } : { pose: 'walk', index: Math.floor(lift / D.rungGap) % 2, lift };
      }
      if (phase === 'toss') return t / duration < 0.2 ? { pose: 'crouch', index: 0 } : { pose: 'cheer', index: 0 };
      if (phase === 'miss') return { pose: 'idle', index: 0 };
      return { pose: 'cheer', index: 0 };
    },
    lean() {
      if (puzzledLeft > 0) return Math.sin((1 - puzzledLeft / D.puzzledSeconds) * Math.PI * 2) > 0 ? D.puzzledLean : -D.puzzledLean;
      if (phase !== 'ladder') return 0;
      const top = Math.max(0, STAND_Y - spot.y - D.handUp);
      const wobbly = top >= D.wobbleFromHeight - D.handUp && lift >= top * 0.6;
      return wobbly ? Math.round(Math.sin(t * D.wobbleHz * Math.PI * 2)) : 0;
    },
    labels() {
      const showNames = phase === 'idle' && lastStill >= D.nameAfter && hung.length > 0 && bedDistance() <= D.hangRadius + 8;
      if (!showNames && deniedLeft <= 0 && nameLeft <= 0 && puzzledLeft <= 0) return NO_LABELS;
      const out: { x: number; y: number; text: string }[] = [];
      // 조작 힌트 말풍선보다 위에 띄운다
      const head = character.y - 50;
      if (nameLeft > 0) out.push({ x: character.x, y: head, text: nameText });
      else if (deniedLeft > 0) out.push({ x: character.x, y: head, text: '…' });
      else if (puzzledLeft > 0) out.push({ x: character.x, y: head, text: '?' });
      if (showNames) {
        // 가만히 서 있으면 가장 가까운 장식 몇 개 옆에 단 사람 닉네임
        const fromY = character.y - 30;
        const nearest = [...hung].sort((a, b) => Math.hypot(a.x - character.x, a.y - fromY) - Math.hypot(b.x - character.x, b.y - fromY)).slice(0, D.nameCount);
        for (const o of nearest) out.push({ x: o.x, y: o.y - 4, text: o.by });
      }
      return out;
    },
    drawables() {
      drawList.length = 0;
      drawList.push(treeLayer, ladderLayer, overlay);
      for (const box of boxes.values()) drawList.push(box.drawable);
      return drawList;
    },
    lights() {
      if (lightsDirty) rebuildLights();
      return lightList;
    },
    setTree(list) {
      hung.length = 0;
      for (const o of list) hung.push(makeHung(o, D.settleSeconds, false));
      treeChanged();
    },
    setOpened(ids) {
      opened.clear();
      for (const id of ids) opened.add(id);
      for (const id of ids) {
        const box = boxes.get(id);
        if (box && (box.state === 'ground' || box.state === 'air')) boxes.delete(id);
      }
      lightsDirty = true;
      syncIn = 0;
    },
    restoreMine(list) {
      for (const item of list) {
        if (character.heldTag === item.id || deps.hands.has(item.id)) continue;
        if (character.holding.get() === null) {
          character.heldTag = item.id;
          character.holding.set(item.kind);
        } else deps.hands.dropAt(item.kind, character.x, character.y + 1, item.id);
      }
    },
    onOpened(id, by, kind) {
      opened.add(id);
      const box = boxes.get(id);
      if (by === deps.myId()) {
        if (phase === 'opening' && openBox && openBox.gift.id === id) {
          granted = kind;
          openBox.kind = kind;
        } else {
          // 열기 연출 없이 받았다 (다시 붙는 사이에 답이 왔다)
          giveOrnament(id, kind);
          if (box) boxes.delete(id);
        }
        return;
      }
      // 다른 사람이 열었다: 내가 열려던 상자면 놓친 것이다
      if (phase === 'opening' && openBox && openBox.gift.id === id) deny();
      if (!box) return;
      box.mine = false;
      box.kind = kind;
      box.popped = false;
      box.state = 'opening';
      box.t = SHAKE_END;
    },
    onOpenDenied(id) {
      if (phase === 'opening' && openBox && openBox.gift.id === id) deny();
    },
    onHung(o, milestone) {
      const old = hung.find((h) => h.id === o.id);
      if (old) {
        old.x = o.x;
        old.y = o.y;
        old.by = o.by;
        old.at = o.at;
        old.pending = false;
      } else hung.push(makeHung(o, 0, false));
      treeChanged();
      if (milestone !== undefined) celebrate();
    },
    onHangDenied(id) {
      // 달 수 없었다 (자리가 겹쳤거나 꽉 찼다): 장식은 손으로 돌아온다
      const gone = removeHung(id);
      if (gone) giveOrnament(id, gone.kind);
    },
    onUnhung(id, by) {
      const gone = removeHung(id);
      if (gone && by === deps.myId()) giveOrnament(id, gone.kind);
    },
    addDebugGift(gift) {
      if (opened.has(gift.id) || debugGifts.some((g) => g.id === gift.id)) return;
      const dropAt = gift.at / 1000;
      debugGifts.push({ id: gift.id, x: gift.x, y: gift.y, color: gift.color, at: gift.at, dropAt, landAt: dropAt + GIFT.popSeconds + GIFT.debugFallSeconds, fromY: Math.max(8, gift.y - 150) });
      syncIn = 0;
    },
    debugDrop() {
      const x = clamp(Math.round(character.x + facingSign() * GIFT.debugAhead), WALK_AREA.x + 8, WALK_AREA.x + WALK_AREA.w - 8);
      const y = clamp(Math.round(character.y), WALK_AREA.y + 8, WALK_AREA.y + WALK_AREA.h - 2);
      if (deps.online()) deps.send.debugGift(x, y);
      else {
        const gift = { at: deps.now(), x, y, color: Math.floor(random() * 4) };
        self.addDebugGift({ ...gift, id: debugGiftId(gift) });
      }
    },
    debugLine() {
      return `santa in ${Math.ceil(nextSantaIn(nowSeconds()))}s  ornaments ${hung.length}/${ORNAMENT.max}  P: gift`;
    },
    drawDebug(ctx, camera) {
      // 장식을 달 수 있는 영역: 잎 실루엣에서 2px 안쪽
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.fillStyle = OC.debugArea;
      for (let y = TREE.tipY; y <= TREE.foliageBottomY; y++) {
        const half = hangHalfWidth(y);
        if (half >= 0) ctx.fillRect(TREE_X - half - ox, y, half * 2 + 1, 1);
      }
    },
  };
  return self;
}
