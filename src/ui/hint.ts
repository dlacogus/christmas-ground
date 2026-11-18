// 조작 힌트 말풍선: 'Space 타기' 같은 짧은 글자를 화면 위에 띄운다.
// 글자는 480x270 캔버스에 그리면 뭉개지므로, 캔버스 위에 겹친 DOM 요소로 또렷하게 보여 준다.
// 위치는 내부 해상도 좌표(sx, sy)로 받고, 말풍선의 아래 가운데가 그 점에 온다.

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
  let visible = false;

  return {
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
        main.textContent = content.text;
        shownText = content.text;
      }
      const subText = content.sub ?? '';
      if (subText !== shownSub) {
        sub.textContent = subText;
        sub.style.display = subText ? 'block' : 'none';
        shownSub = subText;
      }
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / SCREEN_WIDTH;
      box.style.fontSize = `${Math.max(HINT.minFont, HINT.fontPerScale * scale)}px`;
      box.style.left = `${rect.left + content.sx * scale}px`;
      box.style.top = `${rect.top + content.sy * scale}px`;
      if (!visible) {
        box.style.display = 'block';
        visible = true;
      }
    },
  };
}
