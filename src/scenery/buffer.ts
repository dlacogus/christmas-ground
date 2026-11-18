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
  const get = (): PixelBuffer => {
    if (!buffer) {
      buffer = createBuffer(width, height);
      paint(buffer.ctx);
    }
    return buffer;
  };
  notWarmed.push(get);
  return get;
}

const notWarmed: (() => PixelBuffer)[] = [];

/**
 * 아직 안 그린 버퍼를 틈틈이 미리 그려 둔다 (한 번에 perStep개씩).
 * 처음 가 보는 구역에 들어설 때 한꺼번에 그리느라 화면이 멈칫하지 않게 한다.
 */
export function warmBuffers(perStep: number, stepMs: number): void {
  const step = () => {
    for (let i = 0; i < perStep && notWarmed.length > 0; i++) notWarmed.shift()!();
    if (notWarmed.length > 0) window.setTimeout(step, stepMs);
  };
  step();
}

/** 화면보다 넓은 버퍼에서 지금 보이는 가로 구간만 잘라 찍는다 (offsetX = 버퍼에서 화면 왼쪽 끝의 x) */
export function drawSlice(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, offsetX: number, y = 0): void {
  const sx = Math.max(0, Math.min(offsetX, canvas.width - 1));
  const w = Math.min(ctx.canvas.width, canvas.width - sx);
  ctx.drawImage(canvas, sx, 0, w, canvas.height, sx - offsetX, y, w, canvas.height);
}
