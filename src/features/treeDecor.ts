// 트리 꾸미기의 규칙 (DOM도 그림도 없음 — 화면과 서버가 같이 쓰고, 테스트할 수 있다). 조작과 그림은 treeDecorPlay.ts.
//
// - 산타는 서버 시각이 5분의 배수가 될 때마다 지나가며 선물 상자 하나를 떨어뜨린다.
//   지나가는 때·떨어질 자리·상자 색은 서버 시각 + 고정 시드로 각자 계산한다 (메시지를 보내지 않아도 모든 화면이 같다).
// - 상자는 매번 다른 구역(광장 → 회전목마 → 스케이트장)의 걸을 수 있는 바닥에 떨어진다. 바닥에는 최근 3개까지.
// - 상자를 열면 장식 하나 (보통 85%, 특별 15%). 장식의 id는 상자 id와 같다 — 상자 하나에 장식 하나.
// - 장식은 트리 잎 실루엣 안쪽(테두리 2px 안)에, 다른 장식과 겹치지 않게 단다. 최대 150개.
// - 높이에 따라 까치발 / 사다리 / 던지기. 내가 단 장식은 1분 안에만 다시 뗄 수 있다.

import { GIFT, ORNAMENT, ORNAMENT_KINDS, SANTA, TREE, type OrnamentKind } from '../constants';
import { foliageHalfWidth } from '../props/treeShape';
import { createRng, randInt } from '../random';
import { CAROUSEL_GATE, CAROUSEL_X, MAP_WIDTH, OBSTACLES, TREE_X, WALK_AREA, ZONE_BOUNDS, getObstacle, type Point, type ZoneName } from '../world';

// ───────────── 산타가 지나가는 때 (서버 시각) ─────────────

/** 한 번 가로지르는 데 걸리는 시간 (초) */
export function santaFlightSeconds(): number {
  return (MAP_WIDTH + SANTA.width) / SANTA.speed;
}

/** 썰매 가운데가 월드 x에 있을 때의 높이 (썰매 위쪽 y): 평소 높이로 날다가 트리 위에서 별 위로 솟는다 */
export function santaAltitude(centerX: number): number {
  const d = (centerX - TREE_X) / SANTA.treeRiseWidth;
  return SANTA.cruiseY - (SANTA.cruiseY - SANTA.overTreeY) * Math.exp(-d * d);
}

/** 서버 시각(초)에 산타가 날고 있으면 몇 번째(index)인지와 가로지른 정도(0~1), 아니면 null */
export function santaPass(nowSec: number): { index: number; progress: number } | null {
  const index = Math.floor(nowSec / SANTA.interval);
  const progress = (nowSec - index * SANTA.interval) / santaFlightSeconds();
  return progress < 1 ? { index, progress } : null;
}

/** 다음 산타가 날기 시작할 때까지 남은 시간 (초) */
export function nextSantaIn(nowSec: number): number {
  return SANTA.interval - (((nowSec % SANTA.interval) + SANTA.interval) % SANTA.interval);
}

// ───────────── 선물 상자 ─────────────

export interface Gift {
  id: string;
  /** 떨어질 자리 (상자 바닥 가운데, 맵 좌표) */
  x: number;
  y: number;
  /** 상자 색 번호 (GIFT_COLORS.boxes) */
  color: number;
  /** 썰매에서 튀어나오는 때, 바닥에 닿는 때 (서버 시각, 초) */
  dropAt: number;
  landAt: number;
  /** 튀어나오는 높이 (썰매 자루의 y) */
  fromY: number;
}

/** 산타 번호마다 떨어지는 구역: 광장 → 회전목마 → 스케이트장 순서로 돌아 매번 다른 구역이 된다 */
const GIFT_ZONES: readonly ZoneName[] = ['plaza', 'carousel', 'rink'];

export function giftZone(index: number): ZoneName {
  return GIFT_ZONES[((index % GIFT_ZONES.length) + GIFT_ZONES.length) % GIFT_ZONES.length];
}

