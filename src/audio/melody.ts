// 회전목마 오르골 선율 — 직접 만든 3/4박자 짧은 왈츠 (16마디, 다장조).
// 글자 하나하나가 음표: "음이름옥타브:박자", 마디는 '|'로 나눈다. 음이름은 C D E F G A B (#은 반음 올림).

import { A4_FREQUENCY, A4_MIDI } from '../constants';

export const MELODY = `
  E5:1 G5:1 C6:1 | B5:2 G5:1 | A5:1 F5:1 A5:1 | G5:3 |
  F5:1 A5:1 D6:1 | C6:2 A5:1 | G5:1 E5:1 D5:1 | C5:3 |
  E5:1 G5:1 C6:1 | D6:2 C6:1 | B5:1 A5:1 G5:1 | A5:3 |
  F5:1 E5:1 D5:1 | G5:2 B4:1 | D5:1 F5:1 E5:1 | C5:3
`;

/** 마디마다 첫 박에 울리는 낮은 음 */
export const BASS = `C3 G2 F2 C3 D3 F2 G2 C3 C3 D3 G2 A2 D3 G2 G2 C3`;

export const BEATS_PER_BAR = 3;

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" → 주파수 (Hz) */
export function noteFrequency(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  if (!match) throw new Error(`음 이름이 이상함: ${name}`);
  const midi = (Number(match[3]) + 1) * 12 + NOTE_OFFSETS[match[1]] + (match[2] ? 1 : 0);
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

export interface NoteEvent {
  /** 곡 처음부터 몇 박째 */
  beat: number;
  frequency: number;
  bass: boolean;
}

/** 선율과 낮은 음을 박자 순서의 음표 목록으로 */
export function parseSong(melody = MELODY, bass = BASS): { events: NoteEvent[]; lengthBeats: number } {
  const events: NoteEvent[] = [];
  let beat = 0;
  for (const token of melody.split(/[\s|]+/).filter(Boolean)) {
    const [name, beats] = token.split(':');
    events.push({ beat, frequency: noteFrequency(name), bass: false });
    beat += Number(beats);
  }
  bass
    .split(/\s+/)
    .filter(Boolean)
    .forEach((name, bar) => events.push({ beat: bar * BEATS_PER_BAR, frequency: noteFrequency(name), bass: true }));
  events.sort((a, b) => a.beat - b.beat);
  return { events, lengthBeats: beat };
}
