// 이모트(감정 표현) 규칙 — DOM 없음, 테스트할 수 있다.
// 바퀴 칸은 위(↑)부터 시계 방향으로 고르게 놓이고, 스틱·방향키가 가리키는 쪽에서 가장 가까운 칸을 고른다
// (두 칸 사이 한가운데면 고르지 않는다 — 6칸이면 똑바로 왼쪽·오른쪽). 숫자 키도 같은 순서.

import { EMOTE, EMOTES } from '../constants';

export const EMOTE_COUNT = EMOTES.length;

/** 방향 입력(dx, dy: 화면 아래가 +)이 가리키는 칸. 가만히 있거나 두 칸 사이 한가운데면 null */
export function emoteForDir(dx: number, dy: number): number | null {
  if (dx === 0 && dy === 0) return null;
  // 위가 0, 시계 방향으로 커지는 각도를 칸 단위로
  const step = (Math.PI * 2) / EMOTE_COUNT;
  const at = Math.atan2(dx, -dy) / step;
  if (Math.abs(at - Math.floor(at) - 0.5) < 0.01) return null;
  return ((Math.round(at) % EMOTE_COUNT) + EMOTE_COUNT) % EMOTE_COUNT;
}

/** 숫자 키(Digit1~, Numpad1~)가 가리키는 칸. 아니면 null */
export function emoteForKey(code: string): number | null {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return i < EMOTE_COUNT ? i : null;
}

/** 바퀴 칸의 자리: 가운데에서 (x, y) 방향 단위 벡터 (화면 아래가 +) */
export function wheelSlot(i: number): { x: number; y: number } {
  const angle = (i * Math.PI * 2) / EMOTE_COUNT;
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** 보낸 지 age초 된 말풍선의 크기·불투명도 (커지며 나타나 → 머물다 → 흐려진다). 다 됐으면 null */
export function bubbleLook(age: number): { scale: number; alpha: number } | null {
  if (age < 0 || age >= EMOTE.bubbleSeconds) return null;
  const pop = Math.min(1, age / EMOTE.popSeconds);
  // 살짝 더 커졌다가 제자리로 (튀어나오는 느낌)
  const scale = pop < 1 ? 0.4 + 0.75 * pop : 1 + 0.15 * Math.max(0, 1 - (age - EMOTE.popSeconds) / 0.12);
  const alpha = Math.min(1, (EMOTE.bubbleSeconds - age) / EMOTE.fadeSeconds);
  return { scale: Math.min(scale, 1.15), alpha };
}

/** 보낼 때 폴짝: 남은 시간 → 몸을 띄우는 높이 (px) */
export function hopLift(left: number): number {
  if (left <= 0) return 0;
  const t = 1 - left / EMOTE.hopSeconds;
  return Math.round(EMOTE.hopHeight * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
}

/** 마지막으로 보낸 때(초)에서 지금 다시 보낼 수 있나 */
export function canEmote(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= EMOTE.cooldown;
}