export function giftId(index: number): string {
  return `s${index}`;
}

/** 산타 선물의 id면 산타 번호, 아니면 null */
export function giftIndexOf(id: string): number | null {
  return /^s\d{1,12}$/.test(id) ? Number(id.slice(1)) : null;
}

/** 회전목마 입구 카펫과 계단 (걸을 수는 있지만 선물은 떨어지지 않는다) */
const CARPET = (() => {
  const top = getObstacle('carousel').y + getObstacle('carousel').h;
  return { x: CAROUSEL_X - CAROUSEL_GATE.ropePostOffset, y: top, w: CAROUSEL_GATE.ropePostOffset * 2, h: CAROUSEL_GATE.stepsDepth + CAROUSEL_GATE.carpetLength };
})();

/** 큰 시설(트리·회전목마·링크)의 뒤쪽: 걸을 수는 있지만 시설에 가려 상자가 안 보인다 — x 범위 [left, right], 이 y보다 뒤 */
const HIDDEN_BEHIND = [
  { left: TREE_X - TREE.baseHalfWidth, right: TREE_X + TREE.baseHalfWidth, frontY: getObstacle('tree-bed').y + getObstacle('tree-bed').h },
  ...['carousel', 'rink'].map((id) => {
    const o = getObstacle(id);
    return { left: o.x, right: o.x + o.w, frontY: o.y + o.h };
  }),
];

/**
 * 여기에 선물이 떨어져도 되나: 걸을 수 있는 바닥 안쪽이고, 장애물(트리 화단·링크·회전목마·가로등·벤치…)에서 떨어져 있으며,
 * 큰 시설 뒤에 가려지지 않는다.
 */
export function canLandAt(x: number, y: number): boolean {
  const m = GIFT.edgeMargin;
  if (x < WALK_AREA.x + m || x > WALK_AREA.x + WALK_AREA.w - m || y < WALK_AREA.y + m || y > WALK_AREA.y + WALK_AREA.h - m) return false;
  const pad = GIFT.obstacleMargin;
  for (const h of HIDDEN_BEHIND) {
    if (x > h.left - pad && x < h.right + pad && y < h.frontY + pad) return false;
  }
  for (const o of OBSTACLES) {
    if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return false;
  }
  return !(x > CARPET.x - pad && x < CARPET.x + CARPET.w + pad && y > CARPET.y - pad && y < CARPET.y + CARPET.h + pad);
}

/** index번째 산타가 떨어뜨리는 선물을 계산한다. 서버 시각에서 나온 번호와 고정 시드만 쓰므로 언제 어디서 계산해도 같다 */
export function computeGift(index: number): Gift {
  const rng = createRng(GIFT.seed + index * 7919);
  const zone = ZONE_BOUNDS[giftZone(index)];
  let x = 0;
  let y = 0;
  do {
    x = randInt(rng, zone.startX + GIFT.zoneMargin, zone.endX - GIFT.zoneMargin);
    y = randInt(rng, WALK_AREA.y + GIFT.edgeMargin, WALK_AREA.y + WALK_AREA.h - GIFT.edgeMargin);
  } while (!canLandAt(x, y));
  const color = randInt(rng, 0, 3);
  // 썰매의 선물 자루가 떨어질 자리 바로 위를 지나는 순간에 떨어뜨린다
  const dropAt = index * SANTA.interval + (MAP_WIDTH + SANTA.sackX - x) / SANTA.speed;
  const sleighCenter = x - SANTA.sackX + SANTA.width / 2;
  return { id: giftId(index), x, y, color, dropAt, landAt: dropAt + GIFT.popSeconds + GIFT.fallSeconds, fromY: Math.round(santaAltitude(sleighCenter)) + SANTA.sackY };
}

const giftCache = new Map<number, Gift>();

