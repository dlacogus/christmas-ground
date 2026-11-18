import { describe, expect, it } from 'vitest';
import { canStandAt, createCharacter } from '../character/character';
import { SKATE } from '../constants';
import type { InputActions } from '../input';
import { onIce, rinkBounds } from '../props/iceRink';
import { createSkatePlay } from './skatePlay';
import {
  createSkate,
  insideSkateArea,
  rinkExit,
  rinkExitInside,
  rinkGate,
  rinkInside,
  skateArea,
  speedOf,
  stepSkate,
  tryAirSpin,
  tryJump,
  tryStartSpin,
  stopSpin,
  type Skate,
  type SkateEvent,
} from './skating';

const DT = 1 / 60;
const none = { x: 0, y: 0 };
const center = () => {
  const b = rinkBounds();
  return { x: b.centerX, y: b.midY };
};

function run(s: Skate, seconds: number, dir = none, events: SkateEvent[] = []): SkateEvent[] {
  for (let t = 0; t < seconds; t += DT) stepSkate(s, DT, dir, events);
  return events;
}

const noActions = (): InputActions => ({ tap: false, hold: false, cancel: false, up: false, debugFriend: false });

describe('스케이트 미끄럼', () => {
  it('방향키는 가속한다 (90px/s²): 1초 뒤 약 90px/s', () => {
    const c = center();
    const s = createSkate(c.x - 150, c.y);
    run(s, 1, { x: 1, y: 0 });
    expect(s.vx).toBeCloseTo(SKATE.accel, -1);
  });

  it('최대 속도(120px/s)를 넘지 않는다', () => {
    const c = center();
    const s = createSkate(c.x - 180, c.y);
    for (let t = 0; t < 6; t += DT) {
      stepSkate(s, DT, { x: 1, y: 0.3 }, []);
      expect(speedOf(s)).toBeLessThanOrEqual(SKATE.maxSpeed + 1e-6);
    }
  });

  it('입력이 없으면 천천히 미끄러지다 멈춘다: 멈추기까지 v²/(2×25)', () => {
    const c = center();
    const s = createSkate(c.x - 40, c.y);
    s.vx = 50;
    run(s, 5);
    expect(speedOf(s)).toBe(0);
    const expected = (50 * 50) / (2 * SKATE.friction);
    expect(s.x - (c.x - 40)).toBeGreaterThan(expected - 2);
    expect(s.x - (c.x - 40)).toBeLessThan(expected + 2);
  });

  it('반대 방향키는 브레이크 (140px/s²)', () => {
    const c = center();
    const s = createSkate(c.x - 100, c.y);
    s.vx = 70;
    const events = run(s, 0.25, { x: -1, y: 0 });
    expect(events).toContain('brake');
    expect(s.braking).toBe(true);
    expect(s.vx).toBeCloseTo(70 - SKATE.brake * 0.25, -1);
    // 브레이크로는 거꾸로 가속하지 않는다
    run(s, 0.3, { x: -1, y: 0 });
    expect(s.vx).toBeGreaterThanOrEqual(-SKATE.accel * 0.1);
  });
});

