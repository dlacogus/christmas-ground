import { afterEach, describe, expect, it } from 'vitest';
import { CAMERA_MAX_X, clampCameraX, createCamera, snapCamera } from '../camera';
import { MOBILE_SCREEN, SCREEN_HEIGHT as H, SCREEN_WIDTH as W, TOUCH_PAD } from '../constants';
import { VIEW, portraitLayout, usesTouchPad } from '../screen';
import { MAP_WIDTH, WALK_AREA } from '../world';
import { clampHintX, padLabels } from './hint';
import { stickKeys } from './touchPad';

describe('휴대폰 세로 화면', () => {
  afterEach(() => {
    VIEW.left = 0;
    VIEW.right = W;
  });

  it('손가락 기기를 세로로 들 때만 아래 조작 패드를 쓴다', () => {
    expect(usesTouchPad(390, 844, true)).toBe(true);
    expect(usesTouchPad(844, 390, true)).toBe(false);
    expect(usesTouchPad(390, 844, false)).toBe(false);
  });

  it('게임 화면을 키운다: 창 폭을 넘게 확대하고 양옆을 잘라, 보이는 폭은 240px쯤이다', () => {
    const phone = portraitLayout(390, 800, W, H);
    // 그냥 창 폭에 맞추면 0.81배 — 그보다 훨씬 크다
    expect(phone.scale).toBeGreaterThan((390 / W) * 1.5);
    expect(W - phone.crop * 2).toBeCloseTo(MOBILE_SCREEN.minViewWidth, 5);
    // 게임 화면은 창 높이의 55%를 넘지 않고, 아래에 패드 자리가 넉넉하다
    expect(phone.gameHeight).toBeLessThanOrEqual(800 * MOBILE_SCREEN.maxGameHeightRatio);
    expect(800 - phone.gameHeight).toBeGreaterThanOrEqual(MOBILE_SCREEN.minPadHeight);
    // 큰 트리(폭 176px)가 한 화면에 다 들어간다
    expect(W - phone.crop * 2).toBeGreaterThan(176);
  });

  it('키가 작은 휴대폰에서는 패드 자리를 남기려고 덜 키운다 (그래도 창 폭보다 작아지지는 않는다)', () => {
    const short = portraitLayout(390, 600, W, H);
    expect(600 - short.gameHeight).toBeGreaterThanOrEqual(MOBILE_SCREEN.minPadHeight - 1);
    expect(W - short.crop * 2).toBeGreaterThan(MOBILE_SCREEN.minViewWidth);
    // 아주 납작하면 창 폭에 맞춘다 (자르지 않는다)
    const flat = portraitLayout(390, 420, W, H);
    expect(flat.crop).toBe(0);
    expect(flat.scale).toBeCloseTo(390 / W, 5);
  });

  it('양옆이 잘려도 카메라가 그만큼 더 나가, 맵 양 끝까지 보인다', () => {
    VIEW.left = 96;
    VIEW.right = W - 96;
    expect(clampCameraX(-500)).toBe(-96);
    expect(clampCameraX(5000)).toBe(CAMERA_MAX_X + 96);
    const camera = createCamera();
    // 맵 왼쪽 끝 근처에 서 있어도 보이는 부분 안에 있다
    snapCamera(camera, WALK_AREA.x + 10);
    expect(camera.x + VIEW.left).toBeLessThanOrEqual(WALK_AREA.x + 10);
    expect(camera.x + VIEW.left).toBeGreaterThanOrEqual(0);
    snapCamera(camera, MAP_WIDTH - 10);
    expect(camera.x + VIEW.right).toBeGreaterThanOrEqual(MAP_WIDTH - 10);
    expect(camera.x + VIEW.right).toBeLessThanOrEqual(MAP_WIDTH);
  });
});

describe('조작 패드', () => {
  const r = TOUCH_PAD.stickRadius;

  it('조이스틱: 가운데는 멈춤, 기울이면 8방향 방향키', () => {
    expect(stickKeys(2, 3, r)).toEqual({ left: false, right: false, up: false, down: false });
    expect(stickKeys(r, 0, r)).toEqual({ left: false, right: true, up: false, down: false });
    expect(stickKeys(0, -r, r)).toEqual({ left: false, right: false, up: true, down: false });
    expect(stickKeys(-r, r, r)).toEqual({ left: true, right: false, up: false, down: true });
    // 살짝 비스듬해도 한 방향
    expect(stickKeys(r, r * 0.2, r)).toEqual({ left: false, right: true, up: false, down: false });
  });

  it('패드를 쓰는 동안 힌트의 키 이름을 버튼 이름으로 바꾼다', () => {
    expect(padLabels('Space 열기')).toBe('Ⓐ 열기');
    expect(padLabels('Space 눈 굴리기 · F 던지기')).toBe('Ⓐ 눈 굴리기 · ❄ 던지기');
    expect(padLabels('방향키 자리 고르기 · Esc 취소')).toBe('스틱 자리 고르기 · ✕ 취소');
    expect(padLabels('←→ 고르기 · Space 당근 코 받기')).toBe('스틱 ←→ 고르기 · Ⓐ 당근 코 받기');
    expect(padLabels('↑ 손 흔들기')).toBe('스틱 ↑ 손 흔들기');
    // 방향을 가리키는 화살표는 그대로
    expect(padLabels('입구는 왼쪽 ←')).toBe('입구는 왼쪽 ←');
  });

  it('힌트 말풍선은 창 밖으로 나가지 않는다', () => {
    expect(clampHintX(5, 100, 390)).toBe(54);
    expect(clampHintX(388, 100, 390)).toBe(336);
    expect(clampHintX(200, 100, 390)).toBe(200);
  });
});
