import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { HAT_CHASE as C, SKATE } from '../constants';
import {
  allowBeg,
  applyOwnHat,
  hatOf,
  hatStack,
  hatsOnLeave,
  newSession,
  tryCatchHat,
  tryFallHat,
  tryGiveHat,
  tryHomeHat,
  tryPickHat,
  trySnowmanHat,
  wireHatOf,
  type Session,
} from '../shared/plazaCore';
import { parseClientMessage, type WirePlayer, type WireState } from '../shared/protocol';
import { createSkate, stepSkate, speedOf, type SkateEvent } from '../zones/skating';
import { begStage, canCatch, chaseSpeedFactor, createHatChase, homeDue, nextBegCount, spotFromWire, stackOwners, topOwner, type ChaseBody } from './hatChase';
import { createHat } from './sneeze';

function player(id: string, x = 700, y = 240, state: WireState = { kind: 'walk' }): WirePlayer {
  return { id, name: id, scarf: 1, x, y, f: 1, state, hat: 'on' };
}

function join(id: string, x = 700, y = 240, state: WireState = { kind: 'walk' }): Session {
  return { ...newSession(), player: player(id, x, y, state) };
}

/** 주인 모자가 (x, y) 바닥에 떨어진 상태 */
function dropped(owner: Session, x: number, y: number): void {
  applyOwnHat([owner], owner, { x, y });
}

