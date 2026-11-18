// 검은 주철 가로등: 받침, 기둥, 장식 고리, 작은 리스, 위에 등 하나 또는 두 개와 따뜻한 빛 번짐.

import { layerOffsetX, type Camera } from '../camera';
import { LAMP_COLORS as C, LAYER_FACTORS, STREET_LAMP as L } from '../constants';
import type { DepthDrawable } from '../zones/zone';
import { fillSoftGlow } from './pixel';

export interface LampSpec {
  x: number;
  /** 발밑 y */
  y: number;
  heads: number;
}

/** 등(랜턴)들의 가운데 위치 (발밑 x 기준 상대 x, 화면 y) */
export function lanternCenters(lamp: LampSpec): { dx: number; y: number }[] {
  const y = lamp.y - L.height - Math.floor(L.lanternHeight / 2);
  return lamp.heads === 1 ? [{ dx: 0, y }] : [{ dx: -L.armHalfWidth, y }, { dx: L.armHalfWidth, y }];
}

function paintLantern(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const w = L.lanternWidth;
  const h = L.lanternHeight;
  const left = cx - w / 2;
  const top = cy - h / 2;
  // 지붕 모자와 꼭지
  ctx.fillStyle = C.iron;
  ctx.fillRect(cx - 1, top - 3, 2, 1);
  ctx.fillRect(left - 1, top - 2, w + 2, 2);
  // 틀과 유리
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = C.glass;
  ctx.fillRect(left + 1, top + 1, w - 2, h - 2);
  ctx.fillStyle = C.glassBright;
  ctx.fillRect(left + 2, top + 2, w - 4, h - 4);
  ctx.fillStyle = C.iron;
  ctx.fillRect(left, top + h, w, 1);
}

function paintWreath(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const r = L.wreathRadius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3 || d < r - L.wreathThickness) continue;
      // 왼쪽 위는 밝게, 나머지는 잎이 엇갈린 두 색
      const lit = dx + dy < -r && d > r - 1.2;
      ctx.fillStyle = lit ? C.wreathLight : (dx + dy) % 2 === 0 ? C.wreath : C.wreathDark;
      ctx.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  // 작은 금 열매
  ctx.fillStyle = C.berry;
  ctx.fillRect(cx - r + 1, cy - 1, 1, 1);
  ctx.fillRect(cx + r - 1, cy + 1, 1, 1);
  ctx.fillRect(cx + 1, cy - r + 1, 1, 1);
  // 아래 리본: 매듭 양옆 고리와 늘어진 두 가닥
  ctx.fillStyle = C.bow;
  ctx.fillRect(cx - 3, cy + r - 1, 2, 2);
  ctx.fillRect(cx + 2, cy + r - 1, 2, 2);
  ctx.fillRect(cx - 2, cy + r + 1, 1, 2);
  ctx.fillRect(cx + 2, cy + r + 1, 1, 2);
  ctx.fillStyle = C.bowDark;
  ctx.fillRect(cx - 1, cy + r - 1, 3, 2);
}

function paintLamp(ctx: CanvasRenderingContext2D, lamp: LampSpec, x: number): void {
  const foot = lamp.y;
  const topY = foot - L.height;
  ctx.fillStyle = C.iron;
  // 받침
  ctx.fillRect(x - L.baseWidth / 2, foot - L.baseHeight, L.baseWidth, L.baseHeight);
  ctx.fillRect(x - L.plinthWidth / 2, foot - L.baseHeight - L.plinthHeight, L.plinthWidth, L.plinthHeight);
  // 기둥 (왼쪽 한 줄 하이라이트)
  ctx.fillRect(x - L.poleWidth / 2, topY, L.poleWidth, L.height - L.baseHeight);
  ctx.fillStyle = C.ironLight;
  ctx.fillRect(x - L.poleWidth / 2, topY, 1, L.height - L.baseHeight);
  // 장식 고리
  ctx.fillStyle = C.iron;
  ctx.fillRect(x - 2, foot - L.collarAbove, 4, 2);
  // 팔 (등 둘)
  if (lamp.heads > 1) {
    ctx.fillRect(x - L.armHalfWidth, topY, L.armHalfWidth * 2, 2);
    ctx.fillRect(x - L.armHalfWidth - 1, topY + 2, 1, 1);
    ctx.fillRect(x + L.armHalfWidth, topY + 2, 1, 1);
  }
  paintWreath(ctx, x, foot - L.wreathAbove);
  for (const c of lanternCenters(lamp)) paintLantern(ctx, x + c.dx, c.y);
}

export function createStreetLamp(lamp: LampSpec): DepthDrawable {
  return {
    footY: lamp.y,
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const x = lamp.x - layerOffsetX(camera, LAYER_FACTORS.main);
      for (const c of lanternCenters(lamp)) fillSoftGlow(ctx, x + c.dx, c.y, L.glowRadius, L.glowAlpha, C.glow);
      paintLamp(ctx, lamp, x);
    },
  };
}
