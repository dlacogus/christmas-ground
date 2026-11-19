// 조작 힌트 말풍선: 'Space 타기' 같은 짧은 글자를 화면 위에 띄운다.
// 글자는 480x270 캔버스에 그리면 뭉개지므로, 캔버스 위에 겹친 DOM 요소로 또렷하게 보여 준다.
// 위치는 내부 해상도 좌표(sx, sy)로 받고, 말풍선의 아래 가운데가 그 점에 온다. 창 밖으로 나가지 않게 좌우를 맞춘다.
// 휴대폰 세로의 조작 패드를 쓰는 동안은 키 이름을 패드 버튼 이름으로 바꿔 보여 준다 (padLabels).

import { HINT, SCREEN_WIDTH } from '../constants';

export interface HintContent {
  text: string;
  /** 아래에 작게 적는 둘째 줄 */
  sub?: string;
  sx: number;
  sy: number;
}

export interface Hint {
  /** null이면 숨긴다 */
  show(content: HintContent | null): void;
  /** 조작 패드를 쓰는 중이면 키 이름을 패드 버튼 이름으로 바꾼다 */
  setPad(on: boolean): void;
}

/** 키보드 힌트의 키 이름을 조작 패드 버튼 이름으로: Space → Ⓐ, F 던지기 → ❄ 던지기, Esc → ✕, 방향키·←→·↑ → 스틱 */
export function padLabels(text: string): string {
  return text
    .replace(/Space/g, 'Ⓐ')
    .replace(/F 던지기/g, '❄ 던지기')
    .replace(/Esc/g, '✕')
    .replace(/방향키/g, '스틱')
    .replace(/(^|· )(←→|↑) /g, '$1스틱 $2 ');
}

/** 창 밖으로 나가지 않게 말풍선 가운데 x를 맞춘다 (CSS px) */
export function clampHintX(x: number, boxWidth: number, winWidth: number, margin = 4): number {
  const half = boxWidth / 2 + margin;
  if (winWidth < half * 2) return winWidth / 2;
  return Math.min(Math.max(x, half), winWidth - half);
}

export function createHint(canvas: HTMLCanvasElement): Hint {
  const box = document.createElement('div');
  const main = document.createElement('div');
  const sub = document.createElement('div');
  box.append(main, sub);
  Object.assign(box.style, {
    position: 'fixed',
    transform: 'translate(-50%, -100%)',
    padding: '0.25em 0.6em',
    background: HINT.background,
    color: HINT.color,
    fontFamily: 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
    fontWeight: '600',
    lineHeight: '1.3',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'none',
  });
  Object.assign(sub.style, { color: HINT.subColor, fontWeight: '400', fontSize: `${HINT.subFontRatio}em` });
  document.body.append(box);

  let shownText = '';
  let shownSub = '';
  let shownFont = '';
  let visible = false;
  let pad = false;
  /** 말풍선 폭 (글자나 크기가 바뀔 때만 다시 잰다 — 매 프레임 재면 레이아웃을 다시 계산한다) */
  let boxWidth = -1;

  return {
    setPad(on) {
      if (on === pad) return;
      pad = on;
      // 다음에 글자를 다시 쓴다
      shownText = '';
      shownSub = '';
    },
    show(content: HintContent | null) {
      if (!content) {
        if (visible) {
          box.style.display = 'none';
          visible = false;
        }
        return;
      }
      // 글자가 바뀔 때만 DOM을 건드린다
      if (content.text !== shownText) {
        main.textContent = pad ? padLabels(content.text) : content.text;
        shownText = content.text;
        boxWidth = -1;
      }
      const subText = content.sub ?? '';
      if (subText !== shownSub) {
        sub.textContent = pad ? padLabels(subText) : subText;
        sub.style.display = subText ? 'block' : 'none';
        shownSub = subText;
        boxWidth = -1;
      }
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / SCREEN_WIDTH;
      const font = `${Math.max(HINT.minFont, HINT.fontPerScale * scale)}px`;
      if (font !== shownFont) {
        box.style.fontSize = font;
        shownFont = font;
        boxWidth = -1;
      }
      if (!visible) {
        box.style.display = 'block';
        visible = true;
      }
      if (boxWidth < 0) boxWidth = box.offsetWidth;
      box.style.left = `${clampHintX(rect.left + content.sx * scale, boxWidth, window.innerWidth)}px`;
      box.style.top = `${rect.top + content.sy * scale}px`;
    },
  };
}
