import { MAX_FRAME_DT, MOBILE_SCREEN, SCALE_SNAP, SCREEN_WIDTH } from './constants';

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

// ───────────── 휴대폰 세로 화면 ─────────────

/**
 * 지금 화면에 실제로 보이는 가로 범위 (내부 해상도 px, 0~480 안).
 * 보통은 캔버스 전체가 보인다. 휴대폰 세로에서는 캔버스를 크게 키워 양옆이 창 밖으로 잘리므로 가운데만 보인다 —
 * 카메라는 캐릭터를 캔버스 가운데에 두므로 잘려도 캐릭터는 늘 보인다. 화면에 붙어 있는 것(스피커 버튼, 가장자리 화살표)은 이 범위 안에 그린다.
 */
export const VIEW = { left: 0, right: SCREEN_WIDTH };

/** 휴대폰 세로 화면의 배치: 확대 배율, 양옆이 잘려 안 보이는 폭(내부 해상도 px, 한쪽), 게임 화면 높이(CSS px) */
export interface PortraitLayout {
  scale: number;
  crop: number;
  gameHeight: number;
}

/**
 * 세로 화면(winW x winH, 안전 영역을 뺀 CSS px)의 배치. 게임 화면은 창 폭을 꽉 채우고, 보이는 폭이 minViewWidth까지 줄 만큼 키운다.
 * 단 게임 화면이 창 높이의 maxGameHeightRatio를 넘지 않고, 아래 패드에 minPadHeight는 남긴다.
 */
export function portraitLayout(winW: number, winH: number, width: number, height: number): PortraitLayout {
  const byWidth = winW / MOBILE_SCREEN.minViewWidth;
  const byHeight = Math.min(winH * MOBILE_SCREEN.maxGameHeightRatio, winH - MOBILE_SCREEN.minPadHeight) / height;
  // 창 폭에 전체가 다 들어가는 배율보다 작아지지는 않는다 (그때는 자르지 않는다)
  const scale = Math.max(winW / width, Math.min(byWidth, byHeight));
  const crop = Math.max(0, (width - winW / scale) / 2);
  return { scale, crop, gameHeight: Math.floor(height * scale) };
}

/** 이 창에서 아래쪽 조작 패드를 쓰나: 손가락으로 쓰는 기기를 세로로 들었을 때 */
export function usesTouchPad(winW: number, winH: number, coarsePointer: boolean): boolean {
  return coarsePointer && winH > winW;
}

/** 안전 영역(노치·홈 바) 여백 (CSS px) */
function safeInsets(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  Object.assign(probe.style, {
    position: 'fixed',
    visibility: 'hidden',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  });
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}

/**
 * 게임 캔버스를 창에 맞춘다. 손가락 기기를 세로로 들면 위쪽에 크게(양옆은 잘라서) 두고, 그 아래 자리를 onPad로 알린다
 * (top = 패드가 시작하는 y, CSS px. 패드를 안 쓰면 null). 가로로 돌리면 예전처럼 창에 꽉 맞춘다.
 */
export function fitGameToWindow(canvas: HTMLCanvasElement, width: number, height: number, onPad: (top: number | null) => void): void {
  const coarse = window.matchMedia('(pointer: coarse)');
  let lastKey = '';
  const resize = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const pad = usesTouchPad(winW, winH, coarse.matches);
    const key = `${winW}x${winH}:${pad}`;
    if (key === lastKey) return;
    lastKey = key;
    if (!pad) {
      VIEW.left = 0;
      VIEW.right = width;
      Object.assign(canvas.style, { position: '', left: '', top: '' });
      const scale = fitScale(winW, winH, width, height, window.devicePixelRatio || 1);
      canvas.style.width = `${Math.floor(width * scale)}px`;
      canvas.style.height = `${Math.floor(height * scale)}px`;
      onPad(null);
      return;
    }
    const insets = safeInsets();
    const layout = portraitLayout(winW, winH - insets.top - insets.bottom, width, height);
    VIEW.left = Math.ceil(layout.crop);
    VIEW.right = width - VIEW.left;
    const cssW = width * layout.scale;
    Object.assign(canvas.style, {
      position: 'fixed',
      width: `${cssW}px`,
      height: `${layout.gameHeight}px`,
      left: `${(winW - cssW) / 2}px`,
      top: `${insets.top}px`,
    });
    onPad(insets.top + layout.gameHeight);
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  coarse.addEventListener?.('change', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(document.documentElement);
  resize();
}
