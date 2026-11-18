import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { createCold, isWarmAt, sneezeRate } from '../character/cold';
import { BALD_POSES, POSES, type PoseName } from '../character/sprites';
import { CHARACTER, CHARACTER_BASE_PALETTE, COLD, HAT, SNEEZE } from '../constants';
import type { InputActions } from '../input';
import { actionsFor, nearestInteraction, withoutSpace } from '../input/interact';
import { carouselGeometry } from '../props/carousel';
import { INTERACTION_POINTS, LAMPS, SPAWN, TREE_X, WALK_AREA, getObstacle } from '../world';
import { insideSkateArea, rinkInside, skateArea } from '../zones/skating';
import { createHat, createSneeze, hatCanRestAt, hatLanding } from './sneeze';

const DT = 1 / 60;
const env = (over: Partial<{ warm: boolean; bald: boolean; canSneeze: boolean }> = {}) => ({ warm: false, bald: false, canSneeze: true, ...over });

/** 0, 1을 번갈아가 아니라 늘 같은 값을 주는 무작위 */
const fixed = (v: number) => () => v;

describe('추위', () => {
  it('밖에 있으면 분당 약 15씩 오른다', () => {
    const cold = createCold(fixed(0.99));
    for (let t = 0; t < 60; t += DT) cold.update(DT, env());
    expect(cold.value).toBeCloseTo(15, 0);
  });

  it('따뜻한 곳(트리 빛 안, 가로등 밑)에서는 줄어든다', () => {
    const bed = getObstacle('tree-bed');
    expect(isWarmAt(TREE_X, bed.y + bed.h + 10)).toBe(true);
    expect(isWarmAt(LAMPS[2].x + 10, LAMPS[2].y)).toBe(true);
    // 불빛에서 먼 곳
    expect(isWarmAt(300, WALK_AREA.y + WALK_AREA.h - 5)).toBe(false);
    const cold = createCold(fixed(0.99), 50);
    for (let t = 0; t < 30; t += DT) cold.update(DT, env({ warm: true }));
    expect(cold.value).toBeLessThan(50 - 15);
    for (let t = 0; t < 120; t += DT) cold.update(DT, env({ warm: true }));
    expect(cold.value).toBe(0);
  });

  it('대머리일 때는 2배 빨리 오른다', () => {
    const hatted = createCold(fixed(0.99));
    const bald = createCold(fixed(0.99));
    for (let t = 0; t < 40; t += DT) {
      hatted.update(DT, env());
      bald.update(DT, env({ bald: true }));
    }
    expect(bald.value).toBeCloseTo(hatted.value * COLD.baldFactor, 3);
    expect(COLD.baldFactor).toBe(2);
  });

  it('0~100을 벗어나지 않고, 60을 넘으면 코끝이 빨개지고 가끔 떤다', () => {
    const cold = createCold(fixed(0.99), 95);
    cold.add(40);
    expect(cold.value).toBe(100);
    expect(cold.redNose).toBe(true);
    let shivered = false;
    for (let t = 0; t < 10; t += DT) {
      cold.update(DT, env({ canSneeze: false }));
      shivered ||= cold.shivering;
    }
    expect(shivered).toBe(true);
    cold.add(-100);
    expect(cold.value).toBe(0);
    expect(cold.redNose).toBe(false);
  });

  it('50을 넘어야 재채기가 나오고, 추울수록 자주 (100이면 평균 40초에 한 번)', () => {
    expect(sneezeRate(50)).toBe(0);
    expect(sneezeRate(30)).toBe(0);
    expect(sneezeRate(100)).toBeCloseTo(1 / 40, 6);
    expect(sneezeRate(75)).toBeCloseTo(1 / 80, 6);
    // 무작위가 늘 0이어도 50 이하에서는 안 나온다
    const mild = createCold(fixed(0), 40);
    expect(mild.update(DT, env({ warm: true }))).toBe(false);
    const freezing = createCold(fixed(0), 90);
    expect(freezing.update(DT, env())).toBe(true);
    // 이미 재채기하는 중이면 안 나온다
    expect(createCold(fixed(0), 90).update(DT, env({ canSneeze: false }))).toBe(false);
  });

  it('눈사람에서 빠져나오면 1초 뒤 반드시 재채기', () => {
    const cold = createCold(fixed(0.99), 0);
    cold.sneezeIn(COLD.afterSnowmanSeconds);
    let at = -1;
    for (let t = 0; t < 3 && at < 0; t += DT) if (cold.update(DT, env())) at = t;
    expect(at).toBeGreaterThan(COLD.afterSnowmanSeconds - 0.05);
    expect(at).toBeLessThan(COLD.afterSnowmanSeconds + 0.05);
  });
});

