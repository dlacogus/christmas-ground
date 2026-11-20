import { describe, expect, it } from 'vitest';
import { createCold } from '../character/cold';
import { REINDEER_POSES } from '../character/reindeer';
import { CHARACTER, REINDEER_PALETTE, SLEIGH as K } from '../constants';
import { leaveSleigh, newSession, sleighOf, sleighRestOf, tryGrabSleigh, trySitSleigh, tryThrowSleigh, type Session } from '../shared/plazaCore';
import { parseClientMessage, type WirePlayer } from '../shared/protocol';
import { SLEIGH_HOME } from '../world';
import {
  SLEIGH_HOME_REST,
  followRope,
  hitchOf,
  isSharpTurn,
  nextRamp,
  restingPos,
  sleighFits,
  sleighSpeedFactor,
  stowHat,
  throwVictim,
  unstowHat,
} from './sleigh';

function player(id: string): WirePlayer {
  return { id, name: id, scarf: 0, x: 640, y: 250, f: 1, state: { kind: 'walk' }, hat: 'on' };
}
const joined = (id: string): Session => ({ ...newSession(), player: player(id) });
const REST = SLEIGH_HOME_REST;

describe('썰매 자리 (서버)', () => {
  it('끄는 사람은 한 명, 타는 사람은 두 명까지 (앞자리부터)', () => {
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(joined);
    const all = [a, b, c, d];
    expect(tryGrabSleigh(all, a, REST, 1000)).not.toBeNull();
    expect(tryGrabSleigh(all, b, REST, 1000)).toBeNull();
    expect(trySitSleigh(all, b, REST, 1000)?.seat).toBe(0);
    expect(trySitSleigh(all, c, REST, 1000)?.seat).toBe(1);
    expect(trySitSleigh(all, d, REST, 1000)).toBeNull();
    // 끄는 사람은 탈 수 없다
    expect(trySitSleigh(all, a, REST, 1000)).toBeNull();
    expect(sleighOf(all, REST)).toMatchObject({ p: 'a', s: ['b', 'c'], since: null });
  });

  it('동시에 같은 자리를 요청하면 먼저 처리된 한 명만', () => {
    const [a, b] = ['a', 'b'].map(joined);
    const results = [tryGrabSleigh([a, b], a, REST, 0), tryGrabSleigh([a, b], b, REST, 0)];
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const [c, d, e] = ['c', 'd', 'e'].map(joined);
    // 남은 한 자리를 둘이 동시에
    c.sleigh = 0;
    const seats = [trySitSleigh([c, d, e], d, REST, 0), trySitSleigh([c, d, e], e, REST, 0)];
    expect(seats.filter((r) => r !== null)).toHaveLength(1);
  });

  it('회전목마·스케이트 중에는 썰매를 못 잡는다', () => {
    const a = joined('a');
    a.player!.state = { kind: 'skating' };
    expect(tryGrabSleigh([a], a, REST, 0)).toBeNull();
    a.player!.state = { kind: 'riding', mount: 0, slot: 0 };
    expect(trySitSleigh([a], a, REST, 0)).toBeNull();
  });

  it('끄는 사람이 나가면 썰매는 마지막 자리에 멈추고, 탄 사람은 그대로 앉아 있다', () => {
    const [a, b] = ['a', 'b'].map(joined);
    tryGrabSleigh([a, b], a, REST, 0);
    trySitSleigh([a, b], b, REST, 0);
    a.sleighPos = { x: 800, y: 240, f: 0 };
    const rest = leaveSleigh([a, b], a, REST, 5000)!;
    expect(rest).toEqual({ x: 800, y: 240, f: 0, since: 5000 });
    expect(a.sleigh).toBeNull();
    // 탄 사람이 남아 있으니 아직 쓰는 중 (2분을 세지 않는다)
    expect(sleighOf([a, b], rest)).toMatchObject({ p: null, s: ['b', null], x: 800, since: null });
  });

  it('놓을 때 끄던 사람 화면이 보낸 멈출 자리에 선다', () => {
    const a = joined('a');
    tryGrabSleigh([a], a, REST, 0);
    const rest = leaveSleigh([a], a, REST, 9000, { x: 700, y: 230, f: 1 })!;
    expect(sleighOf([a], rest)).toMatchObject({ p: null, x: 700, y: 230, since: 9000 });
  });

  it('놓인 자리는 접속마다 적어 둔 것 가운데 가장 나중 것 (서버가 잠들었다 깨어나도)', () => {
    const [a, b] = ['a', 'b'].map(joined);
    a.sleighRest = { x: 600, y: 240, f: 1, since: 100 };
    b.sleighRest = { x: 650, y: 240, f: 0, since: 200 };
    expect(sleighRestOf([a, b]).x).toBe(650);
    expect(sleighRestOf([joined('c')])).toEqual(SLEIGH_HOME_REST);
  });

  it('급회전: 뒷자리부터 튕겨 나가고, 같은 사람은 10초에 한 번', () => {
    const [a, b, c] = ['a', 'b', 'c'].map(joined);
    const all = [a, b, c];
    tryGrabSleigh(all, a, REST, 0);
    trySitSleigh(all, b, REST, 0);
    trySitSleigh(all, c, REST, 0);
    // 앞자리(b)부터는 안 된다 — 뒷자리(c)가 먼저
    expect(tryThrowSleigh(all, a, 'b', 1000)).toBe(false);
    expect(tryThrowSleigh(all, a, 'c', 1000)).toBe(true);
    expect(c.sleigh).toBeNull();
    // 탄 사람은 끄는 사람만 떨어뜨릴 수 있다
    expect(tryThrowSleigh(all, b, 'b', 1000)).toBe(false);
    // c가 다시 타도 10초 안에는 또 튕겨 나가지 않는다 → 앞자리 b가 대신
    trySitSleigh(all, c, REST, 2000);
    expect(c.sleigh).toBe(1);
    expect(tryThrowSleigh(all, a, 'c', 3000)).toBe(false);
    expect(tryThrowSleigh(all, a, 'b', 3000)).toBe(true);
    expect(tryThrowSleigh(all, a, 'c', 1000 + K.throwCooldown * 1000)).toBe(true);
  });

  it('메시지 검사', () => {
    const send = (m: unknown) => parseClientMessage(JSON.stringify(m));
    expect(send({ t: 'sleighGrab' })).toEqual({ t: 'sleighGrab' });
    expect(send({ t: 'sleighSit' })).toEqual({ t: 'sleighSit' });
    expect(send({ t: 'sleighLeave' })).toEqual({ t: 'sleighLeave' });
    expect(send({ t: 'sleighLeave', x: 700, y: 230, f: 1 })).toEqual({ t: 'sleighLeave', x: 700, y: 230, f: 1 });
    expect(send({ t: 'sleighLeave', x: 99999, y: 230, f: 1 })).toBeNull();
    expect(send({ t: 'sleighThrow', who: 'b' })).toEqual({ t: 'sleighThrow', who: 'b' });
    expect(send({ t: 'sleighThrow' })).toBeNull();
    // 끄는 썰매 자리는 pos에 실려 온다
    expect(send({ t: 'pos', x: 700, y: 240, f: 1, m: 1, sx: 680, sy: 240, sf: 1 })).toMatchObject({ sx: 680, sy: 240, sf: 1 });
    expect(send({ t: 'state', state: { kind: 'inSleigh', seat: 1 }, hat: 'on' })).not.toBeNull();
    expect(send({ t: 'state', state: { kind: 'inSleigh', seat: 2 }, hat: 'on' })).toBeNull();
  });
});

