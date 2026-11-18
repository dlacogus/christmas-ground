import { startGame } from './game';
import { startSpriteSheet } from './spriteSheet';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);
// 개발용 주소(?debug=1, ?sprites=1)는 개발 서버에서만 켜진다. 배포 빌드에서는 붙여도 그냥 게임이 열린다
const dev = import.meta.env.DEV;

if (dev && params.get('sprites') === '1') {
  startSpriteSheet(canvas);
} else {
  startGame(canvas, dev && params.get('debug') === '1');
}
