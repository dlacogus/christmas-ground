// 임시 그림: 단색 상자·삼각형. 나중에 진짜 픽셀 그림으로 바꾼다.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS } from '../constants';
import type { Rect } from '../world';
import type { DepthDrawable } from './zone';

/** 발밑 사각형 위로 height만큼 솟은 단색 상자 */
export function boxProp(foot: Rect, height: number, color: string): DepthDrawable {
  const bottom = foot.y + foot.h;
  return {
    footY: bottom,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.fillStyle = color;
      ctx.fillRect(foot.x - ox, bottom - height, foot.w, height);
    },
  };
}

/** 한 줄씩 채운 픽셀 삼각형 (경로 채우기의 번짐 없이) */
export function fillPixelTriangle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  baseY: number,
  halfWidth: number,
): void {
  const height = baseY - topY;
  for (let y = topY; y < baseY; y++) {
    const half = Math.round(((y - topY + 1) / height) * halfWidth);
    ctx.fillRect(centerX - half, y, half * 2, 1);
  }
}
