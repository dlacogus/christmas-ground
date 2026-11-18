// 클라이언트와 서버가 주고받는 메시지 형식. 양쪽이 이 파일 하나를 같이 쓴다.
// 서버(Durable Object 'Plaza')는 받은 메시지를 parseClientMessage로 확인하고, 다른 사람들에게 전달만 한다.
// 브라우저·Worker 어느 쪽에서도 돌아가게 DOM도 Cloudflare API도 쓰지 않는다.

import { CAROUSEL, CARRIAGE, COPUSH, NET, PROP_IDS, PROPS, SNOWBALL, SNOWMAN, THROW, type PropId } from '../constants';
import { MAP_HEIGHT, MAP_WIDTH } from '../world';

// ───────────── 공통 ─────────────

/** 캐릭터가 지금 하는 일 (character.state와 같은 뜻) */
export type WireState =
  | { kind: 'walk' }
  | { kind: 'riding'; mount: number; slot: number }
  | { kind: 'skating' }
  | { kind: 'sitting'; bench: number; slot: number };

/** 털모자: 쓰고 있거나, 눈사람에게 씌워 줬거나, 떨어져 있는 자리 */
export type WireHat = 'on' | 'onSnowman' | { x: number; y: number };

/** 눈사람이 쓴 털모자: 주인 닉네임과 모자 색 (목도리 색 번호) */
export interface SnowmanHat {
  name: string;
  color: number;
}

/** 한 번짜리 동작 — 친구 화면에서도 같은 연출이 나온다 */
export const ACTS = ['sneeze', 'snowman', 'fall', 'wave', 'jump', 'spin', 'spinEnd', 'highfive', 'cheer', 'decorate'] as const;
export type Act = (typeof ACTS)[number];

export interface WirePlayer {
  id: string;
  name: string;
  /** 목도리 색 번호 (0~5) */
  scarf: number;
  x: number;
  y: number;
  /** 바라보는 쪽 (1 = 오른쪽, 0 = 왼쪽) */
  f: 0 | 1;
  state: WireState;
  hat: WireHat;
  /** 손에 든 노점 소품 */
  hold?: PropId | null;
  /** 쓰고 있는 털모자 색 (없으면 자기 목도리 색)과, 남의 모자를 쓰고 있으면 그 주인 닉네임 */
  hc?: number | null;
  ho?: string | null;
}

/** 만든 사람 (접속 id는 나가면 바뀌므로 닉네임과 목도리 색으로 적는다) */
export interface Maker {
  name: string;
  scarf: number;
}

/** 눈사람에 달린 소품 하나: 무엇을(p), 누가 달았나(by = 닉네임) */
export interface AttachedProp {
  p: PropId;
  by: string;
}

/** 떨어진 머리 눈덩이에 붙어 있는 얼굴: 생김새 시드, 머리·얼굴 소품, 모자, 엎어져 있나 */
export interface BallFace {
  seed: number;
  props?: AttachedProp[];
  hat?: SnowmanHat | null;
  down?: boolean;
}

/** 놓여 있는 눈덩이 */
export interface BallData {
  x: number;
  y: number;
  d: number;
  roll: number;
  seed: number;
  owner: string;
  /** 처음 만든 사람 + 이어서 굴린 사람들 (최대 4명) */
  makers?: Maker[];
  /** 눈사람에서 떨어진 머리면 얼굴이 붙어 있다 (눈 위로 굴리면 묻혀 없어진다) */
  face?: BallFace | null;
}

/** 눈사람 */
export interface SnowmanData {
  x: number;
  y: number;
  tiers: number[];
  seed: number;
  owner: string;
  /** 눈덩이를 굴린 사람들 (2명 이상이면 줄무늬 목도리) */
  makers?: Maker[];
  /** 달아준 노점 소품 (자리마다 하나, 5개까지) */
  props?: AttachedProp[];
  /** 누가 씌워 준 털모자 */
  hat?: SnowmanHat | null;
  /** 머리가 떨어져 몸통만 남았다 (한 단만 남을 수도 있다) */
  headless?: boolean;
  /** 처음 만든 때 (서버 시각, ms). 서버가 적는다 — 10분 뒤 녹는다 */
  born?: number;
}

