// 스케이트장 소리: Web Audio로 합성.
// - 사사삭: 흰 잡음을 높은 대역만 걸러 짧게 긁는 소리를 한두세 번씩
// - 가끔 작은 웃음 같은 짧은 음: 세모파를 '하' 소리 대역으로 걸러 끊어 낸다
// 링크(울타리 상자)에서 멀어질수록 작아지고, 링크가 있는 쪽 스피커에서 들린다.

import { RINK_SOUND as R } from '../constants';
import type { Rect } from '../world';
import { falloffVolume } from './falloff';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

/** 상자 안 가장 가까운 점까지 거리와 그 점의 x */
export function nearestOnRect(rect: Rect, x: number, y: number): { distance: number; x: number } {
  const nx = Math.min(Math.max(x, rect.x), rect.x + rect.w);
  const ny = Math.min(Math.max(y, rect.y), rect.y + rect.h);
  return { distance: Math.hypot(x - nx, y - ny), x: nx };
}

export function rinkVolume(rect: Rect, x: number, y: number): number {
  return falloffVolume(nearestOnRect(rect, x, y).distance, R.nearDistance, R.farDistance, R.maxVolume);
}

/** 소리 위치 좌우 (-1 왼쪽 ~ 1 오른쪽) */
export function rinkPan(rect: Rect, x: number, y: number): number {
  return Math.max(-1, Math.min(1, (nearestOnRect(rect, x, y).x - x) / R.panDistance));
}

const between = (min: number, max: number) => min + Math.random() * (max - min);

export function createRinkSounds(rink: Rect): SoundPart {
  let audio: AudioContext | null = null;
  let gain: GainNode | null = null;
  let panner: StereoPannerNode | null = null;
  let noise: AudioBuffer | null = null;
  let nextSwish = 0;
  let nextLaugh = 0;
  let target = { volume: 0, pan: 0 };

  const stroke = (ctx: AudioContext, out: AudioNode, when: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = between(R.minFilterHz, R.maxFilterHz);
    filter.Q.value = R.filterQ;
    const env = ctx.createGain();
    const length = between(R.minStrokeLength, R.maxStrokeLength);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(R.strokeGain, when + R.strokeAttack);
    env.gain.linearRampToValueAtTime(0, when + length);
    src.connect(filter).connect(env).connect(out);
    src.start(when, Math.random() * Math.max(0, R.noiseSeconds - length), length);
  };

  const laugh = (ctx: AudioContext, out: AudioNode, when: number) => {
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = R.laughFormantHz;
    formant.Q.value = R.laughFormantQ;
    formant.connect(out);
    const pulses = Math.round(between(R.laughMinPulses, R.laughMaxPulses));
    let freq = between(R.laughMinHz, R.laughMaxHz);
    for (let i = 0; i < pulses; i++) {
      const t = when + i * (R.laughPulseLength + R.laughPulseGap);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * R.laughDroop, t + R.laughPulseLength);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(R.laughGain, t + R.laughPulseLength * 0.25);
      env.gain.linearRampToValueAtTime(0, t + R.laughPulseLength);
      osc.connect(env).connect(formant);
      osc.start(t);
      osc.stop(t + R.laughPulseLength + 0.01);
      freq *= R.laughStepDown;
    }
  };

  return {
    start(ctx: AudioContext, out: AudioNode) {
      audio = ctx;
      noise = createNoiseBuffer(ctx, R.noiseSeconds);
      gain = ctx.createGain();
      gain.gain.value = target.volume;
      panner = ctx.createStereoPanner();
      panner.pan.value = target.pan;
      gain.connect(panner).connect(out);
      nextSwish = ctx.currentTime + R.lookahead;
      nextLaugh = ctx.currentTime + between(R.laughMinGap, R.laughMaxGap);
    },
    /** 앞으로 lookahead초 안에 날 소리를 예약한다. 안 들릴 만큼 멀면 건너뛴다 */
    tick(ctx: AudioContext) {
      if (!gain) return;
      const now = ctx.currentTime;
      const horizon = now + R.lookahead;
      while (nextSwish < horizon) {
        if (nextSwish >= now && target.volume > 0) {
          const strokes = Math.round(between(R.minStrokes, R.maxStrokes));
          for (let i = 0; i < strokes; i++) stroke(ctx, gain, nextSwish + i * R.strokeGap);
        }
        nextSwish = Math.max(nextSwish, now) + between(R.minGap, R.maxGap);
      }
      while (nextLaugh < horizon) {
        if (nextLaugh >= now && target.volume > 0) laugh(ctx, gain, nextLaugh);
        nextLaugh = Math.max(nextLaugh, now) + between(R.laughMinGap, R.laughMaxGap);
      }
    },
    setListener(x: number, y: number) {
      target = { volume: rinkVolume(rink, x, y), pan: rinkPan(rink, x, y) };
      if (!audio || !gain || !panner) return;
      gain.gain.setTargetAtTime(target.volume, audio.currentTime, R.smoothing);
      panner.pan.setTargetAtTime(target.pan, audio.currentTime, R.smoothing);
    },
  };
}
