import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { COPUSH, SNOWBALL, SNOWMAN, SNOW_FIELD } from '../constants';
import { nearestInteraction } from '../input/interact';
import { createSnowField } from '../scenery/snowField';
import { MAP_WIDTH, WALK_AREA } from '../world';
import {
  addMaker,
  combinePush,
  mergeMakers,
  createSnowWorld,
  fitsScreen,
  grow,
  rollSpeed,
  sizeTier,
  snowmanHeight,
  snowmanKind,
  snowmanLook,
  stackBalls,
  stackOnSnowman,
  type SnowWorld,
} from './snowman';
import { createSnowmanPlay, largeLiftProgress } from './snowmanPlay';

const DT = 1 / 60;
const none = { x: 0, y: 0 };
const right = { x: 1, y: 0 };
const left = { x: -1, y: 0 };

/** 눈이 가득 깔린(또는 하나도 없는) 바닥 */
function field(snowy = true) {
  return createSnowField(new Uint8Array(MAP_WIDTH * WALK_AREA.h).fill(snowy ? 1 : 0), MAP_WIDTH, WALK_AREA.h, { x: 0, y: WALK_AREA.y });
}

/** 오른쪽으로 한참 장애물이 없는 눈밭 (트리 화단 앞, 가로등 줄보다 뒤) */
const START = { x: 620, y: 236 };

function setup(snowy = true) {
  const ch = createCharacter(START.x, START.y);
  const world = createSnowWorld(() => 0.5);
  const f = field(snowy);
  let saves = 0;
  const play = createSnowmanPlay(ch, world, { field: f, owner: 'me', random: () => 0.5, save: () => saves++ });
  const run = (seconds: number, dir = none, holding = true) => {
    for (let t = 0; t < seconds - 1e-9; t += DT) play.update(DT, dir, holding);
  };
  return { ch, world, f, play, run, saves: () => saves };
}