export type WireObject =
  | { id: string; kind: 'ball'; data: BallData; updatedAt: number }
  | { id: string; kind: 'snowman'; data: SnowmanData; updatedAt: number };

/** 회전목마 자리: seats[탈 것][자리] = 앉은 사람 id 또는 null */
export type WireSeats = (string | null)[][];

// ───────────── 클라이언트 → 서버 ─────────────

export type ClientMessage =
  /** 입장 (맨 처음 한 번). legacy = 예전에 이 브라우저에만 저장해 둔 내 눈사람 (서버로 옮긴다) */
  | { t: 'join'; name: string; scarf: number; legacy?: SnowmanData[] }
  /** 위치 (움직이는 동안 초당 최대 8번, 멈추면 한 번). 스케이트 중에는 속도도 */
  | { t: 'pos'; x: number; y: number; f: 0 | 1; m: 0 | 1; vx?: number; vy?: number }
  /** 상태가 바뀌었을 때만 */
  | { t: 'state'; state: WireState; hat: WireHat; hold?: PropId | null; hc?: number | null; ho?: string | null }
  | { t: 'act'; a: Act }
  /** 회전목마 자리에 앉겠다 / 내렸다 */
  | { t: 'sit'; mount: number; slot: number }
  | { t: 'stand' }
  /** 굴리는 눈덩이 (초당 최대 5번, 저장하지 않는다) */
  | { t: 'ball'; id: string; x: number; y: number; d: number; roll: number; seed: number }
  /** 눈덩이를 잡겠다 (새로 뭉쳤거나, 놓인 것을 이어 굴리거나, 남이 미는 것을 같이 밀거나) / 손을 뗐다 */
  | { t: 'grab'; id: string }
  | { t: 'drop'; id: string }
  /** 같이 미는 사람의 방향 입력 (눈덩이 위치는 먼저 잡은 사람 화면이 계산한다) */
  | { t: 'push'; id: string; dx: number; dy: number }
  /** 결과가 바뀔 때만: 놓기·합치기 (저장한다) / 없어짐 */
  | { t: 'put'; id: string; kind: 'ball'; data: BallData }
  | { t: 'put'; id: string; kind: 'snowman'; data: SnowmanData }
  | { t: 'del'; id: string }
  /** 눈덩이를 던졌다: 시작 자리·방향만 보내고, 나는 모습은 각자 화면에서 똑같이 계산한다 */
  | { t: 'throw'; x: number; y: number; dx: number; dy: number; p: number }
  /** 눈사람 머리를 맞혔다 (던진 사람 화면이 판정한다). n = 지금까지 맞힌 횟수, dir = 날아온 쪽 */
  | { t: 'hit'; id: string; n: number; dir: number }
  /** 친구를 맞혔다 (head = 머리에 맞았다) */
  | { t: 'splat'; to: string; head: 0 | 1; dir: number };

// ───────────── 서버 → 클라이언트 ─────────────

export type ServerMessage =
  /** 입장 허락: 내 id, 서버 시각, 지금 있는 사람들·회전목마 자리·눈덩이·눈사람 전부 */
  | { t: 'welcome'; id: string; now: number; players: WirePlayer[]; seats: WireSeats; objects: WireObject[]; rolling: { owner: string; id: string; x: number; y: number; d: number; roll: number; seed: number }[] }
  /** 광장이 꽉 찼다 (8명) */
  | { t: 'full' }
  | { t: 'joined'; player: WirePlayer }
  | { t: 'left'; id: string }
  | { t: 'pos'; id: string; x: number; y: number; f: 0 | 1; m: 0 | 1; vx?: number; vy?: number }
  | { t: 'state'; id: string; state: WireState; hat: WireHat; hold?: PropId | null; hc?: number | null; ho?: string | null }
  | { t: 'act'; id: string; a: Act }
  | { t: 'seats'; seats: WireSeats }
  /** 그 자리는 이미 누가 앉았다 */
  | { t: 'seatDenied' }
  | { t: 'ball'; owner: string; id: string; x: number; y: number; d: number; roll: number; seed: number }
  | { t: 'put'; object: WireObject }
  | { t: 'del'; id: string }
  /** 이 눈덩이를 지금 밀고 있는 사람들 (먼저 잡은 순서, 최대 2명) */
  | { t: 'holders'; id: string; holders: string[] }
  /** 잡을 수 없다 (이미 둘이 밀고 있다) */
  | { t: 'grabDenied'; id: string }
  | { t: 'push'; id: string; from: string; dx: number; dy: number }
  | { t: 'throw'; id: string; x: number; y: number; dx: number; dy: number; p: number }
  /** 서버가 확인한 맞힘 (그 눈사람이 있을 때만) */
  | { t: 'hit'; id: string; by: string; n: number; dir: number }
  | { t: 'splat'; from: string; to: string; head: 0 | 1; dir: number };

