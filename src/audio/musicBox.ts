// 회전목마 오르골: Web Audio로 합성. 첫 클릭·키 입력 뒤에만 켜지고, 회전목마에서 멀어질수록 작아진다.

import { MUSIC_BOX as M } from '../constants';
import type { Point } from '../world';
import { parseSong, type NoteEvent } from './melody';

/** 거리에 따른 음량 (가까우면 maxVolume, farDistance 밖은 0) */
export function musicBoxVolume(distance: number): number {
  if (distance <= M.nearDistance) return M.maxVolume;
  if (distance >= M.farDistance) return 0;
  const f = 1 - (distance - M.nearDistance) / (M.farDistance - M.nearDistance);
  return M.maxVolume * f * f;
}

/** 소리 위치 좌우 (-1 왼쪽 ~ 1 오른쪽): 소리 나는 곳이 듣는 사람 기준 어디인가 */
export function musicBoxPan(listenerX: number, sourceX: number): number {
  return Math.max(-1, Math.min(1, (sourceX - listenerX) / M.panDistance));
}

export interface MusicBox {
  /** 사용자가 처음 클릭·키를 누를 때 부른다 (브라우저 자동 재생 규칙) */
  unlock(): void;
  /** 매 프레임 듣는 사람(캐릭터) 위치 */
  setListener(x: number, y: number): void;
}

export function createMusicBox(source: Point): MusicBox {
  const song = parseSong();
  const secondsPerBeat = 60 / M.tempo;
  let audio: AudioContext | null = null;
  let master: GainNode | null = null;
  let panner: StereoPannerNode | null = null;
  let songStart = 0;
  let nextIndex = 0;
  let loop = 0;

  const playNote = (ctx: AudioContext, out: AudioNode, note: NoteEvent, when: number) => {
    const velocity = note.bass ? M.bassVelocity : M.melodyVelocity;
    for (const p of M.partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.frequency * p.ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(velocity * p.gain, when + M.attack);
      gain.gain.setTargetAtTime(0, when + M.attack, p.decay);
      osc.connect(gain).connect(out);
      osc.start(when);
      osc.stop(when + M.noteLength);
    }
  };

  /** 앞으로 lookahead초 안에 울릴 음을 예약한다 (곡은 계속 되풀이) */
  const schedule = () => {
    if (!audio || !master || audio.state !== 'running') return;
    const horizon = audio.currentTime + M.lookahead;
    for (;;) {
      const note = song.events[nextIndex];
      const when = songStart + (loop * song.lengthBeats + note.beat) * secondsPerBeat;
      if (when > horizon) break;
      if (when >= audio.currentTime) playNote(audio, master, note, when);
      nextIndex++;
      if (nextIndex >= song.events.length) {
        nextIndex = 0;
        loop++;
      }
    }
  };

  let target = { volume: 0, pan: 0 };

  return {
    unlock() {
      if (audio) {
        if (audio.state === 'suspended') void audio.resume();
        return;
      }
      try {
        audio = new AudioContext();
      } catch {
        return; // 소리를 못 내는 환경이면 조용히 넘어간다
      }
      master = audio.createGain();
      master.gain.value = target.volume;
      panner = audio.createStereoPanner();
      panner.pan.value = target.pan;
      master.connect(panner).connect(audio.destination);
      songStart = audio.currentTime + M.lookahead;
      window.setInterval(schedule, M.scheduleIntervalMs);
      document.addEventListener('visibilitychange', () => {
        if (!audio) return;
        if (document.hidden) void audio.suspend();
        else void audio.resume();
      });
    },
    setListener(x: number, y: number) {
      target = {
        volume: musicBoxVolume(Math.hypot(x - source.x, y - source.y)),
        pan: musicBoxPan(x, source.x),
      };
      if (!audio || !master || !panner) return;
      master.gain.setTargetAtTime(target.volume, audio.currentTime, M.smoothing);
      panner.pan.setTargetAtTime(target.pan, audio.currentTime, M.smoothing);
    },
  };
}