describe('눈덩이 굴리기', () => {
  it('크기 구간과 굴리는 속도: 작음 50, 중간 30, 큼은 15까지 느려진다', () => {
    expect(sizeTier(4)).toBe('small');
    expect(sizeTier(12)).toBe('small');
    expect(sizeTier(13)).toBe('medium');
    expect(sizeTier(32)).toBe('medium');
    expect(sizeTier(33)).toBe('large');
    expect(rollSpeed(8)).toBe(50);
    expect(rollSpeed(20)).toBe(30);
    expect(rollSpeed(64)).toBe(15);
    expect(rollSpeed(48)).toBeLessThan(30);
    expect(rollSpeed(48)).toBeGreaterThan(15);
    // 둘이 같이 밀면 두 배 빨리
    expect(rollSpeed(64, 2)).toBe(30);
  });

  it('주저앉아 지름 4px 눈덩이를 만들고, 눈 위를 굴리면 커진다', () => {
    const { world, play, run } = setup();
    expect(play.start()).toBe(true);
    run(SNOWBALL.gatherSeconds + 0.05);
    expect(play.phase).toBe('roll');
    expect(world.balls).toHaveLength(1);
    expect(play.rolling!.d).toBe(SNOWBALL.startSize);
    run(3, right);
    expect(play.rolling!.d).toBeGreaterThan(8);
    // 떼면 그 크기로 그 자리에 놓인다
    const d = play.rolling!.d;
    run(0.1, none, false);
    expect(play.busy).toBe(false);
    expect(world.balls[0].d).toBe(d);
  });

  it('눈 위에서만 커진다: 눈이 없는 바닥에서는 시작할 수 없고, 굴려도 커지지 않는다', () => {
    const { ch, world, play, run } = setup(false);
    expect(play.canStartHere()).toBe(false);
    expect(play.start()).toBe(false);
    const ball = world.addBall(ch.x + 14, ch.y, 10, 'me');
    expect(play.continueWith(ball)).toBe(true);
    const x = ch.x;
    run(2, right);
    expect(ch.x).toBeGreaterThan(x + 50);
    expect(ball.d).toBe(10);
  });

  it('굴린 자리는 눈이 줄어 (눌린 눈길, 여전히 눈 덮인 바닥) 길이 남고, 이미 굴린 자리를 다시 지나가도 커지지 않는다. 약 2분 뒤 다시 찬다', () => {
    const { ch, f, play, run } = setup();
    play.start();
    run(SNOWBALL.gatherSeconds + 0.05);
    const startX = ch.x;
    run(2, right);
    const ball = play.rolling!;
    const mid = (startX + ch.x) / 2 + 12;
    expect(f.amountAt(mid, ball.y - 3)).toBe(0);
    expect(f.hasSnow(mid, ball.y - 3)).toBe(false);
    // 바닥이 드러나는 것은 아니다: 눌렸어도 눈 덮인 바닥
    expect(f.covered(mid, ball.y - 3)).toBe(true);
    // 길에서 벗어난 곳은 그대로
    expect(f.amountAt(mid, ball.y - 40)).toBe(1);
    // 왔던 길로 되돌아간다: 눈덩이가 반대편으로 돌아간 뒤에는 걷힌 길 위라 커지지 않는다
    run(0.6, left);
    const d = ball.d;
    run(1, left);
    expect(ball.d).toBeCloseTo(d, 5);
    // 다시 쌓인다
    for (let t = 0; t < SNOW_FIELD.refillSeconds + 1; t += 0.5) f.update(0.5);
    expect(f.amountAt(mid, ball.y - 3)).toBe(1);
    expect(f.hasSnow(mid, ball.y - 3)).toBe(true);
  });

  it('처음엔 빨리, 클수록 천천히 커지고, 최대 64px를 넘지 않는다', () => {
    const area = 200;
    expect(grow(6, area) - 6).toBeGreaterThan(grow(20, area) - 20);
    expect(grow(20, area) - 20).toBeGreaterThan(grow(50, area) - 50);
    expect(grow(10, 0)).toBe(10);
    expect(grow(63.9, 1e6)).toBe(SNOWBALL.maxSize);
    expect(grow(64, 500)).toBe(64);
    // 지붕 눈 더미 위에서는 2배 빨리
    const d = 16;
    expect(grow(d, area, SNOWBALL.pileBoost) ** 2 - d * d).toBeCloseTo(2 * (grow(d, area) ** 2 - d * d), 5);
    const { world, ch, play, run } = setup();
    // 큰 눈덩이는 앞뒤로도 넓어서, 트리 화단에 걸리지 않게 맨 앞줄에서 굴린다
    ch.y = 262;
    const big = world.addBall(ch.x + 40, ch.y, 63.9, 'me');
    play.continueWith(big);
    run(6, right);
    expect(big.d).toBe(SNOWBALL.maxSize);
  });

  it('장애물과 바닥 띠 밖으로는 밀고 가지 못한다', () => {
    const { ch, play, run } = setup();
    play.start();
    run(SNOWBALL.gatherSeconds + 0.05);
    run(8, { x: 0, y: 1 });
    expect(ch.y).toBeLessThanOrEqual(WALK_AREA.y + WALK_AREA.h);
    const ball = play.rolling!;
    expect(ball.y).toBeLessThanOrEqual(WALK_AREA.y + WALK_AREA.h);
  });

  it('놓아둔 눈덩이는 지름 12px보다 크면 장애물이 되고, 5분 뒤 녹아 없어진다', () => {
    const world = createSnowWorld(() => 0.5);
    world.addBall(500, 240, 10, 'me');
    expect(world.obstacles()).toHaveLength(0);
    const big = world.addBall(540, 240, 20, 'me');
    expect(world.obstacles()).toHaveLength(1);
    expect(world.obstacles(big)).toHaveLength(0);
    world.update(SNOWBALL.idleSeconds - 1);
    expect(world.balls).toHaveLength(2);
    for (let t = 0; t < 40; t += 0.1) world.update(0.1);
    expect(world.balls).toHaveLength(0);
  });
});

