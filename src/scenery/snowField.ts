// 바닥에 깔린 눈의 양. 바닥 눈 그림(ground.ts의 눈 지도)과 같은 자리에, 2px 칸마다 0~1의 양을 붙인다.
// 눈덩이를 굴리면 지나간 칸의 눈이 걷혀 눌린 눈길이 남고 (그 위를 다시 굴려도 커지지 않는다), 내리는 눈으로 약 2분에 걸쳐 다시 찬다.
// DOM을 쓰지 않는다. 칸이 '수북한 눈 ↔ 눌린 눈'으로 바뀔 때 onCell로 알려 주면 바닥 그림이 그 칸만 다시 찍는다.

import { SNOW_FIELD as F } from '../constants';
import type { Rect } from '../world';

export interface SnowField {
  readonly cols: number;
  readonly rows: number;
  /** 월드 좌표 (x, y)의 눈 양 (0~1). 바닥 밖이면 0 */
  amountAt(x: number, y: number): number;
  /** 그 자리에 굴릴 눈이 수북한가 (굴리기를 시작할 수 있나) */
  hasSnow(x: number, y: number): boolean;
  /** 그 자리가 눈 덮인 바닥인가 — 눌린 눈길도 눈이다 (발자국이 남는다). 원래 벽돌이 드러난 곳·카펫은 아니다 */
  covered(x: number, y: number): boolean;
  /** (x, y)를 가운데로 가로 ±halfW, 세로 ±halfD 타원 안의 눈을 걷는다. 걷은 넓이(px²)를 돌려준다 */
  take(x: number, y: number, halfW: number, halfD: number): number;
  /** 걷힌 눈이 다시 쌓인다 */
  update(dt: number): void;
  /** 칸(cx, cy)이 수북한 눈으로(true) / 눌린 눈길로(false) 보이게 바뀌었을 때 */
  onCell: ((cx: number, cy: number, snowy: boolean) => void) | null;
  /** 지금 눌린 눈길로 보이는 칸들 (바닥 그림을 처음 만들 때 맞춘다) */
  forEachBare(visit: (cx: number, cy: number) => void): void;
}

/**
 * cover = 가로 width, 세로 height의 눈 지도 (0 = 원래 눈이 없는 곳). origin = 지도의 왼쪽 위 월드 좌표.
 * blocked = 눈이 없는 것으로 치는 곳 (카펫 등).
 */
export function createSnowField(
  cover: Uint8Array,
  width: number,
  height: number,
  origin: { x: number; y: number },
  blocked: readonly Rect[] = [],
): SnowField {
  const cols = Math.ceil(width / F.cell);
  const rows = Math.ceil(height / F.cell);
  /** 눈이 쌓일 수 있는 칸인가 (원래 눈이 있던 자리) */
  const base = new Uint8Array(cols * rows);
  const amount = new Float32Array(cols * rows);
  /** 칸마다 다른 '눈으로 보이는' 문턱 */
  const show = new Float32Array(cols * rows);
  /** 지금 눈으로 보이나 */
  const shown = new Uint8Array(cols * rows);
  /** 아직 덜 찬 칸 목록 */
  const refilling: number[] = [];
  const inList = new Uint8Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const px = Math.min(width - 1, cx * F.cell);
      const py = Math.min(height - 1, cy * F.cell);
      const wx = origin.x + px;
      const wy = origin.y + py;
      const i = cy * cols + cx;
      const isBlocked = blocked.some((r) => wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h);
      if (cover[py * width + px] > 0 && !isBlocked) {
        base[i] = 1;
        amount[i] = 1;
        shown[i] = 1;
      }
      const hash = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
      show[i] = F.showMin + (hash - Math.floor(hash)) * (F.showMax - F.showMin);
    }
  }

  const indexAt = (x: number, y: number): number => {
    const cx = Math.floor((x - origin.x) / F.cell);
    const cy = Math.floor((y - origin.y) / F.cell);
    return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : cy * cols + cx;
  };

  const field: SnowField = {
    cols,
    rows,
    onCell: null,
    amountAt(x, y) {
      const i = indexAt(x, y);
      return i < 0 ? 0 : amount[i];
    },
    hasSnow(x, y) {
      const i = indexAt(x, y);
      return i >= 0 && shown[i] === 1;
    },
    covered(x, y) {
      const i = indexAt(x, y);
      return i >= 0 && base[i] === 1;
    },
    take(x, y, halfW, halfD) {
      const cx0 = Math.max(0, Math.floor((x - halfW - origin.x) / F.cell));
      const cx1 = Math.min(cols - 1, Math.floor((x + halfW - origin.x) / F.cell));
      const cy0 = Math.max(0, Math.floor((y - halfD - origin.y) / F.cell));
      const cy1 = Math.min(rows - 1, Math.floor((y + halfD - origin.y) / F.cell));
      let taken = 0;
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = (origin.y + (cy + 0.5) * F.cell - y) / halfD;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = (origin.x + (cx + 0.5) * F.cell - x) / halfW;
          const r2 = dx * dx + dy * dy;
          if (r2 > 1) continue;
          // 가장자리는 한 칸 걸러 한 칸만: 길 경계가 칼로 자른 듯하지 않고 흩어진다
          if (r2 > F.softEdgeFrom && (cx + cy) % 2 === 1) continue;
          const i = cy * cols + cx;
          if (amount[i] <= 0) continue;
          taken += amount[i] * F.cell * F.cell;
          amount[i] = 0;
          if (shown[i]) {
            shown[i] = 0;
            field.onCell?.(cx, cy, false);
          }
          if (!inList[i]) {
            inList[i] = 1;
            refilling.push(i);
          }
        }
      }
      return taken;
    },
    update(dt) {
      const add = dt / F.refillSeconds;
      for (let k = refilling.length - 1; k >= 0; k--) {
        const i = refilling[k];
        amount[i] = Math.min(1, amount[i] + add);
        if (!shown[i] && amount[i] >= show[i]) {
          shown[i] = 1;
          field.onCell?.(i % cols, Math.floor(i / cols), true);
        }
        if (amount[i] >= 1) {
          inList[i] = 0;
          refilling[k] = refilling[refilling.length - 1];
          refilling.pop();
        }
      }
    },
    forEachBare(visit) {
      for (const i of refilling) if (!shown[i] && base[i]) visit(i % cols, Math.floor(i / cols));
    },
  };
  return field;
}
