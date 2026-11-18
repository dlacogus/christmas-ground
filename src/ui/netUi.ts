// 실시간 접속에 쓰는 화면 글자 (모두 DOM — 저해상도 캔버스에서는 글자가 뭉개진다):
//   입장 창(닉네임 + 목도리 색), 구석의 작은 상태 글자('다시 연결 중…'), 가운데 안내('광장이 꽉 찼어요', '다시 들어가기'),
//   친구 캐릭터 머리 위 닉네임.

import { NET, OUTFITS, SCREEN_HEIGHT, SCREEN_WIDTH, type OutfitName } from '../constants';
import { cleanName } from '../shared/protocol';
import type { Profile } from '../net/client';

const FONT = '600 13px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function panel(): HTMLDivElement {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(22, 26, 48, 0.94)',
    color: '#f3ead6',
    border: '2px solid #e2b23e',
    borderRadius: '10px',
    padding: '16px 18px',
    font: FONT,
    textAlign: 'center',
    zIndex: '20',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.5)',
  });
  document.body.append(box);
  return box;
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    font: FONT,
    marginTop: '12px',
    padding: '7px 18px',
    borderRadius: '8px',
    border: 'none',
    background: '#c8343e',
    color: '#fff',
    cursor: 'pointer',
  });
  return b;
}

/** 처음 들어올 때: 닉네임(최대 8글자)과 목도리 색 6가지 중 하나를 고른다 */
export function askProfile(initial: Profile | null): Promise<Profile> {
  return new Promise((resolve) => {
    const box = panel();
    const title = document.createElement('div');
    title.textContent = '크리스마스 광장에 들어가기';
    title.style.marginBottom = '10px';
    const input = document.createElement('input');
    input.maxLength = NET.nameMax;
    input.placeholder = `닉네임 (최대 ${NET.nameMax}글자)`;
    input.value = initial?.name ?? '';
    Object.assign(input.style, { font: FONT, padding: '6px 8px', borderRadius: '6px', border: '1px solid #8a8fb0', width: '170px', textAlign: 'center' });
    // 게임 조작 키(방향키·스페이스)가 입력을 가로채지 않게
    for (const type of ['keydown', 'keyup', 'pointerdown'] as const) input.addEventListener(type, (e) => e.stopPropagation());

    const swatches = document.createElement('div');
    Object.assign(swatches.style, { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' });
    let scarf = initial?.scarf ?? 0;
    const dots: HTMLButtonElement[] = [];
    const paint = () => dots.forEach((d, i) => (d.style.outline = i === scarf ? '3px solid #fff' : 'none'));
    for (let i = 0; i < NET.scarves; i++) {
      const dot = document.createElement('button');
      dot.title = '목도리 색';
      Object.assign(dot.style, {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        border: '2px solid rgba(0, 0, 0, 0.35)',
        background: OUTFITS[`scarf${i}` as OutfitName].scarf,
        cursor: 'pointer',
      });
      dot.addEventListener('click', () => {
        scarf = i;
        paint();
      });
      dots.push(dot);
      swatches.append(dot);
    }
    paint();

    const enter = button('들어가기');
    const submit = () => {
      const name = cleanName(input.value);
      if (name === null) {
        input.style.borderColor = '#ff6b6b';
        input.focus();
        return;
      }
      box.remove();
      resolve({ name, scarf });
    };
    enter.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    const label = document.createElement('div');
    label.textContent = '목도리 색';
    Object.assign(label.style, { marginTop: '12px', fontSize: '11px', opacity: '0.8' });
    box.append(title, input, label, swatches, enter);
    input.focus();
  });
}

export interface NetUi {
  /** 구석의 작은 상태 글자 (null이면 숨긴다) */
  status(text: string | null): void;
  /** 가운데 안내. 단추가 있으면 누를 때 onClick (null이면 닫는다) */
  notice(text: string | null, buttonLabel?: string, onClick?: () => void): void;
  /** 머리 위 닉네임들: (sx, sy) = 내부 해상도 화면 좌표 */
  names(list: readonly { id: string; name: string; sx: number; sy: number }[]): void;
}

export function createNetUi(canvas: HTMLCanvasElement): NetUi {
  const corner = document.createElement('div');
  Object.assign(corner.style, {
    position: 'fixed',
    left: '10px',
    bottom: '8px',
    font: '11px system-ui, "Malgun Gothic", sans-serif',
    color: '#d8e0ff',
    background: 'rgba(12, 16, 48, 0.7)',
    padding: '3px 8px',
    borderRadius: '6px',
    display: 'none',
    zIndex: '15',
    pointerEvents: 'none',
  });
  document.body.append(corner);
  let noticeBox: HTMLDivElement | null = null;
  const tags = new Map<string, HTMLDivElement>();

  return {
    status(text) {
      corner.style.display = text ? 'block' : 'none';
      if (text) corner.textContent = text;
    },
    notice(text, buttonLabel, onClick) {
      noticeBox?.remove();
      noticeBox = null;
      if (!text) return;
      noticeBox = panel();
      const line = document.createElement('div');
      line.textContent = text;
      noticeBox.append(line);
      if (buttonLabel) {
        const b = button(buttonLabel);
        b.addEventListener('click', () => onClick?.());
        noticeBox.append(document.createElement('br'), b);
      }
    },
    names(list) {
      const rect = canvas.getBoundingClientRect();
      const seen = new Set<string>();
      for (const item of list) {
        seen.add(item.id);
        let tag = tags.get(item.id);
        if (!tag) {
          tag = document.createElement('div');
          Object.assign(tag.style, {
            position: 'fixed',
            transform: 'translate(-50%, -100%)',
            font: '600 11px system-ui, "Malgun Gothic", sans-serif',
            color: '#fff',
            textShadow: '0 1px 2px #000, 0 0 3px #000',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: '5',
          });
          document.body.append(tag);
          tags.set(item.id, tag);
        }
        if (tag.textContent !== item.name) tag.textContent = item.name;
        const visible = item.sx > -10 && item.sx < SCREEN_WIDTH + 10;
        tag.style.display = visible ? 'block' : 'none';
        tag.style.left = `${rect.left + (item.sx / SCREEN_WIDTH) * rect.width}px`;
        tag.style.top = `${rect.top + (item.sy / SCREEN_HEIGHT) * rect.height}px`;
      }
      for (const [id, tag] of tags) {
        if (seen.has(id)) continue;
        tag.remove();
        tags.delete(id);
      }
    },
  };
}
