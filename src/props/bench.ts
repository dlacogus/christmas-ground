// 나무 벤치: 주철 다리, 등받이 판자 두 줄, 위에 눈 살짝.

import { layerOffsetX, type Camera } from '../camera';
import { BENCH as B, BENCH_COLORS as C, LAYER_FACTORS } from '../constants';
import type { Rng } from '../random';
import type { DepthDrawable } from '../zones/zone';

export function createBench(foot: { x: number; y: number }, halfWidth: number, rng: Rng): DepthDrawable {
  // 눈이 쌓인 칸 (시드 고정)
  const width = halfWidth * 2;
  const seatSnow = Array.from({ length: width }, () => rng() < B.snowChance);
  const backSnow = Array.from({ length: width }, () => rng() < B.snowChance);

  return {
    footY: foot.y,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const left = foot.x - halfWidth - layerOffsetX(camera, LAYER_FACTORS.main);
      const seatY = foot.y - B.seatAbove;
      const backTop = foot.y - B.backTopAbove;
      // 다리와 등받이 지지대
      ctx.fillStyle = C.iron;
      for (const x of [left + B.legInset, left + width - 1 - B.legInset]) {
        ctx.fillRect(x, backTop, 1, foot.y - backTop);
      }
      // 등받이 판자
      for (let s = 0; s < B.backSlats; s++) {
        const y = backTop + s * 3;
        ctx.fillStyle = C.wood;
        ctx.fillRect(left, y, width, 2);
        ctx.fillStyle = C.woodDark;
        ctx.fillRect(left, y + 1, width, 1);
      }
      // 앉는 판
      ctx.fillStyle = C.wood;
      ctx.fillRect(left - 1, seatY, width + 2, B.seatThickness);
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(left - 1, seatY + B.seatThickness - 1, width + 2, 1);
      // 눈
      ctx.fillStyle = C.snow;
      for (let i = 0; i < width; i++) {
        if (backSnow[i]) ctx.fillRect(left + i, backTop - 1, 1, 1);
        if (seatSnow[i]) ctx.fillRect(left + i, seatY - 1, 1, 1);
      }
    },
  };
}