/** index번째 산타가 떨어뜨리는 선물 (한 번 계산한 것은 기억해 둔다 — 매 프레임 묻는다) */
export function giftOfPass(index: number): Gift {
  let gift = giftCache.get(index);
  if (!gift) {
    gift = computeGift(index);
    if (giftCache.size > 64) giftCache.clear();
    giftCache.set(index, gift);
  }
  return gift;
}

/** 가장 최근에 바닥에 닿은 선물의 산타 번호 */
export function latestLanded(nowSec: number): number {
  const index = Math.floor(nowSec / SANTA.interval);
  return giftOfPass(index).landAt <= nowSec ? index : index - 1;
}

/** 가장 최근에 썰매에서 떨어지기 시작한 선물의 산타 번호 */
export function latestDropped(nowSec: number): number {
  const index = Math.floor(nowSec / SANTA.interval);
  return giftOfPass(index).dropAt <= nowSec ? index : index - 1;
}

/**
 * 지금 있는 선물들 (오래된 것부터): 바닥에는 최근에 닿은 3개까지 — 새 상자가 닿으면 가장 오래된 것이 사라진다.
 * 떨어지는 중인 것도 넣는다. 이미 열린 것(opened)은 뺀다.
 */
export function liveGifts(nowSec: number, opened: ReadonlySet<string> = new Set()): Gift[] {
  const out: Gift[] = [];
  const dropped = latestDropped(nowSec);
  for (let k = latestLanded(nowSec) - GIFT.maxOnGround + 1; k <= dropped; k++) {
    const gift = giftOfPass(k);
    if (!opened.has(gift.id)) out.push(gift);
  }
  return out;
}

/** 이 산타 선물을 지금 열 수 있나 (서버 검사): 바닥에 닿았고, 최근 3개 안에 든다 */
export function giftOpenable(id: string, nowSec: number): boolean {
  const index = giftIndexOf(id);
  if (index === null) return false;
  const landed = latestLanded(nowSec);
  return index <= landed && index > landed - GIFT.maxOnGround;
}

/** 지금 열 수 있는 산타 선물의 id들 (서버가 이 가운데 열린 것만 기억하면 된다) */
export function openableGiftIds(nowSec: number): string[] {
  const landed = latestLanded(nowSec);
  return Array.from({ length: GIFT.maxOnGround }, (_, i) => giftId(landed - i));
}

/** 떨어지는 선물의 지금 자리 (상자 바닥 가운데). elapsed = 떨어지기 시작한 뒤 지난 시간 */
export function giftFlight(gift: { x: number; y: number; fromY: number }, elapsed: number, fallSeconds: number = GIFT.fallSeconds): { x: number; y: number; chute: boolean; progress: number } {
  const startY = gift.fromY + GIFT.height;
  if (elapsed < GIFT.popSeconds) {
    // 썰매에서 톡 튀어나온다
    const hop = Math.sin((Math.PI * Math.max(0, elapsed)) / GIFT.popSeconds) * GIFT.popHeight;
    return { x: gift.x, y: startY - hop, chute: false, progress: 0 };
  }
  const t = elapsed - GIFT.popSeconds;
  const progress = Math.min(1, t / fallSeconds);
  // 낙하산을 펴고 좌우로 흔들리며 내려온다 (바닥에 가까워질수록 잦아들어 정해진 자리에 닿는다)
  const sway = Math.sin(t * GIFT.swayHz * Math.PI * 2) * GIFT.swayAmp * (1 - progress);
  return { x: gift.x + sway, y: startY + (gift.y - startY) * progress, chute: true, progress };
}

// ───────────── 장식 ─────────────

export const ORNAMENT_NAMES: Record<OrnamentKind, string> = {
  ballRed: '빨간 장식볼',
  ballGold: '금빛 장식볼',
  ballSilver: '은빛 장식볼',
  ballBlue: '파란 장식볼',
  cane: '지팡이 사탕',
  bell: '작은 종',
  snowflake: '눈꽃',
  pinecone: '솔방울',
  cookie: '진저브레드 쿠키',
  bow: '리본 매듭',
  icicle: '고드름',
  glowBall: '빛나는 장식볼',
  star: '작은 별',
  musicBox: '오르골 장식',
};

