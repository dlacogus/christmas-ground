// 조명·분위기 효과. 모두 기존 그림 위에 덧입히는 층이다.
//   하늘 노을빛·달·구름 / 먼 건물 안개 / 바닥 그늘·쌓인 눈·번지는 불빛 / 빛 번짐 / 화면 가장자리 어둡게
// 움직이지 않는 것은 한 번 그려 두고 찍어 쓴다. 빛은 '더하기(lighter)'로 얹어 바닥과 벽이 실제로 밝아진다.

import { CLOCK_TOWER, LIGHTING as L, LIGHTING_COLORS as C, SCREEN_HEIGHT, SCREEN_WIDTH, TREE } from '../constants';
import { carouselGeometry } from '../props/carousel';
import { gateGeometry } from '../props/carouselEntrance';
import { exitSpan, gateArchTopAt, gateSpan } from '../props/iceRink';
import { hutRoofHeight } from '../props/marketHut';
import { dither, fillPixelCircle, fillPixelEllipse } from '../props/pixel';
import { lanternCenters } from '../props/streetLamp';
import { randInt, randRange, type Rng } from '../random';
import { CAROUSEL_X, HUTS, LAMPS, MAP_WIDTH, STREET_LINE_Y, TREE_X, WALK_AREA, getObstacle } from '../world';
import { drawSlice, lazyBuffer } from './buffer';
import { clockTowerGeometry } from './clockTower';

export { dither };

/** 가운데가 진하고 바깥으로 계단처럼 옅어지는 타원 */
function softEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha / L.spillSteps;
  for (let i = 0; i < L.spillSteps; i++) {
    const f = (L.spillSteps - i) / L.spillSteps;
    fillPixelEllipse(ctx, Math.round(cx), Math.round(cy), Math.max(1, Math.round(rx * f)), Math.max(1, Math.round(ry * f)));
  }
  ctx.restore();
}

// ───────────── 하늘 ─────────────

