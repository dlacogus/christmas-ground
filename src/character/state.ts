// 캐릭터가 지금 무엇을 하고 있는지를 하나의 값으로 관리한다.
//   walk    — 걸어 다닌다
//   riding  — 회전목마를 탄다 (어느 탈 것 mount의 어느 자리 slot인지)
//   skating — 스케이트를 탄다 (속도 vx, vy, 초당 px을 정수로)
//   sitting — 벤치에 앉아 있다 (어느 벤치 bench의 어느 자리 slot인지)
// 상태가 바뀌면 onChange로 알린다. 나중에 네트워크로 보낼 때 이 알림에 붙이면 된다.

import type { PropId } from '../constants';

export type CharacterState =
  | { kind: 'walk' }
  | { kind: 'riding'; mount: number; slot: number }
  | { kind: 'skating'; vx: number; vy: number }
  | { kind: 'sitting'; bench: number; slot: number };

/** 털모자: 쓰고 있거나('on'), 벗겨져 바닥 어딘가(발밑 기준 좌표)에 떨어져 있다. 벗겨져 있는 동안 캐릭터는 대머리다 */
export type HatState = 'on' | { x: number; y: number };

export interface HatStore {
  get(): HatState;
  set(next: HatState): void;
  /** 바뀌면 알린다 — 나중에 친구들도 내 대머리와 떨어진 모자를 보게 네트워크로 보낼 자리 */
  onChange(listener: (next: HatState, previous: HatState) => void): () => void;
}

export function createHatState(): HatStore {
  let current: HatState = 'on';
  const listeners = new Set<(next: HatState, previous: HatState) => void>();
  return {
    get: () => current,
    set(next) {
      const same = next === current || (next !== 'on' && current !== 'on' && next.x === current.x && next.y === current.y);
      if (same) return;
      const previous = current;
      current = next;
      for (const listener of listeners) listener(current, previous);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** 손에 든 노점 소품 (한 번에 하나, 없으면 null). 바뀌면 알린다 — 친구들 화면에도 보이게 네트워크로 보낸다 */
export interface HoldStore {
  get(): PropId | null;
  set(next: PropId | null): void;
  onChange(listener: (next: PropId | null, previous: PropId | null) => void): () => void;
}

export function createHoldState(): HoldStore {
  let current: PropId | null = null;
  const listeners = new Set<(next: PropId | null, previous: PropId | null) => void>();
  return {
    get: () => current,
    set(next) {
      if (next === current) return;
      const previous = current;
      current = next;
      for (const listener of listeners) listener(current, previous);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type StateListener = (next: CharacterState, previous: CharacterState) => void;

export interface CharacterStateStore {
  get(): CharacterState;
  /** 값이 실제로 달라졌을 때만 바꾸고 알린다 */
  set(next: CharacterState): void;
  /** 알림 받기. 돌려주는 함수를 부르면 그만 받는다 */
  onChange(listener: StateListener): () => void;
}

export function sameState(a: CharacterState, b: CharacterState): boolean {
  if (a.kind === 'walk' && b.kind === 'walk') return true;
  if (a.kind === 'riding' && b.kind === 'riding') return a.mount === b.mount && a.slot === b.slot;
  if (a.kind === 'skating' && b.kind === 'skating') return a.vx === b.vx && a.vy === b.vy;
  if (a.kind === 'sitting' && b.kind === 'sitting') return a.bench === b.bench && a.slot === b.slot;
  return false;
}

export function createCharacterState(initial: CharacterState = { kind: 'walk' }): CharacterStateStore {
  let current = initial;
  const listeners = new Set<StateListener>();
  return {
    get: () => current,
    set(next: CharacterState) {
      if (sameState(current, next)) return;
      const previous = current;
      current = next;
      for (const listener of listeners) listener(current, previous);
    },
    onChange(listener: StateListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
