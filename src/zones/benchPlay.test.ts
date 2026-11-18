import { describe, expect, it } from 'vitest';
import { canStandAt, createCharacter } from '../character/character';
import { BENCH_SIT } from '../constants';
import type { InputActions } from '../input';
import { BENCHES, BENCH_HALF_WIDTH } from '../world';
import { benchAt, benchSeats, createBenchPlay, seatNear } from './benchPlay';

const none = { x: 0, y: 0 };
const actions = (over: Partial<InputActions> = {}): InputActions => ({
  tap: false,
  hold: false,
  cancel: false,
  up: false,
  debugFriend: false,
  ...over,
});

describe('벤치 앉기', () => {
  it('벤치마다 두 자리, 벤치 폭 안에 나란히 있고 서로 마주 본다', () => {
    const seats = benchSeats();
    expect(seats).toHaveLength(BENCHES.length * 2);
    for (const b of BENCHES.keys()) {
      const [left, right] = seats.filter((s) => s.bench === b);
      expect(right.x - left.x).toBeGreaterThanOrEqual(16);
      expect(Math.abs(left.x - BENCHES[b].x)).toBeLessThan(BENCH_HALF_WIDTH);
      expect(left.facing).toBe('right');
      expect(right.facing).toBe('left');
    }
  });

  it('벤치 앞에서 스페이스를 누르면 가까운 자리에 앉고, 다시 누르면 일어난다', () => {
    const seat = benchSeats()[1];
    const ch = createCharacter(seat.frontX + 2, seat.frontY + 3);
    expect(canStandAt(ch.x, ch.y)).toBe(true);
    const play = createBenchPlay(ch);
    expect(play.hint(false)?.text).toBe('Space 앉기');
    expect(play.handleWalking(actions({ tap: true }), none)).toBe(true);
    expect(play.seated).toEqual(seat);
    expect(ch.state.get()).toEqual({ kind: 'sitting', bench: seat.bench, slot: seat.slot });
    // ↑ = 손 흔들기 (앉은 채로)
    play.handleSeated(0.1, none, actions({ up: true }));
    expect(play.seated).not.toBeNull();
    play.handleSeated(0.1, none, actions({ tap: true }));
    expect(play.seated).toBeNull();
    expect(ch.state.get().kind).toBe('walk');
    // 일어난 자리는 걸을 수 있는 곳
    expect(canStandAt(ch.x, ch.y)).toBe(true);
    expect(ch.y).toBe(BENCHES[seat.bench].y + BENCH_SIT.standGap);
  });

  it('방향키를 눌러도 일어난다', () => {
    const seat = benchSeats()[0];
    const ch = createCharacter(seat.frontX, seat.frontY);
    const play = createBenchPlay(ch);
    play.handleWalking(actions({ tap: true }), none);
    play.handleSeated(0.1, { x: 1, y: 0 }, actions());
    expect(play.seated).toBeNull();
  });

  it('멀리서는 앉지 않는다', () => {
    const seat = benchSeats()[0];
    expect(seatNear(seat.frontX + 40, seat.frontY)).toBeNull();
    const ch = createCharacter(seat.frontX + 40, seat.frontY);
    const play = createBenchPlay(ch);
    expect(play.handleWalking(actions({ tap: true }), none)).toBe(false);
  });

  it('모바일: 벤치를 탭하면 걸어가서 앉는다', () => {
    const b = BENCHES[0];
    expect(benchAt(b.x, b.y - 5)).toBe(0);
    expect(benchAt(b.x - 40, b.y - 5)).toBe(-1);
    const ch = createCharacter(b.x + 40, b.y + 10);
    const play = createBenchPlay(ch);
    play.tapBench(0);
    expect(ch.target).not.toBeNull();
    // 도착했다고 치고
    ch.x = ch.target!.x;
    ch.y = ch.target!.y;
    ch.target = null;
    expect(play.handleWalking(actions(), none)).toBe(true);
    expect(play.seated?.bench).toBe(0);
  });
});
