import { describe, expect, it } from 'vitest';
import { parseSong, BEATS_PER_BAR, noteFrequency } from '../audio/melody';
import { musicBoxPan, musicBoxVolume } from '../audio/musicBox';
import { CAROUSEL, MUSIC_BOX } from '../constants';
import { CAROUSEL_X, FIRS, FIR_LINE_X, INTERACTION_POINTS, LAMPS, STALLS, getObstacle, inZone } from '../world';
import { HORSE_HEIGHT, HORSE_WIDTH, bulbLevel, carouselGeometry, horseStates, shadeLevel } from './carousel';

describe('회전목마 모양', () => {
  it('폭 약 160px, 높이 약 140px', () => {
    const g = carouselGeometry();
    const flagTop = g.apexY - CAROUSEL.flagPoleHeight;
    expect(g.rimBottom - flagTop).toBeGreaterThanOrEqual(130);
    expect(g.rimBottom - flagTop).toBeLessThanOrEqual(150);
    expect(g.platformRadiusX * 2).toBe(160);
    expect(flagTop).toBeGreaterThanOrEqual(0);
  });

  it('판 아래는 장애물, 입구 앞에 CAROUSEL_ENTRY', () => {
    const platform = getObstacle('carousel');
    const entry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;
    expect(entry.x).toBe(CAROUSEL_X);
    expect(entry.y).toBeGreaterThan(platform.y + platform.h);
  });

  it('목마 스프라이트는 22x18 (캐릭터 키 32px 대비 너무 작지 않게)', () => {
    expect([HORSE_WIDTH, HORSE_HEIGHT]).toEqual([22, 18]);
  });
});

describe('목마 회전', () => {
  it('6~8마리, 한 바퀴 약 12초', () => {
    const now = horseStates(1.234);
    expect(now.length).toBeGreaterThanOrEqual(6);
    expect(now.length).toBeLessThanOrEqual(8);
    const later = horseStates(1.234 + CAROUSEL.rotationPeriod);
    for (const h of now) {
      const same = later.find((l) => l.index === h.index)!;
      expect(same.x).toBeCloseTo(h.x, 6);
      expect(same.z).toBeCloseTo(h.z, 6);
    }
  });

  it('뒤 → 앞 순서로 그리고, 앞쪽 말은 밝고 아래(가까이)에 있다', () => {
    const horses = horseStates(0.5);
    for (let i = 1; i < horses.length; i++) expect(horses[i].z).toBeGreaterThanOrEqual(horses[i - 1].z);
    expect(shadeLevel(1)).toBe(0);
    expect(shadeLevel(-1)).toBe(CAROUSEL.shadeLevels - 1);
    // 앞쪽은 오른쪽으로, 뒤쪽은 왼쪽으로 지나간다
    for (const h of horses) expect(h.facing).toBe(h.z >= 0 ? 'right' : 'left');
  });

  it('말마다 위상이 달라 오르내림이 다르다', () => {
    const at = (t: number) => horseStates(t).map((h) => ({ i: h.index, y: h.y, z: h.z }));
    // 같은 앞뒤 위치에서 비교하려고 회전 효과를 빼고 오르내림만 본다
    const bob = (t: number) =>
      at(t).map((h) => h.y - (carouselGeometry().platformY - CAROUSEL.horseBaseAbove + h.z * CAROUSEL.horseDepthDrop));
    const values = bob(0.3).map((b) => b.toFixed(2));
    expect(new Set(values).size).toBeGreaterThan(3);
    for (const b of bob(1.7)) expect(Math.abs(b)).toBeLessThanOrEqual(CAROUSEL.bobAmplitude + 1e-9);
  });

  it('지붕 전구 빛은 한 방향(오른쪽)으로 흐른다', () => {
    const brightest = (t: number) => {
      const levels = Array.from({ length: CAROUSEL.bulbChaseLength }, (_, i) => bulbLevel(i, t));
      return levels.indexOf(Math.max(...levels));
    };
    const step = 1 / CAROUSEL.bulbChaseSpeed;
    expect((brightest(step * 2) - brightest(step) + CAROUSEL.bulbChaseLength) % CAROUSEL.bulbChaseLength).toBe(1);
  });
});

describe('회전목마 구역 주변', () => {
  it('노점 2곳, 가로등 2개, 벤치는 world에, 왼쪽 끝은 전나무 줄', () => {
    expect(STALLS.filter((s) => inZone('carousel', s.x))).toHaveLength(2);
    expect(LAMPS.filter((l) => inZone('carousel', l.x))).toHaveLength(2);
    expect(FIRS.length).toBeGreaterThanOrEqual(5);
    for (const f of FIRS) expect(f.x).toBeLessThanOrEqual(FIR_LINE_X);
  });
});

describe('오르골', () => {
  it('직접 만든 3/4박자 16마디', () => {
    const song = parseSong();
    expect(song.lengthBeats).toBe(16 * BEATS_PER_BAR);
    expect(song.events.filter((e) => e.bass)).toHaveLength(16);
    expect(noteFrequency('A4')).toBeCloseTo(440, 6);
    expect(noteFrequency('C5')).toBeCloseTo(523.25, 1);
  });

  it('가까우면 크고 멀어질수록 작아지다가 안 들린다', () => {
    expect(musicBoxVolume(0)).toBe(MUSIC_BOX.maxVolume);
    expect(musicBoxVolume(150)).toBeLessThan(musicBoxVolume(100));
    expect(musicBoxVolume(250)).toBeLessThan(musicBoxVolume(150));
    expect(musicBoxVolume(MUSIC_BOX.farDistance)).toBe(0);
    expect(musicBoxVolume(2000)).toBe(0);
  });

  it('회전목마가 왼쪽에 있으면 왼쪽에서 들린다', () => {
    expect(musicBoxPan(600, CAROUSEL_X)).toBeLessThan(0);
    expect(musicBoxPan(CAROUSEL_X, CAROUSEL_X)).toBe(0);
    expect(musicBoxPan(100, CAROUSEL_X)).toBeGreaterThan(0);
  });
});
