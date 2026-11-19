import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { GIFT, ORNAMENT, ORNAMENT_KINDS, SANTA, TREE, TREE_DECOR, type OrnamentKind } from '../constants';
import type { InputActions } from '../input';
import type { TreeProp } from '../props/tree';
import { canHangOrnament, canOpenGift, canUnhangOrnament, debugGiftId, parseDebugGift, type OrnamentRow } from '../shared/plazaCore';
import { parseClientMessage, validHeld } from '../shared/protocol';
import { OBSTACLES, TREE_X, WALK_AREA, ZONE_BOUNDS, inZone } from '../world';
import {
  ORNAMENT_NAMES,
  ORNAMENT_SPRITES,
  TREE_FOOT_Y,
  canLandAt,
  canUnhang,
  checkHang,
  computeGift,
  giftFlight,
  giftId,
  giftIndexOf,
  giftOfPass,
  giftOpenable,
  giftZone,
  hangSeconds,
  hangStyle,
  inHangArea,
  isSpecial,
  latestLanded,
  liveGifts,
  milestoneAt,
  nextSantaIn,
  openableGiftIds,
  rollOrnament,
  santaFlightSeconds,
  santaPass,
  starIsBright,
} from './treeDecor';
import { createTreeDecor } from './treeDecorPlay';

const send = (m: unknown) => parseClientMessage(JSON.stringify(m));
/** 시험에 쓰는 산타 번호 (요즘 날짜쯤의 서버 시각) */
const BASE = 5_900_000;

describe('산타가 지나가는 때 (서버 시각)', () => {
  it('서버 시각이 5분의 배수가 될 때마다 날기 시작한다', () => {
    const start = BASE * SANTA.interval;
    expect(santaPass(start)).toEqual({ index: BASE, progress: 0 });
    expect(santaPass(start + santaFlightSeconds() / 2)?.progress).toBeCloseTo(0.5, 5);
    expect(santaPass(start + santaFlightSeconds() + 1)).toBeNull();
    expect(santaPass(start - 1)).toBeNull();
    expect(nextSantaIn(start + 10)).toBeCloseTo(SANTA.interval - 10, 5);
  });
});

