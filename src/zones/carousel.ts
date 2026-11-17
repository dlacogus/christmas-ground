import type { Camera } from '../camera';
import { ZONE_BOUNDS } from '../constants';
import type { InteractionPoint, Zone } from './zone';

/** 회전목마 구역 (왼쪽) — 아직 뼈대만 있다. */
export function createCarouselZone(): Zone {
  const interactionPoints: InteractionPoint[] = [];

  return {
    name: 'carousel',
    startX: ZONE_BOUNDS.carousel.startX,
    endX: ZONE_BOUNDS.carousel.endX,
    interactionPoints,
    update(_dt: number) {},
    draw(_ctx: CanvasRenderingContext2D, _camera: Camera) {},
  };
}