describe('모자 자리 (서버)', () => {
  it('바닥에 떨어진 모자를 둘이 동시에 주우면 먼저 온 한 명만', () => {
    const owner = join('주인', 600, 240);
    const a = join('가', 700, 240);
    const b = join('나', 705, 240);
    const all = [owner, a, b];
    dropped(owner, 702, 240);
    expect(hatOf(owner)).toEqual({ k: 'ground', x: 702, y: 240 });
    expect(tryPickHat(all, a, '주인', 1000)).toBe(true);
    expect(tryPickHat(all, b, '주인', 1001)).toBe(false);
    expect(hatOf(owner)).toEqual({ k: 'worn', by: '가', at: 1000 });
    // 주인이 같은 순간 '썼다'고 해도 이미 남이 쓰고 있으면 받지 않는다
    expect(applyOwnHat(all, owner, 'on')).toBe(false);
    expect(hatOf(owner).k).toBe('worn');
    expect(wireHatOf(hatOf(owner))).toBe('taken');
  });

  it('멀리서는 주울 수 없고, 바닥에 없는 모자도 주울 수 없다', () => {
    const owner = join('주인');
    const far = join('멀리', 200, 240);
    expect(tryPickHat([owner, far], far, '주인', 1)).toBe(false);
    dropped(owner, 700, 240);
    expect(tryPickHat([owner, far], far, '주인', 1)).toBe(false);
    // 자기 모자는 'state'로 줍는다
    expect(tryPickHat([owner], owner, '주인', 1)).toBe(false);
    expect(applyOwnHat([owner], owner, 'on')).toBe(true);
    expect(hatOf(owner)).toEqual({ k: 'me' });
  });

  it('모자 탑: 한 머리에 최대 3개 (내 모자 포함), 대머리면 남의 모자가 바로 머리에', () => {
    const me = join('나', 700, 240);
    const others = ['가', '나2', '다'].map((id) => join(id, 600, 240));
    const all = [me, ...others];
    for (const o of others) dropped(o, 700, 240);
    expect(tryPickHat(all, me, '가', 1)).toBe(true);
    expect(tryPickHat(all, me, '나2', 2)).toBe(true);
    expect(hatStack(all, '나')).toEqual(['나', '가', '나2']);
    // 세 개가 꽉 찼다
    expect(tryPickHat(all, me, '다', 3)).toBe(false);
    // 내 모자가 날아가면 한 자리가 빈다 — 남의 모자가 바로 머리에 얹힌다
    dropped(me, 650, 240);
    expect(hatStack(all, '나')).toEqual(['가', '나2']);
    expect(tryPickHat(all, me, '다', 4)).toBe(true);
    expect(hatStack(all, '나')).toEqual(['가', '나2', '다']);
    // 이제 내 모자도 올릴 자리가 없다
    expect(applyOwnHat(all, me, 'on')).toBe(false);
  });

  it('남의 모자 하나당 걸음 -8%, 스케이트는 최대 속도 -8%', () => {
    expect(C.slowPerHat).toBe(0.08);
    expect(chaseSpeedFactor(0)).toBe(1);
    expect(chaseSpeedFactor(1)).toBeCloseTo(0.92, 5);
    expect(chaseSpeedFactor(2)).toBeCloseTo(0.84, 5);
    const top = (factor: number) => {
      // 벽에 닿기 전에 최대 속도에 이른다
      const s = createSkate(1020, 190);
      s.maxSpeedFactor = factor;
      const events: SkateEvent[] = [];
      for (let i = 0; i < 150; i++) stepSkate(s, 1 / 60, { x: 1, y: 0 }, events);
      return speedOf(s);
    };
    expect(top(1)).toBeCloseTo(SKATE.maxSpeed, 0);
    expect(top(chaseSpeedFactor(1))).toBeCloseTo(SKATE.maxSpeed * 0.92, 0);
  });

  it('잡기: 마지막 위치끼리 24px 안이어야 하고, 같은 사람은 3초에 한 번', () => {
    const owner = join('주인', 700, 240);
    const thief = join('도둑', 700, 240);
    const all = [owner, thief];
    dropped(owner, 700, 240);
    tryPickHat(all, thief, '주인', 0);
    // 멀리서는 안 된다
    owner.player!.x = 700 + C.serverCatchReach + 1;
    expect(tryCatchHat(all, owner, '도둑', 10_000)).toBe(false);
    // 통신 지연을 생각해 서버는 24px까지 받아 준다
    owner.player!.x = 700 + C.serverCatchReach;
    expect(tryCatchHat(all, owner, '도둑', 10_000)).toBe(true);
    expect(hatOf(owner)).toEqual({ k: 'me' });
    // 도둑이 바로 다시 주워 가도, 3초 안에는 또 잡을 수 없다
    dropped(owner, 700, 240);
    tryPickHat(all, thief, '주인', 10_500);
    expect(tryCatchHat(all, owner, '도둑', 12_000)).toBe(false);
    expect(tryCatchHat(all, owner, '도둑', 13_000)).toBe(true);
    // 화면에서 잡기는 12px까지 바짝 붙어야 한다
    expect(canCatch({ x: 0, y: 0, skating: false }, { x: 12, y: 0, kind: 'walk' }, 10)).toBe(true);
    expect(canCatch({ x: 0, y: 0, skating: false }, { x: 13, y: 0, kind: 'walk' }, 10)).toBe(false);
    expect(canCatch({ x: 0, y: 0, skating: false }, { x: 5, y: 0, kind: 'walk' }, 2)).toBe(false);
  });

  it('회전목마를 타고 있으면 못 잡고, 스케이트를 타고 있으면 나도 신어야 잡는다', () => {
    const owner = join('주인', 340, 200);
    const rider = join('탄사람', 340, 200);
    const all = [owner, rider];
    dropped(owner, 340, 200);
    tryPickHat(all, rider, '주인', 0);
    rider.player!.state = { kind: 'riding', mount: 0, slot: 0 };
    expect(tryCatchHat(all, owner, '탄사람', 10_000)).toBe(false);
    expect(canCatch({ x: 0, y: 0, skating: false }, { x: 1, y: 0, kind: 'riding' }, 10)).toBe(false);
    rider.player!.state = { kind: 'skating' };
    expect(tryCatchHat(all, owner, '탄사람', 10_000)).toBe(false);
    expect(canCatch({ x: 0, y: 0, skating: false }, { x: 1, y: 0, kind: 'skating' }, 10)).toBe(false);
    owner.player!.state = { kind: 'skating' };
    expect(tryCatchHat(all, owner, '탄사람', 10_000)).toBe(true);
    expect(canCatch({ x: 0, y: 0, skating: true }, { x: 1, y: 0, kind: 'skating' }, 10)).toBe(true);
  });

  it('돌려주기: 쓰고 있는 사람이 주인 곁에서만', () => {
    const owner = join('주인', 700, 240);
    const thief = join('도둑', 705, 240);
    const other = join('남', 705, 240);
    const all = [owner, thief, other];
    dropped(owner, 705, 240);
    tryPickHat(all, thief, '주인', 0);
    expect(tryGiveHat(all, other, '주인')).toBe(false);
    thief.player!.x = 700 + C.serverGiveReach + 5;
    expect(tryGiveHat(all, thief, '주인')).toBe(false);
    thief.player!.x = 720;
    expect(tryGiveHat(all, thief, '주인')).toBe(true);
    expect(hatOf(owner)).toEqual({ k: 'me' });
  });

  it('재채기하면 맨 위 모자부터 날아간다 (남의 모자도 다시 바닥으로)', () => {
    const me = join('나', 700, 240);
    const a = join('가', 600, 240);
    const b = join('다', 600, 240);
    const all = [me, a, b];
    dropped(a, 700, 240);
    dropped(b, 700, 240);
    tryPickHat(all, me, '가', 1);
    tryPickHat(all, me, '다', 2);
    const spots = new Map(all.map((s) => [s.player!.id, hatOf(s)]));
    expect(stackOwners(spots, '나')).toEqual(['나', '가', '다']);
    expect(topOwner(spots, '나')).toBe('다');
    // 서버: 맨 위 모자가 떨어졌다
    expect(tryFallHat(all, me, '다', 740, 236)).toBe(true);
    expect(hatOf(b)).toEqual({ k: 'ground', x: 740, y: 236 });
    // 남이 쓰고 있지 않은 모자는 떨어뜨릴 수 없다
    expect(tryFallHat(all, me, '다', 1, 1)).toBe(false);
    // 남의 모자가 없으면 내 모자가 맨 위
    expect(topOwner(new Map([['나', { k: 'me' as const }]]), '나')).toBe('나');
  });

  it('조르기: 1초에 한 번만 받고, 연달아 조를수록 세진다 (3번째 떼쓰기, 5번째 눈물)', () => {
    const s = join('주인');
    expect(allowBeg(s, 0)).toBe(true);
    expect(allowBeg(s, 900)).toBe(false);
    expect(allowBeg(s, 1000)).toBe(true);
    let n = 0;
    const stages: string[] = [];
    for (let i = 0; i < 5; i++) {
      n = nextBegCount(n, 0.5);
      stages.push(begStage(n));
    }
    expect(stages).toEqual(['stomp', 'stomp', 'tantrum', 'tantrum', 'tears']);
    // 쉬었다가 조르면 처음부터
    expect(nextBegCount(4, C.begComboGap + 0.1)).toBe(1);
  });

  it('주인이 나가면 모자도 사라지고, 쓰고 있던 사람이 나가면 그 자리에 떨어진다', () => {
    const owner1 = join('주인1', 600, 240);
    const owner2 = join('주인2', 600, 240);
    const thief = join('도둑', 800, 230);
    const all = [owner1, owner2, thief];
    dropped(owner1, 800, 230);
    dropped(owner2, 800, 230);
    tryPickHat(all, thief, '주인1', 1);
    tryPickHat(all, thief, '주인2', 2);
    const drops = hatsOnLeave(all, thief);
    expect(drops.map((d) => d.owner).sort()).toEqual(['주인1', '주인2']);
    for (const d of drops) {
      expect(d.spot.k).toBe('ground');
      if (d.spot.k === 'ground') {
        expect(Math.abs(d.spot.x - 800)).toBeLessThanOrEqual(C.leaveSpread);
        expect(d.spot.y).toBe(230);
      }
    }
    // 주인이 나가면 쓰고 있던 사람 머리에서 사라진다 (나간 사람은 목록에 없다)
    const owner3 = join('주인3', 600, 240);
    const wearer = join('쓴사람', 600, 240);
    dropped(owner3, 600, 240);
    tryPickHat([owner3, wearer], wearer, '주인3', 1);
    expect(hatStack([owner3, wearer], '쓴사람')).toEqual(['쓴사람', '주인3']);
    expect(hatStack([wearer], '쓴사람')).toEqual(['쓴사람']);
  });

  it('5분 넘게 쓰고 있으면 모자가 스스로 주인에게 돌아간다', () => {
    const owner = join('주인');
    const thief = join('도둑');
    dropped(owner, 700, 240);
    tryPickHat([owner, thief], thief, '주인', 1000);
    expect(homeDue(hatOf(owner), 1000 + C.returnAfter * 1000 - 1)).toBe(false);
    expect(tryHomeHat(owner, 1000 + C.returnAfter * 1000 - 1)).toBe(false);
    expect(homeDue(hatOf(owner), 1000 + C.returnAfter * 1000)).toBe(true);
    expect(tryHomeHat(owner, 1000 + C.returnAfter * 1000)).toBe(true);
    expect(hatOf(owner)).toEqual({ k: 'me' });
    expect(C.returnAfter).toBe(300);
  });

  it('남의 모자를 눈사람에게 씌우고, 눈사람에서 가져올 수 있다', () => {
    const owner = join('주인');
    const thief = join('도둑');
    const all = [owner, thief];
    dropped(owner, 700, 240);
    tryPickHat(all, thief, '주인', 1);
    expect(trySnowmanHat(all, thief, '주인')).toBe(true);
    expect(hatOf(owner)).toEqual({ k: 'snowman' });
    expect(tryPickHat(all, thief, '주인', 5, true)).toBe(true);
    expect(hatOf(owner).k).toBe('worn');
    // 주인은 눈사람에서 돌려받는다 ('on')
    trySnowmanHat(all, thief, '주인');
    expect(applyOwnHat(all, owner, 'on')).toBe(true);
  });

  it('메시지 검사', () => {
    const send = (m: unknown) => parseClientMessage(JSON.stringify(m));
    expect(send({ t: 'hatPick', owner: 'abc' })).toEqual({ t: 'hatPick', owner: 'abc' });
    expect(send({ t: 'hatPick', owner: 'abc', sm: 's-1' })).toEqual({ t: 'hatPick', owner: 'abc', sm: 's-1' });
    expect(send({ t: 'hatPick' })).toBeNull();
    expect(send({ t: 'hatBeg', n: 3 })).toEqual({ t: 'hatBeg', n: 3 });
    expect(send({ t: 'hatBeg', n: 0 })).toBeNull();
    expect(send({ t: 'hatGive', to: 'abc' })).toEqual({ t: 'hatGive', to: 'abc' });
    expect(send({ t: 'hatCatch', from: 'abc' })).toEqual({ t: 'hatCatch', from: 'abc' });
    expect(send({ t: 'hatFall', owner: 'abc', x: 10.4, y: 200 })).toEqual({ t: 'hatFall', owner: 'abc', x: 10, y: 200 });
    expect(send({ t: 'hatFall', owner: 'abc', x: 99999, y: 200 })).toBeNull();
    expect(send({ t: 'state', state: { kind: 'walk' }, hat: 'taken' })).toMatchObject({ hat: 'taken' });
    expect(spotFromWire({ x: 3, y: 4 }, undefined)).toEqual({ k: 'ground', x: 3, y: 4 });
    expect(spotFromWire('taken', { k: 'worn', by: 'a', at: 5 })).toEqual({ k: 'worn', by: 'a', at: 5 });
  });
});