describe('링크 벽과 넘어지기', () => {
  it('벽에서 튕기면 속도가 절반이 되고 방향이 바뀐다', () => {
    const a = skateArea();
    const y = Math.round((a.top + a.bottom) / 2);
    const s = createSkate(a.right - 0.5, y);
    s.vx = 60;
    const events: SkateEvent[] = [];
    stepSkate(s, DT, none, events);
    expect(events).toContain('bounce');
    expect(s.vx).toBeLessThan(0);
    // 벽에 닿기 직전 속도(감속 조금)의 절반
    expect(speedOf(s)).toBeCloseTo((60 - SKATE.friction * DT) * SKATE.bounce, 3);
    expect(s.phase).toBe('gliding');
  });

  it('초당 90px 넘게 부딪히면 넘어지고, 1.2초 동안 입력을 받지 않다가 일어난다', () => {
    const a = skateArea();
    const y = Math.round((a.top + a.bottom) / 2);
    const fast = createSkate(a.right - 1, y);
    fast.vx = 100;
    const events = run(fast, DT);
    expect(events).toContain('fall');
    expect(fast.phase).toBe('fallen');
    run(fast, SKATE.fallSeconds - 0.1, { x: -1, y: 0 });
    expect(fast.phase).toBe('fallen');
    expect(speedOf(fast)).toBe(0);
    run(fast, 0.2);
    expect(fast.phase).toBe('gliding');

    const slow = createSkate(a.right - 1, y);
    slow.vx = 85;
    expect(run(slow, DT)).not.toContain('fall');
  });

  it('링크 밖으로 나가지 못한다 (어떤 입력에도 얼음 위)', () => {
    const c = center();
    const s = createSkate(c.x, c.y);
    const dirs = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ];
    for (let i = 0; i < 40; i++) {
      for (let t = 0; t < 1.5; t += DT) {
        stepSkate(s, DT, dirs[i % dirs.length], []);
        expect(insideSkateArea(s.x, s.y)).toBe(true);
        expect(onIce(s.x, s.y)).toBe(true);
      }
    }
  });

  it('둥근 모서리로 비스듬히 박아도 링크 안에 남는다', () => {
    const a = skateArea();
    const s = createSkate(a.left + a.radiusX, a.top + a.radiusY);
    s.vx = -SKATE.maxSpeed * 0.7;
    s.vy = -SKATE.maxSpeed * 0.7;
    run(s, 1);
    expect(insideSkateArea(s.x, s.y)).toBe(true);
  });
});

describe('기술', () => {
  it('점프는 초당 40px 이상일 때만, 0.5초 뒤 착지', () => {
    const c = center();
    const slow = createSkate(c.x, c.y);
    slow.vx = 30;
    expect(tryJump(slow)).toBe(false);
    const fast = createSkate(c.x - 100, c.y);
    fast.vx = 60;
    expect(tryJump(fast)).toBe(true);
    const events = run(fast, SKATE.jumpSeconds + DT);
    expect(events).toContain('land');
    expect(fast.jump).toBeNull();
  });

  it('스핀은 미끄러지면서도 돌고 (미끄럼 감속만), 4초 넘게 돌면 어지러워 비틀거린다', () => {
    const c = center();
    const s = createSkate(c.x - 150, c.y);
    s.vx = 60;
    expect(tryStartSpin(s)).toBe(true);
    run(s, 1, { x: -1, y: 0 });
    // 도는 동안 방향키는 받지 않고, 미끄럼 감속만큼만 느려진다
    expect(s.vx).toBeCloseTo(60 - SKATE.friction, 0);
    expect(s.x).toBeGreaterThan(c.x - 150 + 40);
    stopSpin(s);
    expect(s.phase).toBe('gliding');
    // 서 있을 때도 돈다
    s.vx = 0;
    tryStartSpin(s);
    const events = run(s, SKATE.dizzyAfter + 0.1);
    expect(events).toContain('dizzy');
    expect(s.phase).toBe('dizzy');
    // 점프 중에는 땅 스핀이 시작되지 않는다
    const air = createSkate(c.x - 100, c.y);
    air.vx = 60;
    tryJump(air);
    expect(tryStartSpin(air)).toBe(false);
  });

  it('공중 스핀: 점프한 뒤 알맞은 때 다시 누르면 돌고, 너무 이르거나 늦으면 안 된다', () => {
    const c = center();
    const make = () => {
      const s = createSkate(c.x - 120, c.y);
      s.vx = 60;
      tryJump(s);
      return s;
    };
    // 알맞은 때
    const good = make();
    run(good, (SKATE.airSpinFrom + SKATE.airSpinUntil) / 2);
    expect(tryAirSpin(good)).toBe(true);
    expect(tryAirSpin(good)).toBe(false);
    const events = run(good, SKATE.jumpSeconds);
    expect(events).toContain('spinLand');
    expect(good.airSpin).toBe(false);
    // 너무 이르다
    const early = make();
    expect(tryAirSpin(early)).toBe(false);
    // 너무 늦다
    const late = make();
    run(late, SKATE.airSpinUntil + 0.05);
    expect(tryAirSpin(late)).toBe(false);
    expect(run(late, SKATE.jumpSeconds)).toContain('land');
    // 땅에서는 공중 스핀이 없다
    expect(tryAirSpin(createSkate(c.x, c.y))).toBe(false);
  });
});

