import type { Camera } from '../camera';
import { ZONE_BOUNDS } from '../constants';
import type { InteractionPoint, Zone } from './zone';

/** 메인 광장 (가운데, 큰 트리) — 아직 뼈대만 있다. */
export function createPlazaZone(): Zone {
  const interactionPoints: InteractionPoint[] = [];

  return {
    name: 'plaza',
    startX: ZONE_BOUNDS.plaza.startX,
    endX: ZONE_BOUNDS.plaza.endX,
    interactionPoints,
    update(_dt: number) {},
    draw(_ctx: CanvasRenderingContext2D, _camera: Camera) {},
  };
}