describe('모자 쫓기 (화면)', () => {
  function setup() {
    const me = createCharacter(700, 240);
    const myHat = createHat(me, () => 0.5);
    const friendCh = createCharacter(600, 240);
    const friend: ChaseBody = { info: { id: 'f1', name: '친구', scarf: 3, state: { kind: 'walk' } }, ch: friendCh, hat: createHat(friendCh, () => 0.5) };
    const sent: string[] = [];
    let now = 1_000_000;
    const chase = createHatChase(me, myHat, {
      myId: () => 'me1',
      myScarf: () => 1,
      others: () => [friend],
      find: (id) => (id === 'f1' ? friend : undefined),
      now: () => now,
      online: () => true,
      skating: () => false,
      send: {
        pick: (o) => sent.push(`pick ${o}`),
        beg: (n) => sent.push(`beg ${n}`),
        give: (t) => sent.push(`give ${t}`),
        catch: (f) => sent.push(`catch ${f}`),
        fall: (o, x, y) => sent.push(`fall ${o} ${x} ${y}`),
        snowman: (o) => sent.push(`snowman ${o}`),
        home: () => sent.push('home'),
      },
    });
    chase.reset([{ id: 'f1', hl: { k: 'me' } }], 'me1');
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        now += 1000 / 60;
        chase.update(1 / 60);
      }
    };
    return { me, myHat, friend, chase, sent, run, advance: (ms: number) => (now += ms) };
  }

  it('친구 모자를 주우면 내 모자 위에 겹쳐 쓰고, 걸음이 느려진다', () => {
    const { me, friend, chase, sent, run } = setup();
    friend.hat.placeAt({ x: 705, y: 240 });
    chase.onOwnerState('f1', { x: 705, y: 240 });
    run(0.1);
    expect(chase.nearestGroundHat()?.owner).toBe('f1');
    expect(chase.pick('f1')).toBe(true);
    expect(sent).toEqual(['pick f1']);
    chase.onHat('f1', { k: 'worn', by: 'me1', at: 5 }, 'pick', 'me1');
    run(0.1);
    expect(me.extraHats).toEqual([{ owner: 'f1', color: 3 }]);
    expect(friend.hat.on).toBe(false);
    expect(chase.speedFactor()).toBeCloseTo(0.92, 5);
  });

  it('재채기하면 맨 위 남의 모자부터 날아간다', () => {
    const { me, myHat, chase, sent, run } = setup();
    chase.onHat('f1', { k: 'worn', by: 'me1', at: 5 }, 'pick', 'me1');
    run(0.1);
    expect(chase.dropTop('right', { kind: 'ground' })).toBe(true);
    expect(sent[0]).toMatch(/^fall f1 /);
    expect(myHat.on).toBe(true);
    run(0.1);
    expect(me.extraHats).toEqual([]);
    // 남의 모자가 없으면 false (내 모자는 부르는 쪽이 날린다)
    expect(chase.dropTop('right', { kind: 'ground' })).toBe(false);
  });

  it('내 모자를 쓴 사람 곁에서 조르고, 바짝 붙어 잡으면 모자가 날아와 머리에 착', () => {
    const { me, myHat, friend, chase, sent, run } = setup();
    myHat.takenAway();
    chase.onHat('me1', { k: 'worn', by: 'f1', at: 1_000_000 }, 'pick', 'f1');
    run(0.1);
    friend.ch.x = me.x + 30;
    friend.ch.y = me.y;
    expect(chase.myHatWearer()).toMatchObject({ id: 'f1', canCatch: false });
    expect(chase.beg()).toBe(true);
    expect(sent).toEqual(['beg 1']);
    expect(chase.busy).toBe(true);
    run(C.begSeconds + 0.1);
    expect(chase.busy).toBe(false);
    friend.ch.x = me.x + 8;
    expect(chase.myHatWearer()?.canCatch).toBe(true);
    chase.catch('f1');
    expect(sent.at(-1)).toBe('catch f1');
    chase.onHat('me1', { k: 'me' }, 'catch', 'f1');
    expect(chase.poseFor('f1')).toEqual({ pose: 'crouch', index: 0 });
    expect(chase.labels().map((l) => l.text)).toEqual(['잡았다!']);
    expect(myHat.on).toBe(false);
    run(C.flySeconds + 0.1);
    expect(myHat.on).toBe(true);
    expect(me.hat.get()).toBe('on');
  });

  it('5분 넘게 남이 쓰고 있으면 주인 화면이 돌려받기를 묻는다', () => {
    const { myHat, chase, sent, run, advance } = setup();
    myHat.takenAway();
    chase.onHat('me1', { k: 'worn', by: 'f1', at: 1_000_000 }, 'pick', 'f1');
    run(0.5);
    expect(sent).not.toContain('home');
    advance(C.returnAfter * 1000);
    run(0.1);
    expect(sent).toContain('home');
  });
});
