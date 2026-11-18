import { describe, expect, it } from 'vitest';
import { NET, SNOWBALL, SNOWMAN } from '../constants';
import { MAP_WIDTH } from '../world';
import { allowMessage, expiredObjects, isFull, leavePlaza, newSession, seatsOf, trySit, type Session } from './plazaCore';
import { cleanName, emptySeats, parseClientMessage, seatCount, type WireObject, type WirePlayer } from './protocol';

const send = (m: unknown) => parseClientMessage(JSON.stringify(m));

function player(id: string): WirePlayer {
  return { id, name: id, scarf: 0, x: 700, y: 240, f: 1, state: { kind: 'walk' }, hat: 'on' };
}

function joined(id: string): Session {
  return { ...newSession(), player: player(id) };
}

describe('메시지 검사', () => {
  it('닉네임은 1~8글자 (앞뒤 공백은 뗀다)', () => {
    expect(cleanName('  루돌프 ')).toBe('루돌프');
    expect(cleanName('가나다라마바사아')).toBe('가나다라마바사아');
    expect(cleanName('가나다라마바사아자')).toBeNull();
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(123)).toBeNull();
    expect(send({ t: 'join', name: '산타', scarf: 2 })).toEqual({ t: 'join', name: '산타', scarf: 2, legacy: undefined });
    expect(send({ t: 'join', name: '너무너무너무긴이름이에요', scarf: 2 })).toBeNull();
    expect(send({ t: 'join', name: '산타', scarf: NET.scarves })).toBeNull();
  });

  it('좌표는 맵 안이어야 한다', () => {
    expect(send({ t: 'pos', x: 100, y: 200, f: 1, m: 1 })).toEqual({ t: 'pos', x: 100, y: 200, f: 1, m: 1 });
    expect(send({ t: 'pos', x: MAP_WIDTH + 1, y: 200, f: 1, m: 1 })).toBeNull();
    expect(send({ t: 'pos', x: 100, y: -5, f: 1, m: 1 })).toBeNull();
    expect(send({ t: 'pos', x: 'a', y: 200, f: 1, m: 1 })).toBeNull();
    expect(send({ t: 'pos', x: Number.NaN, y: 200, f: 1, m: 1 })).toBeNull();
    // 스케이트 속도는 함께 실려 간다
    expect(send({ t: 'pos', x: 1000, y: 200, f: 0, m: 1, vx: -80, vy: 12 })).toMatchObject({ vx: -80, vy: 12 });
  });

  it('눈덩이 크기는 최대 이하, 눈사람은 2~3단', () => {
    const ball = { x: 500, y: 240, d: 20, roll: 1, seed: 7, owner: 'a' };
    expect(send({ t: 'put', id: 'a-1', kind: 'ball', data: ball })).not.toBeNull();
    expect(send({ t: 'put', id: 'a-1', kind: 'ball', data: { ...ball, d: SNOWBALL.maxSize + 1 } })).toBeNull();
    expect(send({ t: 'ball', id: 'a-1', x: 500, y: 240, d: 999, roll: 0, seed: 1 })).toBeNull();
    const snowman = { x: 500, y: 240, tiers: [30, 20], seed: 7, owner: 'a' };
    expect(send({ t: 'put', id: 'a-2', kind: 'snowman', data: snowman })).not.toBeNull();
    expect(send({ t: 'put', id: 'a-2', kind: 'snowman', data: { ...snowman, tiers: [30] } })).toBeNull();
    expect(send({ t: 'put', id: 'a-2', kind: 'snowman', data: { ...snowman, tiers: [30, 20, 10, 5] } })).toBeNull();
    expect(send({ t: 'put', id: 'a-2', kind: 'snowman', data: { ...snowman, x: 99999 } })).toBeNull();
    expect(SNOWMAN.maxTiers).toBe(3);
  });

  it('메시지 크기는 2KB 이하, 형식이 틀리면 버린다', () => {
    expect(parseClientMessage('x'.repeat(NET.maxMessageBytes + 1))).toBeNull();
    expect(parseClientMessage('{"t":"join","name":"' + 'a'.repeat(3000) + '","scarf":0}')).toBeNull();
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
    expect(send({ t: 'unknown' })).toBeNull();
    expect(send({ t: 'act', a: 'sneeze' })).toEqual({ t: 'act', a: 'sneeze' });
    expect(send({ t: 'act', a: 'explode' })).toBeNull();
  });

  it('회전목마 자리는 있는 자리만 (말 1자리, 마차 2자리)', () => {
    const carriage = emptySeats().findIndex((slots) => slots.length === 2);
    const horse = emptySeats().findIndex((slots) => slots.length === 1);
    expect(seatCount(carriage)).toBe(2);
    expect(send({ t: 'sit', mount: carriage, slot: 1 })).toEqual({ t: 'sit', mount: carriage, slot: 1 });
    expect(send({ t: 'sit', mount: horse, slot: 1 })).toBeNull();
    expect(send({ t: 'sit', mount: 99, slot: 0 })).toBeNull();
    expect(send({ t: 'state', state: { kind: 'riding', mount: horse, slot: 0 }, hat: { x: 10, y: 200 } })).not.toBeNull();
    expect(send({ t: 'state', state: { kind: 'riding', mount: horse, slot: 5 }, hat: 'on' })).toBeNull();
  });
});

