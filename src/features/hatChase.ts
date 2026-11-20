// 남의 모자 주워 쓰고 달아나기 — 대머리 주인은 돌려달라고 조르거나, 쫓아가 잡아서 되찾는다.
//
// - 사람마다 자기 털모자(주인 목도리 색)가 하나 있고, 그 모자가 어디 있는지(HatSpot)는 서버가 정한다:
//   주인 머리 / 바닥 / 다른 사람 머리 / 눈사람. 줍기·돌려주기·잡기는 모두 서버가 허락하고 모두에게 알린다.
// - 바닥에 떨어진 남의 모자를 주우면 내 모자 위에 겹쳐 쓴다 (한 머리에 3개까지, 하나당 걸음 -8%).
// - 대머리 주인: 곁(40px)에서 '돌려줘!' — 발을 동동, 연달아 조를수록 드러누워 버둥(3번째), 눈물(5번째).
//   바짝 붙어(12px) '잡기' — 모자가 포물선을 그리며 날아와 머리에 착, 잡힌 사람은 엉덩방아.
// - 모자를 쓴 사람: 주인 곁에서 '돌려주기' — 맨 위가 아니어도 그 모자만 쏙 빼서 씌워 준다.
// - 재채기·눈덩이에 맞으면 맨 위 모자부터 날아간다. 5분 넘게 쓰고 있으면 모자가 스스로 주인에게 돌아간다.
// 위쪽은 규칙 (DOM 없음, 테스트 가능), 아래쪽은 조작과 연출.

import type { Character } from '../character/character';
import { hatCanvas, type DrawOptions } from '../character/render';
import type { ExtraHat } from '../character/state';
import { layerOffsetX } from '../camera';
import { CHARACTER, HAT, HAT_CHASE as C, HAT_CHASE_COLORS as K, LAYER_FACTORS, NET } from '../constants';
import { VIEW } from '../screen';
import type { HatHow, HatSpot, WireHat } from '../shared/protocol';
import type { DepthDrawable } from '../zones/zone';
import { hatLanding, type Hat, type HatLaunch } from './sneeze';

// ───────────── 규칙 ─────────────

/** 남의 모자를 n개 쓰고 있을 때 걷는 빠르기 배율 (스케이트는 최대 속도 배율) */
export function chaseSpeedFactor(extraCount: number): number {
  return Math.max(0, 1 - C.slowPerHat * extraCount);
}

/** 이 사람 머리 위 모자들의 주인 (아래 → 위): 자기 모자를 쓰고 있으면 맨 아래, 그 위로 주운 차례대로 */
export function stackOwners(spots: ReadonlyMap<string, HatSpot>, wearerId: string): string[] {
  const worn: { owner: string; at: number }[] = [];
  for (const [owner, spot] of spots) if (owner !== wearerId && spot.k === 'worn' && spot.by === wearerId) worn.push({ owner, at: spot.at });
  worn.sort((a, b) => a.at - b.at);
  const own = spots.get(wearerId);
  return own === undefined || own.k === 'me' ? [wearerId, ...worn.map((w) => w.owner)] : worn.map((w) => w.owner);
}

/** 한 머리에 더 쌓을 수 있나 (3개까지) */
export function canStackMore(spots: ReadonlyMap<string, HatSpot>, wearerId: string): boolean {
  return stackOwners(spots, wearerId).length < C.maxStack;
}

/** 재채기·눈덩이로 날아갈 모자: 맨 위 것 (내 모자뿐이면 내 모자) */
export function topOwner(spots: ReadonlyMap<string, HatSpot>, wearerId: string): string | null {
  return stackOwners(spots, wearerId).at(-1) ?? null;
}

/** 연달아 조른 횟수: 지난번 조르기가 끝나고 begComboGap초 안에 다시 조르면 하나 늘고, 아니면 1부터 */
export function nextBegCount(previous: number, sinceLastEnd: number): number {
  return previous > 0 && sinceLastEnd <= C.begComboGap ? previous + 1 : 1;
}

/** 조르기 단계: 발 동동 → 드러누워 버둥 (3번째부터) → 눈물까지 (5번째부터) */
export function begStage(n: number): 'stomp' | 'tantrum' | 'tears' {
  if (n >= C.tearsFrom) return 'tears';
  return n >= C.tantrumFrom ? 'tantrum' : 'stomp';
}

