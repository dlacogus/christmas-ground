/** 한 번 그려 두고 매 프레임 찍어 쓰는 오프스크린 캔버스 */
export interface PixelBuffer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createBuffer(width: number, height: number): PixelBuffer {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** 처음 그릴 때 한 번만 만든다 (테스트처럼 DOM이 없을 때 생성 자체는 미룸) */
export function lazyBuffer(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  let buffer: PixelBuffer | null = null;
  return (): PixelBuffer => {
    if (!buffer) {
      buffer = createBuffer(width, height);
      paint(buffer.ctx);
    }
    return buffer;
  };
}
