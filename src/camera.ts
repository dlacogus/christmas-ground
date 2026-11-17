import { MAP_WIDTH, SCREEN_WIDTH } from './constants';

/** 좌우로만 움직이는 카메라. x는 화면 왼쪽 끝의 맵 좌표. */
export interface Camera {
  x: number;
}

export function createCamera(): Camera {
  return { x: 0 };
}

/** 카메라 x를 맵 범위 안으로 제한한다. */
export function clampCameraX(x: number): number {
  return Math.min(Math.max(x, 0), MAP_WIDTH - SCREEN_WIDTH);
}