/**
 * 내 화면에서 잡을 수 있나 (서버도 다시 확인한다): 바짝 붙어 있고(12px), 그 사람이 회전목마를 타고 있지 않고,
 * 스케이트를 타고 있으면 나도 신고 있고, 그 사람을 잡은 지 3초가 지났을 때.
 */
export function canCatch(me: { x: number; y: number; skating: boolean }, target: { x: number; y: number; kind: string }, sinceLastCatch: number): boolean {
  if (target.kind === 'riding') return false;
  if (target.kind === 'skating' && !me.skating) return false;
  if (sinceLastCatch < C.catchCooldown) return false;
  return Math.hypot(me.x - target.x, me.y - target.y) <= C.catchRadius;
}

/** 남이 5분 넘게 쓰고 있나 (그러면 모자가 스스로 주인에게 돌아간다) */
export function homeDue(spot: HatSpot | undefined, nowMs: number): boolean {
  return spot !== undefined && spot.k === 'worn' && nowMs - spot.at >= C.returnAfter * 1000;
}

/** 주인이 보낸 'state'의 모자 값으로 그 모자 자리를 맞춘다 (남이 쓰고 있다는 'taken'은 서버가 알려 준 자리를 그대로) */
export function spotFromWire(wire: WireHat, previous: HatSpot | undefined): HatSpot {
  if (wire === 'on') return { k: 'me' };
  if (wire === 'onSnowman') return { k: 'snowman' };
  if (wire === 'taken') return previous?.k === 'worn' ? previous : { k: 'worn', by: '', at: 0 };
  return { k: 'ground', x: wire.x, y: wire.y };
}

/** 두 모자 자리가 같은가 */
export function sameSpot(a: HatSpot | undefined, b: HatSpot | undefined): boolean {
  if (!a || !b || a.k !== b.k) return a === b;
  if (a.k === 'ground' && b.k === 'ground') return a.x === b.x && a.y === b.y;
  if (a.k === 'worn' && b.k === 'worn') return a.by === b.by && a.at === b.at;
  return true;
}

// ───────────── 조작 ─────────────

/** 다른 사람 (session의 Remote와 같은 모양) */
export interface ChaseBody {
  info: { id: string; name: string; scarf: number; state: { kind: string } };
  ch: Character;
  hat: Hat;
}

export interface HatChaseDeps {
  /** 서버가 준 내 접속 id (접속 전이면 null), 내 목도리 색 */
  myId(): string | null;
  myScarf(): number;
  /** 지금 광장에 있는 다른 사람들 */
  others(): Iterable<ChaseBody>;
  find(id: string): ChaseBody | undefined;
  /** 서버 시각 (ms) */
  now(): number;
  online(): boolean;
  /** 나는 지금 스케이트를 / 회전목마를 타고 있나 */
  skating(): boolean;
  send: {
    pick(owner: string, sm?: string): void;
    beg(n: number): void;
    give(to: string): void;
    catch(from: string): void;
    fall(owner: string, x: number, y: number): void;
    snowman(owner: string): void;
    home(): void;
  };
  /** 추위를 바꾼다 (돌려받으면 내려간다) */
  cold?(amount: number): void;
  sound?(kind: 'pick' | 'beg' | 'give' | 'catch' | 'land'): void;
}

type Phase = 'idle' | 'pick' | 'beg' | 'give' | 'pratfall' | 'pat' | 'scratch';

interface Flight {
  color: number;
  fromX: number;
  fromY: number;
  /** 날아가는 곳: 이 사람 머리 */
  to: string;
  t: number;
  /** 다 날아왔을 때 */
  land?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vy: number;
  age: number;
  life: number;
  color: string;
}

