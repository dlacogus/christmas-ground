// 회전목마 타기 조작: 입력을 타고 내리는 규칙(carouselRide.ts)에 잇고, 캐릭터를 자리에 맞춘다.
//   입구 근처에서 스페이스 짧게 = 다음에 오는 빈 탈 것, 꾹 = 마차만. 타는 동안 스페이스·Esc = 내리기, ↑ = 손 흔들기.
//   모바일은 회전목마를 탭 (멀리 있으면 입구까지 걸어가서 탄다).

import { setWalkTarget, updateCharacter, type Character, type MoveInput } from '../character/character';
import { CAROUSEL as K, type OutfitName } from '../constants';
import type { InputActions } from '../input';
import { carouselGeometry, mountAngle, mountKind, mountState } from '../props/carousel';
import { CAROUSEL_X, INTERACTION_POINTS } from '../world';
import type { CarouselZone } from './carousel';
import {
  cancelBoard,
  createBoarding,
  findSeat,
  freeSlot,
  leave,
  pickMount,
  requestBoard,
  requestExit,
  sit,
  startWave,
  syncToSeat,
  updateBoarding,
  type Boarding,
  type Occupant,
} from './carouselRide';

export const MY_ID = 'me';
export const FRIEND_ID = 'friend';
const FRIEND_OUTFIT: OutfitName = 'plum';

export type PlayEvent = 'boarded' | 'alighted' | 'passedFront';

export interface PlayHint {
  text: string;
  sub?: string;
  /** head = 캐릭터 머리 위, arch = 입구 아치 위, bottom = 화면 아래, point = 맵의 한 자리(at) 위 */
  anchor: 'head' | 'arch' | 'bottom' | 'point';
  at?: { x: number; y: number };
}

export interface CarouselPlay {
  readonly boarding: Boarding;
  /** 구역 update 전에: 입력을 처리하고 (타지 않을 때는) 캐릭터를 움직인다 */
  handleInput(dt: number, dir: MoveInput, actions: InputActions): void;
  /** 구역 update 뒤에: 올라타기·내리기를 처리하고 캐릭터를 자리에 맞춘다 */
  update(): PlayEvent[];
  /** 회전목마를 탭했다 (모바일) */
  tapCarousel(): void;
  /** 지금 보여 줄 힌트 (없으면 null). touch = 손가락으로 쓰는 기기인가 */
  hint(touch: boolean): PlayHint | null;
  /** ?debug=1: 가짜 친구를 마차에 앉히거나 내보낸다 */
  toggleFriend(): void;
}

const entryPoint = () => INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;

/** 화면에서 회전목마가 차지하는 곳인가 (맵 좌표) */
export function onCarousel(x: number, y: number): boolean {
  const g = carouselGeometry();
  return Math.abs(x - CAROUSEL_X) <= K.roofHalfWidth && y >= g.apexY && y <= g.rimBottom;
}

export function nearEntry(character: { x: number; y: number }): boolean {
  const entry = entryPoint();
  return Math.hypot(character.x - entry.x, character.y - entry.y) <= K.entryRadius;
}

