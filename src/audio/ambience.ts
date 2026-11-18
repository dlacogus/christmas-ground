// 광장 전체에 깔리는 배경 소리 (어디서나 같은 크기로 들린다).
// - 멀리서 웅성거리는 사람들: 낮은 잡음 여러 층. 층마다 대역이 다르고, 느리게 또 말소리 박자로 크기가 일렁인다
// - 아주 가끔 멀리서 울리는 종: 종 특유의 어긋난 배음을 길게 울리고, 먼 소리처럼 높은 음을 깎는다

import { AMBIENCE as A } from '../constants';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

const between = (min: number, max: number) => min + Math.random() * (max - min);

/** 다음 종까지 기다리는 시간 (초) */
export function nextBellGap(random: () => number = Math.random): number {
  return A.bellMinGap + random() * (A.bellMaxGap - A.bellMinGap);
}

export function createAmbience(): SoundPart {
  let out: AudioNode | null = null;
  let nextBell = 0;

  /** 종 한 번: 배음마다 따로 사라지고, 낮은 배음일수록 오래 남는다 */
  const strike = (ctx: AudioContext, dest: AudioNode, when: number, base: number, level: number) => {
    for (const p of A.bellPartials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * p.ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(level * p.gain, when + A.bellAttack);
      env.gain.setTargetAtTime(0, when + A.bellAttack, p.decay);
      osc.connect(env).connect(dest);
      osc.start(when);
      osc.stop(when + A.bellLength);
    }
  };

  return {
    start(ctx: AudioContext, dest: AudioNode) {
      out = dest;
      const noise = createNoiseBuffer(ctx, A.noiseSeconds);
      for (const layer of A.murmurLayers) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = layer.hz;
        filter.Q.value = layer.q;
        const gain = ctx.createGain();
        gain.gain.value = layer.gain * A.murmurVolume;
        // 크기 일렁임 두 겹: 사람들이 몰렸다 흩어지는 느린 물결 + 말소리 같은 빠른 떨림
        for (const [hz, depth] of [
          [layer.swellHz, A.swellDepth],
          [layer.babbleHz, A.babbleDepth],
        ]) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = hz;
          const amount = ctx.createGain();
          amount.gain.value = layer.gain * A.murmurVolume * depth;
          lfo.connect(amount).connect(gain.gain);
          lfo.start();
        }
        src.connect(filter).connect(gain).connect(dest);
        src.start(0, Math.random() * A.noiseSeconds);
      }
      nextBell = ctx.currentTime + between(A.bellFirstMinDelay, A.bellFirstMaxDelay);
    },
    tick(ctx: AudioContext) {
      if (!out || ctx.currentTime < nextBell) return;
      const far = ctx.createBiquadFilter();
      far.type = 'lowpass';
      far.frequency.value = A.bellLowpassHz;
      far.connect(out);
      const base = between(A.bellMinHz, A.bellMaxHz);
      const strokes = Math.round(between(A.bellMinStrokes, A.bellMaxStrokes));
      for (let i = 0; i < strokes; i++) strike(ctx, far, ctx.currentTime + A.bellLead + i * A.bellStrokeGap, base, A.bellVolume);
      nextBell = ctx.currentTime + strokes * A.bellStrokeGap + nextBellGap();
    },
  };
}