export function createSkyGlow(rng: Rng) {
  const horizon = STREET_LINE_Y + 4;
  const levels: (string | null)[] = [null, ...L.horizonColors];
  const getBuffer = lazyBuffer(SCREEN_WIDTH, horizon, (ctx) => {
    for (let y = L.horizonFromY; y < horizon; y++) {
      const pos = ((y - L.horizonFromY) / (horizon - L.horizonFromY)) * L.horizonColors.length;
      const i = Math.floor(pos);
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const color = levels[Math.min(levels.length - 1, dither(x, y, pos - i) ? i + 1 : i)];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // 달과 달무리
    const m = L.moon;
    softEllipse(ctx, m.x, m.y, m.haloRadius, m.haloRadius, m.haloAlpha, C.moonHalo);
    ctx.fillStyle = C.moon;
    fillPixelCircle(ctx, m.x, m.y, m.radius);
    ctx.fillStyle = C.moonShade;
    for (const [dx, dy, r] of [[-3, -2, 2], [3, 3, 1], [1, -5, 1], [-4, 4, 1]]) fillPixelCircle(ctx, m.x + dx, m.y + dy, r);
  });
  const clouds = Array.from({ length: L.cloudCount }, () => ({
    x: randRange(rng, 0, SCREEN_WIDTH),
    y: randInt(rng, L.cloudMinY, L.cloudMaxY),
    w: randInt(rng, L.cloudMinWidth, L.cloudMaxWidth),
  }));

  return {
    update(dt: number) {
      for (const c of clouds) {
        c.x += L.cloudSpeed * dt;
        if (c.x > SCREEN_WIDTH) c.x = -c.w;
      }
    },
    draw(ctx: CanvasRenderingContext2D) {
      ctx.drawImage(getBuffer().canvas, 0, 0);
      ctx.save();
      ctx.globalAlpha = L.cloudAlpha;
      ctx.fillStyle = C.cloud;
      for (const c of clouds) {
        const x = Math.round(c.x);
        ctx.fillRect(x + Math.round(c.w * 0.3), c.y - 2, Math.round(c.w * 0.4), 2);
        ctx.fillRect(x + Math.round(c.w * 0.12), c.y, Math.round(c.w * 0.76), 2);
        ctx.fillRect(x, c.y + 2, c.w, 2);
      }
      ctx.restore();
    },
  };
}

/** 먼 건물 아래쪽에 깔리는 밤안개 (화면에 고정) */
export function createFog() {
  const getBuffer = lazyBuffer(SCREEN_WIDTH, STREET_LINE_Y, (ctx) => {
    ctx.fillStyle = C.fog;
    for (let y = L.fogFromY; y < STREET_LINE_Y; y++) {
      ctx.globalAlpha = L.fogMaxAlpha * ((y - L.fogFromY) / (STREET_LINE_Y - L.fogFromY));
      ctx.fillRect(0, y, SCREEN_WIDTH, 1);
    }
  });
  return {
    draw(ctx: CanvasRenderingContext2D) {
      ctx.drawImage(getBuffer().canvas, 0, 0);
    },
  };
}

/** 시계 판 둘레 빛 번짐 (0.6 레이어 좌표) */
export function drawClockHalo(ctx: CanvasRenderingContext2D, offsetX: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  softEllipse(ctx, CLOCK_TOWER.x - offsetX, clockTowerGeometry().clockY, L.clockHaloRadius, L.clockHaloRadius, L.clockHaloAlpha, C.gold);
  ctx.restore();
}

// ───────────── 바닥 ─────────────

/**
 * 그때그때 생기는 작은 빛 (선물 상자, 스스로 빛나는 트리 장식). 미리 그려 둔 불빛 위에 매 프레임 더한다.
 * floor = 바닥에 납작하게 깔리는 빛 (시설보다 먼저), 아니면 시설 위로 번지는 빛.
 */
export interface PointLight {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: string;
  floor: boolean;
}

const NO_POINT_LIGHTS: readonly PointLight[] = [];

/** 작은 빛들을 더한다 ('lighter'로 바꿔 둔 상태에서 부른다). 화면 밖은 건너뛴다 */
function drawPointLights(ctx: CanvasRenderingContext2D, lights: readonly PointLight[], offsetX: number, floor: boolean): void {
  for (const p of lights) {
    if (p.floor !== floor) continue;
    const sx = Math.round(p.x) - offsetX;
    if (sx < -p.radius || sx > SCREEN_WIDTH + p.radius) continue;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha / L.pointLightSteps;
    for (let i = 0; i < L.pointLightSteps; i++) {
      const r = Math.max(1, Math.round((p.radius * (L.pointLightSteps - i)) / L.pointLightSteps));
      if (floor) fillPixelEllipse(ctx, sx, Math.round(p.y), r, Math.max(1, Math.round(r * L.pointLightFlat)));
      else fillPixelCircle(ctx, sx, Math.round(p.y), r);
    }
  }
  ctx.globalAlpha = 1;
}

/** 바닥 위에 얹는 것: 앞쪽 밤 그늘, 연석 위 쌓인 눈, 그리고 번지는 불빛(더하기). pointLights = 그때그때 생기는 작은 빛 */
export function createGroundLight(rng: Rng, pointLights: () => readonly PointLight[] = () => NO_POINT_LIGHTS) {
  const bed = getObstacle('tree-bed');
  const rink = getObstacle('rink');

  const getShade = lazyBuffer(MAP_WIDTH, SCREEN_HEIGHT, (ctx) => {
    // 앞쪽(화면 아래)으로 갈수록 불빛에서 멀어 어둡다
    const bottom = WALK_AREA.y + WALK_AREA.h;
    for (let y = L.frontShadeFromY; y < SCREEN_HEIGHT; y++) {
      const t = Math.min(1, (y - L.frontShadeFromY) / (bottom - L.frontShadeFromY));
      for (let x = 0; x < MAP_WIDTH; x += 2) {
        ctx.fillStyle = C.shade;
        ctx.globalAlpha = L.frontShadeAlpha * (Math.floor(t * 4) + (dither(x >> 1, y, t * 4 - Math.floor(t * 4)) ? 1 : 0)) / 4;
        ctx.fillRect(x, y, 2, 1);
      }
    }
    ctx.globalAlpha = 1;
    // 연석 위에 쌓인 눈 (높이가 천천히 오르내린다)
    let h: number = L.curbSnowMin;
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (rng() < 0.25) h = Math.max(L.curbSnowMin, Math.min(L.curbSnowMax, h + (rng() < 0.5 ? -1 : 1)));
      ctx.fillStyle = C.snow;
      ctx.fillRect(x, STREET_LINE_Y - 1, 1, h);
      ctx.fillStyle = C.snowShade;
      ctx.fillRect(x, STREET_LINE_Y - 1 + h, 1, 1);
    }
  });

  const getLight = lazyBuffer(MAP_WIDTH, SCREEN_HEIGHT, (ctx) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, WALK_AREA.y, MAP_WIDTH, SCREEN_HEIGHT - WALK_AREA.y);
    ctx.clip();
    // 오두막 창구에서 바닥으로 쏟아지는 따뜻한 빛
    // 타원을 겹쳐 오두막 줄 앞이 끊기지 않고 이어지게
    for (const hut of HUTS) softEllipse(ctx, hut.x, WALK_AREA.y, hut.w / 2 + L.hutSpillSpread, L.hutSpillDepth, L.hutSpillAlpha, C.warm);
    for (const lamp of LAMPS) softEllipse(ctx, lamp.x, lamp.y, L.lampPoolRadiusX, L.lampPoolRadiusY, L.lampPoolAlpha, C.warm);
    softEllipse(ctx, TREE_X, bed.y + bed.h / 2, L.treePoolRadiusX, L.treePoolRadiusY, L.treePoolAlpha, C.gold);
    softEllipse(ctx, CAROUSEL_X, carouselGeometry().rimBottom, L.carouselPoolRadiusX, L.carouselPoolRadiusY, L.carouselPoolAlpha, C.gold);
    // 회전목마 입구: 아치 아래에서 카펫 위로 타원처럼 번지는 금빛 (회전목마 둘레에서 가장 밝은 곳)
    const gate = gateGeometry();
    softEllipse(ctx, gate.cx, (gate.footY + gate.carpetEndY) / 2, L.gatePoolRadiusX, L.gatePoolRadiusY, L.gatePoolAlpha, C.gold);
    // 링크 전구 줄 빛이 앞쪽 바닥에 번진다
    softEllipse(ctx, rink.x + rink.w / 2, rink.y + rink.h + 4, rink.w / 2, L.rinkSpillRadiusY, L.rinkSpillAlpha, C.rinkHaze);
    // 링크 입구·출구 아치 전구 빛이 문 앞 바닥에
    for (const g of [gateSpan(), exitSpan()]) {
      softEllipse(ctx, (g.left + g.right) / 2, rink.y + rink.h + 2, L.rinkGatePoolRadiusX, L.rinkGatePoolRadiusY, L.rinkGatePoolAlpha, C.warm);
    }
    ctx.restore();
  });

  /** 시설 위로 번지는 빛: 트리, 오두막, 가로등, 링크 전구 줄 */
  const getBloom = lazyBuffer(MAP_WIDTH, SCREEN_HEIGHT, (ctx) => {
    softEllipse(ctx, TREE_X, (TREE.tipY + TREE.foliageBottomY) / 2, L.treeHaloRadiusX, L.treeHaloRadiusY, L.treeHaloAlpha, C.gold);
    for (const hut of HUTS) {
      const mid = STREET_LINE_Y - hut.wall / 2;
      softEllipse(ctx, hut.x, mid, hut.w / 2 + 10, L.hutHaloRise + hutRoofHeight(hut) / 3, L.hutHaloAlpha, C.warm);
    }
    for (const lamp of LAMPS) {
      for (const c of lanternCenters(lamp)) softEllipse(ctx, lamp.x + c.dx, c.y, L.lampHaloRadius, L.lampHaloRadius, L.lampHaloAlpha, C.warm);
    }
    softEllipse(ctx, rink.x + rink.w / 2, rink.y - 40, rink.w / 2, 46, L.rinkHazeAlpha, C.rinkHaze);
    for (const g of [gateSpan(), exitSpan()]) {
      const cx = (g.left + g.right) / 2;
      softEllipse(ctx, cx, gateArchTopAt(g, cx) + 3, L.rinkGateHaloRadius, L.rinkGateHaloRadius, L.rinkGateHaloAlpha, C.warm);
    }
    const carousel = carouselGeometry();
    const gate = gateGeometry();
    softEllipse(ctx, gate.cx, gate.springY, L.gateHaloRadius, L.gateHaloRadius, L.gateHaloAlpha, C.gold);
    softEllipse(ctx, CAROUSEL_X, (carousel.apexY + carousel.platformY) / 2, L.carouselHaloRadiusX, L.carouselHaloRadiusY, L.carouselHaloAlpha, C.gold);
  });

  return {
    /** 바닥 바로 위 (시설보다 먼저) */
    drawGround(ctx: CanvasRenderingContext2D, offsetX: number) {
      drawSlice(ctx, getShade().canvas, offsetX);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawSlice(ctx, getLight().canvas, offsetX);
      drawPointLights(ctx, pointLights(), offsetX, true);
      ctx.restore();
    },
    /** 시설을 다 그린 뒤 */
    drawBloom(ctx: CanvasRenderingContext2D, offsetX: number) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawSlice(ctx, getBloom().canvas, offsetX);
      drawPointLights(ctx, pointLights(), offsetX, false);
      ctx.restore();
    },
  };
}

// ───────────── 화면 가장자리 ─────────────

export function createVignette() {
  const getBuffer = lazyBuffer(SCREEN_WIDTH, SCREEN_HEIGHT, (ctx) => {
    ctx.fillStyle = C.vignette;
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const dx = (x - SCREEN_WIDTH / 2) / (SCREEN_WIDTH / 2);
        const dy = (y - SCREEN_HEIGHT / 2) / (SCREEN_HEIGHT / 2);
        const t = Math.max(0, (Math.hypot(dx, dy) / Math.SQRT2 - L.vignetteStart) / (1 - L.vignetteStart));
        const level = t * L.vignetteSteps;
        const step = Math.floor(level) + (dither(x, y, level - Math.floor(level)) ? 1 : 0);
        if (step <= 0) continue;
        ctx.globalAlpha = (L.vignetteAlpha * Math.min(L.vignetteSteps, step)) / L.vignetteSteps;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
  return {
    draw(ctx: CanvasRenderingContext2D) {
      ctx.drawImage(getBuffer().canvas, 0, 0);
    },
  };
}