describe('재채기', () => {
  it("준비 동작 1초(머리를 뒤로 두 번 젖힘, 걸음이 느려짐) 뒤 '에취' — 몸이 앞으로 꺾인다", () => {
    const sneeze = createSneeze(fixed(0.5));
    expect(sneeze.start()).toBe(true);
    expect(sneeze.start()).toBe(false);
    let achooAt = -1;
    let backs = 0;
    let wasBack = false;
    for (let t = 0; t < 2 && achooAt < 0; t += DT) {
      if (sneeze.update(DT)) achooAt = t;
      else {
        expect(sneeze.speedFactor()).toBe(SNEEZE.windupSpeedFactor);
        const back = sneeze.lean('right') < 0;
        if (back && !wasBack) backs++;
        wasBack = back;
      }
    }
    expect(achooAt).toBeCloseTo(SNEEZE.windupSeconds, 1);
    expect(backs).toBe(SNEEZE.windupCount);
    // 에취: 바라보는 쪽으로 확
    expect(sneeze.lean('right')).toBe(SNEEZE.achooLean);
    expect(sneeze.lean('left')).toBe(-SNEEZE.achooLean);
    expect(sneeze.speedFactor()).toBe(1);
    for (let t = 0; t < SNEEZE.achooSeconds + 0.1; t += DT) sneeze.update(DT);
    expect(sneeze.active).toBe(false);
  });
});

describe('날아간 모자', () => {
  it('바라보는 방향으로 30~60px 날아가고, 떨어지는 자리는 바닥 띠 안·장애물 밖', () => {
    for (let i = 0; i <= 10; i++) {
      const r = i / 10;
      const right = hatLanding(SPAWN, 'right', { kind: 'ground' }, fixed(r));
      const left = hatLanding(SPAWN, 'left', { kind: 'ground' }, fixed(r));
      expect(right.x - SPAWN.x).toBeGreaterThanOrEqual(HAT.flyMinDistance - 1);
      expect(right.x - SPAWN.x).toBeLessThanOrEqual(HAT.flyMaxDistance + 1);
      expect(SPAWN.x - left.x).toBeGreaterThanOrEqual(HAT.flyMinDistance - 1);
      for (const p of [right, left]) expect(hatCanRestAt(p.x, p.y)).toBe(true);
    }
  });

  it('어디서 재채기해도 모자는 WALK_AREA 안에 떨어지고 장애물 안으로 들어가지 않는다', () => {
    const starts = [
      { x: WALK_AREA.x + 50, y: WALK_AREA.y + 100 }, // 왼쪽 끝 전나무 줄 옆
      { x: WALK_AREA.x + WALK_AREA.w - 45, y: WALK_AREA.y + 140 }, // 오른쪽 끝
      { x: TREE_X - 60, y: WALK_AREA.y + 95 }, // 트리 화단 옆
      { x: 470, y: WALK_AREA.y + 85 }, // 회전목마 옆
      { x: 965, y: WALK_AREA.y + 70 }, // 링크 울타리 옆
      { x: 700, y: WALK_AREA.y + 4 }, // 맨 뒤
      { x: 700, y: WALK_AREA.y + WALK_AREA.h - 1 }, // 맨 앞
    ];
    for (const from of starts) {
      for (const facing of ['left', 'right'] as const) {
        for (const r of [0, 0.3, 0.7, 1]) {
          const p = hatLanding(from, facing, { kind: 'ground' }, fixed(r));
          const label = `${from.x},${from.y} ${facing} ${r}`;
          expect(p.x, label).toBeGreaterThanOrEqual(WALK_AREA.x);
          expect(p.x, label).toBeLessThanOrEqual(WALK_AREA.x + WALK_AREA.w);
          expect(p.y, label).toBeGreaterThanOrEqual(WALK_AREA.y);
          expect(p.y, label).toBeLessThanOrEqual(WALK_AREA.y + WALK_AREA.h);
          expect(hatCanRestAt(p.x, p.y), label).toBe(true);
        }
      }
    }
  });

  it('에취 순간부터 대머리, 통통 튀다 멈춘 자리가 상태에 적힌다 (onChange로 알린다)', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    const changes: unknown[] = [];
    ch.hat.onChange((next) => changes.push(next));
    const hat = createHat(ch, fixed(0.5));
    expect(hat.on).toBe(true);
    hat.launch(ch, 'right', { kind: 'ground' });
    expect(ch.hat.get()).not.toBe('on');
    expect(hat.moving).toBe(true);
    let peak = 0;
    for (let t = 0; t < 4; t += DT) {
      hat.update(DT);
      peak = Math.max(peak, hat.z);
    }
    expect(peak).toBeGreaterThan(HAT.headHeight);
    expect(hat.moving).toBe(false);
    expect(hat.z).toBe(0);
    const at = ch.hat.get() as { x: number; y: number };
    expect(at).toEqual({ x: hat.x, y: hat.y });
    expect(hatCanRestAt(at.x, at.y)).toBe(true);
    expect(changes.length).toBeGreaterThanOrEqual(1);
    // 이미 벗겨졌으면 또 날아가지 않는다
    hat.launch(ch, 'left', { kind: 'ground' });
    expect(hat.moving).toBe(false);
  });

  it('회전목마에서는 판 밖 바닥으로 날아간다', () => {
    const entry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;
    const rim = carouselGeometry().rimBottom;
    for (const facing of ['left', 'right'] as const) {
      for (const r of [0, 0.5, 1]) {
        const p = hatLanding({ x: entry.x - 60, y: rim - 20 }, facing, { kind: 'carousel', frontY: rim, safe: entry }, fixed(r));
        expect(p.y).toBeGreaterThan(rim);
        expect(hatCanRestAt(p.x, p.y)).toBe(true);
      }
    }
  });

  it('스케이트 중이면 얼음 위에 떨어져 내 속도로 미끄러지다 멈춘다 (링크 밖으로 안 나간다)', () => {
    const a = skateArea();
    const start = { x: a.right - 30, y: rinkInside().y - 30 };
    const ch = createCharacter(start.x, start.y);
    const hat = createHat(ch, fixed(0.5));
    hat.launch(start, 'right', { kind: 'ice', vx: 100, vy: 0 });
    let afterFlight: number | null = null;
    for (let t = 0; t < 10 && hat.moving; t += DT) {
      hat.update(DT);
      if (afterFlight === null && hat.z === 0 && t > HAT.flySeconds) afterFlight = hat.x;
      if (hat.z === 0) expect(insideSkateArea(hat.x, hat.y)).toBe(true);
    }
    expect(hat.moving).toBe(false);
    expect(insideSkateArea(hat.x, hat.y)).toBe(true);
    // 떨어진 뒤에도 미끄러져 자리가 바뀐다
    expect(Math.abs(hat.x - afterFlight!)).toBeGreaterThan(5);
  });
});

