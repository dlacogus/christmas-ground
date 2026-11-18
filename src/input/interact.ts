// 스페이스 우선순위: 여러 상호작용(모자 줍기, 회전목마 타기, 스케이트 신기, 벤치 앉기…)이 겹칠 때
// 항상 가장 가까운 하나만 힌트로 띄우고 그것만 실행한다. 이 규칙은 여기 한 곳에서만 정한다.

import type { InputActions } from '../input';

/** 지금 할 수 있는 상호작용 하나: 캐릭터에서 그 자리까지 거리와, 닿는 거리(이 안이어야 할 수 있다) */
export interface Interaction<T extends string = string> {
  id: T;
  distance: number;
  radius: number;
}

/** 닿는 것 가운데 가장 가까운 하나 (없으면 null). 거리가 같으면 먼저 적은 쪽 */
export function nearestInteraction<T extends string>(candidates: readonly Interaction<T>[]): T | null {
  let best: Interaction<T> | null = null;
  for (const c of candidates) {
    if (c.distance > c.radius) continue;
    if (!best || c.distance < best.distance) best = c;
  }
  return best ? best.id : null;
}

/** 스페이스(짧게·꾹)를 뺀 입력 — 고르지 않은 상호작용에는 이걸 넘긴다 */
export function withoutSpace(actions: InputActions): InputActions {
  return { ...actions, tap: false, hold: false, spaceDown: false };
}

/** 고른 상호작용에만 스페이스가 간다 */
export function actionsFor<T extends string>(id: T, chosen: T | null, actions: InputActions): InputActions {
  return chosen === id ? actions : withoutSpace(actions);
}
