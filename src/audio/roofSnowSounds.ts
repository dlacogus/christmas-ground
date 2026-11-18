// 지붕 눈 소리: Web Audio로 합성. 순서에 맞춰 나눠 낸다 (한 번의 '와르르'로 끝내지 않는다).
// - 미끄러지는 동안 '스르르': 낮게 걸러 낸 잡음을 계속 흘리고, 눈 판 속도에 따라 커지고 조금 높아진다
// - 덩어리가 바닥에 닿을 때마다 둔한 '퍽': 큰 덩어리일수록 크고 낮다 (닿는 때가 달라 조금씩 어긋나게 들린다)
// - '툭' 떨어지기 전 머리 위에서 '사락'
// 지붕이 캐릭터에서 멀수록 작게, 지붕이 있는 쪽 스피커에서.

import { ROOF_SNOW_SOUND as K } from '../constants';
import { falloffVolume } from './falloff';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface RoofSnowSounds extends SoundPart {
  /** 매 프레임: 지금 미끄러지는 눈 판의 속도와 자리 (없으면 null) */
  setSlide(slide: { speed: number; x: number; y: number } | null): void;
  /** 덩어리가 닿았다 */
  thud(x: number, y: number, size: number): void;
  rustle(x: number, y: number): void;
}

export function createRoofSnowSounds(): RoofSnowSounds {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;
  let listener = { x: 0, y: 0 };
  let slideGain: GainNode | null = null;
  let slideFilter: BiquadFilterNode | null = null;
  let slidePan: StereoPannerNode | null = null;
  let slideOn = false;

  const volumeAt = (x: number, y: number, max: number) =>
    falloffVolume(Math.hypot(x - listener.x, y - listener.y), K.nearDistance, K.farDistance, max);
  const panAt = (x: number) => Math.max(-1, Math.min(1, (x - listener.x) / K.panDistance));

  /** 소리 나는 곳까지의 거리로 음량·좌우를 정해 연결할 곳을 만든다 (안 들릴 만큼 멀면 null) */
  const place = (x: number, y: number, volume: number): AudioNode | null => {
    if (!audio || !out || !noise || audio.state !== 'running') return null;
    const v = volumeAt(x, y, volume);
    if (v <= 0) return null;
    const gain = audio.createGain();
    gain.gain.value = v;
    const pan = audio.createStereoPanner();
    pan.pan.value = panAt(x);
    gain.connect(pan).connect(out);
    return gain;
  };

  const noiseBurst = (dest: AudioNode, type: BiquadFilterType, hz: number, when: number, length: number, level: number) => {
    const ctx = audio!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(level, when + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(filter).connect(env).connect(dest);
    src.start(when, Math.random() * (K.noiseSeconds - length), length);
  };

  return {
    start(ctx, dest) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, K.noiseSeconds);
      // 계속 흐르는 '스르르' (평소에는 소리 0)
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      slideFilter = ctx.createBiquadFilter();
      slideFilter.type = 'lowpass';
      slideFilter.frequency.value = K.slideMinHz;
      slideGain = ctx.createGain();
      slideGain.gain.value = 0;
      slidePan = ctx.createStereoPanner();
      src.connect(slideFilter).connect(slideGain).connect(slidePan).connect(dest);
      src.start();
    },
    setListener(x, y) {
      listener = { x, y };
    },
    setSlide(slide) {
      if (!audio || !slideGain || !slideFilter || !slidePan) return;
      if (!slide && !slideOn) return;
      slideOn = slide !== null;
      const now = audio.currentTime;
      const level = slide ? volumeAt(slide.x, slide.y, K.slideVolume) * Math.min(1, slide.speed / K.slideFullSpeed) : 0;
      slideGain.gain.setTargetAtTime(level, now, K.slideSmoothing);
      if (!slide) return;
      slideFilter.frequency.setTargetAtTime(K.slideMinHz + slide.speed * K.slideHzPerSpeed, now, K.slideSmoothing);
      slidePan.pan.setTargetAtTime(panAt(slide.x), now, K.slideSmoothing);
    },
    thud(x, y, size) {
      const big = Math.min(1, size / K.thudFullSize);
      const dest = place(x, y, K.thudVolume * (0.35 + 0.65 * big));
      if (!dest) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const hz = Math.max(60, K.thudBaseHz - size * K.thudHzPerSize);
      const length = K.thudSeconds * (0.7 + 0.6 * big);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.5, now + length);
      const env = ctx.createGain();
      env.gain.setValueAtTime(1, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + length);
      osc.connect(env).connect(dest);
      osc.start(now);
      osc.stop(now + length + 0.02);
      // 눈이라 딱딱하지 않게: 낮게 걸러 낸 잡음을 함께
      noiseBurst(dest, 'lowpass', hz * 2.2, now, length, 0.8);
    },
    rustle(x, y) {
      const dest = place(x, y, K.rustleVolume);
      if (!dest) return;
      noiseBurst(dest, 'bandpass', K.rustleHz, audio!.currentTime, K.rustleSeconds, 1);
    },
  };
}
