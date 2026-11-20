// 휴대폰 세로 화면 아래쪽 조작 패드 (DOM): 왼쪽 조이스틱, 오른쪽 A(스페이스)·❄(던지기, F)·✕(취소, Esc) 버튼, 위쪽 가운데 😊(이모트, E).
// 누르면 키보드와 똑같은 키 이벤트(keydown/keyup)를 창에 보낸다 — 그래서 기능마다 따로 손대지 않아도 키보드로 되는 것은 모두 패드로도 된다
// (꾹 누르기·연타·누른 채 방향 바꾸기까지). 화면 탭 조작(바닥 탭으로 걷기, 시설 탭)도 그대로 쓸 수 있다.

import { TOUCH_PAD as P } from '../constants';

export interface TouchPad {
  /** 지금 패드가 보이나 */
  readonly active: boolean;
  /** 패드를 이 y(CSS px)부터 화면 아래까지 보인다. null이면 숨긴다 */
  place(top: number | null): void;
}

const ARROWS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' } as const;
const KEY_NAMES: Record<string, string> = { Space: ' ', KeyF: 'f', KeyE: 'e', Escape: 'Escape', ...Object.fromEntries(Object.values(ARROWS).map((c) => [c, c])) };
/** 8방향을 가르는 기준: cos 22.5°쯤 */
const AXIS = Math.sin(Math.PI / 8);

/** 조이스틱 기울기(dx, dy, 받침 반지름 r)를 눌린 방향키로: 가운데 deadZone 안은 없음, 그 밖은 8방향 */
export function stickKeys(dx: number, dy: number, r: number, deadZone: number = P.deadZone): { left: boolean; right: boolean; up: boolean; down: boolean } {
  const d = Math.hypot(dx, dy);
  if (d < r * deadZone) return { left: false, right: false, up: false, down: false };
  const x = dx / d;
  const y = dy / d;
  return { left: x < -AXIS, right: x > AXIS, up: y < -AXIS, down: y > AXIS };
}

function sendKey(code: string, down: boolean): void {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: KEY_NAMES[code] ?? code, bubbles: true }));
}

function circle(size: number, color: string): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  });
  return el;
}

