import { createCarouselZone } from './carousel';
import { createPlazaZone } from './plaza';
import { createRinkZone } from './rink';
import type { Zone } from './zone';

/** 왼쪽에서 오른쪽 순서의 모든 구역 */
export function createZones(): Zone[] {
  return [createCarouselZone(), createPlazaZone(), createRinkZone()];
}