export interface HatChase {
  readonly phase: Phase;
  /** 캐릭터를 맡고 있나 (줍기·조르기·돌려주기·엉덩방아…) */
  readonly busy: boolean;
  /** 걷는 빠르기 배율 (남의 모자 하나당 -8%) */
  speedFactor(): number;
  /** 바닥에 떨어진 남의 모자 가운데 가장 가까운 것 (더 쌓을 수 없으면 null) */
  nearestGroundHat(): { owner: string; x: number; y: number; distance: number } | null;
  /** 내 모자를 쓴 사람 (잡기·조르기 대상)과 그 거리. 잡을 수 있으면 canCatch */
  myHatWearer(): { id: string; x: number; y: number; distance: number; canCatch: boolean } | null;
  /** 내가 쓰고 있는 모자의 주인 가운데 가장 가까운 사람 (돌려주기), 그 주인이 조르는 중인가 */
  nearestOwner(): { owner: string; x: number; y: number; distance: number; begging: boolean } | null;
  pick(owner: string): boolean;
  beg(): boolean;
  give(owner: string): boolean;
  catch(from: string): boolean;
  /** 재채기·눈덩이: 쓰고 있는 남의 모자 가운데 맨 위 것이 날아간다. 남의 모자가 없으면 false (내 모자는 부르는 쪽이 날린다) */
  dropTop(facing: 'left' | 'right', launch: HatLaunch): boolean;
  /** 맨 위 남의 모자 (눈사람에게 씌워 줄 때) */
  topExtra(): (ExtraHat & { name: string }) | null;
  /** 맨 위 남의 모자를 눈사람에게 씌웠다 */
  gaveToSnowman(owner: string): void;
  /** 눈사람이 쓴 모자의 주인이 지금 광장에 있으면 그 사람 id */
  onlineOwnerByName(name: string): string | null;
  /** 눈사람에서 그 사람 모자를 가져온다 (서버에 묻는다) */
  pickFromSnowman(owner: string, snowmanId: string): void;
  /** 화면을 탭했다 (맵 좌표): 처리했으면 true */
  tap(x: number, y: number, walkTo: (x: number, y: number) => void): boolean;
  update(dt: number): void;
  /** 이 사람(내 id 포함)을 바꿔 그릴 자세 */
  poseFor(id: string): DrawOptions | null;
  /** 내 자세 */
  pose(): DrawOptions | null;
  /** '잡았다!' 같은 잠깐 뜨는 글자 (맵 좌표) */
  labels(): readonly { x: number; y: number; text: string }[];
  readonly drawables: readonly DepthDrawable[];
  // ── 서버가 알려 준 것
  /** 입장: 모두의 모자 자리 */
  reset(players: readonly { id: string; hl?: HatSpot }[], myId: string): void;
  joined(id: string, spot: HatSpot | undefined): void;
  left(id: string): void;
  onOwnerState(id: string, hat: WireHat): void;
  onHat(owner: string, spot: HatSpot, how: HatHow, by?: string): void;
  onBeg(id: string, n: number): void;
  /** 그려 볼 수 있게 지금 모자 자리 (테스트·디버그) */
  spotOf(id: string): HatSpot | undefined;
  /** ?debug=1: 모두의 모자 자리와 다른 사람 모자 상태 */
  debugState(): unknown;
}

const NO_LABELS: readonly { x: number; y: number; text: string }[] = [];
const ME = '__me';

