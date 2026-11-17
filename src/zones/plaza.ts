import { layerOffsetX, type Camera } from '../camera';
import { COLORS, LAYER_FACTORS, PLACEHOLDER } from '../constants';
import { OBSTACLES, TREE_X, ZONE_BOUNDS, getObstacle } from '../world';
import { boxProp, fillPixelTriangle } from './placeholder';
import { pointsInZone, type DepthDrawable, type Zone } from './zone';

/** 메인 광장 (가운데) — 지금은 초록 삼각형 트리와 노점 상자 4개 */
export function createPlazaZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.plaza;
  const bed = getObstacle('tree-bed');
  const bedBottom = bed.y + bed.h;

  const tree: DepthDrawable = {
    footY: bedBottom,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const cx = TREE_X - layerOffsetX(camera, LAYER_FACTORS.main);
      const bedTop = bedBottom - PLACEHOLDER.treeBedVisibleHeight;
      ctx.fillStyle = COLORS.treeTrunk;
      ctx.fillRect(cx - PLACEHOLDER.treeTrunkHalfWidth, bed.y, PLACEHOLDER.treeTrunkHalfWidth * 2, bedTop - bed.y);
      ctx.fillStyle = COLORS.treeGreen;
      fillPixelTriangle(ctx, cx, PLACEHOLDER.treeTopY, bed.y + PLACEHOLDER.treeBaseOffset, PLACEHOLDER.treeHalfWidth);
      ctx.fillStyle = COLORS.treeBed;
      ctx.fillRect(cx - bed.w / 2, bedTop, bed.w, PLACEHOLDER.treeBedVisibleHeight);
    },
  };

  const stalls = OBSTACLES.filter((o) => o.id.startsWith('stall-')).map((o) =>
    boxProp(o, PLACEHOLDER.stallHeight, COLORS.stall),
  );

  return {
    name: 'plaza',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [tree, ...stalls],
    update(_dt: number) {},
    draw() {},
  };
}