describe('합치기 = 눈사람', () => {
  it('작은 쪽이 큰 쪽 위로 올라간다 (내가 굴리던 게 더 커도)', () => {
    expect(stackBalls(10, 30)).toEqual([30, 10]);
    expect(stackBalls(30, 10)).toEqual([30, 10]);
  });

  it('최대 3단, 눈사람 위에는 맨 위보다 작은 것만 올릴 수 있다', () => {
    expect(stackOnSnowman([30, 20], 10, 250)).toEqual([30, 20, 10]);
    expect(stackOnSnowman([30, 20], 20, 250)).toBeNull();
    expect(stackOnSnowman([30, 20], 25, 250)).toBeNull();
    expect(stackOnSnowman([30, 20, 10], 5, 250)).toBeNull();
    expect(SNOWMAN.maxTiers).toBe(3);
  });

  it('전체 높이가 화면 위로 잘리면 올리지 않는다', () => {
    expect(snowmanHeight([64, 60])).toBeCloseTo(64 + 60 * (1 - SNOWMAN.sink), 5);
    expect(fitsScreen(260, [64, 60])).toBe(true);
    expect(fitsScreen(260, [64, 62, 60])).toBe(true);
    expect(fitsScreen(118, [64, 62])).toBe(false);
    expect(stackOnSnowman([64, 62], 60, 130)).toBeNull();
  });

  it('높이에 따라 미니 · 중간 · 엄청 큰 눈사람으로 나뉜다', () => {
    expect(snowmanKind(snowmanHeight([10, 6]))).toBe('mini');
    expect(snowmanKind(23.9)).toBe('mini');
    expect(snowmanKind(24)).toBe('medium');
    expect(snowmanKind(snowmanHeight([30, 20]))).toBe('medium');
    expect(snowmanKind(64)).toBe('medium');
    expect(snowmanKind(snowmanHeight([50, 30]))).toBe('giant');
    // 생김새는 시드로 정해져 늘 같고, 미니는 팔·단추·장식이 없다
    expect(snowmanLook(7, 'giant')).toEqual(snowmanLook(7, 'giant'));
    expect(snowmanLook(7, 'giant').buttons).toBe(3);
    const mini = snowmanLook(7, 'mini');
    expect(mini.buttons).toBe(0);
    expect(mini.scarf).toBeNull();
    expect(mini.bucket).toBe(false);
  });

  it('굴리던 눈덩이를 놓인 눈덩이에 대고 놓으면 올라가 눈사람이 된다', () => {
    const { ch, world, play, run, saves } = setup();
    const lying = world.addBall(ch.x + 90, ch.y, 24, 'friend');
    play.start();
    run(SNOWBALL.gatherSeconds + 0.05);
    // 닿으면 멈추고 힌트
    run(4, right);
    expect(play.target).toBe(lying);
    expect(play.canStack).toBe(true);
    expect(play.hint(false)?.text).toBe('Space 올리기');
    const mine = play.rolling!.d;
    expect(mine).toBeLessThan(24);
    // 떼면 올린다
    run(0.05, none, false);
    expect(play.phase).toBe('lift');
    run(SNOWMAN.liftSmall + 0.1, none, false);
    expect(world.balls).toHaveLength(0);
    expect(world.snowmen).toHaveLength(1);
    const s = world.snowmen[0];
    expect(s.tiers[0]).toBe(24);
    expect(s.tiers[1]).toBeCloseTo(mine, 5);
    expect(s.x).toBe(lying.x);
    expect(saves()).toBeGreaterThan(0);
    // 뿌듯해한 뒤 다시 걸을 수 있다
    run(SNOWMAN.cheerSeconds + SNOWMAN.peekSeconds + 0.2, none, false);
    expect(play.busy).toBe(false);
  });

  it('내가 굴리던 게 더 크면 놓여 있던 작은 눈덩이가 내 눈덩이 위로 올라간다', () => {
    const { ch, world, play, run } = setup();
    const small = world.addBall(ch.x + 80, ch.y, 8, 'me');
    const mine = world.addBall(ch.x + 20, ch.y, 28, 'me');
    play.continueWith(mine);
    run(3, right);
    expect(play.target).toBe(small);
    run(0.05, none, false);
    run(SNOWMAN.liftSmall + 0.1, none, false);
    expect(world.snowmen).toHaveLength(1);
    expect(world.snowmen[0].tiers[0]).toBeGreaterThanOrEqual(28);
    expect(world.snowmen[0].tiers[1]).toBe(8);
    expect(world.balls).toHaveLength(0);
  });

  it('눈사람보다 큰 눈덩이를 대면 올리지 않고 고개를 갸우뚱한다', () => {
    const { ch, world, play, run } = setup();
    const snowman = world.addSnowman(ch.x + 90, ch.y, [20, 10], 'me');
    const big = world.addBall(ch.x + 22, ch.y, 30, 'me');
    play.continueWith(big);
    run(3, right);
    expect(play.target).toBe(snowman);
    expect(play.canStack).toBe(false);
    expect(play.hint(false)).toBeNull();
    run(0.05, none, false);
    expect(play.phase).toBe('shrug');
    expect(snowman.tiers).toEqual([20, 10]);
    expect(world.balls).toContain(big);
  });

  it('거의 같은 크기(차이 2px 이하)면 위 눈덩이가 흔들흔들하다 자리를 잡는다', () => {
    const { ch, world, play, run } = setup();
    world.addBall(ch.x + 80, ch.y, 11, 'me');
    const mine = world.addBall(ch.x + 14, ch.y, 10, 'me');
    play.continueWith(mine);
    run(3, right);
    run(0.05, none, false);
    run(SNOWMAN.liftSmall + 0.1, none, false);
    const s = world.snowmen[0];
    expect(Math.abs(s.tiers[0] - s.tiers[1])).toBeLessThanOrEqual(SNOWMAN.wobbleDiff);
    expect(s.wobble).toBeGreaterThan(0);
    world.update(SNOWMAN.wobbleSeconds + 0.1);
    expect(s.wobble).toBe(0);
  });

  it('큰 눈덩이는 굴려 올리다 중간에 한 번 밀려 내려왔다 다시 올라간다', () => {
    expect(largeLiftProgress(0)).toBe(0);
    expect(largeLiftProgress(1)).toBeCloseTo(1, 5);
    const before = largeLiftProgress(SNOWMAN.slipAt - 0.01);
    const slipped = largeLiftProgress(SNOWMAN.slipAt + 0.11);
    expect(slipped).toBeLessThan(before);
    expect(largeLiftProgress(0.9)).toBeGreaterThan(before);
  });
});