describe('산타가 떨어뜨리는 선물', () => {
  it('산타가 지나갈 때마다 선물 상자 하나: 그 비행 중에 떨어지기 시작해 약 4초 뒤 바닥에 닿는다', () => {
    for (let k = BASE; k < BASE + 60; k++) {
      const gift = giftOfPass(k);
      expect(gift.id).toBe(giftId(k));
      expect(giftIndexOf(gift.id)).toBe(k);
      const start = k * SANTA.interval;
      expect(gift.dropAt).toBeGreaterThan(start);
      expect(gift.dropAt).toBeLessThan(start + santaFlightSeconds());
      expect(gift.landAt - gift.dropAt).toBeCloseTo(GIFT.popSeconds + GIFT.fallSeconds, 5);
      expect(GIFT.fallSeconds).toBe(4);
      // 한 번 지나가는 동안 새로 생기는 선물은 꼭 하나
      const before = liveGifts(start - 1).map((g) => g.id);
      const after = liveGifts(gift.landAt + 1).map((g) => g.id);
      expect(after.filter((id) => !before.includes(id))).toEqual([gift.id]);
    }
  });

  it('떨어질 자리는 걸을 수 있는 바닥 안이고 장애물·링크·회전목마 위가 아니다', () => {
    for (let k = BASE; k < BASE + 600; k++) {
      const { x, y } = giftOfPass(k);
      expect(x).toBeGreaterThanOrEqual(WALK_AREA.x + GIFT.edgeMargin);
      expect(x).toBeLessThanOrEqual(WALK_AREA.x + WALK_AREA.w - GIFT.edgeMargin);
      expect(y).toBeGreaterThanOrEqual(WALK_AREA.y + GIFT.edgeMargin);
      expect(y).toBeLessThanOrEqual(WALK_AREA.y + WALK_AREA.h - GIFT.edgeMargin);
      for (const o of OBSTACLES) {
        const inside = x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
        expect(inside, `${o.id}에 떨어짐 (${x}, ${y})`).toBe(false);
      }
      expect(canLandAt(x, y)).toBe(true);
      // 트리 뒤에 가려지는 자리에도 떨어지지 않는다
      const behindTree = Math.abs(x - TREE_X) <= TREE.baseHalfWidth && y < TREE_FOOT_Y;
      expect(behindTree, `트리 뒤 (${x}, ${y})`).toBe(false);
    }
    // 세 구역 모두 떨어질 자리가 넉넉하다 (한 줄에 몰리지 않는다)
    for (let z = 0; z < 3; z++) {
      const ys = new Set(Array.from({ length: 100 }, (_, i) => giftOfPass(BASE + z + i * 3).y));
      expect(ys.size).toBeGreaterThan(3);
    }
    const rink = OBSTACLES.find((o) => o.id === 'rink')!;
    const carousel = OBSTACLES.find((o) => o.id === 'carousel')!;
    expect(canLandAt(rink.x + rink.w / 2, rink.y + rink.h / 2)).toBe(false);
    expect(canLandAt(carousel.x + carousel.w / 2, carousel.y + carousel.h / 2)).toBe(false);
    expect(canLandAt(TREE_X, TREE_FOOT_Y - 4)).toBe(false);
    expect(canLandAt(TREE_X, WALK_AREA.y - 10)).toBe(false);
  });

  it('매번 다른 구역에 떨어진다 (광장 → 회전목마 → 스케이트장)', () => {
    for (let k = BASE; k < BASE + 90; k++) {
      expect(giftZone(k)).not.toBe(giftZone(k + 1));
      expect(inZone(giftZone(k), giftOfPass(k).x)).toBe(true);
    }
    const seen = new Set([0, 1, 2].map((i) => giftZone(BASE + i)));
    expect(seen.size).toBe(Object.keys(ZONE_BOUNDS).length);
  });

  it('같은 서버 시각·같은 시드면 어느 화면에서 계산해도 같은 자리·같은 때·같은 색이다', () => {
    for (let k = BASE; k < BASE + 30; k++) {
      expect(computeGift(k)).toEqual(computeGift(k));
      expect(giftOfPass(k)).toEqual(computeGift(k));
    }
    const now = (BASE + 7) * SANTA.interval + 123;
    expect(liveGifts(now)).toEqual(liveGifts(now));
    // 번호가 다르면 자리도 다르다
    expect(new Set(Array.from({ length: 30 }, (_, i) => `${giftOfPass(BASE + i).x},${giftOfPass(BASE + i).y}`)).size).toBeGreaterThan(25);
  });

  it('바닥에는 최대 3개: 더 떨어지면 가장 오래된 상자가 사라진다', () => {
    for (let t = BASE * SANTA.interval; t < (BASE + 12) * SANTA.interval; t += 7.3) {
      const landed = liveGifts(t).filter((g) => g.landAt <= t);
      expect(landed.length).toBeLessThanOrEqual(GIFT.maxOnGround);
      expect(landed.length).toBe(3);
    }
    const next = giftOfPass(BASE + 3);
    expect(liveGifts(next.landAt - 0.1).map((g) => g.id)).toEqual([giftId(BASE), giftId(BASE + 1), giftId(BASE + 2), next.id]);
    expect(liveGifts(next.landAt + 0.1).map((g) => g.id)).toEqual([giftId(BASE + 1), giftId(BASE + 2), next.id]);
    // 열린 상자는 빠진다
    expect(liveGifts(next.landAt + 0.1, new Set([giftId(BASE + 2)])).map((g) => g.id)).toEqual([giftId(BASE + 1), next.id]);
    expect(openableGiftIds(next.landAt + 0.1).sort()).toEqual([giftId(BASE + 1), giftId(BASE + 2), next.id].sort());
  });

  it('썰매 자루에서 튀어나와 낙하산으로 좌우로 흔들리며 내려와 정해진 자리에 닿는다', () => {
    const gift = giftOfPass(BASE);
    const start = giftFlight(gift, 0);
    expect(start.chute).toBe(false);
    expect(start.x).toBe(gift.x);
    expect(giftFlight(gift, GIFT.popSeconds / 2).y).toBeLessThan(start.y);
    let swayed = 0;
    let lastY = -Infinity;
    for (let t = GIFT.popSeconds; t <= GIFT.popSeconds + GIFT.fallSeconds; t += 0.1) {
      const p = giftFlight(gift, t);
      expect(p.chute).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(lastY);
      lastY = p.y;
      swayed = Math.max(swayed, Math.abs(p.x - gift.x));
    }
    expect(swayed).toBeGreaterThan(2);
    const end = giftFlight(gift, GIFT.popSeconds + GIFT.fallSeconds);
    expect(end.x).toBeCloseTo(gift.x, 5);
    expect(end.y).toBeCloseTo(gift.y, 5);
    expect(end.progress).toBeCloseTo(1, 5);
  });
});

