import { describe, expect, it } from 'vitest';
import { EMOTE, EMOTES } from '../constants';
import { allowEmote, newSession } from '../shared/plazaCore';
import { parseClientMessage } from '../shared/protocol';
import { padLabels } from '../ui/hint';
import { bubbleLook, canEmote, emoteForDir, emoteForKey, hopLift, wheelSlot } from './emotes';

describe('이모트', () => {
  it('6가지, 위부터 시계 방향: 스틱 8방향 가운데 가장 가까운 칸 (똑바로 왼쪽·오른쪽은 두 칸 사이라 없음)', () => {
    expect(EMOTES.length).toBe(6);
    expect(EMOTES.map((e) => e.text)).toEqual(['안녕!', '좋아!', '이리 와!', '같이 하자!', '고마워!', '잘 가~']);
    expect(emoteForDir(0, 0)).toBeNull();
    expect(emoteForDir(0, -1)).toBe(0);
    expect(emoteForDir(1, -1)).toBe(1);
    expect(emoteForDir(1, 0)).toBeNull();
    expect(emoteForDir(1, 1)).toBe(2);
    expect(emoteForDir(0, 1)).toBe(3);
    expect(emoteForDir(-1, 1)).toBe(4);
    expect(emoteForDir(-1, 0)).toBeNull();
    expect(emoteForDir(-1, -1)).toBe(5);
  });

  it('바퀴 칸은 가리키는 방향에 놓인다', () => {
    for (let i = 0; i < EMOTES.length; i++) {
      const s = wheelSlot(i);
      expect(emoteForDir(s.x, s.y)).toBe(i);
    }
  });

  it('숫자 키 1~6으로 바로 보낸다', () => {
    expect(emoteForKey('Digit1')).toBe(0);
    expect(emoteForKey('Numpad6')).toBe(5);
    expect(emoteForKey('Digit7')).toBeNull();
    expect(emoteForKey('Digit9')).toBeNull();
    expect(emoteForKey('Digit0')).toBeNull();
    expect(emoteForKey('KeyE')).toBeNull();
  });

  it('1초에 하나만 보낸다 (서버는 0.8초)', () => {
    expect(canEmote(null, 5)).toBe(true);
    expect(canEmote(5, 5.5)).toBe(false);
    expect(canEmote(5, 5 + EMOTE.cooldown)).toBe(true);
    const s = newSession();
    expect(allowEmote(s, 1000)).toBe(true);
    expect(allowEmote(s, 1500)).toBe(false);
    expect(allowEmote(s, 1000 + EMOTE.serverEvery * 1000)).toBe(true);
  });

  it('서버는 정해진 번호만 받는다', () => {
    const send = (m: unknown) => parseClientMessage(JSON.stringify(m));
    expect(send({ t: 'emote', e: 0 })).toEqual({ t: 'emote', e: 0 });
    expect(send({ t: 'emote', e: 5 })).toEqual({ t: 'emote', e: 5 });
    expect(send({ t: 'emote', e: 6 })).toBeNull();
    expect(send({ t: 'emote', e: 1.5 })).toBeNull();
    expect(send({ t: 'emote', e: '안녕' })).toBeNull();
  });

  it('말풍선은 커지며 나타나 머물다 흐려지고 사라진다', () => {
    expect(bubbleLook(0)!.scale).toBeLessThan(1);
    expect(bubbleLook(1)).toEqual({ scale: 1, alpha: 1 });
    expect(bubbleLook(EMOTE.bubbleSeconds - 0.1)!.alpha).toBeLessThan(1);
    expect(bubbleLook(EMOTE.bubbleSeconds)).toBeNull();
  });

  it('보낼 때 폴짝: 가운데서 가장 높고 끝나면 땅에', () => {
    expect(hopLift(0)).toBe(0);
    expect(hopLift(EMOTE.hopSeconds / 2)).toBe(EMOTE.hopHeight);
    expect(hopLift(EMOTE.hopSeconds)).toBe(0);
  });

  it('패드를 쓰면 E 표현 → 😊 표현', () => {
    expect(padLabels('Space 눈 굴리기 · F 던지기 · E 표현')).toBe('Ⓐ 눈 굴리기 · ❄ 던지기 · 😊 표현');
  });
});
