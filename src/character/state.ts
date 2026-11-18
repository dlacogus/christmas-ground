// 캐릭터가 지금 무엇을 하고 있는지를 하나의 값으로 관리한다.
//   walk    — 걸어 다닌다
//   riding  — 회전목마를 탄다 (어느 탈 것 mount의 어느 자리 slot인지)
//   skating — 스케이트를 탄다 (속도 vx, vy) — 나중에 쓴다
// 상태가 바뀌면 onChange로 알린다. 나중에 네트워크로 보낼 때 이 알림에 붙이면 된다.

export type CharacterState =
  | { kind: 'walk' }
  | { kind: 'riding'; mount: number; slot: number }
  | { kind: 'skating'; vx: number; vy: number };

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
