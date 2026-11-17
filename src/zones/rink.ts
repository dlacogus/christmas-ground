import type { Camera } from '../camera';
import { ZONE_BOUNDS } from '../constants';
import type { InteractionPoint, Zone } from './zone';

/** 스케이트장 (오른쪽) — 아직 뼈대만 있다. */
export function createRinkZone(): Zone {
  const interactionPoints: InteractionPoint[] = [];

  return {
    name: 'rink',
    startX: ZONE_BOUNDS.rink.startX,
    endX: ZONE_BOUNDS.rink.endX,
    interactionPoints,
    update(_dt: number) {},
    draw(_ctx: CanvasRenderingContext2D, _camera: Camera) {},
  };
}
