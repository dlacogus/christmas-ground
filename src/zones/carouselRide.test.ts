import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { createCharacterState, type CharacterState } from '../character/state';
import { CAROUSEL } from '../constants';
import { createHoldKey, type InputActions } from '../input';
import { mountAngle, mountKind, seatPosition } from '../props/carousel';
import { INTERACTION_POINTS } from '../world';
import { createCarouselZone } from './carousel';
import { FRIEND_ID, MY_ID, createCarouselPlay, nearEntry, onCarousel } from './carouselPlay';
import {
  atFront,
  companionSlot,
  createBoarding,
  createSeats,
  findSeat,
  freeSlot,
  pickMount,
  requestBoard,
  requestExit,
  riderViews,
  sit,
  startWave,
  syncToSeat,
  timeToFront,
  updateBoarding,
  type Occupant,
} from './carouselRide';

const FRAME = 1 / 60;
const [CARRIAGE_A, CARRIAGE_B] = CAROUSEL.carriageIndices;
const me = (): Occupant => ({ id: MY_ID, outfit: 'camel', waveLeft: 0 });
const friend = (id = FRIEND_ID): Occupant => ({ id, outfit: 'plum', waveLeft: 0 });
const idle: InputActions = { tap: false, hold: false, cancel: false, up: false, debugFriend: false };
const entry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;

/** 이 탈 것이 입구 정면에 오는 시각 */
function frontTime(mount: number): number {
  return (CAROUSEL.rotationPeriod * (CAROUSEL.horseCount - mount)) / CAROUSEL.horseCount;
}

describe('자리 관리', () => {
  it('말은 1자리, 마차는 2자리', () => {
    const seats = createSeats();
    seats.forEach((slots, i) => expect(slots).toHaveLength(mountKind(i) === 'carriage' ? 2 : 1));
    expect(seats.flat().every((o) => o === null)).toBe(true);
  });

  it('자리에 누가 앉았는지 기록하고, 이미 찬 자리에는 못 앉는다', () => {
    const seats = createSeats();
    expect(sit(seats, 1, 0, me())).toBe(true);
    expect(sit(seats, 1, 0, friend())).toBe(false);
    expect(findSeat(seats, MY_ID)).toEqual({ mount: 1, slot: 0 });
    expect(freeSlot(seats, 1)).toBe(-1);
  });

  it('마차 한 자리에 친구가 앉아 있으면 옆자리에 앉을 수 있다', () => {
    const seats = createSeats();
    sit(seats, CARRIAGE_A, 0, friend());
    expect(freeSlot(seats, CARRIAGE_A)).toBe(1);
    expect(sit(seats, CARRIAGE_A, 1, me())).toBe(true);
    expect(companionSlot(seats, MY_ID)).toBe(0);
    expect(freeSlot(seats, CARRIAGE_A)).toBe(-1);
  });
});