describe('들어가고 나오기', () => {
  const tap = (): InputActions => ({ ...noActions(), tap: true });

  function enter() {
    const g = rinkGate();
    const ch = createCharacter(g.x, g.y);
    const play = createSkatePlay(ch, []);
    expect(play.handleWalking(tap(), none)).toBe(true);
    expect(play.phase).toBe('puttingOn');
    for (let t = 0; t < SKATE.putOnSeconds + 0.1; t += DT) play.update(DT);
    expect(play.phase).toBe('on');
    return { ch, play };
  }

  it('입구에서 스페이스로 신고 0.8초 뒤 얼음 위로 나간다', () => {
    const { ch, play } = enter();
    expect(ch.state.get().kind).toBe('skating');
    expect(onIce(ch.x, ch.y)).toBe(true);
    expect(play.skate!.x).toBe(rinkInside().x);
  });

  it('입구 근처가 아니면 스페이스를 눌러도 신지 않는다', () => {
    const g = rinkGate();
    const ch = createCharacter(g.x + 60, g.y);
    const play = createSkatePlay(ch, []);
    expect(play.handleWalking(tap(), none)).toBe(false);
    expect(play.active).toBe(false);
  });

  it('입구와 출구는 앞 울타리 양 끝에 따로 있다', () => {
    const g = rinkGate();
    const e = rinkExit();
    expect(e.x - g.x).toBeGreaterThan(200);
    expect(e.y).toBe(g.y);
    expect(canStandAt(e.x, e.y)).toBe(true);
    expect(onIce(rinkExitInside().x, rinkExitInside().y)).toBe(true);
    // 출구 앞에서는 신을 수 없다
    const ch = createCharacter(e.x, e.y);
    const play = createSkatePlay(ch, []);
    expect(play.handleWalking(tap(), none)).toBe(false);
    expect(play.hint(false)?.sub).toContain('입구');
  });

  it('출구에서 느릴 때만 스페이스가 벗기로 동작하고, 출구 밖에 선다', () => {
    const { ch, play } = enter();
    const p = rinkExitInside();
    play.skate!.x = p.x;
    play.skate!.y = p.y;
    // 빠르면 벗지 않는다 (점프도 나가지 않는다)
    play.skate!.vx = 50;
    play.handleInput(none, tap(), false, null);
    expect(play.phase).toBe('on');
    expect(play.skate!.jump).toBeNull();
    // 느리면 벗고 걷는다
    play.skate!.vx = 10;
    expect(play.hint(false)?.text).toBe('출구');
    play.handleInput(none, tap(), false, null);
    expect(play.phase).toBe('off');
    expect(ch.state.get().kind).toBe('walk');
    expect(ch.x).toBe(rinkExit().x);
    expect(ch.y).toBe(rinkExit().y);
  });

  it('입구 안쪽에서는 멈춰도 벗을 수 없다 (출구를 안내한다)', () => {
    const { play } = enter();
    play.skate!.vx = 0;
    play.handleInput(none, tap(), false, null);
    expect(play.phase).toBe('on');
    for (let t = 0; t < SKATE.tipsSeconds + 0.1; t += DT) play.update(DT);
    expect(play.hint(false)?.text).toContain('출구');
  });

  it('출구에서 멀면 느려도 스페이스는 벗기가 아니다', () => {
    const { play } = enter();
    const c = center();
    play.skate!.x = c.x;
    play.skate!.y = c.y;
    play.skate!.vx = 0;
    play.handleInput(none, tap(), false, null);
    expect(play.phase).toBe('on');
  });

  it('지나간 자리에 날 자국이 남고 3초 동안 서서히 사라진다 (개수 상한)', () => {
    const { play } = enter();
    for (let t = 0; t < 2; t += DT) {
      play.handleInput({ x: 1, y: -0.2 }, noActions(), false, null);
      play.update(DT);
    }
    expect(play.marks.length).toBeGreaterThan(20);
    expect(play.marks.length).toBeLessThanOrEqual(SKATE.trailMax);
    // 멈출 때까지 미끄러진 뒤(최대 속도에서 약 5초) 자국이 남아 있는 시간만큼 기다린다
    for (let t = 0; t < SKATE.maxSpeed / SKATE.friction + SKATE.trailSeconds + 1; t += DT) {
      play.handleInput(none, noActions(), false, null);
      play.update(DT);
    }
    // 멈춘 뒤에는 새 자국이 생기지 않고 남은 것은 사라진다
    expect(play.marks.length).toBe(0);
  });
});
