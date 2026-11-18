import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { THROW } from '../constants';
import { parseClientMessage, validBall, validSnowman } from '../shared/protocol';
import { createSnowField as createField, type SnowField } from '../scenery/snowField';
import { MAP_WIDTH, WALK_AREA } from '../world';
import { createSnowmanPlay } from './snowmanPlay';
import { createSnowWorld, type Snowman } from './snowman';
import { createThrowPlay, fallAt } from './throwPlay';
import { flightAt, headOf, hitPart, hitPerson, hitsNeeded, knockOff, pressKind, registerHit, restoreFace, throwDir } from './throwing';

const DT = 1 / 60;
/** 온통 눈으로 덮인 눈밭 */
const createSnowField = (): SnowField => createField(new Uint8Array(MAP_WIDTH * WALK_AREA.h).fill(1), MAP_WIDTH, WALK_AREA.h, { x: 0, y: WALK_AREA.y });
const START = { x: 620, y: 236 };

function setup() {
  const ch = createCharacter(START.x, START.y);
  const world = createSnowWorld(() => 0.5);
  let now = 100;
  const sent: string[] = [];
  const puts: string[] = [];
  const play = createThrowPlay(ch, world, {
    now: () => now,
    canScoop: () => true,
    owner: () => 'me',
    send: {
      throw: () => sent.push('throw'),
      hit: (_s, n) => sent.push(`hit${n}`),
      splat: (to, head) => sent.push(`splat:${to}:${head}`),
    },
    put: (thing) => puts.push(thing.kind),
    targets: () => targets,
  });
  const targets: { id: string; x: number; y: number; lift: number }[] = [];
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      now += DT;
      play.update(DT, 0);
    }
  };
  /** 한 번 던지고 끝까지 기다린다 */
  const shoot = () => {
    expect(play.start(0)).toBe(true);
    run(THROW.scoopSeconds + THROW.flightSeconds + THROW.cooldown);
  };
  return { ch, world, play, sent, puts, targets, run, shoot, wait: (seconds: number) => (now += seconds) };
}

/** 던지면 머리에 맞는 자리에 눈사람을 세운다 */
function snowmanInFront(world: ReturnType<typeof createSnowWorld>, tiers: number[], distance = 50): Snowman {
  // 포물선이 머리 높이를 지나는 거리에 둔다
  return world.addSnowman(START.x + distance, START.y, tiers, 'me');
}

