// 재채기 소리: Web Audio로 합성.
// - '흐… 흐…': 숨을 들이쉬는 짧은 바람 소리 두 번 (점점 높아진다)
// - '에취!': 짧게 터지는 잡음 + 뚝 떨어지는 짧은 톤

import { SNEEZE, SNEEZE_SOUND as K } from '../constants';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface SneezeSound extends SoundPart {
  /** 준비 동작이 시작될 때: '흐… 흐…'를 박자에 맞춰 예약한다 */
  windup(): void;
  achoo(): void;
}

export function createSneezeSound(): SneezeSound {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;

  const ready = () => audio !== null && out !== null && noise !== null && audio.state === 'running';

  const burst = (type: BiquadFilterType, fromHz: number, toHz: number, when: number, length: number, attack: number, volume: number) => {
    const ctx = audio!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, when);
    filter.frequency.exponentialRampToValueAtTime(toHz, when + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(volume, when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(filter).connect(env).connect(out!);
    src.start(when, Math.random() * (K.noiseSeconds - length), length);
  };

  return {
    start(ctx, dest) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, K.noiseSeconds);
    },
    windup() {
      if (!ready()) return;
      const now = audio!.currentTime;
      const each = SNEEZE.windupSeconds / SNEEZE.windupCount;
      for (let i = 0; i < SNEEZE.windupCount; i++) {
        // 들이쉬는 숨: 천천히 커지며 높아진다
        burst('bandpass', K.breathHz * (1 + i * 0.2), K.breathHz * (1.5 + i * 0.2), now + i * each, K.breathSeconds, K.breathSeconds * 0.7, K.breathVolume);
      }
    },
    achoo() {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      burst('bandpass', K.achooNoiseHz, K.achooNoiseHz * 0.5, now, K.achooNoiseSeconds, 0.008, K.achooVolume);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(K.achooToneHz, now);
      osc.frequency.exponentialRampToValueAtTime(K.achooToneEndHz, now + K.achooToneSeconds);
      const env = ctx.createGain();
      env.gain.setValueAtTime(K.achooVolume * 0.5, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + K.achooToneSeconds);
      osc.connect(env).connect(out!);
      osc.start(now);
      osc.stop(now + K.achooToneSeconds + 0.02);
    },
  };
}