describe('썰매 끌기 (규칙)', () => {
  it('처음엔 걸음보다 조금 느리고, 계속 누르면 최대 1.6배. 탄 사람 한 명당 -10%', () => {
    expect(sleighSpeedFactor(0, 0)).toBeLessThan(1);
    expect(sleighSpeedFactor(1, 0)).toBeCloseTo(1.6);
    expect(sleighSpeedFactor(1, 1)).toBeCloseTo(1.6 * 0.9);
    expect(sleighSpeedFactor(1, 2)).toBeCloseTo(1.6 * 0.8);
    expect(sleighSpeedFactor(0, 2)).toBeLessThan(sleighSpeedFactor(0, 1));
    let ramp = 0;
    for (let i = 0; i < 60; i++) ramp = nextRamp(ramp, true, K.rampSeconds / 60);
    expect(ramp).toBeCloseTo(1);
    expect(nextRamp(1, false, 0.1)).toBeLessThan(1);
  });

  it('최대 속도로 달리다 반대쪽을 누르면 급회전 (손을 떼고 바꾸는 짧은 틈은 봐준다)', () => {
    expect(isSharpTurn({ x: 1, y: 0 }, 10, { x: -1, y: 0 }, 10.1)).toBe(true);
    expect(isSharpTurn({ x: 1, y: 0 }, 10, { x: -1, y: 0 }, 10 + K.sharpTurnGrace + 0.05)).toBe(false);
    expect(isSharpTurn({ x: 1, y: 0 }, 10, { x: 0, y: 1 }, 10.1)).toBe(false);
    expect(isSharpTurn(null, 10, { x: -1, y: 0 }, 10.1)).toBe(false);
  });

  it('튕겨 나갈 자리: 뒷자리부터, 10초 안에 떨어진 사람은 건너뛴다', () => {
    expect(throwVictim(['a', 'b'], {}, 0)).toBe(1);
    expect(throwVictim(['a', null], {}, 0)).toBe(0);
    expect(throwVictim(['a', 'b'], { b: 0 }, 5000)).toBe(0);
    expect(throwVictim(['a', 'b'], { a: 0, b: 0 }, 5000)).toBeNull();
    expect(throwVictim(['a', 'b'], { b: 0 }, K.throwCooldown * 1000)).toBe(1);
  });

  it('밧줄: 멀어지면 썰매가 밧줄 길이만큼 뒤에서 따라온다', () => {
    const s = { x: SLEIGH_HOME.x, y: SLEIGH_HOME.y, f: 1 as 1 | -1, vx: 0, vy: 0 };
    const puller = { x: hitchOf(s).x + K.ropeLength + 6, y: s.y };
    followRope(s, puller, 1 / 60);
    expect(Math.hypot(puller.x - hitchOf(s).x, puller.y - hitchOf(s).y)).toBeCloseTo(K.ropeLength, 1);
    expect(s.vx).toBeGreaterThan(0);
  });

  it('오른쪽으로 가다가 왼쪽으로 가면 앞 끝을 축으로 빙 돌아서 끄는 사람 뒤를 따라온다', () => {
    const s = { x: SLEIGH_HOME.x, y: SLEIGH_HOME.y, f: 1 as 1 | -1, vx: 0, vy: 0 };
    const front = hitchOf(s);
    // 앞 끝 바로 앞에서는 그대로
    followRope(s, { x: front.x + 1, y: s.y }, 1 / 60);
    expect(s.f).toBe(1);
    // 앞 끝보다 뒤(왼쪽)로 가면 돌아선다: 앞 끝은 그 자리, 몸통은 오른쪽으로 넘어간다
    followRope(s, { x: front.x - 4, y: s.y }, 1 / 60);
    expect(s.f).toBe(-1);
    expect(hitchOf(s).x).toBeCloseTo(front.x);
    expect(s.x).toBeGreaterThan(front.x);
    // 계속 왼쪽으로 가면 왼쪽으로 끌려온다
    const x0 = s.x;
    followRope(s, { x: front.x - K.ropeLength - 10, y: s.y }, 1 / 60);
    expect(s.x).toBeLessThan(x0);
    expect(s.f).toBe(-1);
  });

  it('썰매는 스케이트 링크·회전목마 안으로 못 들어간다', () => {
    expect(sleighFits(SLEIGH_HOME.x, SLEIGH_HOME.y)).toBe(true);
    expect(sleighFits(1100, 200)).toBe(false);
    expect(sleighFits(340, 180)).toBe(false);
  });

  it('아무도 안 쓰면 2분 뒤 제자리로 천천히 돌아간다', () => {
    const rest = { x: 800, y: 230, f: 0 as const, since: 0 };
    expect(restingPos(rest, null, 999999).x).toBe(800);
    expect(restingPos(rest, 0, (K.idleReturnSeconds - 1) * 1000).x).toBe(800);
    const mid = restingPos(rest, 0, (K.idleReturnSeconds + K.returnSeconds / 2) * 1000).x;
    expect(mid).toBeLessThan(800);
    expect(mid).toBeGreaterThan(SLEIGH_HOME.x);
    expect(restingPos(rest, 0, (K.idleReturnSeconds + K.returnSeconds) * 1000)).toMatchObject({ x: SLEIGH_HOME.x, y: SLEIGH_HOME.y });
  });
});

