import { createCarouselZone, type CarouselZone } from './carousel';
import { createPlazaZone } from './plaza';
import { createRinkZone } from './rink';
import type { Zone } from './zone';

export interface WorldZones {
  /** 왼쪽에서 오른쪽 순서의 모든 구역 */
  all: Zone[];
  carousel: CarouselZone;
}

export function createWorldZones(): WorldZones {
  const carousel = createCarouselZone();
  return { all: [carousel, createPlazaZone(), createRinkZone()], carousel };
}

/** 왼쪽에서 오른쪽 순서의 모든 구역 */
export function createZones(): Zone[] {
  return createWorldZones().all;
}