describe('상자 열기 (서버 검사)', () => {
  const gift = giftOfPass(BASE);
  const nowMs = (gift.landAt + 5) * 1000;
  const near = { x: gift.x + 6, y: gift.y };

  it('동시에 열어도 한 명만: 먼저 온 사람이 열면 줄이 생기고, 늦은 사람은 거절된다', () => {
    let row: OrnamentRow | null = null;
    const tryOpen = (nick: string): boolean => {
      if (!canOpenGift(gift.id, nowMs, near, row)) return false;
      row = { id: gift.id, kind: rollOrnament(0.5, 0.5), x: null, y: null, by: nick, at: nowMs };
      return true;
    };
    expect(tryOpen('산타')).toBe(true);
    expect(tryOpen('루돌프')).toBe(false);
    expect(tryOpen('산타')).toBe(false);
    expect((row as OrnamentRow | null)?.by).toBe('산타');
  });

  it('바닥에 닿기 전, 사라진 뒤, 멀리서는 열 수 없다', () => {
    expect(canOpenGift(gift.id, (gift.landAt - 1) * 1000, near, null)).toBe(false);
    expect(giftOpenable(gift.id, gift.landAt + 1)).toBe(true);
    const later = giftOfPass(BASE + GIFT.maxOnGround).landAt + 1;
    expect(giftOpenable(gift.id, later)).toBe(false);
    expect(canOpenGift(gift.id, later * 1000, near, null)).toBe(false);
    expect(canOpenGift(gift.id, nowMs, { x: gift.x + GIFT.serverReach + 5, y: gift.y }, null)).toBe(false);
    expect(canOpenGift('없는상자', nowMs, near, null)).toBe(false);
    expect(latestLanded(gift.landAt + 1)).toBe(BASE);
  });

  it('개발용 상자는 개발 서버에서만 열린다', () => {
    const debug = { at: Math.round(nowMs) - 3000, x: 700, y: 240, color: 2 };
    const id = debugGiftId(debug);
    expect(parseDebugGift(id)).toEqual({ ...debug, id });
    expect(canOpenGift(id, nowMs, { x: 705, y: 240 }, null, false)).toBe(false);
    expect(canOpenGift(id, nowMs, { x: 705, y: 240 }, null, true)).toBe(true);
    expect(parseDebugGift('d1x2')).toBeNull();
  });

  it('메시지 검사: open·hang·unhang', () => {
    expect(send({ t: 'open', id: gift.id })).toEqual({ t: 'open', id: gift.id });
    expect(send({ t: 'open' })).toBeNull();
    expect(send({ t: 'hang', id: gift.id, x: 720, y: 150 })).toEqual({ t: 'hang', id: gift.id, x: 720, y: 150 });
    expect(send({ t: 'hang', id: gift.id, x: 720.5, y: 150 })).toBeNull();
    expect(send({ t: 'hang', id: gift.id, x: 99999, y: 150 })).toBeNull();
    expect(send({ t: 'unhang', id: gift.id })).toEqual({ t: 'unhang', id: gift.id });
    // 손에 든 것으로 장식도 보낼 수 있다
    expect(validHeld('star')).toBe(true);
    expect(validHeld('carrot')).toBe(true);
    expect(validHeld('bomb')).toBe(false);
    expect(send({ t: 'state', state: { kind: 'walk' }, hat: 'on', hold: 'ballRed' })).toMatchObject({ hold: 'ballRed' });
  });
});

