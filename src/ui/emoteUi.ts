// 이모트 화면 (모두 DOM — 저해상도 캔버스에서는 글자가 뭉개진다):
//   머리 위 말풍선 (커지며 톡 나타나 2.6초 머물다 흐려진다), 고르는 바퀴 (내 캐릭터 둘레에 6칸, 위부터 시계 방향).
// 바퀴 칸은 마우스·손가락으로 바로 눌러도 되고, 방향키·스틱으로 가리킨 뒤 Space(Ⓐ)로 보내도 된다.

import { EMOTE, EMOTES, SCREEN_WIDTH } from '../constants';
import { bubbleLook, wheelSlot } from '../features/emotes';

const FONT_FAMILY = 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export interface BubbleItem {
  id: string;
  /** 이모트 번호 */
  e: number;
  /** 말풍선 아래 끝 (내부 해상도 화면 좌표) */
  sx: number;
  sy: number;
  /** 뜬 지 몇 초 */
  age: number;
}

export interface EmoteBubbles {
  show(list: readonly BubbleItem[]): void;
}

/** 말풍선 글자: 하트는 크게 빨간 하트만, 나머지는 그림 + 말 */
function bubbleText(e: number): string {
  const emote = EMOTES[e];
  return emote.icon === '♥' ? `♥ ${emote.text}` : `${emote.icon} ${emote.text}`;
}

export function createEmoteBubbles(canvas: HTMLCanvasElement): EmoteBubbles {
  const boxes = new Map<string, { box: HTMLDivElement; label: HTMLSpanElement; e: number; font: string }>();

  const make = (): { box: HTMLDivElement; label: HTMLSpanElement } => {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      transformOrigin: '50% 100%',
      padding: '0.2em 0.55em',
      background: EMOTE.bubbleBack,
      color: EMOTE.bubbleText,
      border: `2px solid ${EMOTE.bubbleBorder}`,
      borderRadius: '0.7em',
      font: `700 13px ${FONT_FAMILY}`,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '6',
      boxShadow: '0 2px 0 rgba(0, 0, 0, 0.35)',
    });
    const label = document.createElement('span');
    // 아래로 뾰족한 꼬리 (테두리 색 사각형을 돌려 반만 보이게)
    const tail = document.createElement('div');
    Object.assign(tail.style, {
      position: 'absolute',
      left: '50%',
      bottom: '-6px',
      width: '8px',
      height: '8px',
      marginLeft: '-5px',
      background: EMOTE.bubbleBack,
      borderRight: `2px solid ${EMOTE.bubbleBorder}`,
      borderBottom: `2px solid ${EMOTE.bubbleBorder}`,
      transform: 'rotate(45deg)',
    });
    box.append(label, tail);
    document.body.append(box);
    return { box, label };
  };

  return {
    show(list) {
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / SCREEN_WIDTH;
      const font = `700 ${Math.round(Math.max(EMOTE.minFont, EMOTE.fontPerScale * scale))}px ${FONT_FAMILY}`;
      const seen = new Set<string>();
      for (const item of list) {
        const look = bubbleLook(item.age);
        if (!look) continue;
        seen.add(item.id);
        let entry = boxes.get(item.id);
        if (!entry) {
          entry = { ...make(), e: -1, font: '' };
          boxes.set(item.id, entry);
        }
        if (entry.e !== item.e) {
          entry.e = item.e;
          entry.label.textContent = bubbleText(item.e);
          entry.label.style.color = EMOTES[item.e].icon === '♥' ? EMOTE.heart : '';
        }
        if (entry.font !== font) {
          entry.box.style.font = font;
          entry.font = font;
        }
        const visible = item.sx > -20 && item.sx < SCREEN_WIDTH + 20;
        entry.box.style.display = visible ? 'block' : 'none';
        if (!visible) continue;
        entry.box.style.left = `${rect.left + item.sx * scale}px`;
        entry.box.style.top = `${rect.top + item.sy * scale}px`;
        entry.box.style.transform = `translate(-50%, calc(-100% - 6px)) scale(${look.scale.toFixed(3)})`;
        entry.box.style.opacity = look.alpha.toFixed(2);
      }
      for (const [id, entry] of boxes) {
        if (seen.has(id)) continue;
        entry.box.remove();
        boxes.delete(id);
      }
    },
  };
}

