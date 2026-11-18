// 링크 양쪽(옆 울타리 가운데)에 선 기둥 두 개 사이로 처지게 걸린 전구 줄 4개.
// 빨강·초록·금·파랑이 차례로 천천히 밝아진다. 기둥과 전선은 미리 그려 두고 전구만 매 프레임 그린다.

import { layerOffsetX, type Camera } from '../camera';
import { LAYER_FACTORS, REFLECTION, RINK_LIGHTS as L } from '../constants';
import { lazyBuffer } from '../scenery/buffer';
import type { DepthDrawable } from '../zones/zone';
import { rinkBounds, type IceLight } from './iceRink';

// ───────────── 위치 계산 (순수) ─────────────

export function lightPoles() {
  const b = rinkBounds();
  const top = b.midY - L.poleHeight;
  return { leftX: b.left, rightX: b.right - 1, footY: b.midY, top };
}

/** i번째 줄의 x 위치 y (양 끝 걸이에서 가운데로 처진다) */
export function stringY(i: number, x: number): number {
  const p = lightPoles();
  const anchor = p.top + L.firstHookBelowTop + i * L.hookGap;
  const u = (x - p.leftX) / (p.rightX - p.leftX);
  return anchor + L.sags[i] * 4 * u * (1 - u);
}

export interface Bulb {
  x: number;
  /** 전선 바로 아래 전구 윗끝 y */
  y: number;
  stringIndex: number;
  /** 0 빨강, 1 초록, 2 금, 3 파랑 */
  colorIndex: number;
}

export function rinkBulbs(): Bulb[] {
  const p = lightPoles();
  return L.sags.flatMap((_, i) => {
    const bulbs: Bulb[] = [];
    // 줄마다 시작을 엇갈려 위아래 전구가 한 줄로 서지 않게
    let k = 0;
    for (let x = p.leftX + 4 + i * 2; x < p.rightX - 2; x += L.bulbSpacing, k++) {
      bulbs.push({ x, y: Math.round(stringY(i, x)) + 1, stringIndex: i, colorIndex: (k + i) % L.bulbs.length });
    }
    return bulbs;
  });
}

/** 이 색 전구의 지금 밝기: 한 색씩 차례로 밝아졌다 어두워진다 */
export function bulbColorLevel(colorIndex: number, time: number): number {
  const phase = time / L.cyclePeriod - colorIndex / L.bulbs.length;
  const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * phase);
  return L.minLevel + (1 - L.minLevel) * wave * wave;
}

// ───────────── 소품 ─────────────

export interface RinkLights extends DepthDrawable {
  update(dt: number): void;
  /** 얼음에 비칠 전구들 */
  iceLights(): IceLight[];
}

export function createRinkLights(): RinkLights {
  const p = lightPoles();
  const b = rinkBounds();
  const bulbs = rinkBulbs();
  const width = p.rightX - p.leftX + 1 + 4;
  const bufferTop = p.top - 3;
  // 기둥 + 전선 (x 원점 = 왼쪽 기둥 - 2)
  const frame = lazyBuffer(width, p.footY - bufferTop + 1, (ctx) => {
    for (const x of [p.leftX, p.rightX]) {
      const bx = x - p.leftX + 2;
      ctx.fillStyle = L.pole;
      ctx.fillRect(bx - 1, p.top - bufferTop, L.poleWidth, p.footY - p.top);
      ctx.fillStyle = L.poleLight;
      ctx.fillRect(bx - 1, p.top - bufferTop, 1, p.footY - p.top);
      // 꼭대기 장식과 눈
      ctx.fillStyle = L.pole;
      ctx.fillRect(bx - 2, 1, 4, 2);
      ctx.fillRect(bx - 1, 0, 2, 1);
      ctx.fillStyle = L.snow;
      ctx.fillRect(bx - 1, 0, 2, 1);
    }
    ctx.fillStyle = L.wire;
    L.sags.forEach((_, i) => {
      for (let x = p.leftX; x <= p.rightX; x++) ctx.fillRect(x - p.leftX + 2, Math.round(stringY(i, x)) - bufferTop, 1, 1);
    });
  });
  let time = 0;

  return {
    footY: p.footY,
    update(dt: number) {
      time += dt;
    },
    iceLights() {
      return bulbs.map((bulb) => ({
        x: bulb.x,
        top: b.top + REFLECTION.topGap + Math.round((bulb.y - p.top) * REFLECTION.bulbDepthScale),
        length: REFLECTION.bulbLength,
        width: 1,
        color: L.bulbs[bulb.colorIndex],
        level: bulbColorLevel(bulb.colorIndex, time),
      }));
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.drawImage(frame().canvas, p.leftX - 2 - ox, bufferTop);
      const levels = L.bulbs.map((_, c) => bulbColorLevel(c, time));
      ctx.save();
      for (const bulb of bulbs) {
        const level = levels[bulb.colorIndex];
        const x = bulb.x - ox;
        ctx.fillStyle = L.bulbs[bulb.colorIndex];
        ctx.globalAlpha = L.glowAlpha * level;
        ctx.fillRect(x - 1, bulb.y - 1, 3, L.bulbHeight + 2);
        ctx.globalAlpha = L.bulbMinAlpha + (1 - L.bulbMinAlpha) * level;
        ctx.fillRect(x, bulb.y, 1, L.bulbHeight);
      }
      ctx.restore();
    },
  };
}
