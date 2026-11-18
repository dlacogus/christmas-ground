// 내 캐릭터의 스케이트 소리: Web Audio로 합성.
// - 미끄러지는 '사사삭': 걸러 낸 흰 잡음을 계속 흘리고, 속도에 따라 크고 높게, 잦게 떨리게
// - 브레이크 '스윽': 잡음을 높은 대역에서 낮은 대역으로 쓸어내린다
// - 착지 '탁': 짧은 딸깍 + 낮은 울림
// - 넘어짐 '쿵': 낮게 떨어지는 사인파 + 둔한 잡음

import { SKATE, SKATE_SOUND as K } from '../constants';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface SkateSounds extends SoundPart {
  /** 매 프레임: 얼음 위에서 미끄러지는 속도 (얼음 밖이거나 떠 있으면 0) */
  setGlide(speed: number): void;
  brake(): void;
  land(): void;
  fall(): void;
}

export function createSkateSounds(): SkateSounds {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;
  let glideGain: GainNode | null = null;
  let glideFilter: BiquadFilterNode | null = null;
  let flutter: OscillatorNode | null = null;
  let lastSpeed = -1;

  const ready = () => audio !== null && out !== null && noise !== null && audio.state === 'running';

  const noiseBurst = (type: BiquadFilterType, hz: number, q: number, when: number, length: number, volume: number) => {
    const ctx = audio!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(filter).connect(env).connect(out!);
    src.start(when, Math.random() * (K.noiseSeconds - length), length);
    return filter;
  };

  const tone = (startHz: number, endHz: number, when: number, length: number, volume: number) => {
    const ctx = audio!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, when);
    osc.frequency.exponentialRampToValueAtTime(endHz, when + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    osc.connect(env).connect(out!);
    osc.start(when);
    osc.stop(when + length + 0.02);
  };

  return {
    start(ctx: AudioContext, dest: AudioNode) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, K.noiseSeconds);
      // 계속 흐르는 미끄럼 잡음 (평소에는 소리 0)
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      glideFilter = ctx.createBiquadFilter();
      glideFilter.type = 'bandpass';
      glideFilter.frequency.value = K.glideMinHz;
      glideFilter.Q.value = K.glideQ;
      // 사삭거리는 떨림: 느린 사인파로 크기를 흔든다
      const trem = ctx.createGain();
      trem.gain.value = 1 - K.flutterDepth;
      flutter = ctx.createOscillator();
      flutter.frequency.value = K.flutterMinHz;
      const depth = ctx.createGain();
      depth.gain.value = K.flutterDepth;
      flutter.connect(depth).connect(trem.gain);
      glideGain = ctx.createGain();
      glideGain.gain.value = 0;
      src.connect(glideFilter).connect(trem).connect(glideGain).connect(dest);
      src.start();
      flutter.start();
    },
    setGlide(speed: number) {
      if (!audio || !glideGain || !glideFilter || !flutter) return;
      const rounded = Math.round(speed);
      if (rounded === lastSpeed) return;
      lastSpeed = rounded;
      const now = audio.currentTime;
      const f = Math.min(1, speed / SKATE.maxSpeed);
      glideGain.gain.setTargetAtTime(K.glideVolume * f, now, K.smoothing);
      glideFilter.frequency.setTargetAtTime(K.glideMinHz + speed * K.glideHzPerSpeed, now, K.smoothing);
      flutter.frequency.setTargetAtTime(K.flutterMinHz + speed * K.flutterHzPerSpeed, now, K.smoothing);
    },
    brake() {
      if (!ready()) return;
      const now = audio!.currentTime;
      const filter = noiseBurst('bandpass', K.brakeStartHz, K.brakeQ, now, K.brakeSeconds, K.brakeVolume);
      filter.frequency.exponentialRampToValueAtTime(K.brakeEndHz, now + K.brakeSeconds);
    },
    land() {
      if (!ready()) return;
      const now = audio!.currentTime;
      noiseBurst('highpass', K.landClickHz, 0.7, now, K.landClickSeconds, K.landVolume);
      tone(K.landThumpHz, K.landThumpHz * 0.6, now, K.landThumpSeconds, K.landVolume * 0.8);
    },
    fall() {
      if (!ready()) return;
      const now = audio!.currentTime;
      tone(K.fallStartHz, K.fallEndHz, now, K.fallSeconds, K.fallVolume);
      noiseBurst('lowpass', K.fallNoiseHz, 0.7, now, K.fallSeconds * 0.8, K.fallVolume * 0.6);
    },
  };
}
