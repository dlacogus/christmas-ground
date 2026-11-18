import { describe, expect, it } from 'vitest';
import { AMBIENCE, CAROUSEL, FOOTSTEPS, MARKET_HUT, MUSIC_BOX, RINK_SOUND, SCREEN_WIDTH, SOUND, STREET_LAMP } from '../constants';
import { zoneVisible } from '../layers';
import { hitSoundButton, soundButtonRect } from '../ui/soundButton';
import { CAROUSEL_X, HUTS, LAMPS, ZONE_BOUNDS, getObstacle, inZone, type ZoneName } from '../world';
import { nextBellGap } from './ambience';
import { advanceStepTimer, createStepTimer } from './footsteps';
import { musicBoxPan, musicBoxVolume } from './musicBox';
import { rinkPan, rinkVolume } from './rinkSounds';
import { loadMuted } from './soundSystem';

describe('소리 전체', () => {
  it('기본 볼륨 0.4, 저장소를 못 써도 켜진 상태로 시작한다', () => {
    expect(SOUND.masterVolume).toBe(0.4);
    expect(loadMuted()).toBe(false);
  });

  it('스피커 버튼은 오른쪽 위에 있고 둘레까지 눌린다', () => {
    const r = soundButtonRect();
    expect(r.x + r.w).toBeLessThanOrEqual(SCREEN_WIDTH);
    expect(r.x).toBeGreaterThan(SCREEN_WIDTH * 0.9);
    expect(r.y).toBeLessThan(10);
    expect(hitSoundButton(r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
    expect(hitSoundButton(r.x - 2, r.y + r.h + 2)).toBe(true);
    expect(hitSoundButton(SCREEN_WIDTH / 2, 100)).toBe(false);
  });
});

describe('광장 배경 소리', () => {
  it('웅성거림은 낮은 잡음 여러 층', () => {
    expect(AMBIENCE.murmurLayers.length).toBeGreaterThanOrEqual(3);
    for (const layer of AMBIENCE.murmurLayers) expect(layer.hz).toBeLessThan(2000);
    expect(AMBIENCE.murmurLayers[0].gain).toBeGreaterThan(AMBIENCE.murmurLayers.at(-1)!.gain);
  });

  it('종은 아주 가끔 울린다 (1분 넘게 띄엄띄엄)', () => {
    expect(nextBellGap(() => 0)).toBe(AMBIENCE.bellMinGap);
    expect(nextBellGap(() => 1)).toBe(AMBIENCE.bellMaxGap);
    expect(AMBIENCE.bellMinGap).toBeGreaterThanOrEqual(60);
  });
});

describe('구역별 소리', () => {
  const rink = getObstacle('rink');

  it('걸어가면 오르골은 작아지고 스케이트 소리는 커진다', () => {
    const y = 244;
    const music = [300, 700, 1100].map((x) => musicBoxVolume(Math.hypot(x - CAROUSEL_X, 0)));
    const skate = [300, 700, 1100].map((x) => rinkVolume(rink, x, y));
    expect(music[0]).toBe(MUSIC_BOX.maxVolume);
    expect(music[1]).toBeLessThan(music[0]);
    expect(music[2]).toBe(0);
    expect(skate[0]).toBe(0);
    expect(skate[1]).toBeGreaterThan(0);
    expect(skate[2]).toBe(RINK_SOUND.maxVolume);
  });

  it('메인 광장 가운데서는 오르골이 왼쪽, 스케이트 소리가 오른쪽에서 들린다', () => {
    expect(musicBoxPan(720, CAROUSEL_X)).toBeLessThan(0);
    expect(rinkPan(rink, 720, 244)).toBeGreaterThan(0);
  });
});

describe('발자국', () => {
  it('걷는 동안 일정 간격으로 디디고, 멈췄다 걸으면 첫 걸음에 바로 난다', () => {
    const timer = createStepTimer();
    let steps = 0;
    for (let i = 0; i < 120; i++) if (advanceStepTimer(timer, 1 / 60, true)) steps++;
    expect(steps).toBeGreaterThanOrEqual(Math.floor(2 / FOOTSTEPS.interval));
    expect(steps).toBeLessThanOrEqual(Math.ceil(2 / FOOTSTEPS.interval) + 1);
    expect(advanceStepTimer(timer, 1 / 60, false)).toBe(false);
    expect(advanceStepTimer(timer, 1 / 60, true)).toBe(true);
  });

  it('프레임이 크게 밀려도 한 번에 한 걸음만 난다', () => {
    const timer = createStepTimer();
    expect(advanceStepTimer(timer, 5, true)).toBe(true);
    expect(advanceStepTimer(timer, 0.01, true)).toBe(false);
  });
});

describe('화면 밖 구역 건너뛰기', () => {
  it('카메라에 걸친 구역만 그린다', () => {
    const { carousel, plaza, rink } = ZONE_BOUNDS;
    // 처음 화면 (트리 가운데): 메인 광장만
    expect([carousel, plaza, rink].map((z) => zoneVisible(z, 480))).toEqual([false, true, false]);
    // 왼쪽 끝: 회전목마만, 오른쪽 끝: 스케이트장만
    expect([carousel, plaza, rink].map((z) => zoneVisible(z, 0))).toEqual([true, false, false]);
    expect([carousel, plaza, rink].map((z) => zoneVisible(z, 960))).toEqual([false, false, true]);
    // 경계를 걸으면 두 구역 모두
    expect([carousel, plaza, rink].map((z) => zoneVisible(z, 300))).toEqual([true, true, false]);
  });

  it('구역의 그림은 자기 x 범위를 넘지 않는다 (건너뛸 때 잘리지 않게)', () => {
    const inside = (x: number, half: number) => {
      const zone = (Object.keys(ZONE_BOUNDS) as ZoneName[]).find((z) => inZone(z, x))!;
      expect(x - half, `x ${x}`).toBeGreaterThanOrEqual(ZONE_BOUNDS[zone].startX);
      expect(x + half, `x ${x}`).toBeLessThanOrEqual(ZONE_BOUNDS[zone].endX);
    };
    for (const h of HUTS) inside(h.x, h.w / 2 + MARKET_HUT.roofOverhang + 2);
    for (const l of LAMPS) inside(l.x, (l.heads > 1 ? STREET_LAMP.armHalfWidth : 0) + STREET_LAMP.glowRadius);
    inside(CAROUSEL_X, CAROUSEL.floorGlowRadiusX);
    inside(CAROUSEL_X, CAROUSEL.roofHalfWidth);
    const rinkBox = getObstacle('rink');
    expect(rinkBox.x).toBeGreaterThanOrEqual(ZONE_BOUNDS.rink.startX);
  });
});
