// 눈 위에 손으로 쓴 듯한 흘림체 글씨 ("Merry Christmas"). 회전목마 왼쪽 빈 눈밭에 판다.
// 글자는 이미지·글꼴 없이 점을 이은 부드러운 곡선(획)으로 만들고, 바닥에 누운 것처럼 세로로 납작하게 눕힌다.

import { SNOW_WRITING as W, SNOW_WRITING_COLORS as C } from '../constants';
import { SNOW_WRITING_AT } from '../world';

type Pt = readonly [number, number];
interface Letter {
  /** 획들 (단위: x높이 = 1, y는 위가 +, 기준선 = 0) */
  strokes: readonly (readonly Pt[])[];
  /** 다음 글자까지 나아가는 폭 */
  width: number;
}

/** 흘림체 글자: 왼쪽 아래(0, 0.1)에서 들어와 오른쪽 아래(width, 0.15)로 나가 다음 글자와 이어진다 */
export const LETTERS: Readonly<Record<string, Letter>> = {
  M: {
    width: 1.5,
    strokes: [
      [
        [-0.45, 1.1], [-0.4, 0.5], [-0.12, 0.02], [0.1, 0.8], [0.3, 2.0], [0.45, 1.2], [0.6, 0.4],
        [0.75, 1.2], [0.95, 2.0], [1.05, 1.0], [1.1, 0.1], [1.3, 0.05], [1.5, 0.15],
      ],
    ],
  },
  C: {
    width: 1.05,
    strokes: [[[0.8, 1.4], [0.97, 1.6], [0.87, 1.95], [0.55, 2.0], [0.2, 1.5], [0.1, 0.8], [0.3, 0.1], [0.65, 0.0], [1.05, 0.15]]],
  },
  e: {
    width: 0.7,
    strokes: [[[0, 0.1], [0.35, 0.5], [0.5, 0.85], [0.35, 1.0], [0.18, 0.8], [0.2, 0.3], [0.4, 0.02], [0.7, 0.15]]],
  },
  r: {
    width: 0.85,
    strokes: [[[0, 0.1], [0.2, 0.7], [0.25, 1.05], [0.35, 0.92], [0.55, 0.98], [0.55, 0.4], [0.62, 0.05], [0.85, 0.15]]],
  },
  y: {
    width: 0.9,
    strokes: [
      [
        [0, 0.1], [0.12, 0.8], [0.15, 1.0], [0.18, 0.4], [0.3, 0.03], [0.5, 0.3], [0.6, 1.0], [0.6, 0.0],
        [0.5, -0.8], [0.3, -1.0], [0.15, -0.7], [0.4, -0.2], [0.9, 0.15],
      ],
    ],
  },
  h: {
    width: 0.9,
    strokes: [
      [
        [0, 0.1], [0.25, 1.0], [0.35, 1.8], [0.25, 2.1], [0.14, 1.7], [0.14, 0.8], [0.14, 0.0], [0.18, 0.5],
        [0.38, 1.0], [0.56, 0.8], [0.58, 0.3], [0.68, 0.03], [0.9, 0.15],
      ],
    ],
  },
  i: {
    width: 0.6,
    strokes: [
      [[0, 0.1], [0.18, 0.7], [0.22, 1.0], [0.22, 0.4], [0.32, 0.03], [0.6, 0.15]],
      [[0.24, 1.5], [0.26, 1.55]],
    ],
  },
  s: {
    width: 0.75,
    strokes: [
      [[0, 0.1], [0.3, 0.8], [0.36, 1.05], [0.5, 0.45], [0.4, 0.05], [0.15, 0.12]],
      [[0.42, 0.06], [0.6, 0.05], [0.75, 0.15]],
    ],
  },
  t: {
    width: 0.65,
    strokes: [
      [[0, 0.1], [0.2, 0.9], [0.28, 1.7], [0.26, 0.5], [0.36, 0.03], [0.65, 0.15]],
      [[0.05, 1.2], [0.5, 1.25]],
    ],
  },
  m: {
    width: 1.2,
    strokes: [
      [
        [0, 0.1], [0.12, 0.9], [0.16, 0.5], [0.16, 0.0], [0.2, 0.6], [0.36, 1.0], [0.5, 0.7], [0.5, 0.0],
        [0.54, 0.6], [0.7, 1.0], [0.84, 0.7], [0.86, 0.25], [0.96, 0.03], [1.2, 0.15],
      ],
    ],
  },
  a: {
    width: 0.92,
    strokes: [
      [
        [0, 0.1], [0.3, 0.5], [0.55, 0.95], [0.38, 1.02], [0.14, 0.7], [0.14, 0.25], [0.3, 0.02], [0.5, 0.4],
        [0.58, 1.0], [0.58, 0.35], [0.68, 0.03], [0.92, 0.15],
      ],
    ],
  },
};

