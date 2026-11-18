import { MAX_FRAME_DT, SCALE_SNAP } from './constants';

/** 두 rAF 시각 사이의 dt(초). 0~MAX_FRAME_DT로 제한 (첫 프레임은 음수일 수 있다) */
export function frameDt(now: number, last: number): number {
  return Math.min(Math.max((now - last) / 1000, 0), MAX_FRAME_DT);
}

/**
 * 창(winW x winH, CSS px)에 맞는 확대 배율 (CSS px 기준).
 * 창에 꽉 차는 배율을 기본으로 하되, 모니터 픽셀로 정수배가 되는 배율이 그에 가까우면(SCALE_SNAP 이상) 그쪽으로 맞춘다.
 */
export function fitScale(winW: number, winH: number, width: number, height: number, dpr = 1): number {
  const fit = Math.min(winW / width, winH / height);
  const snapped = Math.floor(fit * dpr) / dpr;
  return snapped >= fit * SCALE_SNAP ? snapped : fit;
}

/** 캔버스를 창 크기에 맞춰 가장 크게 보여준다 (검은 여백은 가로세로 비율이 다른 만큼만 남는다). */
export function fitCanvasToWindow(canvas: HTMLCanvasElement, width: number, height: number): void {
  const root = document.documentElement;
  const resize = () => {
    const scale = fitScale(root.clientWidth, root.clientHeight, width, height, window.devicePixelRatio || 1);
    canvas.style.width = `${Math.floor(width * scale)}px`;
    canvas.style.height = `${Math.floor(height * scale)}px`;
  };
  window.addEventListener('resize', resize);
  // 창 크기 이벤트가 늦거나 빠지는 경우(확대/축소, 화면 회전)에도 맞춘다
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(root);
  resize();
}
