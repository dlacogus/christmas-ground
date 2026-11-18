// 회전목마 오르골: Web Audio로 합성. 회전목마에서 멀어질수록 작아지고, 회전목마가 있는 쪽 스피커에서 들린다.

import { MUSIC_BOX as M } from '../constants';
import type { Point } from '../world';
import { falloffVolume } from './falloff';
import { parseSong, type NoteEvent } from './melody';
import type { SoundPart } from './soundSystem';

/** 거리에 따른 음량 (가까우면 maxVolume, farDistance 밖은 0) */
export function musicBoxVolume(distance: number): number {
  return falloffVolume(distance, M.nearDistance, M.farDistance, M.maxVolume);
}

/** 소리 위치 좌우 (-1 왼쪽 ~ 1 오른쪽): 소리 나는 곳이 듣는 사람 기준 어디인가 */
export function musicBoxPan(listenerX: number, sourceX: number): number {
  return Math.max(-1, Math.min(1, (sourceX - listenerX) / M.panDistance));
}

export function createMusicBox(source: Point): SoundPart {
  const song = parseSong();
  const secondsPerBeat = 60 / M.tempo;
  let audio: AudioContext | null = null;
  let gain: GainNode | null = null;
  let panner: StereoPannerNode | null = null;
  let songStart = 0;
  let nextIndex = 0;
  let loop = 0;
  let target = { volume: 0, pan: 0 };

  const playNote = (ctx: AudioContext, out: AudioNode, note: NoteEvent, when: number) => {
    const velocity = note.bass ? M.bassVelocity : M.melodyVelocity;
    for (const p of M.partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.frequency * p.ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(velocity * p.gain, when + M.attack);
      env.gain.setTargetAtTime(0, when + M.attack, p.decay);
      osc.connect(env).connect(out);
      osc.start(when);
      osc.stop(when + M.noteLength);
    }
  };

  return {
    start(ctx: AudioContext, out: AudioNode) {
      audio = ctx;
      gain = ctx.createGain();
      gain.gain.value = target.volume;
      panner = ctx.createStereoPanner();
      panner.pan.value = target.pan;
      gain.connect(panner).connect(out);
      songStart = ctx.currentTime + M.lookahead;
    },
    /** 앞으로 lookahead초 안에 울릴 음을 예약한다 (곡은 계속 되풀이). 안 들릴 만큼 멀면 음은 건너뛴다 */
    tick(ctx: AudioContext) {
      if (!gain) return;
      const horizon = ctx.currentTime + M.lookahead;
      for (;;) {
        const note = song.events[nextIndex];
        const when = songStart + (loop * song.lengthBeats + note.beat) * secondsPerBeat;
        if (when > horizon) break;
        if (when >= ctx.currentTime && target.volume > 0) playNote(ctx, gain, note, when);
        nextIndex++;
        if (nextIndex >= song.events.length) {
          nextIndex = 0;
          loop++;
        }
      }
    },
    setListener(x: number, y: number) {
      target = {
        volume: musicBoxVolume(Math.hypot(x - source.x, y - source.y)),
        pan: musicBoxPan(x, source.x),
      };
      if (!audio || !gain || !panner) return;
      gain.gain.setTargetAtTime(target.volume, audio.currentTime, M.smoothing);
      panner.pan.setTargetAtTime(target.pan, audio.currentTime, M.smoothing);
    },
  };
}
