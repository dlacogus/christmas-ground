// 소리 전체를 묶는 곳: AudioContext 하나, 전체 볼륨(기본 0.4), 켜고 끄기.
// 브라우저 규칙상 첫 클릭·키 입력(unlock) 전에는 아무 소리도 내지 않는다.
// 각 소리(오르골, 스케이트장, 광장 배경, 발자국)는 SoundPart로 붙는다.

import { SOUND } from '../constants';

/** 소리 한 갈래. start에서 받은 out에 연결해 소리를 낸다 */
export interface SoundPart {
  start(ctx: AudioContext, out: AudioNode): void;
  /** 일정 간격으로 불린다 — 앞으로 날 소리를 예약한다 */
  tick?(ctx: AudioContext): void;
  /** 매 프레임 듣는 사람(캐릭터) 위치 */
  setListener?(x: number, y: number): void;
}

export interface SoundSystem {
  /** 첫 입력을 받아 소리가 켜졌는가 */
  readonly started: boolean;
  readonly muted: boolean;
  /** 사용자가 처음 클릭·키를 누를 때 부른다 */
  unlock(): void;
  toggleMuted(): void;
  setListener(x: number, y: number): void;
}

/** 저장된 음소거 여부 (저장소를 못 쓰면 켜진 상태) */
export function loadMuted(): boolean {
  try {
    return localStorage.getItem(SOUND.storageKey) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(SOUND.storageKey, muted ? '1' : '0');
  } catch {
    // 저장하지 못해도 이번 접속 동안은 그대로 동작한다
  }
}

/** 흰 잡음 (스케이트 날, 웅성거림, 발자국이 함께 쓴다) */
export function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createSoundSystem(parts: readonly SoundPart[]): SoundSystem {
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = loadMuted();

  return {
    get started() {
      return audio !== null;
    },
    get muted() {
      return muted;
    },
    unlock() {
      if (audio) {
        if (audio.state === 'suspended' && !document.hidden) void audio.resume();
        return;
      }
      try {
        audio = new AudioContext();
      } catch {
        return; // 소리를 못 내는 환경이면 조용히 넘어간다
      }
      const ctx = audio;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : SOUND.masterVolume;
      master.connect(ctx.destination);
      for (const part of parts) part.start(ctx, master);
      window.setInterval(() => {
        if (ctx.state !== 'running') return;
        for (const part of parts) part.tick?.(ctx);
      }, SOUND.scheduleIntervalMs);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
    },
    toggleMuted() {
      muted = !muted;
      saveMuted(muted);
      if (audio && master) master.gain.setTargetAtTime(muted ? 0 : SOUND.masterVolume, audio.currentTime, SOUND.muteFade);
    },
    setListener(x: number, y: number) {
      for (const part of parts) part.setListener?.(x, y);
    },
  };
}