describe('줍기', () => {
  it('가만히 놓인 모자 근처(약 16px)에서만 주울 수 있다', () => {
    const ch = createCharacter(SPAWN.x, SPAWN.y);
    const hat = createHat(ch, fixed(0.5));
    expect(hat.canPickUp(ch.x, ch.y)).toBe(false);
    hat.launch(ch, 'right', { kind: 'ground' });
    // 날아가는 중에는 못 줍는다
    hat.update(DT);
    expect(hat.canPickUp(hat.x, hat.y)).toBe(false);
    for (let t = 0; t < 4; t += DT) hat.update(DT);
    expect(hat.canPickUp(hat.x - HAT.pickRadius + 1, hat.y)).toBe(true);
    expect(hat.canPickUp(hat.x - HAT.pickRadius - 2, hat.y)).toBe(false);
    expect(hat.canPickUp(ch.x, ch.y)).toBe(false);
    hat.putOn();
    expect(ch.hat.get()).toBe('on');
    expect(hat.on).toBe(true);
  });
});

describe('스페이스 우선순위', () => {
  const actions: InputActions = { tap: true, hold: false, cancel: false, up: false, debugFriend: false, spaceDown: true };

  it('닿는 것 가운데 가장 가까운 상호작용 하나만 고른다', () => {
    expect(nearestInteraction([])).toBeNull();
    expect(nearestInteraction([{ id: 'hat', distance: 30, radius: 16 }])).toBeNull();
    expect(
      nearestInteraction([
        { id: 'hat', distance: 12, radius: 16 },
        { id: 'carousel', distance: 8, radius: 22 },
        { id: 'skate', distance: 40, radius: 18 },
      ]),
    ).toBe('carousel');
    // 닿지 않는 것은 아무리 가까워도 뽑히지 않는다
    expect(
      nearestInteraction([
        { id: 'hat', distance: 17, radius: 16 },
        { id: 'skate', distance: 18, radius: 18 },
      ]),
    ).toBe('skate');
  });

  it('고른 상호작용에만 스페이스가 간다 (나머지는 실행되지 않는다)', () => {
    const chosen = nearestInteraction([
      { id: 'hat', distance: 5, radius: 16 },
      { id: 'carousel', distance: 9, radius: 22 },
    ]);
    expect(actionsFor('hat', chosen, actions).tap).toBe(true);
    expect(actionsFor('carousel', chosen, actions).tap).toBe(false);
    expect(actionsFor('carousel', chosen, actions).spaceDown).toBe(false);
    expect(withoutSpace({ ...actions, hold: true, up: true })).toMatchObject({ tap: false, hold: false, up: true });
  });
});

describe('대머리 스프라이트', () => {
  it('모든 자세에 모자 있음 / 대머리 두 벌이 있다 (모자·머리카락 없이 살색, 정수리 반짝임)', () => {
    const known = new Set(['.', 'O', 'o', 'M', 'm', ...Object.keys(CHARACTER_BASE_PALETTE)]);
    for (const pose of Object.keys(POSES) as PoseName[]) {
      expect(BALD_POSES[pose]).toHaveLength(POSES[pose].length);
      for (const frame of BALD_POSES[pose]) {
        expect(frame).toHaveLength(CHARACTER.spriteHeight);
        const text = frame.join('');
        for (const ch of text) expect(known.has(ch), ch).toBe(true);
        for (const hatLetter of ['P', 'p', 'H', 'h', 'b', 'R']) expect(text.includes(hatLetter), `${pose} ${hatLetter}`).toBe(false);
        expect(text.includes('G')).toBe(true);
        expect(text.includes('E')).toBe(true);
      }
    }
  });
});