// ───────────── 검사 ─────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number, max: number): v is number => isNum(v) && Number.isInteger(v) && v >= min && v <= max;
const inMap = (x: unknown, y: unknown): boolean => isNum(x) && isNum(y) && x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT;
const isBit = (v: unknown): v is 0 | 1 => v === 0 || v === 1;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 40;
const isSize = (v: unknown): v is number => isNum(v) && v >= 1 && v <= SNOWBALL.maxSize;

/** 탈 것마다 자리 수 (말 1, 마차 2) */
export function seatCount(mount: number): number {
  return (CAROUSEL.carriageIndices as readonly number[]).includes(mount) ? CARRIAGE.seats.length : 1;
}

export function emptySeats(): WireSeats {
  return Array.from({ length: CAROUSEL.horseCount }, (_, mount) => Array<string | null>(seatCount(mount)).fill(null));
}

/** 닉네임: 앞뒤 공백을 떼고 1~8글자. 맞지 않으면 null */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ');
  const length = [...name].length;
  return length >= 1 && length <= NET.nameMax ? name : null;
}

export function validState(v: unknown): v is WireState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (s.kind === 'walk' || s.kind === 'skating') return true;
  if (s.kind === 'riding') return isInt(s.mount, 0, CAROUSEL.horseCount - 1) && isInt(s.slot, 0, seatCount(s.mount as number) - 1);
  if (s.kind === 'sitting') return isInt(s.bench, 0, 7) && isInt(s.slot, 0, 1);
  return false;
}

export function validHat(v: unknown): v is WireHat {
  if (v === 'on' || v === 'onSnowman') return true;
  if (typeof v !== 'object' || v === null) return false;
  const h = v as Record<string, unknown>;
  return inMap(h.x, h.y);
}

export function validMakers(v: unknown): v is Maker[] | undefined {
  if (v === undefined) return true;
  return (
    Array.isArray(v) &&
    v.length <= COPUSH.maxMakers &&
    v.every((m) => typeof m === 'object' && m !== null && cleanName((m as Maker).name) !== null && isInt((m as Maker).scarf, 0, NET.scarves - 1))
  );
}

export function validSnowmanHat(v: unknown): v is SnowmanHat | null | undefined {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'object') return false;
  const h = v as Record<string, unknown>;
  return cleanName(h.name) !== null && isInt(h.color, 0, NET.scarves - 1);
}

export function validProp(v: unknown): v is PropId {
  return (PROP_IDS as readonly unknown[]).includes(v);
}

export function validProps(v: unknown): v is AttachedProp[] | undefined {
  if (v === undefined) return true;
  return (
    Array.isArray(v) &&
    v.length <= PROPS.maxPerSnowman &&
    v.every((a) => typeof a === 'object' && a !== null && validProp((a as AttachedProp).p) && cleanName((a as AttachedProp).by) !== null)
  );
}

export function validFace(v: unknown): v is BallFace | null | undefined {
  if (v === undefined || v === null) return true;
  if (typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return isNum(f.seed) && validProps(f.props) && validSnowmanHat(f.hat) && (f.down === undefined || typeof f.down === 'boolean');
}

export function validBall(v: unknown): v is BallData {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return inMap(b.x, b.y) && isSize(b.d) && isNum(b.roll) && isNum(b.seed) && isId(b.owner) && validMakers(b.makers) && validFace(b.face);
}

export function validSnowman(v: unknown): v is SnowmanData {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    inMap(s.x, s.y) &&
    Array.isArray(s.tiers) &&
    (s.headless === undefined || typeof s.headless === 'boolean') &&
    (s.born === undefined || isNum(s.born)) &&
    s.tiers.length >= (s.headless === true ? 1 : 2) &&
    s.tiers.length <= SNOWMAN.maxTiers &&
    s.tiers.every(isSize) &&
    isNum(s.seed) &&
    isId(s.owner) &&
    validMakers(s.makers) &&
    validProps(s.props) &&
    validSnowmanHat(s.hat)
  );
}

