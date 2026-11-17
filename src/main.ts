import { startGame } from './game';
import { startSpriteSheet } from './spriteSheet';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);

if (params.get('sprites') === '1') {
  startSpriteSheet(canvas);
} else {
  startGame(canvas, params.get('debug') === '1');
}