describe('타기', () => {
  it('빈 자리가 있는 탈 것이 앞에 올 때만 탄다', () => {
    const seats = createSeats();
    const b = createBoarding();
    // 말 1번이 막 앞을 지나간 직후에 타겠다고 한다
    let t = frontTime(1) + 0.6;
    expect(requestBoard(b, seats, t, MY_ID, false)).toBe(true);
    expect(b.phase).toBe('waiting');
    const target = b.target;
    expect(atFront(mountAngle(target, t))).toBe(false);
    let boardedAt = -1;
    for (let i = 0; i < 60 * 20 && boardedAt < 0; i++) {
      t += FRAME;
      const before = findSeat(seats, MY_ID);
      if (updateBoarding(b, seats, t, me()) === 'boarded') boardedAt = t;
      // 올라타기 전에는 어느 자리에도 없다
      else expect(before).toBeNull();
    }
    expect(boardedAt).toBeGreaterThan(0);
    expect(b.phase).toBe('riding');
    expect(findSeat(seats, MY_ID)!.mount).toBe(target);
    expect(atFront(mountAngle(target, boardedAt))).toBe(true);
    // 가장 먼저 오는 것을 골랐으니 한 칸(1/8바퀴)보다 오래 기다리지 않는다
    expect(boardedAt - (frontTime(1) + 0.6)).toBeLessThan(CAROUSEL.rotationPeriod / CAROUSEL.horseCount);
  });

  it('지금 앞에 있는 탈 것에 빈 자리가 있으면 바로 탄다', () => {
    const seats = createSeats();
    const b = createBoarding();
    const t = frontTime(2);
    requestBoard(b, seats, t, MY_ID, false);
    expect(updateBoarding(b, seats, t, me())).toBe('boarded');
    expect(findSeat(seats, MY_ID)).toEqual({ mount: 2, slot: 0 });
  });

  it('자리가 찬 탈 것은 건너뛰고 다음 것을 기다린다', () => {
    const seats = createSeats();
    sit(seats, 2, 0, friend('someone'));
    const t = frontTime(2);
    const pick = pickMount(seats, t, MY_ID, false);
    expect(pick).not.toBe(2);
    expect(timeToFront(mountAngle(pick, t))).toBeGreaterThan(0);
  });

  it('꾹 누르면 마차만 기다린다. 마차 2자리가 모두 꽉 차면 못 탄다', () => {
    const seats = createSeats();
    const b = createBoarding();
    expect(mountKind(pickMount(seats, 0.4, MY_ID, true))).toBe('carriage');
    for (const c of [CARRIAGE_A, CARRIAGE_B]) {
      sit(seats, c, 0, friend(`a${c}`));
      sit(seats, c, 1, friend(`b${c}`));
    }
    expect(pickMount(seats, 0.4, MY_ID, true)).toBe(-1);
    expect(requestBoard(b, seats, 0.4, MY_ID, true)).toBe(false);
    expect(b.phase).toBe('none');
    // 말은 여전히 탈 수 있다
    expect(mountKind(pickMount(seats, 0.4, MY_ID, false))).toBe('horse');
  });

  it('친구가 앉은 마차에 빈 자리가 있으면, 더 먼저 오는 말이 있어도 그 마차를 고른다', () => {
    const seats = createSeats();
    sit(seats, CARRIAGE_B, 0, friend());
    // 마차 B가 막 지나가서 거의 한 바퀴를 기다려야 하는 때
    const t = frontTime(CARRIAGE_B) + 1;
    expect(pickMount(seats, t, MY_ID, false)).toBe(CARRIAGE_B);
    const b = createBoarding();
    requestBoard(b, seats, t, MY_ID, false);
    let time = t;
    while (updateBoarding(b, seats, time, me()) !== 'boarded') time += FRAME;
    expect(findSeat(seats, MY_ID)).toEqual({ mount: CARRIAGE_B, slot: 1 });
    expect(findSeat(seats, FRIEND_ID)).toEqual({ mount: CARRIAGE_B, slot: 0 });
  });

  it('기다리는 사이 그 마차가 꽉 차면 다른 탈 것으로 바꾼다', () => {
    const seats = createSeats();
    const b = createBoarding();
    const t = frontTime(CARRIAGE_A) + 1;
    requestBoard(b, seats, t, MY_ID, true);
    const first = b.target;
    sit(seats, first, 0, friend('x'));
    sit(seats, first, 1, friend('y'));
    updateBoarding(b, seats, t + FRAME, me());
    expect(b.phase).toBe('waiting');
    expect(b.target).not.toBe(first);
    expect(mountKind(b.target)).toBe('carriage');
  });
});

