// 키보드(방향키/WASD)와 탭 입력.

import type { MoveInput } from './character/character';

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const UP_KEYS = ['ArrowUp', 'KeyW'];
const DOWN_KEYS = ['ArrowDown', 'KeyS'];
const HANDLED_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS, ...UP_KEYS, ...DOWN_KEYS]);

export interface Input {
  direction(): MoveInput;
}

/**
 * onTap은 내부 해상도 기준 화면 좌표(sx, sy)로 불린다.
 * screenWidth/Height는 캔버스 내부 해상도.
 */
export function createInput(
  canvas: HTMLCanvasElement,
  screenWidth: number,
  screenHeight: number,
  onTap: (sx: number, sy: number) => void,
): Input {
  const held = new Set<string>();

  window.addEventListener('keydown', (e) => {
    if (!HANDLED_KEYS.has(e.code)) return;
    e.preventDefault();
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * screenWidth;
    const sy = ((e.clientY - rect.top) / rect.height) * screenHeight;
    onTap(sx, sy);
  });

  const any = (keys: string[]) => keys.some((k) => held.has(k));
  return {
    direction() {
      return {
        x: (any(RIGHT_KEYS) ? 1 : 0) - (any(LEFT_KEYS) ? 1 : 0),
        y: (any(DOWN_KEYS) ? 1 : 0) - (any(UP_KEYS) ? 1 : 0),
      };
    },
  };
}
