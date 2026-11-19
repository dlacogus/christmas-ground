import { CAMERA_FOLLOW_RATE, CAMERA_REFERENCE_FPS, SCREEN_WIDTH } from './constants';
import { VIEW } from './screen';
import { MAP_WIDTH } from './world';

/** 좌우로만 움직이는 카메라. x는 화면 왼쪽 끝의 맵 좌표 (소수). */
export interface Camera {
  x: number;
}

export const CAMERA_MIN_X = 0;
export const CAMERA_MAX_X = MAP_WIDTH - SCREEN_WIDTH;

export function createCamera(): Camera {
  return { x: 0 };
}

/**
 * 카메라 x를 맵 범위(0~960) 안으로 제한한다.
 * 휴대폰 세로처럼 캔버스 양옆이 잘려 보일 때는 그만큼 더 나가서, 보이는 부분이 맵 끝까지 닿게 한다.
 */
export function clampCameraX(x: number): number {
  return Math.min(Math.max(x, CAMERA_MIN_X - VIEW.left), CAMERA_MAX_X + VIEW.left);
}

/** 대상 x를 화면 가운데에 두는 카메라 위치 */
export function cameraTargetX(focusX: number): number {
  return clampCameraX(focusX - SCREEN_WIDTH / 2);
}

/** 대상에 바로 맞춘다 (시작할 때). */
export function snapCamera(camera: Camera, focusX: number): void {
  camera.x = cameraTargetX(focusX);
}

/** 매 프레임 남은 거리의 10%씩 다가간다 (60fps 기준, dt로 보정). */
export function updateCamera(camera: Camera, focusX: number, dt: number): void {
  const target = cameraTargetX(focusX);
  const t = 1 - Math.pow(1 - CAMERA_FOLLOW_RATE, dt * CAMERA_REFERENCE_FPS);
  camera.x = clampCameraX(camera.x + (target - camera.x) * t);
}

/** 레이어를 그릴 때 쓰는 정수 픽셀 오프셋 (번짐 방지) */
export function layerOffsetX(camera: Camera, factor: number): number {
  return Math.round(camera.x * factor);
}
