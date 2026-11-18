import { describe, expect, it } from 'vitest';
import { canStandAt } from '../character/character';
import { SIGNPOST as S } from '../constants';
import { BENCH_HALF_WIDTH, SIGNPOST, ZONE_BOUNDS } from '../world';
import { createPlazaZone } from '../zones/plaza';
import { GLYPHS, GLYPH_HEIGHT, signBoards, signExtent } from './signpost';

describe('이정표', () => {
  it('위 판은 회전목마(왼쪽), 아래 판은 아이스링크(오른쪽)를 가리킨다', () => {
    const [top, bottom] = signBoards();
    expect(top.text).toBe('회전목마');
    expect(top.direction).toBe('left');
    expect(bottom.text).toBe('아이스링크');
    expect(bottom.direction).toBe('right');
    expect(bottom.top).toBeGreaterThanOrEqual(top.top + S.boardHeight);
    // 화살촉 쪽으로 더 길게 뻗는다
    expect(-top.left).toBeGreaterThan(top.left + top.bodyWidth + S.tipLength);
    expect(bottom.left + bottom.bodyWidth + S.tipLength).toBeGreaterThan(-bottom.left);
  });

  it('쓰는 글자가 모두 작은 픽셀 글꼴(높이 7, 폭 5~6)로 준비되어 있다', () => {
    for (const board of S.boards) {
      for (const ch of board.text) {
        expect(GLYPHS[ch], ch).toBeDefined();
        expect(GLYPHS[ch]).toHaveLength(GLYPH_HEIGHT);
        for (const row of GLYPHS[ch]) {
          expect(row).toHaveLength(GLYPHS[ch][0].length);
          expect(row.length).toBeLessThanOrEqual(6);
        }
      }
    }
    expect(S.boardHeight).toBeGreaterThanOrEqual(GLYPH_HEIGHT + 2);
  });

  it('메인 광장 안에 서 있고 (그림이 구역을 넘지 않는다), 기둥만 길을 막는다', () => {
    const { left, right } = signExtent();
    expect(SIGNPOST.x + left).toBeGreaterThan(ZONE_BOUNDS.plaza.startX);
    expect(SIGNPOST.x + right).toBeLessThan(ZONE_BOUNDS.plaza.endX);
    expect(createPlazaZone().props.some((p) => p.footY === SIGNPOST.y)).toBe(true);
    expect(canStandAt(SIGNPOST.x, SIGNPOST.y - 1)).toBe(false);
    expect(canStandAt(SIGNPOST.x - 20, SIGNPOST.y)).toBe(true);
    expect(canStandAt(SIGNPOST.x + 20, SIGNPOST.y)).toBe(true);
  });

  it('캐릭터보다 조금 큰 아담한 크기', () => {
    expect(S.height).toBeLessThanOrEqual(48);
    const { left, right } = signExtent();
    expect(right - left).toBeLessThanOrEqual(64);
  });
});

describe('벤치', () => {
  it('두 사람이 나란히 앉을 수 있는 폭', () => {
    // 캐릭터 한 명의 폭은 약 16px
    expect(BENCH_HALF_WIDTH * 2).toBeGreaterThanOrEqual(32);
  });
});