describe('타는 동안', () => {
  it('캐릭터 위치는 자기 자리 위치와 같다 (말의 오르내림과 회전을 따라간다)', () => {
    const seats = createSeats();
    sit(seats, 3, 0, me());
    const pos = { x: 0, y: 0 };
    const seen = new Set<string>();
    for (let t = 0; t < CAROUSEL.rotationPeriod; t += 0.25) {
      expect(syncToSeat(pos, seats, MY_ID, t)).toBe(true);
      const seat = seatPosition(3, 0, t);
      expect(pos).toEqual({ x: seat.x, y: seat.y });
      seen.add(`${pos.x},${pos.y}`);
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(syncToSeat(pos, createSeats(), MY_ID, 0)).toBe(false);
  });

  it('마차에 같이 탄 사람이 있으면 손 흔들 때 그쪽을 본다', () => {
    const seats = createSeats();
    const mine = me();
    sit(seats, CARRIAGE_A, 0, mine);
    sit(seats, CARRIAGE_A, 1, friend());
    startWave(mine);
    const t = frontTime(CARRIAGE_A);
    const views = riderViews(seats, t);
    const myView = views.find((v) => v.slot === 0)!;
    expect(myView.waving).toBe(true);
    // 앞쪽에서는 앞자리(1)가 오른쪽에 있다
    expect(myView.lookAt).toBe('right');
    expect(views.find((v) => v.slot === 1)!.lookAt).toBe('left');
    // 혼자 탄 말에서는 볼 사람이 없다
    const alone = createSeats();
    sit(alone, 1, 0, me());
    expect(riderViews(alone, t)[0].lookAt).toBeNull();
  });
});

describe('내리기', () => {
  it('내 탈 것이 앞에 있을 때만 내린다. 아니면 앞에 올 때까지 기다렸다가 저절로 내린다', () => {
    const seats = createSeats();
    const b = createBoarding();
    const mine = me();
    sit(seats, 3, 0, mine);
    b.phase = 'riding';
    // 뒤쪽을 돌고 있을 때 내리겠다고 한다
    let t = frontTime(3) + CAROUSEL.rotationPeriod / 2;
    requestExit(b);
    expect(b.exitRequested).toBe(true);
    expect(updateBoarding(b, seats, t, mine)).toBeNull();
    expect(findSeat(seats, MY_ID)).not.toBeNull();
    let alightedAt = -1;
    for (let i = 0; i < 60 * 20 && alightedAt < 0; i++) {
      t += FRAME;
      if (updateBoarding(b, seats, t, mine) === 'alighted') alightedAt = t;
    }
    expect(alightedAt).toBeGreaterThan(0);
    expect(atFront(mountAngle(3, alightedAt))).toBe(true);
    expect(findSeat(seats, MY_ID)).toBeNull();
    expect(b.phase).toBe('none');
    expect(b.exitRequested).toBe(false);
  });

  it('앞에 있을 때 내리겠다고 하면 바로 내린다', () => {
    const seats = createSeats();
    const b = createBoarding();
    const mine = me();
    sit(seats, 3, 0, mine);
    b.phase = 'riding';
    requestExit(b);
    expect(updateBoarding(b, seats, frontTime(3), mine)).toBe('alighted');
  });

  it('마차에서 한 명이 내려도 다른 한 명은 그대로 탄다', () => {
    const seats = createSeats();
    const b = createBoarding();
    const mine = me();
    sit(seats, CARRIAGE_A, 0, friend());
    sit(seats, CARRIAGE_A, 1, mine);
    b.phase = 'riding';
    requestExit(b);
    expect(updateBoarding(b, seats, frontTime(CARRIAGE_A), mine)).toBe('alighted');
    expect(findSeat(seats, MY_ID)).toBeNull();
    expect(findSeat(seats, FRIEND_ID)).toEqual({ mount: CARRIAGE_A, slot: 0 });
  });
});

describe('회전목마 조작', () => {
  function setup() {
    const zone = createCarouselZone();
    const character = createCharacter(entry.x, entry.y);
    const play = createCarouselPlay(character, zone);
    const states: CharacterState[] = [];
    character.state.onChange((next) => states.push(next));
    const step = (actions: Partial<InputActions> = {}, dir = { x: 0, y: 0 }) => {
      play.handleInput(FRAME, dir, { ...idle, ...actions });
      zone.update(FRAME);
      return play.update();
    };
    return { zone, character, play, states, step };
  }

  it('입구 근처에서만 탈 수 있고, 회전목마 그림을 탭한 것인지 가려낸다', () => {
    expect(nearEntry(entry)).toBe(true);
    expect(nearEntry({ x: entry.x + CAROUSEL.entryRadius + 5, y: entry.y })).toBe(false);
    expect(onCarousel(entry.x, entry.y - 60)).toBe(true);
    expect(onCarousel(entry.x + 300, entry.y - 60)).toBe(false);
    const { play, character, step } = setup();
    character.x += 80;
    step({ tap: true });
    expect(play.boarding.phase).toBe('none');
  });

  it('스페이스로 타면 riding 상태가 되고 탈 것 번호와 자리 번호를 알린다. 타는 동안 ←→는 무시한다', () => {
    const { play, character, states, step, zone } = setup();
    step({ tap: true });
    expect(play.boarding.phase).not.toBe('none');
    for (let i = 0; i < 60 * 15 && play.boarding.phase !== 'riding'; i++) step();
    expect(play.boarding.phase).toBe('riding');
    const at = findSeat(zone.seats, MY_ID)!;
    expect(states.at(-1)).toEqual({ kind: 'riding', mount: at.mount, slot: at.slot });
    for (let i = 0; i < 30; i++) step({}, { x: 1, y: 0 });
    const seat = seatPosition(at.mount, at.slot, zone.rideTime());
    expect({ x: character.x, y: character.y }).toEqual({ x: seat.x, y: seat.y });
  });

  it('가짜 친구가 앉은 마차 옆자리에 타고, 내리면 입구 앞에 서서 walk로 돌아온다. 친구는 계속 탄다', () => {
    const { play, character, states, step, zone } = setup();
    play.toggleFriend();
    const friendSeat = findSeat(zone.seats, FRIEND_ID)!;
    expect(mountKind(friendSeat.mount)).toBe('carriage');
    step({ tap: true });
    for (let i = 0; i < 60 * 15 && play.boarding.phase !== 'riding'; i++) step();
    const mine = findSeat(zone.seats, MY_ID)!;
    expect(mine.mount).toBe(friendSeat.mount);
    expect(mine.slot).not.toBe(friendSeat.slot);

    // 위쪽 키 = 손 흔들기 (1초)
    step({ up: true });
    expect(riderViews(zone.seats, zone.rideTime()).find((v) => v.slot === mine.slot)!.waving).toBe(true);
    for (let i = 0; i < 70; i++) step();
    expect(riderViews(zone.seats, zone.rideTime()).find((v) => v.slot === mine.slot)!.waving).toBe(false);

    step({ tap: true });
    let events: string[] = [];
    for (let i = 0; i < 60 * 15 && !events.includes('alighted'); i++) events = step();
    expect(events).toContain('alighted');
    expect({ x: character.x, y: character.y }).toEqual({ x: entry.x, y: entry.y });
    expect(states.at(-1)).toEqual({ kind: 'walk' });
    expect(findSeat(zone.seats, FRIEND_ID)).toEqual(friendSeat);
  });

  it('기다리다가 움직이면 그만둔다. 힌트는 상황에 맞게 바뀐다', () => {
    const { play, step, zone } = setup();
    expect(play.hint(false)).toEqual({ text: 'Space 타기', sub: '꾹 누르면 마차', anchor: 'arch' });
    // 앞에 아무것도 없을 때 꾹 누르면 마차를 기다린다
    while (atFront(mountAngle(CARRIAGE_A, zone.rideTime())) || atFront(mountAngle(CARRIAGE_B, zone.rideTime()))) step();
    step({ hold: true });
    expect(play.boarding.phase).toBe('waiting');
    expect(play.boarding.carriageOnly).toBe(true);
    expect(play.hint(false)!.text).toBe('마차를 기다려요');
    step({}, { x: -1, y: 0 });
    expect(play.boarding.phase).toBe('none');
  });

  it('뒤쪽에서 내리려 하면 머리 위에 앞에서 내려요 힌트', () => {
    const { play, step } = setup();
    step({ tap: true });
    for (let i = 0; i < 60 * 15 && play.boarding.phase !== 'riding'; i++) step();
    for (let i = 0; i < 60 * 3; i++) step();
    expect(play.hint(false)!.anchor).toBe('bottom');
    step({ cancel: true });
    expect(play.hint(false)).toEqual({ text: '앞에서 내려요', anchor: 'head' });
  });
});

describe('캐릭터 상태', () => {
  it('값이 실제로 바뀔 때만 onChange를 부른다', () => {
    const store = createCharacterState();
    const seen: string[] = [];
    const off = store.onChange((next, previous) => seen.push(`${previous.kind}>${next.kind}`));
    store.set({ kind: 'walk' });
    store.set({ kind: 'riding', mount: 4, slot: 1 });
    store.set({ kind: 'riding', mount: 4, slot: 1 });
    store.set({ kind: 'riding', mount: 4, slot: 0 });
    store.set({ kind: 'skating', vx: 1, vy: 0 });
    store.set({ kind: 'walk' });
    expect(seen).toEqual(['walk>riding', 'riding>riding', 'riding>skating', 'skating>walk']);
    off();
    store.set({ kind: 'riding', mount: 0, slot: 0 });
    expect(seen).toHaveLength(4);
    expect(store.get()).toEqual({ kind: 'riding', mount: 0, slot: 0 });
  });
});

describe('스페이스 짧게 / 꾹', () => {
  it('0.5초 안에 떼면 짧게, 넘기면 꾹 (꾹은 한 번만)', () => {
    const key = createHoldKey(CAROUSEL.holdSeconds);
    key.down(10);
    expect(key.poll(10.2)).toBeNull();
    expect(key.up()).toBe('tap');

    key.down(20);
    key.down(20.1); // 누르고 있는 동안 반복되는 keydown
    expect(key.poll(20.4)).toBeNull();
    expect(key.poll(20.5)).toBe('hold');
    expect(key.poll(20.6)).toBeNull();
    expect(key.up()).toBeNull();
    expect(key.up()).toBeNull();
  });
});
