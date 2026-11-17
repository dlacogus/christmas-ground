import { createCamera } from './camera';
import { COLORS, MAX_FRAME_DT, MIN_SCALE, SCREEN_HEIGHT, SCREEN_WIDTH } from './constants';
import { createZones } from './zones';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;
ctx.imageSmoothingEnabled = false;

/** 창 크기에 맞춰 정수배로 확대한다. */
function resize(): void {
  const scale = Math.max(
    MIN_SCALE,
    Math.floor(Math.min(window.innerWidth / SCREEN_WIDTH, window.innerHeight / SCREEN_HEIGHT)),
  );
  canvas.style.width = `${SCREEN_WIDTH * scale}px`;
  canvas.style.height = `${SCREEN_HEIGHT * scale}px`;
}
window.addEventListener('resize', resize);
resize();

const camera = createCamera();
const zones = createZones();

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_DT);
  lastTime = now;

  for (const zone of zones) zone.update(dt);

  ctx.fillStyle = COLORS.nightSky;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  for (const zone of zones) zone.draw(ctx, camera);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
