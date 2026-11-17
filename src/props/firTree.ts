// 작은 전나무: 층층이 좁아지는 잎, 층마다 꼭대기에 눈.

import { layerOffsetX, type Camera } from '../camera';
import { FIR as F, FOREGROUND_COLORS as C, LAYER_FACTORS } from '../constants';
import type { DepthDrawable } from '../zones/zone';

export function createFirTree(fir: { x: number; y: number; h: number }): DepthDrawable {
  const foliage = fir.h - F.trunkHeight;
  return {
    footY: fir.y,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const x = fir.x - layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.fillStyle = C.trunk;
      ctx.fillRect(x - F.trunkHalfWidth, fir.y - F.trunkHeight, F.trunkHalfWidth * 2, F.trunkHeight);
      for (let r = 0; r < foliage; r++) {
        const inTier = r % F.tierHeight;
        const half = Math.max(1, Math.round((foliage - r) * F.halfWidthRatio + (F.tierHeight - inTier) * 0.5));
        const y = fir.y - F.trunkHeight - 1 - r;
        const cap = inTier === F.tierHeight - 1 || r === foliage - 1;
        ctx.fillStyle = inTier === 0 ? C.needle : C.needleLight;
        ctx.fillRect(x - half, y, half * 2, 1);
        if (cap) {
          ctx.fillStyle = C.snow;
          ctx.fillRect(x - half, y, Math.max(1, half), 1);
        }
      }
    },
  };
}