/** 글자 = 픽셀 (ORNAMENT_COLORS), '.'은 투명. 가로세로 4~7px */
export const ORNAMENT_SPRITES: Record<OrnamentKind, readonly string[]> = {
  ballRed: ['.RRR.', 'RWRRr', 'RRRRr', 'RRRrr', '.rrr.'],
  ballGold: ['.GGG.', 'GWGGg', 'GGGGg', 'GGGgg', '.ggg.'],
  ballSilver: ['.SSS.', 'SWSSs', 'SSSSs', 'SSSss', '.sss.'],
  ballBlue: ['.BBB.', 'BWBBb', 'BBBBb', 'BBBbb', '.bbb.'],
  cane: ['.WR.', 'R..W', '...R', '...W', '...R', '...W', '...R'],
  bell: ['..G..', '.GGG.', '.GYG.', 'GGGGg', 'GGGGg', '..K..'],
  snowflake: ['W.W.W', '.WWW.', 'WWCWW', '.WWW.', 'W.W.W'],
  pinecone: ['.EE.', 'NnNn', 'nNnN', 'NnNn', '.nN.'],
  cookie: ['.NNN.', '.NNN.', 'NNWNN', '.NNN.', '.NWN.', '.N.N.'],
  bow: ['RR.RR', 'RRGRR', 'RR.RR', '.r.r.'],
  icicle: ['.CCC', '.CWC', '.cC.', '.cC.', '..C.', '..C.', '..c.'],
  glowBall: ['.YYY.', 'YWWYy', 'YWYYy', 'YYYyy', '.yyy.'],
  star: ['..Y..', 'YYYYY', '.YWY.', '.YYY.', 'Y...Y'],
  musicBox: ['..KK.', '.GGGG', 'GPPPG', 'GPWPG', 'GPPPG', '.GGG.'],
};

export function ornamentSize(kind: OrnamentKind): { w: number; h: number } {
  const rows = ORNAMENT_SPRITES[kind];
  return { w: rows[0].length, h: rows.length };
}

export function isOrnamentKind(v: unknown): v is OrnamentKind {
  return (ORNAMENT_KINDS as readonly unknown[]).includes(v);
}

/** 특별한 장식인가 (스스로 빛나는 장식볼, 작은 별, 오르골) */
export function isSpecial(kind: OrnamentKind): boolean {
  return ORNAMENT_KINDS.indexOf(kind) >= ORNAMENT.commonCount;
}

/** 장식볼인가 (트리 전구 빛이 1px 하이라이트로 비친다) */
export function isBall(kind: OrnamentKind): boolean {
  return kind.startsWith('ball');
}

/** 스스로 빛을 내는 장식인가 (작은 빛을 더한다) */
export function glows(kind: OrnamentKind): boolean {
  return kind === 'glowBall' || kind === 'star';
}

/** 상자에서 나오는 장식: rare(0~1)가 15% 안이면 특별, 아니면 보통. pick(0~1)으로 그 안에서 고른다 */
export function rollOrnament(rare: number, pick: number): OrnamentKind {
  const special = rare < ORNAMENT.specialChance;
  const from = special ? ORNAMENT.commonCount : 0;
  const count = special ? ORNAMENT_KINDS.length - ORNAMENT.commonCount : ORNAMENT.commonCount;
  return ORNAMENT_KINDS[from + Math.min(count - 1, Math.floor(pick * count))];
}

/** 트리에 달린 장식 하나 */
export interface TreeOrnament {
  id: string;
  kind: OrnamentKind;
  /** 장식 가운데 (맵 좌표, 정수) */
  x: number;
  y: number;
  /** 단 사람 닉네임, 단 때 (서버 시각 ms) */
  by: string;
  at: number;
}