describe('장식', () => {
  it('14가지: 보통 11가지(85%)와 특별 3가지(15%), 모두 4~7px 그림', () => {
    expect(ORNAMENT_KINDS).toHaveLength(14);
    expect(ORNAMENT_KINDS.filter(isSpecial)).toEqual(['glowBall', 'star', 'musicBox']);
    for (const kind of ORNAMENT_KINDS) {
      const rows = ORNAMENT_SPRITES[kind];
      expect(rows.length, kind).toBeGreaterThanOrEqual(4);
      expect(rows.length, kind).toBeLessThanOrEqual(7);
      expect(rows[0].length, kind).toBeGreaterThanOrEqual(4);
      expect(rows[0].length, kind).toBeLessThanOrEqual(7);
      for (const row of rows) expect(row.length, kind).toBe(rows[0].length);
      expect(ORNAMENT_NAMES[kind].length).toBeGreaterThan(0);
    }
  });

  it('상자에서 무작위로: 15%는 특별, 나머지는 보통 가운데 고르게', () => {
    expect(ORNAMENT.specialChance).toBe(0.15);
    expect(isSpecial(rollOrnament(0.1499, 0.5))).toBe(true);
    expect(isSpecial(rollOrnament(0.15, 0.5))).toBe(false);
    const common = new Set<OrnamentKind>();
    const special = new Set<OrnamentKind>();
    for (let p = 0; p < 1; p += 0.01) {
      common.add(rollOrnament(0.9, p));
      special.add(rollOrnament(0.01, p));
    }
    expect(common.size).toBe(11);
    expect(special.size).toBe(3);
    expect(isSpecial(rollOrnament(0.9, 0.9999))).toBe(false);
  });
});