export function createCarouselPlay(character: Character, zone: CarouselZone): CarouselPlay {
  const boarding = createBoarding();
  const me: Occupant = { id: MY_ID, outfit: character.outfit, waveLeft: 0 };
  const friend: Occupant = { id: FRIEND_ID, outfit: FRIEND_OUTFIT, waveLeft: 0 };
  const seats = zone.seats;
  /** 회전목마를 탭해서 입구로 걸어가는 중 — 도착하면 탄다 */
  let boardOnArrive = false;
  let lastAngle = 0;

  return {
    boarding,
    handleInput(dt: number, dir: MoveInput, actions: InputActions) {
      const pressingMove = dir.x !== 0 || dir.y !== 0;
      if (boarding.phase === 'riding') {
        // 타는 동안 방향키는 무시한다. 위쪽 키만 손 흔들기로 쓴다
        if (actions.tap || actions.hold || actions.cancel) requestExit(boarding);
        if (actions.up) startWave(me);
        return;
      }
      if (boarding.phase === 'waiting') {
        if (pressingMove || actions.cancel) {
          cancelBoard(boarding);
          updateCharacter(character, dt, dir);
          return;
        }
        if (actions.hold) boarding.carriageOnly = true;
        // 입구에 서서 다가오는 탈 것 쪽을 본다
        if (boarding.target >= 0) character.facing = mountState(boarding.target, zone.rideTime()).x < character.x ? 'left' : 'right';
        updateCharacter(character, dt, { x: 0, y: 0 });
        return;
      }

      updateCharacter(character, dt, dir);
      if (pressingMove) boardOnArrive = false;
      const near = nearEntry(character);
      if (near && (actions.tap || actions.hold)) {
        requestBoard(boarding, seats, zone.rideTime(), MY_ID, actions.hold);
      } else if (boardOnArrive && !character.target) {
        // 걸어가던 것이 끝났다: 입구에 닿았으면 타고, 막혀서 멈췄으면 그만둔다
        if (near) requestBoard(boarding, seats, zone.rideTime(), MY_ID, false);
        boardOnArrive = false;
      }
      // 타려고 기다리기 시작했으면 걸어가던 것을 멈춘다
      if ((boarding.phase as Boarding['phase']) === 'waiting') character.target = null;
    },
    update() {
      const time = zone.rideTime();
      me.bald = character.hat.get() !== 'on';
      const events: PlayEvent[] = [];
      const result = updateBoarding(boarding, seats, time, me);
      if (result === 'boarded') {
        const at = findSeat(seats, MY_ID)!;
        character.state.set({ kind: 'riding', mount: at.mount, slot: at.slot });
        character.moving = false;
        character.target = null;
        character.puffs.length = 0;
        lastAngle = mountAngle(at.mount, time);
        events.push('boarded');
      } else if (result === 'alighted') {
        // 입구 앞에 선다
        const entry = entryPoint();
        character.x = entry.x;
        character.y = entry.y;
        character.facing = 'right';
        character.animTime = 0;
        character.state.set({ kind: 'walk' });
        events.push('alighted');
      }
      if (boarding.phase === 'riding') {
        syncToSeat(character, seats, MY_ID, time);
        const angle = mountAngle(findSeat(seats, MY_ID)!.mount, time);
        // 왼쪽에서 다가와 정면을 넘어서는 순간
        if (lastAngle < 0 && angle >= 0) events.push('passedFront');
        lastAngle = angle;
      }
      return events;
    },
    tapCarousel() {
      if (boarding.phase === 'riding') {
        requestExit(boarding);
        return;
      }
      if (boarding.phase === 'waiting') return;
      if (nearEntry(character)) {
        requestBoard(boarding, seats, zone.rideTime(), MY_ID, false);
        return;
      }
      const entry = entryPoint();
      setWalkTarget(character, entry.x, entry.y);
      boardOnArrive = true;
    },
    hint(touch: boolean) {
      if (boarding.phase === 'riding') {
        if (boarding.exitRequested) return { text: '앞에서 내려요', anchor: 'head' };
        return touch ? { text: '탭하면 내려요', anchor: 'bottom' } : { text: 'Space 내리기', sub: '↑ 손 흔들기', anchor: 'bottom' };
      }
      if (boarding.phase === 'waiting') {
        const carriage = boarding.target >= 0 && mountKind(boarding.target) === 'carriage';
        return { text: carriage ? '마차를 기다려요' : '말을 기다려요', anchor: 'head' };
      }
      if (!nearEntry(character)) return null;
      if (pickMount(seats, zone.rideTime(), MY_ID, false) < 0) return { text: '자리가 없어요', anchor: 'arch' };
      return touch ? { text: '회전목마를 탭', anchor: 'arch' } : { text: 'Space 타기', sub: '꾹 누르면 마차', anchor: 'arch' };
    },
    toggleFriend() {
      if (findSeat(seats, FRIEND_ID)) {
        leave(seats, FRIEND_ID);
        return;
      }
      for (const mount of K.carriageIndices) {
        const slot = freeSlot(seats, mount);
        if (slot >= 0) {
          sit(seats, mount, slot, friend);
          return;
        }
      }
    },
  };
}
