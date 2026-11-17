import { describe, expect, it } from 'vitest';
import { CAMERA_MAX_X, CAMERA_MIN_X, clampCameraX, createCamera, layerOffsetX, snapCamera, updateCamera } from './camera';
import { SCREEN_WIDTH } from './constants';
import { MAP_WIDTH } from './world';

const FRAME = 1 / 60;

function follow(focusX: number, startX: number, frames: number): number[] {
  const camera = createCamera();
  camera.x = startX;
  const history: number[] = [];
  for (let i = 0; i < frames; i++) {
    updateCamera(camera, focusX, FRAME);
    history.push(camera.x);
  }
  return history;
}

describe('카메라', () => {
  it('범위는 0~960이다', () => {
    expect(CAMERA_MIN_X).toBe(0);
    expect(CAMERA_MAX_X).toBe(MAP_WIDTH - SCREEN_WIDTH);
    expect(CAMERA_MAX_X).toBe(960);
    expect(clampCameraX(-50)).toBe(0);
    expect(clampCameraX(5000)).toBe(960);
  });

  it('왼쪽 맵 끝에서 멈추고 0 밑으로 내려가지 않는다', () => {
    const history = follow(0, 480, 600);
    expect(Math.min(...history)).toBeGreaterThanOrEqual(0);
    expect(history.at(-1)).toBeCloseTo(0, 3);
  });

  it('오른쪽 맵 끝에서 멈추고 960을 넘지 않는다', () => {
    const history = follow(MAP_WIDTH, 480, 600);
    expect(Math.max(...history)).toBeLessThanOrEqual(960);
    expect(history.at(-1)).toBeCloseTo(960, 3);
  });

  it('한 프레임에 남은 거리의 10%씩 다가간다', () => {
    const camera = createCamera();
    camera.x = 400;
    updateCamera(camera, 400 + SCREEN_WIDTH / 2 + 100, FRAME); // 목표 500
    expect(camera.x).toBeCloseTo(410, 5);
  });

  it('캐릭터를 화면 가운데에 둔다', () => {
    const camera = createCamera();
    snapCamera(camera, 720);
    expect(camera.x).toBe(720 - SCREEN_WIDTH / 2);
  });

  it('그릴 때는 정수 픽셀로 반올림한다', () => {
    expect(layerOffsetX({ x: 100.6 }, 1)).toBe(101);
    expect(layerOffsetX({ x: 100.6 }, 0.3)).toBe(30);
    expect(Number.isInteger(layerOffsetX({ x: 333.33 }, 1.3))).toBe(true);
  });
});
