import { COLORS, PLACEHOLDER } from '../constants';
import { ZONE_BOUNDS, getObstacle } from '../world';
import { boxProp } from './placeholder';
import { pointsInZone, type Zone } from './zone';

/** 회전목마 구역 (왼쪽) — 지금은 금색 상자 */
export function createCarouselZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.carousel;
  return {
    name: 'carousel',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [boxProp(getObstacle('carousel'), PLACEHOLDER.carouselHeight, COLORS.carouselGold)],
    update(_dt: number) {},
    draw() {},
  };
}