/** 트리 발밑 (화단 앞선의 y) — 높이는 여기서부터 잰다 */
export const TREE_FOOT_Y = getObstacle('tree-bed').y + getObstacle('tree-bed').h;

/** 달 수 있는 영역: 잎 단들의 실루엣에서 테두리 2px 안쪽 (꼭대기 별 바로 밑은 뺀다) */
export function inHangArea(x: number, y: number): boolean {
  if (y < TREE.tipY + ORNAMENT.topMargin || y > TREE.foliageBottomY) return false;
  return Math.abs(x - TREE_X) <= foliageHalfWidth(Math.round(y)) - ORNAMENT.inset;
}

/** y 줄에서 달 수 있는 영역의 반폭 (없으면 -1) */
export function hangHalfWidth(y: number): number {
  if (y < TREE.tipY + ORNAMENT.topMargin || y > TREE.foliageBottomY) return -1;
  const half = foliageHalfWidth(y) - ORNAMENT.inset;
  return half >= 0 ? half : -1;
}

export type HangCheck = 'ok' | 'outside' | 'overlap' | 'full';

/** 이 자리에 달 수 있나: 잎 영역 안, 다른 장식과 겹치지 않음, 150개 미만 */
export function checkHang(x: number, y: number, others: readonly Point[]): HangCheck {
  if (others.length >= ORNAMENT.max) return 'full';
  if (!inHangArea(x, y)) return 'outside';
  for (const o of others) {
    if (Math.hypot(o.x - x, o.y - y) < ORNAMENT.minGap) return 'overlap';
  }
  return 'ok';
}

export type HangStyle = 'tiptoe' | 'ladder' | 'toss';

/** 다는 방식: 손이 닿는 높이(바닥에서 40px)까지는 까치발, 별 바로 아래는 던져서, 그 사이는 사다리 */
export function hangStyle(y: number): HangStyle {
  if (TREE_FOOT_Y - y <= ORNAMENT.reachHeight) return 'tiptoe';
  return y < TREE.tipY + ORNAMENT.tossBelowTip ? 'toss' : 'ladder';
}

/** 다는 데 걸리는 시간: 사다리는 높을수록 오래 (최대 약 3초) */
export function hangSeconds(y: number): number {
  const style = hangStyle(y);
  if (style === 'tiptoe') return ORNAMENT.tiptoeSeconds;
  if (style === 'toss') return ORNAMENT.tossSeconds;
  const lowest = ORNAMENT.reachHeight;
  const highest = TREE_FOOT_Y - (TREE.tipY + ORNAMENT.tossBelowTip);
  const f = Math.min(1, Math.max(0, (TREE_FOOT_Y - y - lowest) / (highest - lowest)));
  return ORNAMENT.ladderMinSeconds + (ORNAMENT.ladderMaxSeconds - ORNAMENT.ladderMinSeconds) * f;
}

/** 다시 뗄 수 있나: 내가 단 것이고 단 지 1분이 안 됐다 */
export function canUnhang(ornament: { by: string; at: number }, nick: string, nowMs: number): boolean {
  return ornament.by === nick && nowMs - ornament.at <= ORNAMENT.undoSeconds * 1000;
}

/**
 * 장식 수가 count가 됐을 때 새로 축하할 개수 (25·50·100), 없으면 null.
 * celebrated = 지금까지 축하한 가장 큰 개수 — 뗐다 다시 달아도 같은 축하는 한 번뿐이다.
 */
export function milestoneAt(count: number, celebrated: number): number | null {
  let hit: number | null = null;
  for (const m of ORNAMENT.milestones) if (count >= m && m > celebrated) hit = m;
  return hit;
}

/** 장식이 이만큼이면 별이 항상 조금 더 밝다 */
export function starIsBright(count: number): boolean {
  return count >= ORNAMENT.brightFrom;
}