describe('트리에 달기', () => {
  const lowY = TREE.foliageBottomY - 10;

  it('달 수 있는 자리: 잎 실루엣에서 2px 안쪽이고, 다른 장식과 겹치지 않는다', () => {
    expect(inHangArea(TREE_X, 120)).toBe(true);
    expect(checkHang(TREE_X, 120, [])).toBe('ok');
    // 잎 밖: 옆으로 벗어남, 잎 아래, 별 바로 밑
    expect(checkHang(TREE_X + TREE.baseHalfWidth + 5, lowY, [])).toBe('outside');
    expect(checkHang(TREE_X, TREE.foliageBottomY + 6, [])).toBe('outside');
    expect(checkHang(TREE_X, TREE.tipY + 1, [])).toBe('outside');
    expect(checkHang(TREE_X + 60, 60, [])).toBe('outside');
    // 테두리에서 2px 안쪽까지만
    let edge = TREE_X;
    while (inHangArea(edge + 1, lowY)) edge++;
    expect(ORNAMENT.inset).toBe(2);
    expect(inHangArea(edge + ORNAMENT.inset + 1, lowY)).toBe(false);
    // 겹침
    const others = [{ x: TREE_X, y: 120 }];
    expect(checkHang(TREE_X + 2, 121, others)).toBe('overlap');
    expect(checkHang(TREE_X + ORNAMENT.minGap, 120, others)).toBe('ok');
  });

  it('최대 150개: 꽉 차면 더 달 수 없다', () => {
    expect(ORNAMENT.max).toBe(150);
    const full = Array.from({ length: ORNAMENT.max }, (_, i) => ({ x: 2000 + i * 10, y: 0 }));
    expect(checkHang(TREE_X, 120, full)).toBe('full');
    expect(checkHang(TREE_X, 120, full.slice(1))).toBe('ok');
  });

  it('높이에 따라 다는 방식이 다르다: 손 닿는 높이는 까치발, 그 위는 사다리, 별 바로 아래는 던지기', () => {
    expect(ORNAMENT.reachHeight).toBe(40);
    expect(hangStyle(TREE_FOOT_Y - 30)).toBe('tiptoe');
    expect(hangStyle(TREE_FOOT_Y - 40)).toBe('tiptoe');
    expect(hangStyle(TREE_FOOT_Y - 41)).toBe('ladder');
    expect(hangStyle(100)).toBe('ladder');
    expect(hangStyle(TREE.tipY + ORNAMENT.tossBelowTip)).toBe('ladder');
    expect(hangStyle(TREE.tipY + ORNAMENT.tossBelowTip - 1)).toBe('toss');
    // 걸리는 시간: 까치발 0.6초, 사다리는 높을수록 오래 (최대 약 3초)
    expect(hangSeconds(TREE_FOOT_Y - 30)).toBe(0.6);
    expect(hangSeconds(120)).toBeGreaterThan(hangSeconds(170));
    expect(hangSeconds(TREE.tipY + ORNAMENT.tossBelowTip)).toBeCloseTo(3, 5);
    for (let y = TREE.tipY; y < TREE_FOOT_Y; y++) expect(hangSeconds(y)).toBeLessThanOrEqual(3);
  });

  it('장식 수가 25, 50, 100개에 닿을 때마다 한 번씩 축하한다', () => {
    expect(milestoneAt(24, 0)).toBeNull();
    expect(milestoneAt(25, 0)).toBe(25);
    // 뗐다 다시 달아 25개가 또 돼도 다시 축하하지 않는다
    expect(milestoneAt(25, 25)).toBeNull();
    expect(milestoneAt(49, 25)).toBeNull();
    expect(milestoneAt(50, 25)).toBe(50);
    expect(milestoneAt(100, 50)).toBe(100);
    expect(milestoneAt(150, 100)).toBeNull();
    const hits: number[] = [];
    let celebrated = 0;
    for (let count = 1; count <= ORNAMENT.max; count++) {
      const m = milestoneAt(count, celebrated);
      if (m !== null) {
        hits.push(m);
        celebrated = m;
      }
    }
    expect(hits).toEqual([25, 50, 100]);
    // 100개부터는 별이 항상 조금 더 밝다
    expect(starIsBright(99)).toBe(false);
    expect(starIsBright(100)).toBe(true);
  });

  it('내가 단 장식만, 1분 안에만 다시 뗄 수 있다', () => {
    const o = { by: '산타', at: 1_000_000 };
    expect(canUnhang(o, '산타', o.at + 59_000)).toBe(true);
    expect(canUnhang(o, '산타', o.at + 61_000)).toBe(false);
    expect(canUnhang(o, '루돌프', o.at + 1000)).toBe(false);
    const row: OrnamentRow = { id: 's1', kind: 'bell', x: TREE_X, y: 120, by: '산타', at: o.at };
    expect(canUnhangOrnament(row, '산타', o.at + 30_000)).toBe(true);
    expect(canUnhangOrnament(row, '루돌프', o.at + 30_000)).toBe(false);
    expect(canUnhangOrnament(row, '산타', o.at + 90_000)).toBe(false);
    // 아직 달지 않은 것, 없는 것은 뗄 수 없다
    expect(canUnhangOrnament({ ...row, x: null, y: null }, '산타', o.at + 1000)).toBe(false);
    expect(canUnhangOrnament(null, '산타', o.at + 1000)).toBe(false);
  });

  it('서버 검사: 상자에서 나온 장식만, 연 사람만, 잎 영역 안에 겹치지 않게 단다', () => {
    const row: OrnamentRow = { id: 's1', kind: 'bell', x: null, y: null, by: '산타', at: 0 };
    expect(canHangOrnament(row, '산타', TREE_X, 120, [])).toBe(true);
    // 열지 않은 장식 (줄이 없다)
    expect(canHangOrnament(null, '산타', TREE_X, 120, [])).toBe(false);
    // 남이 연 장식, 이미 달린 장식
    expect(canHangOrnament(row, '루돌프', TREE_X, 120, [])).toBe(false);
    expect(canHangOrnament({ ...row, x: TREE_X, y: 100 }, '산타', TREE_X, 120, [])).toBe(false);
    // 잎 밖, 겹침, 꽉 참
    expect(canHangOrnament(row, '산타', TREE_X + 80, 60, [])).toBe(false);
    expect(canHangOrnament(row, '산타', TREE_X, 120, [{ x: TREE_X + 1, y: 120 }])).toBe(false);
    expect(canHangOrnament(row, '산타', TREE_X, 120, Array.from({ length: ORNAMENT.max }, (_, i) => ({ x: 3000 + i * 10, y: 0 })))).toBe(false);
  });
});