export function createHatChase(character: Character, myHat: Hat, deps: HatChaseDeps): HatChase {
  const spots = new Map<string, HatSpot>();
  let dirty = true;
  let phase: Phase = 'idle';
  let timer = 0;
  let time = 0;
  let begCount = 0;
  let lastBegEnd = -999;
  let askedHomeAt = -999;
  const begs = new Map<string, { t: number; n: number }>();
  const pratfalls = new Map<string, number>();
  const pats = new Map<string, number>();
  const scratches = new Map<string, number>();
  const caughtAt = new Map<string, number>();
  const caughtLabels: { id: string; t: number }[] = [];
  const flights: Flight[] = [];
  const particles: Particle[] = [];
  const hearts: { id: string; t: number }[] = [];
  let steamIn = 0;
  let tearIn = 0;

  const myKey = () => deps.myId() ?? ME;
  const bodyOf = (id: string): { ch: Character; hat: Hat; scarf: number; name: string; kind: string } | null => {
    if (id === myKey()) return { ch: character, hat: myHat, scarf: deps.myScarf(), name: '', kind: character.state.get().kind };
    const r = deps.find(id);
    return r ? { ch: r.ch, hat: r.hat, scarf: r.info.scarf, name: r.info.name, kind: r.info.state.kind } : null;
  };
  /** 그 사람 모자의 실제 색 (눈사람에서 바꿔 쓴 모자면 목도리 색과 다르다) */
  const hatColorOf = (b: { ch: Character; scarf: number }): number => b.ch.hatColor ?? b.scarf;
  /** 머리 꼭대기 (모자 탑 위) */
  const headOf = (ch: Character) => ({ x: ch.x, y: ch.y - CHARACTER.spriteHeight - ch.extraHats.length * C.stackStep });

  /** 모두의 머리 위 모자 탑을 다시 계산한다 (자리가 바뀔 때만) */
  const restack = () => {
    dirty = false;
    const apply = (id: string, ch: Character) => {
      const owners = stackOwners(spots, id).filter((o) => o !== id);
      ch.extraHats = owners.flatMap((o) => {
        const b = bodyOf(o);
        return b ? [{ owner: o, color: hatColorOf(b) }] : [];
      });
    };
    apply(myKey(), character);
    for (const r of deps.others()) apply(r.info.id, r.ch);
  };

  /** 쌓인 모자 색이 주인 모자의 지금 색과 다른가 (주인이 모자를 바꿔 쓰면 다시 쌓는다) */
  const colorsStale = (): boolean => {
    const check = (ch: Character) => ch.extraHats.some((e) => {
      const b = bodyOf(e.owner);
      return b !== null && hatColorOf(b) !== e.color;
    });
    if (check(character)) return true;
    for (const r of deps.others()) if (check(r.ch)) return true;
    return false;
  };

  const setSpot = (id: string, spot: HatSpot) => {
    spots.set(id, spot);
    dirty = true;
  };

  const startPhase = (next: Phase, seconds: number) => {
    phase = next;
    timer = seconds;
    character.target = null;
    character.moving = false;
  };

  const flyHome = (owner: string, from: { x: number; y: number }, land?: () => void) => {
    const b = bodyOf(owner);
    if (!b) return;
    flights.push({ color: hatColorOf(b), fromX: from.x, fromY: from.y, to: owner, t: 0, land });
  };

  const sparkle = (x: number, y: number) => {
    for (let i = 0; i < 8; i++) particles.push({ x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 6, vy: -10 - Math.random() * 10, age: 0, life: 0.6, color: K.star });
  };

  // ── 그리기

  const overlay: DepthDrawable = {
    footY: 9997,
    draw(ctx, camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      // 날아가는 모자: 포물선
      for (const f of flights) {
        const b = bodyOf(f.to);
        if (!b) continue;
        const to = headOf(b.ch);
        const u = Math.min(1, f.t / C.flySeconds);
        const x = Math.round(f.fromX + (to.x - f.fromX) * u) - ox;
        const y = Math.round(f.fromY + (to.y + 6 - f.fromY) * u - Math.sin(Math.PI * u) * C.flyArc);
        const img = hatCanvas(f.color);
        ctx.drawImage(img, x - (img.width >> 1), y - img.height);
      }
      // 엉덩방아: 머리 위로 별이 돈다
      for (const [id, t] of pratfalls) {
        const b = bodyOf(id);
        if (!b) continue;
        const cx = Math.round(b.ch.x) - ox;
        const cy = Math.round(b.ch.y) - CHARACTER.spriteHeight + 6;
        ctx.fillStyle = K.star;
        for (let i = 0; i < C.starCount; i++) {
          const a = t * 7 + (i * Math.PI * 2) / C.starCount;
          const sx = cx + Math.round(Math.cos(a) * 7);
          const sy = cy + Math.round(Math.sin(a) * 2);
          ctx.fillRect(sx - 1, sy, 3, 1);
          ctx.fillRect(sx, sy - 1, 1, 3);
        }
      }
      // 하트 (돌려받은 주인 머리 위로 떠오른다)
      ctx.fillStyle = K.heart;
      for (const h of hearts) {
        const b = bodyOf(h.id);
        if (!b) continue;
        const x = Math.round(b.ch.x) - ox;
        const y = Math.round(headOf(b.ch).y - 4 - h.t * 10);
        ctx.globalAlpha = Math.max(0, 1 - h.t / C.patSeconds);
        ctx.fillRect(x - 2, y - 1, 2, 2);
        ctx.fillRect(x + 1, y - 1, 2, 2);
        ctx.fillRect(x - 2, y, 5, 2);
        ctx.fillRect(x - 1, y + 2, 3, 1);
        ctx.fillRect(x, y + 3, 1, 1);
      }
      ctx.globalAlpha = 1;
      // 김·눈물·반짝이
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x) - ox, Math.round(p.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      // 내 모자를 쓴 사람: 머리 위에 빨간 '!' 깜빡, 화면 밖이면 가장자리에 내 모자와 화살표
      const mine = spots.get(myKey());
      if (mine?.k !== 'worn') return;
      const w = deps.find(mine.by);
      if (!w) return;
      const head = headOf(w.ch);
      const sx = Math.round(head.x) - ox;
      if (sx >= VIEW.left && sx < VIEW.right) {
        if (Math.floor(time * C.markHz * 2) % 2 === 0) {
          ctx.fillStyle = K.mark;
          // 머리 위 닉네임보다 위에
          const top = Math.min(Math.round(head.y) - 9, Math.round(w.ch.y) - NET.nameAbove - 12);
          ctx.fillRect(sx, top, 2, 5);
          ctx.fillRect(sx, top + 6, 2, 2);
        }
        return;
      }
      const left = sx < VIEW.left;
      const ix = left ? VIEW.left + C.pointerInset + 6 : VIEW.right - C.pointerInset - 6;
      const iy = Math.min(Math.max(Math.round(w.ch.y) - 24, 80), 236);
      const img = hatCanvas(character.hatColor ?? deps.myScarf());
      ctx.drawImage(img, ix - (img.width >> 1), iy - (img.height >> 1));
      const nudge = Math.floor(time * 3) % 2;
      const ax = left ? ix - 9 - nudge : ix + 9 + nudge;
      const dir = left ? 1 : -1;
      ctx.fillStyle = K.pointer;
      ctx.fillRect(ax, iy, 1, 1);
      ctx.fillRect(ax + dir, iy - 1, 1, 3);
      ctx.fillRect(ax + dir * 2, iy - 2, 1, 5);
    },
  };

  /** 조르기·엉덩방아·쓰다듬기·긁적 자세 */
  const poseOf = (id: string, facing: 'left' | 'right'): DrawOptions | null => {
    const fall = pratfalls.get(id);
    if (fall !== undefined) return { pose: 'crouch', index: 0 };
    const beg = begs.get(id);
    if (beg) {
      const beat = Math.floor(beg.t / C.stompSeconds) % 2;
      // 3번째부터는 바닥에 드러누워 팔다리를 버둥
      if (begStage(beg.n) !== 'stomp') return { pose: beat ? 'cheer' : 'walk', index: beat, lie: facing === 'right' ? -1 : 1 };
      // 발을 동동 구르고 양팔을 파닥
      return { pose: beat ? 'cheer' : 'idle', index: 0, lift: beat ? C.stompHeight : 0 };
    }
    const pat = pats.get(id);
    if (pat !== undefined) return { pose: 'cheer', index: 0 };
    const scratch = scratches.get(id);
    if (scratch !== undefined) return { pose: 'cheer', index: 0, lean: Math.floor(scratch / 0.15) % 2 === 0 ? 1 : -1 };
    return null;
  };

  const self: HatChase = {
    get phase() {
      return phase;
    },
    get busy() {
      return phase !== 'idle';
    },
    drawables: [overlay],
    speedFactor() {
      return chaseSpeedFactor(character.extraHats.length);
    },
    nearestGroundHat() {
      if (!deps.online() || !canStackMore(spots, myKey())) return null;
      let best: { owner: string; x: number; y: number; distance: number } | null = null;
      for (const r of deps.others()) {
        if (!r.hat.lying || spots.get(r.info.id)?.k !== 'ground') continue;
        const distance = Math.hypot(r.hat.x - character.x, r.hat.y - character.y);
        if (!best || distance < best.distance) best = { owner: r.info.id, x: r.hat.x, y: r.hat.y, distance };
      }
      return best;
    },
    myHatWearer() {
      const mine = spots.get(myKey());
      if (mine?.k !== 'worn') return null;
      const w = deps.find(mine.by);
      if (!w) return null;
      const last = caughtAt.get(w.info.id);
      const since = last === undefined ? Infinity : (deps.now() - last) / 1000;
      return {
        id: w.info.id,
        x: w.ch.x,
        y: w.ch.y,
        distance: Math.hypot(w.ch.x - character.x, w.ch.y - character.y),
        canCatch: canCatch({ x: character.x, y: character.y, skating: deps.skating() }, { x: w.ch.x, y: w.ch.y, kind: w.info.state.kind }, since),
      };
    },
    nearestOwner() {
      let best: { owner: string; x: number; y: number; distance: number; begging: boolean } | null = null;
      for (const extra of character.extraHats) {
        const o = deps.find(extra.owner);
        if (!o) continue;
        const distance = Math.hypot(o.ch.x - character.x, o.ch.y - character.y);
        if (!best || distance < best.distance) best = { owner: extra.owner, x: o.ch.x, y: o.ch.y, distance, begging: begs.has(extra.owner) };
      }
      return best;
    },
    pick(owner) {
      if (phase !== 'idle' || !deps.online()) return false;
      startPhase('pick', C.pickSeconds);
      deps.send.pick(owner);
      return true;
    },
    beg() {
      if (phase !== 'idle' || spots.get(myKey())?.k !== 'worn') return false;
      begCount = nextBegCount(begCount, time - lastBegEnd);
      startPhase('beg', C.begSeconds);
      begs.set(myKey(), { t: 0, n: begCount });
      deps.send.beg(begCount);
      deps.sound?.('beg');
      return true;
    },
    give(owner) {
      if (phase !== 'idle' || !character.extraHats.some((e) => e.owner === owner)) return false;
      const o = deps.find(owner);
      if (o) character.facing = o.ch.x >= character.x ? 'right' : 'left';
      startPhase('give', C.giveSeconds * 0.5);
      deps.send.give(owner);
      return true;
    },
    catch(from) {
      if (phase !== 'idle') return false;
      caughtAt.set(from, deps.now());
      deps.send.catch(from);
      return true;
    },
    dropTop(facing, launch) {
      const top = character.extraHats.at(-1);
      if (!top) return false;
      const owner = deps.find(top.owner);
      const from = { x: character.x, y: character.y };
      const to = hatLanding(from, facing, launch);
      owner?.hat.flyTo(from, to);
      setSpot(top.owner, { k: 'ground', x: to.x, y: to.y });
      deps.send.fall(top.owner, to.x, to.y);
      return true;
    },
    topExtra() {
      const top = character.extraHats.at(-1);
      if (!top) return null;
      const o = deps.find(top.owner);
      return o ? { ...top, name: o.info.name } : null;
    },
    gaveToSnowman(owner) {
      setSpot(owner, { k: 'snowman' });
      deps.send.snowman(owner);
    },
    onlineOwnerByName(name) {
      for (const r of deps.others()) if (r.info.name === name && spots.get(r.info.id)?.k === 'snowman') return r.info.id;
      return null;
    },
    pickFromSnowman(owner, snowmanId) {
      deps.send.pick(owner, snowmanId);
    },
    tap(x, y, walkTo) {
      if (phase !== 'idle' || !deps.online()) return false;
      // 바닥의 남의 모자: 곁이면 줍고, 멀면 걸어간다
      const ground = self.nearestGroundHat();
      for (const r of deps.others()) {
        if (!r.hat.lying || spots.get(r.info.id)?.k !== 'ground' || Math.abs(x - r.hat.x) > 10 || y < r.hat.y - 14 || y > r.hat.y + 5) continue;
        if (ground && ground.owner === r.info.id && ground.distance <= HAT.pickRadius) self.pick(r.info.id);
        else walkTo(r.hat.x, r.hat.y);
        return true;
      }
      // 사람을 눌렀다: 내 모자를 쓴 사람이면 잡거나 조르고, 내가 그 사람 모자를 쓰고 있으면 돌려준다
      for (const r of deps.others()) {
        if (Math.abs(x - r.ch.x) > 8 || y > r.ch.y + 3 || y < r.ch.y - CHARACTER.spriteHeight - 8) continue;
        const wearer = self.myHatWearer();
        if (wearer && wearer.id === r.info.id) {
          if (wearer.canCatch) self.catch(wearer.id);
          else if (wearer.distance <= C.begRadius) self.beg();
          else walkTo(r.ch.x, r.ch.y);
          return true;
        }
        if (character.extraHats.some((e) => e.owner === r.info.id)) {
          if (Math.hypot(r.ch.x - character.x, r.ch.y - character.y) <= C.giveRadius) self.give(r.info.id);
          else walkTo(r.ch.x, r.ch.y);
          return true;
        }
      }
      return false;
    },
    update(dt) {
      time += dt;
      // 내 모자 자리는 내 화면이 먼저 안다 (재채기로 떨어짐, 주워 씀, 눈사람에게 줌) — 남이 쓰고 있는 동안은 서버가 알려 준 대로
      const wire = character.hat.get();
      if (wire !== 'taken') {
        const current = spots.get(myKey());
        const own = spotFromWire(wire, current);
        if (!sameSpot(own, current)) setSpot(myKey(), own);
      }
      if (!dirty) dirty = colorsStale();
      if (dirty) restack();
      // 내 동작
      if (phase !== 'idle') {
        timer -= dt;
        if (phase !== 'pat' && phase !== 'scratch') {
          character.moving = false;
          character.target = null;
        }
        if (timer <= 0) {
          if (phase === 'beg') {
            lastBegEnd = time;
            begs.delete(myKey());
          }
          phase = 'idle';
        }
      }
      // 모두의 연출 시계
      for (const [id, b] of begs) {
        b.t += dt;
        if (b.t >= C.begSeconds) begs.delete(id);
      }
      for (const [id, t] of pratfalls) (t + dt >= C.pratfallSeconds ? pratfalls.delete(id) : pratfalls.set(id, t + dt));
      for (const [id, t] of pats) (t + dt >= C.patSeconds ? pats.delete(id) : pats.set(id, t + dt));
      for (const [id, t] of scratches) (t + dt >= C.scratchSeconds ? scratches.delete(id) : scratches.set(id, t + dt));
      for (let i = hearts.length - 1; i >= 0; i--) if ((hearts[i].t += dt) >= C.patSeconds) hearts.splice(i, 1);
      for (let i = caughtLabels.length - 1; i >= 0; i--) if ((caughtLabels[i].t += dt) >= C.caughtLabelSeconds) caughtLabels.splice(i, 1);
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i];
        f.t += dt;
        if (f.t < C.flySeconds) continue;
        flights.splice(i, 1);
        f.land?.();
      }
      // 조르는 사람: 반짝이는 대머리에서 화난 김, 5번째부터 눈물
      steamIn -= dt;
      tearIn -= dt;
      const steam = steamIn <= 0;
      const tear = tearIn <= 0;
      if (steam) steamIn = C.steamEvery;
      if (tear) tearIn = C.tearEvery;
      for (const [id, b] of begs) {
        const body = bodyOf(id);
        if (!body) continue;
        const lying = begStage(b.n) !== 'stomp';
        const hx = lying ? body.ch.x + (body.ch.facing === 'right' ? -12 : 12) : body.ch.x;
        const hy = lying ? body.ch.y - 8 : body.ch.y - CHARACTER.spriteHeight + 3;
        if (steam) particles.push({ x: hx + (Math.random() - 0.5) * 6, y: hy, vy: -14, age: 0, life: C.steamLife, color: K.steam });
        if (tear && begStage(b.n) === 'tears') {
          for (const side of [-2, 3]) particles.push({ x: hx + side, y: lying ? hy : hy + 11, vy: 18, age: 0, life: C.tearLife, color: K.tear });
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        p.y += p.vy * dt;
        if (p.age >= p.life) particles.splice(i, 1);
      }
      // 남이 5분 넘게 쓰고 있는 내 모자: 스스로 돌아오게 서버에 묻는다
      if (deps.online() && homeDue(spots.get(myKey()), deps.now()) && time - askedHomeAt >= C.homeRetry) {
        askedHomeAt = time;
        deps.send.home();
      }
    },
    poseFor(id) {
      const b = bodyOf(id);
      return b ? poseOf(id, b.ch.facing) : null;
    },
    pose() {
      if (phase === 'pick') return { pose: 'crouch', index: 0 };
      if (phase === 'give') return { pose: 'cheer', index: 0 };
      return poseOf(myKey(), character.facing);
    },
    labels() {
      if (caughtLabels.length === 0) return NO_LABELS;
      return caughtLabels.flatMap((l) => {
        const b = bodyOf(l.id);
        // 곁에 붙어 있는 사람의 닉네임과 겹치지 않게 그보다 위에
        return b ? [{ x: b.ch.x, y: b.ch.y - NET.nameAbove - 12, text: '잡았다!' }] : [];
      });
    },
    reset(players, myId) {
      spots.clear();
      spots.set(myId, { k: 'me' });
      for (const p of players) spots.set(p.id, p.hl ?? { k: 'me' });
      dirty = true;
      // 들어오면 언제나 내 모자를 쓰고 있다
      if (!myHat.on && character.hat.get() === 'taken') myHat.putOn();
    },
    joined(id, spot) {
      setSpot(id, spot ?? { k: 'me' });
    },
    left(id) {
      // 나간 사람의 모자는 반짝이며 사라져 주인에게 돌아간다 (누가 쓰고 있었으면 그 머리에서)
      const spot = spots.get(id);
      if (spot?.k === 'worn') {
        const w = bodyOf(spot.by);
        if (w) sparkle(w.ch.x, headOf(w.ch).y);
      }
      spots.delete(id);
      begs.delete(id);
      pratfalls.delete(id);
      dirty = true;
    },
    onOwnerState(id, hat) {
      const previous = spots.get(id);
      const next = spotFromWire(hat, previous);
      if (!sameSpot(previous, next)) setSpot(id, next);
    },
    onHat(owner, spot, how, by) {
      const me = myKey();
      setSpot(owner, spot);
      const ownerBody = bodyOf(owner);
      if (!ownerBody) return;
      const isMine = owner === me;
      const wearer = by ? bodyOf(by) : null;
      const wearerHead = wearer ? headOf(wearer.ch) : null;
      switch (how) {
        case 'pick':
          ownerBody.hat.takenAway();
          if (by === me) deps.sound?.('pick');
          break;
        case 'give':
        case 'catch':
        case 'home': {
          // 모자가 포물선을 그리며 주인 머리로 날아가 착
          if (isMine) myHat.takenAway();
          const from = wearerHead ?? { x: ownerBody.ch.x, y: ownerBody.ch.y - CHARACTER.spriteHeight };
          flyHome(owner, from, () => {
            if (isMine) {
              myHat.putOn();
              deps.sound?.('land');
            }
          });
          if (how === 'give') {
            if (by) scratches.set(by, 0);
            pats.set(owner, 0);
            hearts.push({ id: owner, t: 0 });
            if (by === me) startPhase('scratch', C.scratchSeconds);
            if (isMine) {
              startPhase('pat', C.patSeconds);
              deps.cold?.(-C.returnWarmth);
            }
            deps.sound?.('give');
          } else if (how === 'catch') {
            if (by) pratfalls.set(by, 0);
            caughtLabels.push({ id: owner, t: 0 });
            if (by === me) startPhase('pratfall', C.pratfallSeconds);
            deps.sound?.('catch');
          }
          break;
        }
        case 'fall':
        case 'leave': {
          // 쓰고 있던 사람 머리에서 바닥으로 (내가 떨어뜨린 것은 이미 날리고 있다)
          if (by === me && how === 'fall') break;
          if (spot.k !== 'ground') break;
          const from = wearerHead ?? { x: spot.x, y: spot.y - CHARACTER.spriteHeight };
          ownerBody.hat.flyTo({ x: from.x, y: from.y + CHARACTER.spriteHeight }, { x: spot.x, y: spot.y });
          break;
        }
        case 'snowman':
          ownerBody.hat.giveAway();
          break;
        case 'sync':
          // 요청이 거절됐다: 서버가 정한 자리에 맞춘다
          if (spot.k === 'me') {
            if (!ownerBody.hat.on) ownerBody.hat.putOn();
          } else if (spot.k === 'worn') ownerBody.hat.takenAway();
          else if (spot.k === 'ground') {
            if (!ownerBody.hat.lying || ownerBody.hat.x !== spot.x || ownerBody.hat.y !== spot.y) ownerBody.hat.placeAt({ x: spot.x, y: spot.y });
          } else ownerBody.hat.giveAway();
          break;
      }
    },
    onBeg(id, n) {
      if (id === myKey()) return;
      begs.set(id, { t: 0, n });
    },
    spotOf(id) {
      return spots.get(id);
    },
    debugState() {
      return {
        me: myKey(),
        spots: [...spots.entries()],
        others: [...deps.others()].map((r) => ({ id: r.info.id, lying: r.hat.lying, on: r.hat.on, x: r.hat.x, y: r.hat.y, ch: [r.ch.x, r.ch.y] })),
        mine: [character.x, character.y, character.hat.get()],
      };
    },
  };
  return self;
}