/**
 * 클라이언트가 보낸 글자를 확인해 메시지로 바꾼다. 형식이 틀리거나 값이 범위를 벗어나면 null:
 * 크기 2KB 이하, 좌표는 맵 안, 눈덩이 크기는 최대 이하, 닉네임 길이.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > NET.maxMessageBytes) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  switch (m.t) {
    case 'join': {
      const name = cleanName(m.name);
      if (name === null || !isInt(m.scarf, 0, NET.scarves - 1)) return null;
      const legacy = Array.isArray(m.legacy) ? m.legacy.filter(validSnowman).slice(0, SNOWMAN.maxCount) : undefined;
      return { t: 'join', name, scarf: m.scarf, legacy };
    }
    case 'pos': {
      if (!inMap(m.x, m.y) || !isBit(m.f) || !isBit(m.m)) return null;
      const out: ClientMessage = { t: 'pos', x: m.x as number, y: m.y as number, f: m.f, m: m.m };
      if (isNum(m.vx) && isNum(m.vy) && Math.abs(m.vx) <= 400 && Math.abs(m.vy) <= 400) {
        out.vx = m.vx;
        out.vy = m.vy;
      }
      return out;
    }
    case 'state':
      return validState(m.state) && validHat(m.hat) ? { t: 'state', state: m.state, hat: m.hat, hold: validProp(m.hold) ? m.hold : null, hc: isInt(m.hc, 0, NET.scarves - 1) ? m.hc : null, ho: cleanName(m.ho) } : null;
    case 'act':
      return (ACTS as readonly unknown[]).includes(m.a) ? { t: 'act', a: m.a as Act } : null;
    case 'sit':
      return isInt(m.mount, 0, CAROUSEL.horseCount - 1) && isInt(m.slot, 0, seatCount(m.mount) - 1) ? { t: 'sit', mount: m.mount, slot: m.slot } : null;
    case 'stand':
      return { t: 'stand' };
    case 'ball':
      return isId(m.id) && inMap(m.x, m.y) && isSize(m.d) && isNum(m.roll) && isNum(m.seed)
        ? { t: 'ball', id: m.id, x: m.x as number, y: m.y as number, d: m.d, roll: m.roll, seed: m.seed }
        : null;
    case 'grab':
    case 'drop':
      return isId(m.id) ? { t: m.t, id: m.id } : null;
    case 'push':
      return isId(m.id) && isNum(m.dx) && isNum(m.dy) && Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1 ? { t: 'push', id: m.id, dx: m.dx, dy: m.dy } : null;
    case 'put':
      if (!isId(m.id)) return null;
      if (m.kind === 'ball' && validBall(m.data)) return { t: 'put', id: m.id, kind: 'ball', data: m.data };
      if (m.kind === 'snowman' && validSnowman(m.data)) return { t: 'put', id: m.id, kind: 'snowman', data: m.data };
      return null;
    case 'del':
      return isId(m.id) ? { t: 'del', id: m.id } : null;
    case 'throw':
      return inMap(m.x, m.y) && isNum(m.dx) && isNum(m.dy) && Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1 && isNum(m.p) && m.p >= 0 && m.p <= THROW.maxPeak ? { t: 'throw', x: m.x as number, y: m.y as number, dx: m.dx, dy: m.dy, p: m.p } : null;
    case 'hit':
      return isId(m.id) && isInt(m.n, 1, 5) && (m.dir === 1 || m.dir === -1) ? { t: 'hit', id: m.id, n: m.n, dir: m.dir } : null;
    case 'splat':
      return isId(m.to) && isBit(m.head) && (m.dir === 1 || m.dir === -1) ? { t: 'splat', to: m.to, head: m.head, dir: m.dir } : null;
    default:
      return null;
  }
}