export interface EmoteWheel {
  readonly isOpen: boolean;
  /** 방향키·스틱으로 가리키고 있는 칸 (없으면 null) */
  readonly picked: number | null;
  open(): void;
  close(): void;
  highlight(i: number | null): void;
  /** 매 프레임: 바퀴 가운데 (내부 해상도 화면 좌표 — 내 캐릭터 몸 가운데) */
  place(sx: number, sy: number): void;
}

/** onPick = 칸을 눌렀다 (마우스·손가락) */
export function createEmoteWheel(canvas: HTMLCanvasElement, onPick: (i: number) => void): EmoteWheel {
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '0', height: '0', display: 'none', zIndex: '8', pointerEvents: 'none' });
  document.body.append(root);

  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const items = EMOTES.map((emote, i) => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      transform: 'translate(-50%, -50%)',
      padding: '0.32em 0.7em',
      background: EMOTE.wheelBack,
      color: '#fff6dc',
      border: '2px solid rgba(232, 238, 248, 0.3)',
      borderRadius: '999px',
      font: `700 13px ${FONT_FAMILY}`,
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      pointerEvents: 'auto',
      touchAction: 'none',
      userSelect: 'none',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
      transition: 'transform 0.08s',
    });
    const num = document.createElement('span');
    num.textContent = `${i + 1}`;
    Object.assign(num.style, { fontSize: '0.75em', opacity: '0.55', marginRight: '0.4em' });
    const label = document.createElement('span');
    label.textContent = `${emote.icon} ${emote.text}`;
    if (emote.icon === '♥') label.style.color = EMOTE.heart;
    el.append(num, label);
    el.addEventListener('pointerdown', (e) => {
      stop(e);
      onPick(i);
    });
    root.append(el);
    return { el, label };
  });
  // 가운데 닫기
  const center = document.createElement('div');
  center.textContent = '✕';
  Object.assign(center.style, {
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    background: 'rgba(10, 13, 32, 0.7)',
    color: '#c9d4ea',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: `700 14px ${FONT_FAMILY}`,
    cursor: 'pointer',
    pointerEvents: 'auto',
    touchAction: 'none',
  });
  center.addEventListener('pointerdown', (e) => {
    stop(e);
    wheel.close();
  });
  root.append(center);

  let isOpen = false;
  let picked: number | null = null;
  let radius = -1;

  const paint = () => {
    items.forEach(({ el, label }, i) => {
      const on = i === picked;
      el.style.background = on ? EMOTE.wheelPicked : EMOTE.wheelBack;
      el.style.color = on ? '#141a3a' : '#fff6dc';
      el.style.borderColor = on ? '#fff6dc' : 'rgba(232, 238, 248, 0.3)';
      el.style.transform = `translate(-50%, -50%) scale(${on ? 1.15 : 1})`;
      label.style.color = EMOTES[i].icon === '♥' && !on ? EMOTE.heart : '';
    });
  };

  const wheel: EmoteWheel = {
    get isOpen() {
      return isOpen;
    },
    get picked() {
      return picked;
    },
    open() {
      if (isOpen) return;
      isOpen = true;
      picked = null;
      radius = -1;
      paint();
      root.style.display = 'block';
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      picked = null;
      root.style.display = 'none';
    },
    highlight(i) {
      if (i === picked) return;
      picked = i;
      paint();
    },
    place(sx, sy) {
      if (!isOpen) return;
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / SCREEN_WIDTH;
      // 반지름: 게임 화면 높이에 맞춰 (바뀔 때만 칸을 다시 놓는다)
      const r = Math.round(Math.min(EMOTE.wheelMax, rect.height * EMOTE.wheelRatio));
      if (r !== radius) {
        radius = r;
        items.forEach(({ el }, i) => {
          const slot = wheelSlot(i);
          el.style.left = `${Math.round(slot.x * r * 1.25)}px`;
          el.style.top = `${Math.round(slot.y * r)}px`;
        });
      }
      // 칸이 창 밖·게임 화면 밖으로 나가지 않게 가운데를 맞춘다
      const halfW = r * 1.25 + 50;
      const halfH = r + 18;
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      let x = rect.left + sx * scale;
      let y = rect.top + sy * scale;
      x = window.innerWidth < halfW * 2 ? window.innerWidth / 2 : Math.min(Math.max(x, halfW), window.innerWidth - halfW);
      y = bottom - top < halfH * 2 ? (top + bottom) / 2 : Math.min(Math.max(y, top + halfH), bottom - halfH);
      root.style.left = `${Math.round(x)}px`;
      root.style.top = `${Math.round(y)}px`;
    },
  };
  return wheel;
}
