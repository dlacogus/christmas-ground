// 벤치에 앉기: 벤치마다 두 자리. 벤치 앞에서 스페이스(모바일은 벤치를 탭)로 가까운 빈자리에 앉는다.
// 앉아 있는 동안 ↑ = 손 흔들기, 스페이스·Esc·방향키(모바일은 탭) = 일어나기. 두 자리는 서로 마주 보게 앉는다.

import { layerOffsetX, type Camera } from '../camera';
import { setWalkTarget, type Character, type MoveInput } from '../character/character';
import { drawCharacter } from '../character/render';
import type { Facing } from '../character/sprites';
import { BENCH, BENCH_SIT as K, LAYER_FACTORS } from '../constants';
import type { InputActions } from '../input';
import { BENCHES, BENCH_HALF_WIDTH } from '../world';
import type { PlayHint } from './carouselPlay';

export interface BenchSeat {
  bench: number;
  slot: number;
  /** 앉았을 때 발밑 (벤치 바로 앞, 벤치보다 앞에 그려지게) */
  x: number;
  y: number;
  facing: Facing;
  /** 앉으러 다가가는 자리 (벤치 앞) */
  frontX: number;
  frontY: number;
}

export function benchSeats(): BenchSeat[] {
  return BENCHES.flatMap((b, bench) =>
    [-1, 1].map((side, slot) => ({
      bench,
      slot,
      x: b.x + side * K.seatOffset,
      y: b.y + 1,
      // 왼쪽 자리는 오른쪽을, 오른쪽 자리는 왼쪽을 본다 (나란히 앉은 둘이 마주 본다)
      facing: (side < 0 ? 'right' : 'left') as Facing,
      frontX: b.x + side * K.seatOffset,
      frontY: b.y + K.frontGap,
    })),
  );
}

const SEATS = benchSeats();

/** 이 자리에서 앉을 수 있는 가장 가까운 자리 (없으면 null) */
export function seatNear(x: number, y: number, taken: (seat: BenchSeat) => boolean = () => false): BenchSeat | null {
  let best: BenchSeat | null = null;
  let bestD: number = K.sitRadius;
  for (const seat of SEATS) {
    if (taken(seat)) continue;
    const d = Math.hypot(x - seat.frontX, y - seat.frontY);
    if (d <= bestD) {
      best = seat;
      bestD = d;
    }
  }
  return best;
}

/** 화면에서 벤치를 눌렀나 (맵 좌표). 누른 벤치 번호, 없으면 -1 */
export function benchAt(x: number, y: number): number {
  return BENCHES.findIndex((b) => Math.abs(x - b.x) <= BENCH_HALF_WIDTH + 2 && y <= b.y + 2 && y >= b.y - BENCH.backTopAbove - 2);
}

export interface BenchPlay {
  /** 앉아 있나 */
  readonly seated: BenchSeat | null;
  /** 걷는 중: 벤치 앞에서 스페이스면 앉는다. 처리했으면 true */
  handleWalking(actions: InputActions, dir: MoveInput): boolean;
  /** 앉아 있는 동안의 입력 */
  handleSeated(dt: number, dir: MoveInput, actions: InputActions): void;
  /** 모바일: 벤치를 탭 (멀면 걸어가서 앉는다) */
  tapBench(bench: number): void;
  standUp(): void;
  hint(touch: boolean): PlayHint | null;
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

export function createBenchPlay(character: Character): BenchPlay {
  let seated: BenchSeat | null = null;
  let waveLeft = 0;
  let time = 0;
  let sitOnArrive: BenchSeat | null = null;

  const sitDown = (seat: BenchSeat) => {
    seated = seat;
    waveLeft = 0;
    sitOnArrive = null;
    character.x = seat.x;
    character.y = seat.y;
    character.facing = seat.facing;
    character.target = null;
    character.moving = false;
    character.puffs.length = 0;
    character.state.set({ kind: 'sitting', bench: seat.bench, slot: seat.slot });
  };

  const standUp = () => {
    if (!seated) return;
    character.x = seated.x;
    character.y = BENCHES[seated.bench].y + K.standGap;
    character.moving = false;
    character.animTime = 0;
    seated = null;
    character.state.set({ kind: 'walk' });
  };

  return {
    get seated() {
      return seated;
    },
    handleWalking(actions, dir) {
      if (seated) return false;
      if (dir.x !== 0 || dir.y !== 0) sitOnArrive = null;
      if (character.state.get().kind !== 'walk') return false;
      if (actions.tap || actions.hold) {
        const seat = seatNear(character.x, character.y);
        if (seat) {
          sitDown(seat);
          return true;
        }
      }
      if (sitOnArrive && !character.target) {
        const seat = sitOnArrive;
        sitOnArrive = null;
        if (Math.hypot(character.x - seat.frontX, character.y - seat.frontY) <= K.sitRadius) {
          sitDown(seat);
          return true;
        }
      }
      return false;
    },
    handleSeated(dt, dir, actions) {
      time += dt;
      waveLeft = Math.max(0, waveLeft - dt);
      if (!seated) return;
      if (actions.up) {
        waveLeft = K.waveSeconds;
        return;
      }
      if (actions.tap || actions.hold || actions.cancel || dir.x !== 0 || dir.y > 0) standUp();
    },
    tapBench(bench) {
      if (seated || character.state.get().kind !== 'walk') return;
      // 그 벤치에서 가까운 쪽 자리로
      const seat = SEATS.filter((s) => s.bench === bench).sort(
        (a, b) => Math.abs(a.frontX - character.x) - Math.abs(b.frontX - character.x),
      )[0];
      if (Math.hypot(character.x - seat.frontX, character.y - seat.frontY) <= K.sitRadius) {
        sitDown(seat);
        return;
      }
      setWalkTarget(character, seat.frontX, seat.frontY);
      sitOnArrive = seat;
    },
    standUp,
    hint(touch) {
      if (seated) return touch ? { text: '탭하면 일어나요', anchor: 'bottom' } : { text: 'Space 일어나기', sub: '↑ 손 흔들기', anchor: 'bottom' };
      if (character.state.get().kind !== 'walk' || !seatNear(character.x, character.y)) return null;
      return touch ? { text: '벤치를 탭', sub: '앉기', anchor: 'head' } : { text: 'Space 앉기', anchor: 'head' };
    },
    draw(ctx, camera) {
      if (!seated) return;
      const waving = waveLeft > 0;
      drawCharacter(ctx, character, layerOffsetX(camera, LAYER_FACTORS.main), {
        pose: waving ? 'sitWave' : 'sit',
        index: waving ? Math.floor(time / K.waveFrameSeconds) : 0,
        lift: K.lift,
        shadow: false,
      });
    },
  };
}