export function createTouchPad(): TouchPad {
  const pad = document.createElement('div');
  Object.assign(pad.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    padding: `${P.padding}px ${P.padding + 6}px calc(${P.padding}px + env(safe-area-inset-bottom, 0px))`,
    background: P.background,
    borderTop: `2px solid ${P.border}`,
    touchAction: 'none',
    userSelect: 'none',
    webkitUserSelect: 'none',
    zIndex: '4',
    fontFamily: 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  });
  pad.style.setProperty('-webkit-touch-callout', 'none');
  pad.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.append(pad);

  /** 지금 패드가 누르고 있는 키들 (숨기거나 창을 벗어나면 모두 뗀다) */
  const held = new Set<string>();
  const press = (code: string, down: boolean) => {
    if (down === held.has(code)) return;
    if (down) held.add(code);
    else held.delete(code);
    sendKey(code, down);
  };
  const releaseAll = () => {
    for (const code of [...held]) press(code, false);
  };

  // ── 조이스틱: 왼쪽 절반 어디를 눌러도 잡힌다. 방향은 받침 가운데에서 잰다
  const stickZone = document.createElement('div');
  Object.assign(stickZone.style, { flex: '1', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', touchAction: 'none' });
  const base = circle(P.stickRadius * 2, P.stickBase);
  base.style.border = `2px solid ${P.stickRing}`;
  base.style.position = 'relative';
  const knob = circle(P.knobRadius * 2, P.knob);
  Object.assign(knob.style, { position: 'absolute', left: `${P.stickRadius - P.knobRadius - 2}px`, top: `${P.stickRadius - P.knobRadius - 2}px`, opacity: '0.85', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' });
  base.append(knob);
  stickZone.append(base);
  let stickPointer: number | null = null;
  const moveStick = (clientX: number, clientY: number) => {
    const rect = base.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const keys = stickKeys(dx, dy, P.stickRadius);
    press(ARROWS.left, keys.left);
    press(ARROWS.right, keys.right);
    press(ARROWS.up, keys.up);
    press(ARROWS.down, keys.down);
    // 손잡이는 받침 안에서만 움직인다
    const d = Math.hypot(dx, dy);
    if (d > P.stickRadius) {
      dx = (dx / d) * P.stickRadius;
      dy = (dy / d) * P.stickRadius;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const endStick = () => {
    stickPointer = null;
    knob.style.transform = '';
    for (const code of Object.values(ARROWS)) press(code, false);
  };
  stickZone.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null) return;
    stickPointer = e.pointerId;
    try {
      stickZone.setPointerCapture(e.pointerId);
    } catch {
      // 잡지 못해도 pointermove로 따라간다
    }
    moveStick(e.clientX, e.clientY);
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickPointer) moveStick(e.clientX, e.clientY);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stickZone.addEventListener(type, (e) => {
      if (e.pointerId === stickPointer) endStick();
    });
  }

  // ── 버튼: 누르는 동안 그 키를 누르고 있는 것과 같다 (A 꾹 = 스페이스 꾹)
  const button = (code: string, size: number, color: string, pressed: string, label: string, caption: string, labelColor: string) => {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'absolute' });
    const el = circle(size, color);
    Object.assign(el.style, {
      color: labelColor,
      fontWeight: '800',
      fontSize: `${Math.round(size * 0.38)}px`,
      boxShadow: '0 3px 0 rgba(0,0,0,0.45)',
      touchAction: 'none',
    });
    el.textContent = label;
    const cap = document.createElement('div');
    Object.assign(cap.style, { color: P.caption, fontSize: '11px', fontWeight: '600' });
    cap.textContent = caption;
    wrap.append(el, cap);
    let pointer: number | null = null;
    const up = () => {
      pointer = null;
      el.style.background = color;
      el.style.transform = '';
      press(code, false);
    };
    el.addEventListener('pointerdown', (e) => {
      if (pointer !== null) return;
      pointer = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // 잡지 못해도 손을 떼면 놓는다
      }
      el.style.background = pressed;
      el.style.transform = 'translateY(2px)';
      press(code, true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      el.addEventListener(type, (e) => {
        if (e.pointerId === pointer) up();
      });
    }
    return wrap;
  };
  const buttons = document.createElement('div');
  // A는 오른쪽 아래, ❄는 그 왼쪽 조금 위, ✕는 A 위 (버튼 아래 이름표 높이까지 띄운다)
  const caption = 19;
  const clusterW = P.aSize + P.throwSize + 14;
  const clusterH = P.aSize + caption + P.cancelSize + caption + 6;
  Object.assign(buttons.style, { position: 'relative', width: `${clusterW}px`, height: `${clusterH}px`, flex: 'none' });
  const a = button('Space', P.aSize, P.aColor, P.aPressed, 'A', '행동 · 꾹', P.label);
  Object.assign(a.style, { right: '0', bottom: '0' });
  const toss = button('KeyF', P.throwSize, P.throwColor, P.throwPressed, '❄', '던지기', P.lightLabel);
  Object.assign(toss.style, { left: '0', bottom: `${Math.round(P.aSize * 0.55)}px` });
  const cancel = button('Escape', P.cancelSize, P.cancelColor, P.cancelPressed, '✕', '취소', P.lightLabel);
  Object.assign(cancel.style, { right: `${Math.round((P.aSize - P.cancelSize) / 2)}px`, top: '0' });
  buttons.append(toss, cancel, a);
  // 😊 = E (이모트 바퀴): 패드 위쪽 가운데, 스틱과 버튼들 사이
  const emote = button('KeyE', P.cancelSize, P.emoteColor, P.emotePressed, '😊', '표현', P.lightLabel);
  Object.assign(emote.style, { left: '50%', top: `${P.padding}px`, transform: 'translateX(-50%)' });
  pad.append(stickZone, buttons, emote);

  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  let active = false;
  return {
    get active() {
      return active;
    },
    place(top) {
      active = top !== null;
      if (!active) {
        endStick();
        releaseAll();
        pad.style.display = 'none';
        return;
      }
      pad.style.top = `${top}px`;
      pad.style.display = 'flex';
    },
  };
}