/** 낱말 폭 (px) */
export function wordWidth(word: string): number {
  return [...word].reduce((sum, ch) => sum + LETTERS[ch].width, 0) * W.scale;
}

/** 점들을 부드럽게 잇는 곡선 위의 점 (Catmull-Rom) */
function smooth(points: readonly Pt[], visit: (x: number, y: number) => void): void {
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k <= W.curveSteps; k++) {
      const t = k / W.curveSteps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      visit(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
}

export interface WritingMask {
  /** 월드 좌표에서 지도 왼쪽 위 */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1 = 파인 글씨 자국 */
  cells: Uint8Array;
}

let cached: WritingMask | null = null;

/** 글씨가 파인 자리 지도 (한 번만 만든다) */
export function snowWritingMask(): WritingMask {
  if (cached) return cached;
  const dots: number[] = [];
  let last: { x: number; y: number } | null = null;
  // 앞 점에서 이 점까지 빈칸 없이 잇는다 (긴 획도 점선처럼 끊기지 않게)
  const plot = (px: number, py: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    if (last) {
      const steps = Math.max(Math.abs(x - last.x), Math.abs(y - last.y));
      for (let k = 1; k < steps; k++) {
        dots.push(Math.round(last.x + ((x - last.x) * k) / steps), Math.round(last.y + ((y - last.y) * k) / steps));
      }
    }
    dots.push(x, y);
    last = { x, y };
  };
  /** 한 획을 처음부터 끝까지 이어 그린다 */
  const drawStroke = (points: readonly Pt[], visit: (x: number, y: number) => void) => {
    last = null;
    smooth(points, visit);
  };
  W.lines.forEach((word, line) => {
    const baseline = SNOW_WRITING_AT.firstBaselineY + line * W.lineGap;
    let penX = SNOW_WRITING_AT.centerX - wordWidth(word) / 2;
    // 글자 단위 좌표 → 바닥 좌표: 오른쪽으로 기울이고 세로는 납작하게
    const toGround = (ux: number, uy: number) => plot(penX + (ux + uy * W.slant) * W.scale, baseline - uy * W.scale * W.flatten);
    for (const ch of word) {
      for (const stroke of LETTERS[ch].strokes) drawStroke(stroke, toGround);
      penX += LETTERS[ch].width * W.scale;
    }
    // 마지막 낱말 아래에 길게 휘감는 밑줄 장식
    if (line === W.lines.length - 1) {
      const left = SNOW_WRITING_AT.centerX - wordWidth(word) / 2;
      const flourish = W.flourish.map(([fx, fy]) => [left + fx * wordWidth(word), baseline + fy] as const);
      drawStroke(flourish, plot);
    }
  });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < dots.length; i += 2) {
    minX = Math.min(minX, dots[i]);
    maxX = Math.max(maxX, dots[i] + W.thickness - 1);
    minY = Math.min(minY, dots[i + 1]);
    maxY = Math.max(maxY, dots[i + 1] + W.thickness - 1);
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < dots.length; i += 2) {
    for (let dy = 0; dy < W.thickness; dy++) {
      for (let dx = 0; dx < W.thickness; dx++) cells[(dots[i + 1] - minY + dy) * width + dots[i] - minX + dx] = 1;
    }
  }
  cached = { x: minX, y: minY, width, height, cells };
  return cached;
}

/** 바닥 버퍼에 글씨를 판다. top = 버퍼 y 0에 해당하는 월드 y */
export function paintSnowWriting(ctx: CanvasRenderingContext2D, top: number): void {
  const m = snowWritingMask();
  const each = (visit: (x: number, y: number, mx: number, my: number) => void) => {
    for (let my = 0; my < m.height; my++) {
      for (let mx = 0; mx < m.width; mx++) if (m.cells[my * m.width + mx]) visit(m.x + mx, m.y + my - top, mx, my);
    }
  };
  // 글씨 둘레는 고른 눈밭 (벽돌이 드러난 자리 위에도 눈을 덮는다)
  ctx.fillStyle = C.snow;
  each((x, y) => ctx.fillRect(x - W.snowPadX, y - W.snowPadY, W.snowPadX * 2 + 1, W.snowPadY * 2 + 1));
  // 파인 자국 아래쪽 가장자리에 밀려 올라온 밝은 눈
  ctx.fillStyle = C.rim;
  each((x, y) => ctx.fillRect(x, y + 1, 1, 1));
  // 파인 자국: 위쪽 가장자리는 그늘이 더 짙다
  each((x, y, mx, my) => {
    const topEdge = my === 0 || !m.cells[(my - 1) * m.width + mx];
    ctx.fillStyle = topEdge ? C.grooveDeep : C.groove;
    ctx.fillRect(x, y, 1, 1);
  });
}