describe('눈사람이 남아 있기', () => {
  const fill = (world: SnowWorld, count: number) => {
    for (let i = 0; i < count; i++) world.addSnowman(100 + i * 30, 240, [20, 12], 'me');
  };

  it('12개를 넘으면 가장 오래된 것부터 10초에 걸쳐 녹아 없어진다', () => {
    const world = createSnowWorld(() => 0.5);
    fill(world, SNOWMAN.maxCount);
    expect(world.snowmen.every((s) => s.melt < 0)).toBe(true);
    world.addSnowman(900, 240, [10, 6], 'me');
    const melting = world.snowmen.filter((s) => s.melt >= 0);
    expect(melting).toHaveLength(1);
    expect(melting[0]).toBe(world.snowmen[0]);
    world.update(SNOWMAN.meltSeconds / 2);
    expect(world.snowmen).toHaveLength(SNOWMAN.maxCount + 1);
    world.update(SNOWMAN.meltSeconds / 2 + 0.1);
    expect(world.snowmen).toHaveLength(SNOWMAN.maxCount);
    // 하나 더 세우면 그다음 오래된 것이 녹는다
    world.addSnowman(940, 240, [10, 6], 'me');
    expect(world.snowmen.filter((s) => s.melt >= 0)).toHaveLength(1);
  });

  it('내 눈사람만 저장하고, 불러오면 그대로 다시 선다 (망가진 값은 버린다)', () => {
    const world = createSnowWorld(() => 0.5);
    world.addSnowman(300, 240, [30, 18, 9], 'me', 42);
    world.addSnowman(400, 240, [20, 10], 'friend', 7);
    const saved = world.saved('me');
    expect(saved).toEqual([{ x: 300, y: 240, tiers: [30, 18, 9], seed: 42, owner: 'me' }]);
    const again = createSnowWorld(() => 0.5);
    again.load([...saved, { x: Number.NaN, y: 1, tiers: [5, 3], seed: 1, owner: 'me' }, { x: 1, y: 1, tiers: [500], seed: 1, owner: 'me' }]);
    expect(again.snowmen).toHaveLength(1);
    expect(again.snowmen[0]).toMatchObject({ x: 300, y: 240, tiers: [30, 18, 9], seed: 42 });
  });
});

