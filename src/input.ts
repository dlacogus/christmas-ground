// 키보드(방향키/WASD, 스페이스, Esc)와 탭 입력. 누르고 있는 손가락 위치(스케이트)도 따라간다.

import type { MoveInput } from './character/character';
import { CAROUSEL } from './constants';

const LEFT_KEYS = ['ArrowLeft', 'KeyA'];
const RIGHT_KEYS = ['ArrowRight', 'KeyD'];
const UP_KEYS = ['ArrowUp', 'KeyW'];
const DOWN_KEYS = ['ArrowDown', 'KeyS'];
const ACTION_KEY = 'Space';
const CANCEL_KEY = 'Escape';
const DEBUG_FRIEND_KEY = 'KeyB';
const HANDLED_KEYS = new Set([...LEFT_KEYS, ...RIGHT_KEYS, ...UP_KEYS, ...DOWN_KEYS, ACTION_KEY]);

/** 한 프레임 동안 일어난 '한 번짜리' 입력 (읽으면 지워진다) */
export interface InputActions {
  /** 스페이스를 짧게 눌렀다 뗐다 */
  tap: boolean;
  /** 스페이스를 꾹 눌렀다 (holdSeconds를 넘긴 순간 한 번) */
  hold: boolean;
  /** Esc */
  cancel: boolean;
  /** 위쪽 키를 새로 눌렀다 (타는 동안 손 흔들기) */
  up: boolean;
  /** B 키 (?debug=1에서 가짜 친구) */
  debugFriend: boolean;
  /** 방향키를 새로 누른 횟수 (눈사람에서 빠져나오려고 연타) */
  moveTaps?: number;
  /** 스페이스를 막 누른 순간 (뗄 때 나오는 tap과 달리 바로 — 공중 스핀 타이밍) */
  spaceDown?: boolean;
}

export interface Input {
  direction(): MoveInput;
  /** 스페이스를 지금 누르고 있나 (스핀) */
  spaceHeld(): boolean;
  /** 손가락·마우스를 누르고 있는 곳 (내부 해상도 화면 좌표). 안 누르면 null */
  pointer(): { sx: number; sy: number } | null;
  /** 지난번 읽은 뒤로 일어난 한 번짜리 입력 */
  takeActions(): InputActions;
}

/** 짧게 누름과 꾹 누름을 가려낸다. 시간은 초 단위로 넘긴다 */
export interface HoldKey {
  down(now: number): void;
  /** 뗐을 때: 꾹 누름이 이미 나갔으면 null, 아니면 'tap' */
  up(): 'tap' | null;
  /** 매 프레임: 누른 채로 threshold를 넘긴 순간 한 번 'hold' */
  poll(now: number): 'hold' | null;
  /** 지금 누르고 있나 */
  isDown(): boolean;
}

export function createHoldKey(threshold: number): HoldKey {
  let downAt: number | null = null;
  let fired = false;
  return {
    down(now: number) {
      if (downAt !== null) return; // 누르고 있는 동안 반복되는 keydown은 무시
      downAt = now;
      fired = false;
    },
    up() {
      const wasDown = downAt !== null;
      downAt = null;
      return wasDown && !fired ? 'tap' : null;
    },
    poll(now: number) {
      if (downAt === null || fired || now - downAt < threshold) return null;
      fired = true;
      return 'hold';
    },
    isDown() {
      return downAt !== null;
    },
  };
}

const noActions = (): InputActions => ({ tap: false, hold: false, cancel: false, up: false, debugFriend: false });

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
  const space = createHoldKey(CAROUSEL.holdSeconds);
  let actions = noActions();
  const seconds = () => performance.now() / 1000;

  window.addEventListener('keydown', (e) => {
    if (e.code === CANCEL_KEY) actions.cancel = true;
    if (e.code === DEBUG_FRIEND_KEY && !e.repeat) actions.debugFriend = true;
    if (!HANDLED_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.code === ACTION_KEY) {
      if (!space.isDown()) actions.spaceDown = true;
      space.down(seconds());
      return;
    }
    if (UP_KEYS.includes(e.code) && !held.has(e.code)) actions.up = true;
    if (!held.has(e.code)) actions.moveTaps = (actions.moveTaps ?? 0) + 1;
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === ACTION_KEY && space.up() === 'tap') actions.tap = true;
    held.delete(e.code);
  });
  let pointer: { sx: number; sy: number } | null = null;
  window.addEventListener('blur', () => {
    held.clear();
    space.up();
    pointer = null;
  });

  const toScreen = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: ((e.clientX - rect.left) / rect.width) * screenWidth,
      sy: ((e.clientY - rect.top) / rect.height) * screenHeight,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toScreen(e);
    pointer = p;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 잡지 못해도 누르고 있는 동안은 pointermove로 따라간다
    }
    onTap(p.sx, p.sy);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointer) pointer = toScreen(e);
  });
  for (const type of ['pointerup', 'pointercancel'] as const) {
    canvas.addEventListener(type, () => {
      pointer = null;
    });
  }

  const any = (keys: string[]) => keys.some((k) => held.has(k));
  return {
    direction() {
      return {
        x: (any(RIGHT_KEYS) ? 1 : 0) - (any(LEFT_KEYS) ? 1 : 0),
        y: (any(DOWN_KEYS) ? 1 : 0) - (any(UP_KEYS) ? 1 : 0),
      };
    },
    spaceHeld() {
      return space.isDown();
    },
    pointer() {
      return pointer;
    },
    takeActions() {
      if (space.poll(seconds()) === 'hold') actions.hold = true;
      const taken = actions;
      actions = noActions();
      return taken;
    },
  };
}
