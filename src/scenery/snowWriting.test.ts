import { describe, expect, it } from 'vitest';
import { SNOW_WRITING } from '../constants';
import { BENCHES, CAROUSEL_X, FIR_LINE_X, WALK_AREA, getObstacle } from '../world';
import { LETTERS, snowWritingMask, wordWidth } from './snowWriting';

describe('눈 위 글씨', () => {
  it('Merry Christmas 두 줄, 쓰는 글자가 모두 준비되어 있다', () => {
    expect(SNOW_WRITING.lines).toEqual(['Merry', 'Christmas']);
    for (const word of SNOW_WRITING.lines) for (const ch of word) expect(LETTERS[ch], ch).toBeDefined();
    expect(wordWidth('Christmas')).toBeGreaterThan(wordWidth('Merry'));
  });

  it('회전목마 왼쪽 빈 눈밭 안에 들어간다 (전나무 줄·회전목마·벤치와 겹치지 않는다)', () => {
    const m = snowWritingMask();
    const carousel = getObstacle('carousel');
    expect(carousel.x).toBe(CAROUSEL_X - carousel.w / 2);
    expect(m.x - SNOW_WRITING.snowPadX).toBeGreaterThan(FIR_LINE_X);
    expect(m.x + m.width + SNOW_WRITING.snowPadX).toBeLessThan(carousel.x);
    expect(m.y).toBeGreaterThan(WALK_AREA.y);
    // 벤치 등받이 위쪽보다 뒤에서 끝난다
    expect(m.y + m.height).toBeLessThan(BENCHES[0].y - 18);
    expect(m.cells.some((c) => c === 1)).toBe(true);
  });
});
