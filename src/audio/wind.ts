// 회전목마를 타고 앞쪽을 지날 때 스치는 아주 작은 바람 소리.
// 흰 잡음을 좁은 대역으로 거르고, 그 대역을 낮은 데서 높였다 다시 내려 '휘익' 지나가는 느낌을 낸다.

import { WIND as W } from '../constants';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface Wind extends SoundPart {
  /** 바람이 한 번 스친다 */
  whoosh(): void;
}

export function createWind(): Wind {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;

  return {
    start(ctx: AudioContext, dest: AudioNode) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, W.noiseSeconds);
    },
    whoosh() {
      if (!audio || !out || audio.state !== 'running') return;
      const now = audio.currentTime;
      const src = audio.createBufferSource();
      src.buffer = noise;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = W.filterQ;
      filter.frequency.setValueAtTime(W.lowHz, now);
      filter.frequency.linearRampToValueAtTime(W.highHz, now + W.attack);
      filter.frequency.linearRampToValueAtTime(W.lowHz, now + W.length);
      const env = audio.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(W.volume, now + W.attack);
      env.gain.linearRampToValueAtTime(0, now + W.length);
      src.connect(filter).connect(env).connect(out);
      src.start(now, Math.random() * (W.noiseSeconds - W.length), W.length);
    },
  };
}