describe('광장 서버 규칙', () => {
  it('동시 접속은 8명까지', () => {
    const sessions = Array.from({ length: NET.maxPlayers - 1 }, (_, i) => joined(`p${i}`));
    // 아직 입장하지 않은 접속은 세지 않는다
    sessions.push(newSession());
    expect(isFull(sessions)).toBe(false);
    sessions.push(joined('last'));
    expect(isFull(sessions)).toBe(true);
  });

  it('한 사람이 초당 20개 넘게 보내면 무시한다', () => {
    const s = joined('a');
    let allowed = 0;
    for (let i = 0; i < 50; i++) if (allowMessage(s, 1000 + i)) allowed++;
    expect(allowed).toBe(NET.maxMessagesPerSecond);
    // 다음 초에는 다시 받는다
    expect(allowMessage(s, 2100)).toBe(true);
  });

  it('회전목마 자리: 동시에 같은 자리를 요청하면 한 명만 앉는다', () => {
    const a = joined('a');
    const b = joined('b');
    const sessions = [a, b];
    const carriage = emptySeats().findIndex((slots) => slots.length === 2);
    expect(trySit(sessions, a, carriage, 0)).toBe(true);
    expect(trySit(sessions, b, carriage, 0)).toBe(false);
    expect(seatsOf(sessions)[carriage]).toEqual(['a', null]);
    // 같은 마차 옆자리에는 나란히 앉을 수 있다
    expect(trySit(sessions, b, carriage, 1)).toBe(true);
    expect(seatsOf(sessions)[carriage]).toEqual(['a', 'b']);
    // 자리를 옮기면 앉아 있던 자리는 빈다
    const horse = emptySeats().findIndex((slots) => slots.length === 1);
    expect(trySit(sessions, a, horse, 0)).toBe(true);
    expect(seatsOf(sessions)[carriage]).toEqual([null, 'b']);
    expect(seatsOf(sessions)[horse]).toEqual(['a']);
    // 없는 자리, 입장하지 않은 사람은 안 된다
    expect(trySit(sessions, b, horse, 1)).toBe(false);
    expect(trySit(sessions, newSession(), horse, 0)).toBe(false);
  });

  it('나간 사람 뒤처리: 회전목마 자리를 비우고, 굴리던 눈덩이는 그 자리에 놓인 것으로 한다', () => {
    const a = joined('a');
    const b = joined('b');
    const sessions = [a, b];
    trySit(sessions, a, 0, 0);
    a.rolling = { id: 'a-3', x: 520, y: 236, d: 18, roll: 2, seed: 9 };
    const result = leavePlaza(a, 5000);
    expect(result.seatFreed).toBe(true);
    expect(result.dropped).toEqual({ id: 'a-3', kind: 'ball', data: { x: 520, y: 236, d: 18, roll: 2, seed: 9, owner: 'a' }, updatedAt: 5000 });
    expect(a.seat).toBeNull();
    expect(a.rolling).toBeNull();
    expect(seatsOf(sessions.filter((s) => s !== a))).toEqual(emptySeats());
    // 아무것도 안 하던 사람은 뒤처리할 것이 없다
    expect(leavePlaza(b, 5000)).toEqual({ seatFreed: false, dropped: null });
  });

  it('녹는 시간 정리: 5분 넘게 놓아둔 눈덩이, 12개를 넘는 오래된 눈사람', () => {
    const now = 10_000_000;
    const ball = (id: string, age: number): WireObject => ({ id, kind: 'ball', data: { x: 1, y: 1, d: 5, roll: 0, seed: 0, owner: 'a' }, updatedAt: now - age * 1000 });
    const snowman = (id: string, age: number): WireObject => ({ id, kind: 'snowman', data: { x: 1, y: 1, tiers: [10, 5], seed: 0, owner: 'a' }, updatedAt: now - age * 1000 });
    expect(expiredObjects([ball('fresh', 10), ball('old', SNOWBALL.idleSeconds + 1)], now)).toEqual(['old']);
    // 눈사람은 시간이 지나도 남는다 (12개까지)
    const twelve = Array.from({ length: SNOWMAN.maxCount }, (_, i) => snowman(`s${i}`, 100000 - i));
    expect(expiredObjects(twelve, now)).toEqual([]);
    // 넘으면 가장 오래된 것부터
    expect(expiredObjects([...twelve, snowman('new1', 5), snowman('new2', 1)], now)).toEqual(['s0', 's1']);
  });
});