// ───────────── 조작 ─────────────

const DT = 1 / 60;
const NONE: InputActions = { tap: false, hold: false, cancel: false, up: false, debugFriend: false };
const SPACE: InputActions = { ...NONE, tap: true };

function setup(options: { online?: boolean; random?: () => number } = {}) {
  const ch = createCharacter(TREE_X, TREE_FOOT_Y + 6);
  const sent: string[] = [];
  const dropped: { item: OrnamentKind; tag: string | null }[] = [];
  let celebrations = 0;
  let bright = false;
  const tree = {
    footY: TREE_FOOT_Y,
    lights: [],
    levelOf: () => 0,
    celebrate: () => celebrations++,
    setBright: (on: boolean) => (bright = on),
    update: () => {},
    draw: () => {},
  } as unknown as TreeProp;
  let now = (giftOfPass(BASE).landAt + 20) * 1000;
  const decor = createTreeDecor(ch, {
    tree,
    now: () => now,
    online: () => options.online ?? false,
    me: () => '산타',
    myId: () => 'me1',
    send: {
      open: (id) => sent.push(`open ${id}`),
      hang: (id, x, y) => sent.push(`hang ${id} ${x} ${y}`),
      unhang: (id) => sent.push(`unhang ${id}`),
      debugGift: () => {},
    },
    hands: {
      putDown: () => {
        ch.heldTag = null;
        ch.holding.set(null);
      },
      dropAt: (item, _x, _y, tag) => dropped.push({ item, tag }),
      has: () => false,
    },
    random: options.random ?? (() => 0.5),
  });
  const run = (seconds: number, dir = { x: 0, y: 0 }, actions = NONE) => {
    for (let t = 0; t < seconds; t += DT) {
      now += DT * 1000;
      decor.update(DT, dir, actions, 0);
    }
  };
  /** 바닥의 선물 상자 곁으로 간다 */
  const goToGift = () => {
    run(0.3);
    const gift = giftOfPass(BASE);
    ch.x = gift.x - 6;
    ch.y = gift.y;
    return gift;
  };
  return { ch, decor, sent, dropped, run, goToGift, celebrations: () => celebrations, bright: () => bright, advance: (ms: number) => (now += ms) };
}

