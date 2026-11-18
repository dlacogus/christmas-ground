// 눈 위에 남는 발자국: 걸을 때 한 발씩 찍히고, 시간이 지나면 내리는 눈에 덮여 사라진다.
// 벽돌이 드러난 곳처럼 눈이 없는 자리에는 남지 않는다 (찍을지는 부르는 쪽이 정한다).

import { FOOTPRINTS as F, SCREEN_WIDTH } from '../constants';

export interface Footprint {
  x: number;
  y: number;
  /** 세로로 걷는 중이었나 (발자국이 세로로 길다) */
  vertical: boolean;
  age: number;
}

/** 나이에 따른 진하기 (0~1): 한동안 그대로 있다가 끝에서 서서히 흐려진다 */
export function footprintAlpha(age: number): number {
  if (age >= F.life) return 0;
  return Math.min(1, (F.life - age) / F.fade);
}

export function createFootprints() {
  const prints: Footprint[] = [];
  let left = false;

  return {
    prints: prints as readonly Footprint[],
    /** (x, y) = 발밑, (dirX, dirY) = 걷는 방향. 왼발·오른발을 번갈아 걷는 줄 양옆에 찍는다 */
    add(x: number, y: number, dirX: number, dirY: number): void {
      const vertical = Math.abs(dirY) > Math.abs(dirX);
      left = !left;
      const side = left ? -F.sideOffset : F.sideOffset;
      prints.push({
        x: Math.round(x) + (vertical ? side : 0),
        y: Math.round(y) + (vertical ? 0 : side),
        vertical,
        age: 0,
      });
      if (prints.length > F.max) prints.shift();
    },
    update(dt: number): void {
      for (const p of prints) p.age += dt;
      while (prints.length > 0 && prints[0].age >= F.life) prints.shift();
    },
    /** 바닥 바로 위에 그린다 (바닥 불빛보다 먼저 — 불빛이 발자국 위에도 얹히게) */
    draw(ctx: CanvasRenderingContext2D, offsetX: number): void {
      if (prints.length === 0) return;
      ctx.fillStyle = F.color;
      for (const p of prints) {
        const sx = p.x - offsetX;
        if (sx < -F.length || sx > SCREEN_WIDTH) continue;
        ctx.globalAlpha = F.alpha * footprintAlpha(p.age);
        if (p.vertical) ctx.fillRect(sx, p.y - F.length + 1, 1, F.length);
        else ctx.fillRect(sx - 1, p.y, F.length, 1);
      }
      ctx.globalAlpha = 1;
    },
  };
}

export type Footprints = ReturnType<typeof createFootprints>;