describe('스페이스 우선순위', () => {
  it('눈덩이 이어 굴리기도 가장 가까운 상호작용일 때만 고른다', () => {
    expect(
      nearestInteraction([
        { id: 'hat', distance: 14, radius: 16 },
        { id: 'ball', distance: 6, radius: SNOWBALL.continueRadius },
      ]),
    ).toBe('ball');
    expect(
      nearestInteraction([
        { id: 'carousel', distance: 5, radius: 22 },
        { id: 'ball', distance: 6, radius: SNOWBALL.continueRadius },
      ]),
    ).toBe('carousel');
    expect(nearestInteraction([{ id: 'ball', distance: SNOWBALL.continueRadius + 1, radius: SNOWBALL.continueRadius }])).toBeNull();
  });
});

describe('둘이 같이 밀기 · 이어서 굴리기', () => {
  it('두 사람의 방향을 더한다: 같은 쪽이면 2배, 한 명이면 1배, 반대면 제자리', () => {
    expect(combinePush(right, right)).toMatchObject({ x: 1, y: 0, factor: 2, stuck: false });
    expect(combinePush(right, null)).toMatchObject({ x: 1, y: 0, factor: 1, stuck: false });
    expect(combinePush(null, left)).toMatchObject({ x: -1, y: 0, factor: 1, stuck: false });
    expect(combinePush(right, left)).toMatchObject({ factor: 0, stuck: true });
    expect(combinePush(null, null)).toMatchObject({ factor: 0, stuck: false });
    // 비스듬히 다른 쪽으로 밀면 그 사이로, 조금 빠르게
    const diagonal = combinePush(right, { x: 0, y: 1 });
    expect(diagonal.factor).toBeCloseTo(Math.SQRT2, 5);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 5);
  });

  it('둘이 같은 쪽으로 밀면 두 배 빨리 굴러가고, 반대로 밀면 둘 다 버틴다', () => {
    const distance = (helper: { x: number; y: number } | null) => {
      const { ch, world, play, run } = setup();
      ch.y = 262;
      const ball = world.addBall(ch.x + 40, ch.y, 40, 'me');
      play.continueWith(ball);
      run(1, right);
      if (helper) {
        ball.holders = ['me', 'friend'];
        play.setHelperDir(helper);
      }
      const from = ball.x;
      run(1, right);
      return { moved: ball.x - from, play };
    };
    const alone = distance(null).moved;
    const together = distance(right).moved;
    expect(alone).toBeGreaterThan(10);
    expect(together).toBeCloseTo(alone * 2, 0);
    // 큰 눈덩이: 혼자 15px/s 가까이 느린 것을 둘이면 두 배로
    expect(rollSpeed(64) * 2).toBe(30);
    const against = distance(left);
    expect(against.moved).toBeCloseTo(0, 5);
    // 버티는 동안은 제자리에서 발을 동동
    expect(against.play.pose()?.pose).toBe('push');
  });

  it('먼저 잡은 사람이 놓아도 같이 밀던 사람이 있으면 눈덩이는 놓이지 않고 이어받는다', () => {
    const calls: string[] = [];
    const ch = createCharacter(START.x, START.y);
    const world = createSnowWorld(() => 0.5);
    const play = createSnowmanPlay(ch, world, {
      field: field(),
      owner: 'me',
      random: () => 0.5,
      save: () => {},
      sync: { rolling: () => {}, put: () => calls.push('put'), del: () => calls.push('del'), grab: () => calls.push('grab'), drop: () => calls.push('drop') },
    });
    const ball = world.addBall(ch.x + 14, ch.y, 10, 'me');
    play.continueWith(ball);
    expect(calls).toEqual(['grab']);
    ball.holders = ['me', 'friend'];
    play.update(DT, none, false);
    expect(calls).toEqual(['grab', 'drop']);
    expect(play.busy).toBe(false);
    expect(ball.heldBy).toBe('friend');
    expect(world.balls).toContain(ball);
    // 혼자 밀다 놓으면 그 자리에 놓인다
    ball.holders = [];
    ball.heldBy = null;
    play.continueWith(ball);
    play.update(DT, none, false);
    expect(calls).toEqual(['grab', 'drop', 'grab', 'put']);
  });

  it('같이 밀던 사람은 방향만 보내다가, 먼저 잡은 사람이 놓으면 이어받아 굴린다', () => {
    const pushes: string[] = [];
    const ch = createCharacter(START.x, START.y);
    const world = createSnowWorld(() => 0.5);
    const leader = { x: START.x + 30, y: START.y, facing: 'right' as const };
    const play = createSnowmanPlay(ch, world, {
      field: field(),
      owner: 'me',
      random: () => 0.5,
      save: () => {},
      sync: { rolling: () => {}, put: () => {}, del: () => {}, push: (_b, d) => pushes.push(`${d.x},${d.y}`) },
      partner: () => leader,
    });
    const ball = world.addBall(leader.x + 20, leader.y, 20, 'friend');
    ball.heldBy = 'friend';
    ball.holders = ['friend'];
    expect(play.joinAsHelper(ball)).toBe(true);
    expect(play.helping).toBe(ball);
    play.update(DT, right, true);
    // 먼저 잡은 사람 곁에 붙고, 눈덩이는 내가 움직이지 않는다
    expect(Math.abs(ch.x - leader.x)).toBeLessThan(5);
    expect(ball.x).toBe(leader.x + 20);
    expect(pushes).toEqual(['1,0']);
    // 둘까지만
    ball.holders = ['friend', 'me'];
    const third = createSnowmanPlay(createCharacter(START.x, START.y), world, { field: field(), owner: 'c', save: () => {} });
    expect(third.joinAsHelper(ball)).toBe(false);
    // 이어받기
    play.promote();
    expect(play.rolling).toBe(ball);
    expect(play.helping).toBeNull();
    expect(ball.heldBy).toBeNull();
  });

  it('만든 사람 기록: 처음 만든 사람 + 이어서 굴린 사람들 (최대 4명), 같이 만든 눈사람은 줄무늬 목도리', () => {
    const makers = [{ name: '산타', scarf: 1 }];
    expect(addMaker(makers, { name: '산타', scarf: 1 })).toBe(false);
    expect(addMaker(makers, { name: '루돌프', scarf: 3 })).toBe(true);
    addMaker(makers, { name: '셋', scarf: 0 });
    addMaker(makers, { name: '넷', scarf: 2 });
    expect(addMaker(makers, { name: '다섯', scarf: 4 })).toBe(false);
    expect(makers).toHaveLength(COPUSH.maxMakers);
    expect(mergeMakers([{ name: 'a', scarf: 0 }], [{ name: 'b', scarf: 1 }, { name: 'a', scarf: 0 }]).map((m) => m.name)).toEqual(['a', 'b']);

    // 남이 놓고 간 눈덩이를 이어 굴리면 나도 만든 사람으로 적힌다
    const ch = createCharacter(START.x, START.y);
    const world = createSnowWorld(() => 0.5);
    const play = createSnowmanPlay(ch, world, { field: field(), owner: 'me', random: () => 0.5, save: () => {}, me: () => ({ name: '루돌프', scarf: 3 }) });
    const lying = world.addBall(ch.x + 90, ch.y, 24, 'friend');
    lying.makers = [{ name: '산타', scarf: 1 }];
    const mine = world.addBall(ch.x + 14, ch.y, 10, 'friend');
    mine.makers = [{ name: '산타', scarf: 1 }];
    play.continueWith(mine);
    expect(mine.makers.map((m) => m.name)).toEqual(['산타', '루돌프']);
    for (let t = 0; t < 4; t += DT) play.update(DT, right, true);
    play.update(DT, none, false);
    for (let t = 0; t < SNOWMAN.liftSmall + 0.1; t += DT) play.update(DT, none, false);
    const s = world.snowmen[0];
    expect(s.makers.map((m) => m.name).sort()).toEqual(['루돌프', '산타']);
    expect(snowmanLook(s.seed, 'medium', s.makers).stripes).toEqual(expect.arrayContaining([1, 3]));
    // 혼자 만든 눈사람은 줄무늬가 아니다
    expect(snowmanLook(s.seed, 'medium', [{ name: '산타', scarf: 1 }]).stripes).toBeNull();
  });
});