describe('트리 꾸미기 조작', () => {
  it('바닥의 선물 상자는 가까이 가면 열 수 있고, 열면 1.5초 뒤 장식이 손에 들어온다', () => {
    const { ch, decor, run, goToGift } = setup();
    const gift = goToGift();
    const near = decor.nearestGift();
    expect(near?.id).toBe(gift.id);
    expect(near!.distance).toBeLessThanOrEqual(GIFT.openRadius);
    expect(decor.open(gift.id)).toBe(true);
    expect(decor.busy).toBe(true);
    run(GIFT.openSeconds - 0.2);
    expect(ch.holding.get()).toBeNull();
    run(0.3);
    expect(decor.busy).toBe(false);
    expect(ORNAMENT_KINDS).toContain(ch.holding.get());
    expect(ch.heldTag).toBe(gift.id);
    // 장식 이름이 머리 위에 2초
    expect(decor.labels().map((l) => l.text)).toEqual([ORNAMENT_NAMES[ch.holding.get() as OrnamentKind]]);
    run(GIFT.nameSeconds + 0.1);
    expect(decor.labels()).toHaveLength(0);
    // 열린 상자는 다시 열 수 없다
    run(GIFT.emptySeconds + 0.5);
    expect(decor.nearestGift()?.id).not.toBe(gift.id);
  });

  it('서버에 붙어 있으면 서버가 정한다: 내가 받으면 그 장식이, 늦으면 머리 위에 …', () => {
    const won = setup({ online: true });
    const gift = won.goToGift();
    won.decor.open(gift.id);
    expect(won.sent).toEqual([`open ${gift.id}`]);
    won.run(0.3);
    won.decor.onOpened(gift.id, 'me1', 'star');
    won.run(GIFT.openSeconds);
    expect(won.ch.holding.get()).toBe('star');

    const late = setup({ online: true });
    late.goToGift();
    late.decor.open(gift.id);
    late.run(0.3);
    late.decor.onOpenDenied(gift.id);
    late.decor.onOpened(gift.id, 'other', 'bell');
    expect(late.decor.busy).toBe(false);
    expect(late.decor.labels().map((l) => l.text)).toEqual(['…']);
    late.run(GIFT.openSeconds + 1);
    expect(late.ch.holding.get()).toBeNull();
  });

  it('뭔가 들고 있었으면 발밑에 내려놓고 장식을 받는다', () => {
    const { ch, decor, run, goToGift } = setup();
    const gift = goToGift();
    ch.holding.set('carrot');
    decor.open(gift.id);
    run(GIFT.openSeconds + 0.1);
    expect(ORNAMENT_KINDS).toContain(ch.holding.get());
  });

  it('장식을 들고 화단 앞에서 달 자리를 고른다: 방향키로 옮기고, 스페이스로 달고, Esc로 취소', () => {
    const { ch, decor, run } = setup();
    // 장식이 없으면 달 수 없다
    expect(decor.hangDistance()).toBe(Infinity);
    expect(decor.startPick()).toBe(false);
    ch.heldTag = 's1';
    ch.holding.set('ballGold');
    expect(decor.hangDistance()).toBeLessThanOrEqual(TREE_DECOR.hangRadius);
    expect(decor.startPick()).toBe(true);
    expect(decor.phase).toBe('pick');
    // 고르는 동안 카메라는 트리에 고정
    expect(decor.cameraFocus).toBe(TREE_X);
    // Esc로 취소
    run(DT, { x: 0, y: 0 }, { ...NONE, cancel: true });
    expect(decor.phase).toBe('idle');
    expect(ch.holding.get()).toBe('ballGold');
    // 다시 골라, 손이 닿는 높이에 단다 (까치발 0.6초)
    decor.startPick();
    run(DT, { x: 0, y: 0 }, SPACE);
    expect(decor.phase).not.toBe('pick');
    run(2);
    expect(decor.count).toBe(1);
    expect(ch.holding.get()).toBeNull();
    expect(decor.busy).toBe(false);
  });

  it('잎 밖에서는 스페이스를 눌러도 달리지 않는다', () => {
    const { ch, decor, run } = setup();
    ch.heldTag = 's1';
    ch.holding.set('bell');
    decor.startPick();
    // 미리보기를 잎 아래로 내린다
    run(1, { x: 0, y: 1 });
    run(DT, { x: 0, y: 0 }, SPACE);
    expect(decor.phase).toBe('pick');
    expect(decor.hint(false)?.text).toContain('잎');
    expect(decor.count).toBe(0);
  });

  it('높은 곳은 사다리로: 더 오래 걸리고, 달린 뒤 내려온다', () => {
    const { ch, decor, run } = setup();
    ch.heldTag = 's1';
    ch.holding.set('cane');
    decor.startPick();
    run(1.2, { x: 0, y: -1 });
    run(DT, { x: 0, y: 0 }, SPACE);
    let sawLadder = false;
    let maxLift = 0;
    for (let i = 0; i < 400 && decor.busy; i++) {
      run(DT);
      if (decor.phase === 'ladder') {
        sawLadder = true;
        maxLift = Math.max(maxLift, decor.pose()?.lift ?? 0);
      }
    }
    expect(sawLadder).toBe(true);
    expect(maxLift).toBeGreaterThan(20);
    expect(decor.count).toBe(1);
    expect(decor.busy).toBe(false);
  });

  it('별 바로 아래는 던져서: 30% 확률로 튕겨 떨어져 바닥에서 다시 줍는다', () => {
    expect(ORNAMENT.tossMissChance).toBe(0.3);
    const toss = (random: () => number) => {
      const s = setup({ random });
      s.ch.heldTag = 's1';
      s.ch.holding.set('star');
      s.decor.startPick({ x: TREE_X, y: TREE.tipY + 12 });
      s.run(DT, { x: 0, y: 0 }, SPACE);
      s.run(4);
      return s;
    };
    const hit = toss(() => 0.9);
    expect(hit.decor.count).toBe(1);
    expect(hit.dropped).toHaveLength(0);
    const miss = toss(() => 0.1);
    expect(miss.decor.count).toBe(0);
    expect(miss.dropped).toEqual([{ item: 'star', tag: 's1' }]);
    expect(miss.ch.holding.get()).toBeNull();
  });

  it('서버가 달 수 없다고 하면 장식이 손으로 돌아오고, 남이 단 장식은 바로 보인다', () => {
    const { ch, decor, run, sent } = setup({ online: true });
    ch.heldTag = 's9';
    ch.holding.set('bow');
    decor.startPick();
    run(DT, { x: 0, y: 0 }, SPACE);
    run(2);
    expect(sent.some((m) => m.startsWith('hang s9 '))).toBe(true);
    expect(decor.count).toBe(1);
    decor.onHangDenied('s9');
    expect(decor.count).toBe(0);
    expect(ch.holding.get()).toBe('bow');
    expect(ch.heldTag).toBe('s9');
    decor.onHung({ id: 's3', kind: 'bell', x: TREE_X, y: 100, by: '루돌프', at: 0 });
    expect(decor.count).toBe(1);
  });

  it('내가 방금 단 장식에 미리보기를 대고 스페이스를 누르면 뗀다 (1분 안에만)', () => {
    const { ch, decor, run, advance } = setup();
    ch.heldTag = 's1';
    ch.holding.set('bell');
    decor.startPick();
    run(DT, { x: 0, y: 0 }, SPACE);
    run(2);
    expect(decor.count).toBe(1);
    // 다른 장식을 들고 같은 자리에 갖다 댄다
    ch.x = TREE_X;
    ch.y = TREE_FOOT_Y + 6;
    ch.heldTag = 's2';
    ch.holding.set('cane');
    decor.startPick();
    run(DT);
    expect(decor.hint(false)?.text).toContain('떼기');
    run(DT, { x: 0, y: 0 }, SPACE);
    expect(decor.count).toBe(0);
    expect(ch.holding.get()).toBe('bell');
    // 1분이 지나면 못 뗀다
    decor.startPick();
    run(DT, { x: 0, y: 0 }, SPACE);
    run(2);
    expect(decor.count).toBe(1);
    advance(61_000);
    ch.x = TREE_X;
    ch.y = TREE_FOOT_Y + 6;
    ch.heldTag = 's2';
    ch.holding.set('cane');
    decor.startPick();
    run(DT);
    expect(decor.hint(false)?.text).not.toContain('떼기');
  });

  it('꽉 찬 트리 앞에서는 달 수 없다 (장식은 손에 남는다)', () => {
    const { ch, decor } = setup();
    decor.setTree(Array.from({ length: ORNAMENT.max }, (_, i) => ({ id: `x${i}`, kind: 'bell' as const, x: 3000 + i * 10, y: 0, by: '루돌프', at: 0 })));
    ch.heldTag = 's1';
    ch.holding.set('bell');
    expect(decor.hangDistance()).toBe(Infinity);
    expect(decor.startPick()).toBe(false);
    expect(ch.holding.get()).toBe('bell');
  });

  it('25번째 장식이 달리면 축하하고, 100개부터 별이 밝아진다', () => {
    const { decor, celebrations, bright } = setup({ online: true });
    decor.onHung({ id: 'a', kind: 'bell', x: TREE_X, y: 100, by: '루돌프', at: 0 });
    expect(celebrations()).toBe(0);
    decor.onHung({ id: 'b', kind: 'bell', x: TREE_X, y: 110, by: '루돌프', at: 0 }, 25);
    expect(celebrations()).toBe(1);
    expect(bright()).toBe(false);
    decor.setTree(Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, kind: 'bell' as const, x: 3000 + i * 10, y: 0, by: '루돌프', at: 0 })));
    expect(bright()).toBe(true);
  });
});
