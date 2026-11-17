// 임시 그림: 단색 상자. 회전목마·링크를 진짜 픽셀 그림으로 바꿀 때까지 쓴다.

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
