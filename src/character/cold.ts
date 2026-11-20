// 추위 (0~100). 밖에 있으면 천천히 오르고, 따뜻한 곳(트리 빛 안, 가로등 밑)에서는 줄어든다. 대머리면 2배 빨리 오른다.
// 화면에 숫자는 보여주지 않는다. 60을 넘으면 가끔 몸을 떨고 코끝이 빨개지고, 50을 넘으면 가끔 재채기를 한다.
// DOM을 쓰지 않아 테스트에서 바로 돌릴 수 있다.

import { COLD, LIGHTING } from '../constants';
import { LAMPS, TREE_X, getObstacle } from '../world';

/** 타원 안인가 */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/**
 * 따뜻한 곳인가: 바닥에 번지는 불빛(scenery/lighting.ts)과 같은 자리 — 가로등 밑, 큰 트리 둘레.
 * (핫초코 노점이 생기면 여기에 더한다)
 */
export function isWarmAt(x: number, y: number): boolean {
  const bed = getObstacle('tree-bed');
  if (inEllipse(x, y, TREE_X, bed.y + bed.h / 2, LIGHTING.treePoolRadiusX, LIGHTING.treePoolRadiusY)) return true;
  return LAMPS.some((lamp) => inEllipse(x, y, lamp.x, lamp.y, LIGHTING.lampPoolRadiusX, LIGHTING.lampPoolRadiusY));
}

/** 추위에 따라 초당 재채기할 확률: 50 이하면 0, 100이면 평균 40초에 한 번 */
export function sneezeRate(cold: number): number {
  if (cold <= COLD.sneezeFrom) return 0;
  return (cold - COLD.sneezeFrom) / (COLD.max - COLD.sneezeFrom) / COLD.sneezeSecondsAtMax;
}

export interface ColdEnv {
  /** 따뜻한 곳에 있나 */
  warm: boolean;
  /** 모자가 벗겨져 있나 */
  bald: boolean;
  /** 지금 재채기를 시작할 수 있나 (이미 하는 중이면 false) */
  canSneeze: boolean;
  /** 털옷(루돌프 바디슈트)을 입었나: 추위가 오르지 않는다 (따뜻한 곳에서는 그대로 줄어든다) */
  insulated?: boolean;
}

export interface Cold {
  readonly value: number;
  /** 몸을 떠는 중인가, 코끝이 빨간가 */
  readonly shivering: boolean;
  readonly redNose: boolean;
  /** 떨릴 때 윗몸이 좌우로 흔들리는 px */
  shiverLean(): number;
  /** dt초 지나게 한다. 재채기가 나와야 하면 true */
  update(dt: number, env: ColdEnv): boolean;
  /** 추위를 더하거나 뺀다 (지붕 눈에 맞음, 재채기 뒤) */
  add(amount: number): void;
  /** seconds초 뒤 반드시 재채기 (눈사람에서 빠져나온 뒤) */
  sneezeIn(seconds: number): void;
}

export function createCold(random: () => number = Math.random, initial = 0): Cold {
  let value = initial;
  let forced = -1;
  let shiverLeft = 0;
  let nextShiver: number = COLD.shiverMinGap;
  let time = 0;

  const clamp = (v: number) => Math.min(COLD.max, Math.max(0, v));

  return {
    get value() {
      return value;
    },
    get shivering() {
      return shiverLeft > 0;
    },
    get redNose() {
      return value > COLD.shiverFrom;
    },
    shiverLean() {
      if (shiverLeft <= 0) return 0;
      return Math.floor(time / COLD.shiverEvery) % 2 === 0 ? 1 : -1;
    },
    update(dt, env) {
      time += dt;
      value = clamp(value + (env.warm ? -COLD.warmFallPerSecond : env.insulated ? 0 : COLD.risePerSecond * (env.bald ? COLD.baldFactor : 1)) * dt);
      // 많이 추우면 가끔 부르르
      shiverLeft = Math.max(0, shiverLeft - dt);
      if (value > COLD.shiverFrom) {
        nextShiver -= dt;
        if (nextShiver <= 0) {
          shiverLeft = COLD.shiverSeconds;
          nextShiver = COLD.shiverMinGap + random() * (COLD.shiverMaxGap - COLD.shiverMinGap);
        }
      }
      if (forced >= 0) {
        forced -= dt;
        if (forced < 0 && env.canSneeze) return true;
        if (forced < 0) forced = 0; // 지금은 못 하면 할 수 있을 때 바로
        return false;
      }
      return env.canSneeze && random() < sneezeRate(value) * dt;
    },
    add(amount) {
      value = clamp(value + amount);
    },
    sneezeIn(seconds) {
      forced = seconds;
    },
  };
}
