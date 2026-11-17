import { describe, expect, it } from 'vitest';
import { CHARACTER, CHARACTER_BASE_PALETTE } from '../constants';
import { POSES, getFrame, mirrorRows, type PoseName } from './sprites';

const SWAPPABLE = ['O', 'o', 'M', 'm'];

describe('캐릭터 스프라이트', () => {
  const all = (Object.keys(POSES) as PoseName[]).flatMap((pose) => POSES[pose]);

  it('서기 2프레임, 걷기 4프레임', () => {
    expect(POSES.idle).toHaveLength(2);
    expect(POSES.walk).toHaveLength(4);
  });

  it('모든 프레임이 16x32이다', () => {
    for (const frame of all) {
      expect(frame).toHaveLength(CHARACTER.spriteHeight);
      for (const row of frame) expect(row).toHaveLength(CHARACTER.spriteWidth);
    }
  });

  it('모든 글자에 색이 정해져 있다', () => {
    const known = new Set(['.', ...Object.keys(CHARACTER_BASE_PALETTE), ...SWAPPABLE]);
    for (const frame of all) for (const row of frame) for (const ch of row) expect(known.has(ch), ch).toBe(true);
  });

  it('점 눈 두 개가 있다', () => {
    const eyes = POSES.idle[0].join('').split('').filter((c) => c === 'E');
    expect(eyes.length).toBeGreaterThan(0);
    const eyeColumns = new Set(POSES.idle[0].flatMap((row) => [...row].flatMap((c, x) => (c === 'E' ? [x] : []))));
    expect(eyeColumns.size).toBe(2);
  });

  it('왼쪽은 오른쪽을 좌우 반전한 것이다', () => {
    expect(getFrame('walk', 1, 'left')).toEqual(mirrorRows(getFrame('walk', 1, 'right')));
  });

  it('서기 두 번째 프레임은 머리가 1px 내려간다 (숨쉬기)', () => {
    const [a, b] = POSES.idle;
    expect(b[1]).toBe(a[0]);
    expect(b[0]).toBe('.'.repeat(CHARACTER.spriteWidth));
  });
});
