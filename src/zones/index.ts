import { createCarouselZone, type CarouselZone } from './carousel';
import { createPlazaZone, type PlazaZone } from './plaza';
import { createRinkZone, type RinkZone } from './rink';
import type { Zone } from './zone';

export interface WorldZones {
  /** 왼쪽에서 오른쪽 순서의 모든 구역 */
  all: Zone[];
  carousel: CarouselZone;
  plaza: PlazaZone;
  rink: RinkZone;
}

export function createWorldZones(): WorldZones {
  const carousel = createCarouselZone();
  const rink = createRinkZone();
  const plaza = createPlazaZone();
  return { all: [carousel, plaza, rink], carousel, plaza, rink };
}

/** 왼쪽에서 오른쪽 순서의 모든 구역 */
export function createZones(): Zone[] {
  return createWorldZones().all;
}
