import { MAX_FRAME_DT, MIN_SCALE } from './constants';

/** 두 rAF 시각 사이의 dt(초). 0~MAX_FRAME_DT로 제한 (첫 프레임은 음수일 수 있다) */
export function frameDt(now: number, last: number): number {
  return Math.min(Math.max((now - last) / 1000, 0), MAX_FRAME_DT);
}

/** 캔버스를 창 크기에 맞춰 정수배로 확대해 보여준다. */
export function fitCanvasToWindow(canvas: HTMLCanvasElement, width: number, height: number): void {
  const resize = () => {
    const scale = Math.max(
      MIN_SCALE,
      Math.floor(Math.min(window.innerWidth / width, window.innerHeight / height)),
    );
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
  };
  window.addEventListener('resize', resize);
  resize();
}
