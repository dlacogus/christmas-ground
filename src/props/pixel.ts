// 소품 공통 픽셀 도형

/** 가로줄로 채운 픽셀 원 (번짐 없음) */
export function fillPixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy + r));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** 가운데가 진하고 바깥으로 갈수록 옅어지는 빛 번짐 (원 여러 겹) */
export function fillSoftGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  alpha: number,
  color: string,
  rings = 3,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha / rings;
  for (let i = 0; i < rings; i++) {
    fillPixelCircle(ctx, cx, cy, Math.max(1, Math.round((radius * (rings - i)) / rings)));
  }
  ctx.restore();
}

/** 두 색 #rrggbb를 t(0~1)만큼 섞는다 */
export function mixColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const ca = (pa >> shift) & 0xff;
    const cb = (pb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** 가로줄로 채운 픽셀 타원 */
export function fillPixelEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    if (half > 0) ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

/** 문자열 픽셀 그림을 찍는다 (글자 → 색, '.'은 투명) */
export function stampPixels(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
  left: number,
  top: number,
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(left + x, top + y, 1, 1);
    });
  });
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** 점묘: v(0~1)가 클수록 더 많은 칸이 켜진다 */
export function dither(x: number, y: number, v: number): boolean {
  return v > (BAYER[y & 3][x & 3] + 0.5) / 16;
}