describe('루돌프 바디슈트', () => {
  it('입고 있으면 추위가 오르지 않는다', () => {
    const suited = createCold(() => 1, 20);
    const plain = createCold(() => 1, 20);
    for (let i = 0; i < 600; i++) {
      suited.update(0.1, { warm: false, bald: true, canSneeze: false, insulated: true });
      plain.update(0.1, { warm: false, bald: true, canSneeze: false });
    }
    expect(suited.value).toBe(20);
    expect(plain.value).toBeGreaterThan(20);
  });

  it('벗으면 원래 모자 상태로: 쓰고 있었으면 썰매에 실었다가 다시 쓰고, 대머리였으면 그대로', () => {
    const wore = stowHat('on');
    expect(wore.onSleigh).toBe(true);
    expect(unstowHat(wore, 'on')).toBe('on');
    const bald = stowHat({ x: 600, y: 240 });
    expect(bald.onSleigh).toBe(false);
    expect(unstowHat(bald, { x: 600, y: 240 })).toEqual({ x: 600, y: 240 });
    expect(unstowHat(stowHat('onSnowman'), 'onSnowman')).toBe('onSnowman');
  });

  it('스프라이트: 서기 2·걷기 4·달리기 4프레임, 16x32, 모든 글자에 색, 빨간 코', () => {
    expect(REINDEER_POSES.idle).toHaveLength(2);
    expect(REINDEER_POSES.walk).toHaveLength(4);
    expect(REINDEER_POSES.run).toHaveLength(4);
    for (const frames of Object.values(REINDEER_POSES)) {
      for (const frame of frames) {
        expect(frame).toHaveLength(CHARACTER.spriteHeight);
        for (const row of frame) {
          expect(row).toHaveLength(CHARACTER.spriteWidth);
          for (const c of row) expect(c === '.' || REINDEER_PALETTE[c] !== undefined, c).toBe(true);
        }
        expect(frame.join('').split('N').length - 1).toBeGreaterThanOrEqual(3);
        expect(frame.join('')).toContain('W');
      }
    }
  });
});
