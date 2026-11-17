// 시드 고정 무작위 (mulberry32). 같은 시드면 항상 같은 배경이 나온다.

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) 실수 */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** [min, max] 정수 */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** 0~count-1 중 except를 뺀 번호 하나 (except < 0이면 제외 없음) */
export function pickIndexExcept(rng: Rng, count: number, except: number): number {
  if (except < 0 || count < 2) return Math.floor(rng() * count);
  const i = Math.floor(rng() * (count - 1));
  return i >= except ? i + 1 : i;
}
