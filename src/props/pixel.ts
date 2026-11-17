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
