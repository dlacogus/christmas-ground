// 눈 밟는 발자국: 걸을 때 발을 디딜 때마다 작은 '뽀득'.
// 걸러 낸 잡음 알갱이 두 개(눌리는 소리 + 살짝 늦게 으스러지는 소리)를 아주 짧게 낸다.

import { FOOTSTEPS as F } from '../constants';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface StepTimer {
  /** 발을 디딜 때까지 남은 시간 */
  remaining: number;
}

export function createStepTimer(): StepTimer {
  return { remaining: 0 };
}

/** 걷는 동안 일정 간격마다 true (발을 디딤). 멈추면 다음 첫 걸음에서 바로 소리가 난다 */
export function advanceStepTimer(timer: StepTimer, dt: number, moving: boolean): boolean {
  if (!moving) {
    timer.remaining = 0;
    return false;
  }
  timer.remaining -= dt;
  if (timer.remaining > 0) return false;
  timer.remaining += F.interval;
  if (timer.remaining <= 0) timer.remaining = F.interval;
  return true;
}

export interface Footsteps extends SoundPart {
  /** 발을 한 번 디딘다 */
  step(): void;
}

export function createFootsteps(): Footsteps {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;

  const grain = (ctx: AudioContext, dest: AudioNode, when: number, hz: number, level: number, length: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = F.filterQ;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(level, when + F.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(filter).connect(env).connect(dest);
    src.start(when, Math.random() * (F.noiseSeconds - length), length);
  };

  return {
    start(ctx: AudioContext, dest: AudioNode) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, F.noiseSeconds);
    },
    step() {
      if (!audio || !out || audio.state !== 'running') return;
      const now = audio.currentTime;
      // 걸음마다 높이를 조금씩 달리해 기계적으로 들리지 않게
      const vary = 1 + (Math.random() * 2 - 1) * F.pitchVariation;
      grain(audio, out, now, F.pressHz * vary, F.volume, F.pressLength);
      grain(audio, out, now + F.crunchDelay, F.crunchHz * vary, F.volume * F.crunchLevel, F.crunchLength);
    },
  };
}
