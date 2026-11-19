// 트리 꾸미기 소리: Web Audio로 합성.
// - 산타의 작은 '호호', 상자가 썰매에서 '톡', 바닥에 '통'
// - 상자 열기: 덜컹덜컹 → 뚜껑이 폭 튀며 반짝이 (특별한 장식은 더 높은 '링')
// - 트리에 달렸을 때 '딩', 던진 장식이 튕겨 떨어질 때 낮은 '통', 25·50·100개 축하 화음 종소리
// - 오르골 장식: 가까이 가면 아주 작은 선율 (거리로 크기를 정한다)

import { TREE_DECOR as D, TREE_DECOR_SOUND as K } from '../constants';
import { falloffVolume } from './falloff';
import { createNoiseBuffer, type SoundPart } from './soundSystem';

export interface TreeDecorSounds extends SoundPart {
  /** level = 거리에 따른 크기 (0~1) */
  hoho(level?: number): void;
  pop(level?: number): void;
  land(level?: number): void;
  rattle(): void;
  open(special: boolean): void;
  hang(): void;
  miss(): void;
  celebrate(): void;
  /** 가장 가까운 오르골 장식까지의 거리 (없으면 Infinity) */
  setMusicDistance(distance: number): void;
}

export function createTreeDecorSounds(): TreeDecorSounds {
  let audio: AudioContext | null = null;
  let out: AudioNode | null = null;
  let noise: AudioBuffer | null = null;
  let musicDistance = Infinity;
  /** 오르골: 다음에 울릴 음의 번호와 때 */
  let musicStep = 0;
  let musicNext = 0;
  const ready = () => audio !== null && out !== null && noise !== null && audio.state === 'running';

  /** 짧은 종소리 한 음 */
  const bell = (hz: number, when: number, volume: number, seconds: number) => {
    const ctx = audio!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(volume, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(env).connect(out!);
    osc.start(when);
    osc.stop(when + seconds + 0.05);
  };

  /** 걸러 낸 잡음 한 번 (툭·덜컹) */
  const thump = (when: number, hz: number, volume: number, seconds: number) => {
    const ctx = audio!;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    src.connect(filter).connect(env).connect(out!);
    src.start(when, Math.random() * (K.noiseSeconds - seconds), seconds);
  };

  return {
    start(ctx, dest) {
      audio = ctx;
      out = dest;
      noise = createNoiseBuffer(ctx, K.noiseSeconds);
    },
    tick(ctx) {
      // 오르골 장식: 가까이 있을 때만 다음 음을 조금씩 예약한다
      const volume = falloffVolume(musicDistance, D.musicNear, D.musicFar, D.musicVolume);
      if (volume <= 0 || !ready()) {
        musicNext = 0;
        return;
      }
      if (musicNext < ctx.currentTime) musicNext = ctx.currentTime + 0.05;
      while (musicNext < ctx.currentTime + 0.25) {
        const hz = K.musicNotes[musicStep % K.musicNotes.length];
        if (hz > 0) bell(hz, musicNext, volume, D.musicBeat * 2.2);
        musicStep++;
        musicNext += D.musicBeat;
      }
    },
    setMusicDistance(distance) {
      musicDistance = distance;
    },
    hoho(level = 1) {
      if (!ready() || level <= 0) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      K.hohoHz.forEach((hz, i) => {
        const when = now + i * 0.2;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(hz * 1.08, when);
        osc.frequency.linearRampToValueAtTime(hz, when + 0.14);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, when);
        env.gain.linearRampToValueAtTime(K.hohoVolume * level, when + 0.03);
        env.gain.exponentialRampToValueAtTime(0.0001, when + 0.17);
        osc.connect(env).connect(out!);
        osc.start(when);
        osc.stop(when + 0.2);
      });
    },
    pop(level = 1) {
      if (!ready() || level <= 0) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(K.popHz, now);
      osc.frequency.exponentialRampToValueAtTime(K.popHz * 1.8, now + 0.06);
      const env = ctx.createGain();
      env.gain.setValueAtTime(K.popVolume * level, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.connect(env).connect(out!);
      osc.start(now);
      osc.stop(now + 0.1);
    },
    land(level = 1) {
      if (!ready() || level <= 0) return;
      const now = audio!.currentTime;
      // 통, 그리고 한 번 튀어 작게 통
      thump(now, 420, K.landVolume * level, 0.12);
      thump(now + 0.3, 520, K.landVolume * level * 0.5, 0.08);
    },
    rattle() {
      if (!ready()) return;
      const now = audio!.currentTime;
      for (let i = 0; i < 4; i++) thump(now + i * 0.13, 900 + (i % 2) * 300, K.rattleVolume, 0.06);
    },
    open(special) {
      if (!ready()) return;
      const now = audio!.currentTime;
      thump(now, 1400, K.rattleVolume, 0.07);
      const notes = special ? K.specialNotes : K.openNotes;
      notes.forEach((hz, i) => bell(hz, now + 0.03 + i * 0.07, K.openVolume / Math.sqrt(notes.length), special ? 0.9 : 0.5));
    },
    hang() {
      if (!ready()) return;
      const now = audio!.currentTime;
      bell(K.hangHz, now, K.hangVolume, 0.6);
      bell(K.hangHz * 2.76, now, K.hangVolume * 0.25, 0.3);
    },
    miss() {
      if (!ready()) return;
      const ctx = audio!;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(K.missHz, now);
      osc.frequency.exponentialRampToValueAtTime(K.missHz * 0.6, now + 0.18);
      const env = ctx.createGain();
      env.gain.setValueAtTime(K.hangVolume, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(env).connect(out!);
      osc.start(now);
      osc.stop(now + 0.25);
    },
    celebrate() {
      if (!ready()) return;
      const now = audio!.currentTime;
      // 화음 종소리: 아래에서 위로 차례로 울리고, 물결이 흐를 때마다 한 번씩 더
      for (let wave = 0; wave < 3; wave++) {
        K.celebrateNotes.forEach((hz, i) => {
          const when = now + wave * 1.1 + i * 0.08;
          bell(hz, when, K.celebrateVolume / Math.sqrt(K.celebrateNotes.length), K.celebrateSeconds);
          bell(hz * 2.76, when, (K.celebrateVolume * 0.25) / Math.sqrt(K.celebrateNotes.length), K.celebrateSeconds / 2);
        });
      }
    },
  };
}
