import { describe, expect, it } from 'vitest';
import { SCREEN_HEIGHT as H, SCREEN_WIDTH as W } from './constants';
import { fitScale } from './screen';

describe('화면 맞춤', () => {
  it('창에 들어가는 가장 큰 크기로 확대한다 (작은 화면에서도 검은 여백이 커지지 않는다)', () => {
    // 1917x985 창, 배율 125% 모니터: 정수배(3.2)로는 여백이 커서 창 높이에 꽉 채운다
    const scale = fitScale(1917, 985, W, H, 1.25);
    expect(H * scale).toBeCloseTo(985, 5);
    expect(W * scale).toBeLessThanOrEqual(1917);
    // 작은 창
    expect(W * fitScale(700, 500, W, H)).toBeCloseTo(700, 5);
    // 화면보다 작은 창에서도 다 보이게 줄인다
    expect(fitScale(240, 400, W, H)).toBeCloseTo(0.5, 5);
  });

  it('정수배가 거의 꽉 차면 정수배로 맞춘다 (픽셀이 고르다)', () => {
    expect(fitScale(1920, 1080, W, H)).toBe(4);
    expect(fitScale(1450, 830, W, H)).toBe(3);
    // 모니터 픽셀 기준 정수배
    expect(fitScale(1300, 700, W, H, 2)).toBe(2.5);
  });
});
