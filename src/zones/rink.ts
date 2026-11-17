import { COLORS, PLACEHOLDER } from '../constants';
import { ZONE_BOUNDS, getObstacle } from '../world';
import { boxProp } from './placeholder';
import { pointsInZone, type Zone } from './zone';

/** 스케이트장 구역 (오른쪽) — 지금은 하늘색 상자 */
export function createRinkZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.rink;
  return {
    name: 'rink',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [boxProp(getObstacle('rink-fence'), PLACEHOLDER.rinkHeight, COLORS.rinkIce)],
    update(_dt: number) {},
    draw() {},
  };
}