describe('눈덩이 던지기', () => {
  it('짧게 누르면 던지기, 꾹 누르면 굴리기', () => {
    expect(pressKind(0.1)).toBe('throw');
    expect(pressKind(THROW.shortPress - 0.01)).toBe('throw');
    expect(pressKind(THROW.shortPress)).toBe('roll');
    expect(pressKind(1)).toBe('roll');
  });

  it('바라보는 쪽으로 던지고, ↑↓를 누르고 있으면 대각선', () => {
    expect(throwDir('right', 0)).toEqual({ x: 1, y: 0 });
    expect(throwDir('left', 0)).toEqual({ x: -1, y: 0 });
    const up = throwDir('right', -1);
    expect(up.x).toBeCloseTo(Math.SQRT1_2);
    expect(up.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(up.x, up.y)).toBeCloseTo(1);
  });

  it('포물선으로 최대 120px 날아가 땅에 떨어진다 (같은 입력이면 어느 화면에서나 같은 자리)', () => {
    const start = { x: 500, y: 240 };
    const dir = throwDir('right', 0);
    expect(flightAt(start, dir, 0)).toMatchObject({ x: 500, y: 240, z: THROW.handHeight, done: false });
    const mid = flightAt(start, dir, THROW.flightSeconds / 2);
    expect(mid.z).toBeGreaterThan(THROW.handHeight);
    const end = flightAt(start, dir, THROW.flightSeconds);
    expect(end.x - start.x).toBeCloseTo(THROW.range);
    expect(THROW.range).toBe(120);
    expect(end.z).toBeCloseTo(0);
    expect(end.done).toBe(true);
    // 더 지나도 그 자리
    expect(flightAt(start, dir, 5).x).toBeCloseTo(end.x);
    // 대각선은 120px을 넘지 않는다
    const diag = flightAt(start, throwDir('left', 1), THROW.flightSeconds);
    expect(Math.hypot(diag.x - start.x, diag.y - start.y)).toBeLessThanOrEqual(THROW.range);
    expect(flightAt(start, dir, 0.3)).toEqual(flightAt(start, dir, 0.3));
  });

  it('주저앉아 뭉친 뒤 던지고, 0.6초에 한 번만 던진다', () => {
    const { play, sent, run } = setup();
    expect(play.start(0)).toBe(true);
    expect(play.pose()?.pose).toBe('crouch');
    run(THROW.scoopSeconds - 0.05);
    expect(play.flying).toBe(0);
    run(0.1);
    expect(play.flying).toBe(1);
    expect(sent).toEqual(['throw']);
    // 바로 또 던질 수는 없다
    run(0.2);
    expect(play.start(0)).toBe(false);
    run(THROW.cooldown);
    expect(play.start(0)).toBe(true);
  });

  it('머리 크기별 필요한 횟수: 작으면 1번, 중간 2번, 크면 5번', () => {
    expect(hitsNeeded(10)).toBe(1);
    expect(hitsNeeded(20)).toBe(2);
    expect(hitsNeeded(40)).toBe(5);
  });

  it('30초 동안 안 맞으면 맞힌 횟수가 처음으로 돌아간다', () => {
    const state = { hits: 0, hitAt: -999 };
    expect(registerHit(state, 10)).toBe(1);
    expect(registerHit(state, 20)).toBe(2);
    expect(registerHit(state, 20 + THROW.resetSeconds - 1)).toBe(3);
    expect(registerHit(state, 20 + THROW.resetSeconds * 2)).toBe(1);
  });

  it('머리에 맞으면 머리가, 몸통에 맞으면 몸통이 맞는다', () => {
    const s = { x: 500, y: 240, tiers: [30, 20] };
    const head = headOf(s);
    expect(hitPart({ x: 500, y: 240, z: head.z }, s)).toBe('head');
    expect(hitPart({ x: 500, y: 240, z: 10 }, s)).toBe('body');
    expect(hitPart({ x: 540, y: 240, z: head.z }, s)).toBeNull();
    // 깊이가 다르면 안 맞는다
    expect(hitPart({ x: 500, y: 240 + THROW.depthReach + 2, z: head.z }, s)).toBeNull();
    // 머리 없는 몸통은 몸통만
    expect(hitPart({ x: 500, y: 240, z: 15 }, { ...s, tiers: [30], headless: true })).toBe('body');
    expect(hitPerson({ x: 500, y: 240, z: 26 }, { x: 500, y: 240 })).toBe('head');
    expect(hitPerson({ x: 500, y: 240, z: 8 }, { x: 500, y: 240 })).toBe('body');
    expect(hitPerson({ x: 520, y: 240, z: 8 }, { x: 500, y: 240 })).toBeNull();
  });

  it('작은 머리는 한 번에 떨어진다: 몸통은 머리 없이 남고, 머리는 얼굴이 붙은 눈덩이가 된다', () => {
    const { world, sent, puts, shoot, run } = setup();
    const s = snowmanInFront(world, [24, 10]);
    s.props = [{ p: 'carrot', by: '산타' }, { p: 'ribbon', by: '산타' }, { p: 'broom', by: '산타' }];
    s.hat = { name: '산타', color: 1 };
    shoot();
    expect(sent).toContain('hit1');
    expect(s.headless).toBe(true);
    expect(s.tiers).toEqual([24]);
    // 얼굴·머리 쪽 소품과 모자는 머리와 함께 떨어지고, 목·몸통·팔 소품은 남는다
    expect(s.props.map((a) => a.p)).toEqual(['ribbon', 'broom']);
    expect(s.hat).toBeNull();
    run(2);
    expect(world.balls).toHaveLength(1);
    const head = world.balls[0];
    expect(head.d).toBe(10);
    expect(head.face?.props?.map((a) => a.p)).toEqual(['carrot']);
    expect(head.face?.hat).toEqual({ name: '산타', color: 1 });
    // 크기에 따라 10~40px 굴러간다
    const rolled = Math.abs(head.x - s.x) - (24 / 2 + 10 / 2 + 1);
    expect(rolled).toBeGreaterThanOrEqual(THROW.rollMin - 1);
    expect(rolled).toBeLessThanOrEqual(THROW.rollMax + 1);
    expect(puts).toEqual(['snowman', 'ball']);
    // 서버가 받는 형식
    expect(validSnowman({ x: s.x, y: s.y, tiers: s.tiers, seed: 1, owner: 'a', headless: true })).toBe(true);
    expect(validSnowman({ x: s.x, y: s.y, tiers: s.tiers, seed: 1, owner: 'a' })).toBe(false);
    expect(validBall({ x: head.x, y: head.y, d: head.d, roll: 0, seed: 1, owner: 'a', face: head.face })).toBe(true);
    expect(parseClientMessage(JSON.stringify({ t: 'throw', x: 500, y: 240, dx: 1, dy: 0, p: 30 }))).not.toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'hit', id: 'a-1', n: 9, dir: 1 }))).toBeNull();
  });

  it('중간 머리는 두 번 맞아야 떨어지고, 한 번 맞을 때마다 흔들린다', () => {
    const { world, shoot, sent } = setup();
    const s = snowmanInFront(world, [34, 20]);
    shoot();
    expect(s.headless).toBe(false);
    expect(s.hits).toBe(1);
    expect(s.wobble).toBeGreaterThan(0);
    shoot();
    expect(sent.filter((m) => m.startsWith('hit'))).toEqual(['hit1', 'hit2']);
    expect(s.headless).toBe(true);
  });

  it('30초 쉬었다 맞히면 다시 처음부터 세어야 한다', () => {
    const { world, shoot, wait } = setup();
    const s = snowmanInFront(world, [34, 20]);
    shoot();
    wait(THROW.resetSeconds + 1);
    shoot();
    expect(s.hits).toBe(1);
    expect(s.headless).toBe(false);
  });

  it('3단 눈사람은 맨 위만 떨어진다', () => {
    const k = knockOff({ tiers: [40, 28, 12], seed: 3, props: [], hat: null }, 1);
    expect(k.tiers).toEqual([40, 28]);
    expect(k.head.d).toBe(12);
    expect(k.dir).toBe(1);
    expect(knockOff({ tiers: [40, 28, 12], seed: 3, props: [], hat: null }, -1).dir).toBe(-1);
    // 큰 머리일수록 멀리 굴러간다
    expect(knockOff({ tiers: [60, 40], seed: 3, props: [], hat: null }, 1).distance).toBe(THROW.rollMax);
    expect(k.distance).toBeLessThan(THROW.rollMax);
    expect(k.distance).toBeGreaterThanOrEqual(THROW.rollMin);
  });

  it('떨어지는 머리는 젖혀졌다 떨어져 데굴데굴 구른다', () => {
    const f = { x: 500, z: 40, d: 12, edge: 20, dir: 1, distance: 30 };
    expect(fallAt(f, 0).z).toBe(34);
    const total = THROW.tiltSeconds + THROW.fallSeconds + THROW.rollSeconds;
    const end = fallAt(f, total);
    expect(end.z).toBe(0);
    expect(end.x).toBeCloseTo(500 + 20 + 30);
  });

  it('떨어진 머리를 다시 올리면 눈사람이 복원된다 (얼굴·소품·모자 그대로)', () => {
    const back = restoreFace({ props: [{ p: 'ribbon', by: 'a' }] }, { seed: 42, props: [{ p: 'glasses', by: 'b' }], hat: { name: '산타', color: 1 } });
    expect(back.seed).toBe(42);
    expect(back.props.map((a) => a.p)).toEqual(['ribbon', 'glasses']);
    expect(back.hat).toEqual({ name: '산타', color: 1 });

    // 실제로: 머리 눈덩이를 몸통에 올린다
    const ch = createCharacter(START.x, START.y);
    const world = createSnowWorld(() => 0.5);
    const field = createSnowField();
    const play = createSnowmanPlay(ch, world, { field, owner: 'me', random: () => 0.5, save: () => {} });
    const body = world.addSnowman(ch.x + 60, ch.y, [30], 'me');
    body.headless = true;
    body.props = [{ p: 'ribbon', by: 'a' }];
    const head = world.addBall(ch.x + 14, ch.y, 12, 'me');
    head.face = { seed: 42, props: [{ p: 'glasses', by: 'b' }], hat: { name: '산타', color: 1 } };
    // 눈 없는 길로만 굴려 간다 (얼굴이 묻히지 않게 길을 먼저 걷어 둔다)
    for (let x = ch.x; x < ch.x + 80; x += 2) field.take(x, ch.y - 4, 12, 12);
    play.continueWith(head);
    for (let t = 0; t < 3; t += DT) play.update(DT, { x: 1, y: 0 }, true);
    expect(head.face).not.toBeNull();
    expect(play.canStack).toBe(true);
    play.update(DT, { x: 0, y: 0 }, false);
    for (let t = 0; t < 1; t += DT) play.update(DT, { x: 0, y: 0 }, false);
    expect(body.headless).toBe(false);
    expect(body.tiers).toEqual([30, 12]);
    expect(body.seed).toBe(42);
    expect(body.props.map((a) => a.p)).toEqual(['ribbon', 'glasses']);
    expect(body.hat).toEqual({ name: '산타', color: 1 });
  });

  it('눈 위로 굴리면 얼굴이 묻혀 그냥 눈덩이가 된다', () => {
    const ch = createCharacter(START.x, START.y);
    const world = createSnowWorld(() => 0.5);
    const play = createSnowmanPlay(ch, world, { field: createSnowField(), owner: 'me', random: () => 0.5, save: () => {} });
    const head = world.addBall(ch.x + 14, ch.y, 12, 'me');
    head.face = { seed: 42 };
    play.continueWith(head);
    for (let t = 0; t < 1; t += DT) play.update(DT, { x: 1, y: 0 }, true);
    expect(head.face).toBeNull();
    expect(head.d).toBeGreaterThan(12);
  });

  it('친구를 맞히면 서버에 알린다 (머리인지 몸인지)', () => {
    const { targets, sent, shoot } = setup();
    targets.push({ id: 'friend', x: START.x + 105, y: START.y, lift: 0 });
    shoot();
    expect(sent.some((m) => m.startsWith('splat:friend'))).toBe(true);
  });
});
