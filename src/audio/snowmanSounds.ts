// 눈사람 소리: Web Audio로 합성.
// - '뽀득': 눈덩이가 한 바퀴 굴러갈 때마다, 짧게 조이는 잡음 (클수록 낮고 둔하게, 엄청 크면 묵직하게)
// - '영차': 낮은 톤 두 번
// - 완성 종소리 화음: 미니는 작고 높은 '딩', 엄청 큰 눈사람은 길고 낮은 화음

import { COPUSH, PROPS, SNOWBALL, SNOWMAN_SOUND as K } from '../constants';
import type { SnowmanKind } from '../features/snowman';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface SnowmanSounds extends SoundPart {
  squeak(d: number, loud?: boolean): void;
  /** 하이파이브 '짝!' */
  clap(): void;
  /** 노점에서 소품을 받을 때 '띠링' */
  ding(): void;
  grunt(): void;
  chime(kind: SnowmanKind): void;
}

export function createSnowmanSounds(): SnowmanSounds {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;
  const ready = () => audio !== null && out !== null && noise !== null && audio.state === 'running';

  return {
    start(ctx, dest) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, K.noiseSeconds);
    },
    ding() {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      PROPS.dingNotes.forEach((hz, i) => {
        const when = now + i * 0.09;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = hz;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, when);
        env.gain.linearRampToValueAtTime(PROPS.dingVolume, when + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
        osc.connect(env).connect(out!);
        osc.start(when);
        osc.stop(when + 0.4);
      });
    },
    clap() {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1700;
      filter.Q.value = 0.9;
      const env = ctx.createGain();
      env.gain.setValueAtTime(K.chimeVolume * 2, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      src.connect(filter).connect(env).connect(out!);
      src.start(now, 0, 0.1);
    },
    squeak(d, loud = false) {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const big = Math.min(1, d / SNOWBALL.maxSize);
      const hz = Math.max(260, K.squeakHz - d * K.squeakHzPerSize);
      const length = K.squeakSeconds * (1 + big * 1.5);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 3 - big * 2;
      // 눌리며 조이는 소리: 살짝 올라갔다 내려온다
      filter.frequency.setValueAtTime(hz * 0.8, now);
      filter.frequency.linearRampToValueAtTime(hz * 1.2, now + length * 0.4);
      filter.frequency.linearRampToValueAtTime(hz * 0.7, now + length);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(K.squeakVolume * (0.6 + big * 0.6) * (loud ? COPUSH.loudSqueak : 1), now + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + length);
      src.connect(filter).connect(env).connect(out!);
      src.start(now, Math.random() * (K.noiseSeconds - length), length);
    },
    grunt() {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      [0, 0.22].forEach((delay, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const hz = K.gruntHz * (i === 0 ? 1 : 1.3);
        osc.frequency.setValueAtTime(hz, now + delay);
        osc.frequency.linearRampToValueAtTime(hz * 0.85, now + delay + 0.16);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now + delay);
        env.gain.linearRampToValueAtTime(K.gruntVolume, now + delay + 0.03);
        env.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.18);
        osc.connect(env).connect(out!);
        osc.start(now + delay);
        osc.stop(now + delay + 0.2);
      });
    },
    chime(kind) {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const { notes, seconds } = K.chimes[kind];
      notes.forEach((hz, i) => {
        const when = now + i * 0.07;
        // 종: 기본음 + 살짝 어긋난 배음
        for (const [mult, level] of [
          [1, 1],
          [2.76, 0.3],
        ]) {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = hz * mult;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, when);
          env.gain.linearRampToValueAtTime((K.chimeVolume * level) / Math.sqrt(notes.length), when + 0.005);
          env.gain.exponentialRampToValueAtTime(0.0001, when + seconds / mult ** 0.5);
          osc.connect(env).connect(out!);
          osc.start(when);
          osc.stop(when + seconds + 0.05);
        }
      });
    },
  };
}
