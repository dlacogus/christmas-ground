import { describe, expect, it } from 'vitest';
import { parseSong, BEATS_PER_BAR, noteFrequency } from '../audio/melody';
import { musicBoxPan, musicBoxVolume } from '../audio/musicBox';
import { CAROUSEL, CARRIAGE, CHARACTER, MUSIC_BOX } from '../constants';
import { CAROUSEL_X, FIRS, FIR_LINE_X, INTERACTION_POINTS, LAMPS, getObstacle, inZone } from '../world';
import {
  HORSE_HEIGHT,
  HORSE_WIDTH,
  bulbLevel,
  carouselGeometry,
  carriageTopAt,
  mountAngle,
  mountKind,
  mountSeats,
  mountSize,
  mountState,
  mountStates,
  riderDepth,
  roofBottomAt,
  seatPosition,
  shadeLevel,
} from './carousel';

describe('회전목마 모양', () => {
  it('트리와 비슷한 규모: 판 폭 240px, 깃발까지 높이 약 185px, 화면 위로 안 잘림', () => {
    const g = carouselGeometry();
    const flagTop = g.apexY - CAROUSEL.flagPoleHeight;
    expect(g.platformRadiusX * 2).toBe(240);
    expect(g.rimBottom - flagTop).toBeGreaterThanOrEqual(175);
    expect(g.rimBottom - flagTop).toBeLessThanOrEqual(200);
    expect(flagTop).toBeGreaterThanOrEqual(0);
  });

  it('판과 지붕이 회전목마 구역(0~480) 안에 있고 전나무 줄에 닿지 않는다', () => {
    const platform = getObstacle('carousel');
    expect(platform.x + platform.w).toBeLessThanOrEqual(480);
    expect(CAROUSEL_X + CAROUSEL.roofHalfWidth).toBeLessThanOrEqual(480);
    expect(platform.x).toBeGreaterThan(FIR_LINE_X);
  });

  it('판 아래는 장애물, 입구 앞에 CAROUSEL_ENTRY', () => {
    const platform = getObstacle('carousel');
    const entry = INTERACTION_POINTS.find((p) => p.id === 'CAROUSEL_ENTRY')!;
    expect(entry.x).toBe(CAROUSEL_X);
    expect(entry.y).toBeGreaterThan(platform.y + platform.h);
  });

  it('목마는 캐릭터가 탈 수 있는 크기 (몸통 ≈ 캐릭터 폭 2배, 키는 캐릭터보다 조금 작게)', () => {
    expect([HORSE_WIDTH, HORSE_HEIGHT]).toEqual([30, 23]);
    expect(HORSE_WIDTH).toBeGreaterThanOrEqual(CHARACTER.spriteWidth * 1.8);
    expect(HORSE_HEIGHT).toBeLessThan(CHARACTER.spriteHeight);
  });

  it('언제 어느 탈 것 어느 자리에 타도 머리가 지붕 장식에 닿지 않고, 자리는 탈 것 위에 있다', () => {
    for (let t = 0; t < CAROUSEL.rotationPeriod; t += 0.37) {
      for (const m of mountStates(t)) {
        for (const seat of mountSeats(m)) {
          const valanceBottom = roofBottomAt(seat.x - CAROUSEL_X) + CAROUSEL.goldBandHeight + CAROUSEL.valanceHeight;
          expect(seat.y - CAROUSEL.riderAboveSeat * seat.scale).toBeGreaterThan(valanceBottom);
          expect(seat.y).toBeLessThan(m.y);
          expect(Math.abs(seat.x - m.x)).toBeLessThan(mountSize(m.kind, m.z).w / 2);
        }
      }
    }
  });
});

describe('마차', () => {
  const kinds = Array.from({ length: CAROUSEL.horseCount }, (_, i) => mountKind(i));

  it('탈 것 8개 = 말 6마리 + 마차 2대, 마차는 서로 반대편(180°)', () => {
    expect(kinds.filter((k) => k === 'horse')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'carriage')).toHaveLength(2);
    const [a, b] = CAROUSEL.carriageIndices;
    for (const t of [0, 1.7, 5.2]) {
      const gap = Math.abs(mountAngle(a, t) - mountAngle(b, t));
      expect(gap).toBeCloseTo(Math.PI, 6);
    }
  });

  it('두 사람이 나란히 앉을 폭: 자리 2개가 캐릭터 폭만큼 떨어져 겹치지 않고, 마차 안에 들어간다', () => {
    expect(CARRIAGE.width).toBeGreaterThanOrEqual(40);
    const [rear, front] = CARRIAGE.seats;
    expect(front.x - rear.x).toBeGreaterThanOrEqual(CHARACTER.spriteWidth);
    expect(rear.x - CHARACTER.spriteWidth / 2).toBeGreaterThanOrEqual(0);
    expect(front.x + CHARACTER.spriteWidth / 2).toBeLessThanOrEqual(CARRIAGE.width);
    const carriage = mountState(CAROUSEL.carriageIndices[0], 0);
    expect(mountSeats(carriage)).toHaveLength(2);
    expect(mountSeats(mountState(1, 0))).toHaveLength(1);
  });

  it('지붕이 없고, 옆면이 앉은 사람의 다리를 가려 상반신만 보인다', () => {
    for (const seat of CARRIAGE.seats) {
      // 옆면 윗선이 엉덩이보다 위에 있어 다리를 가리고, 머리와 어깨는 그 위로 나온다
      expect(carriageTopAt(seat.x)).toBeLessThan(seat.y);
      expect(seat.y - carriageTopAt(seat.x)).toBeLessThan(8);
      expect(seat.y - CAROUSEL.riderAboveSeat).toBeLessThan(0);
    }
  });

  it('말처럼 오르내리지 않고 판에 붙어 돌며, 1px만 흔들린다', () => {
    const index = CAROUSEL.carriageIndices[0];
    const offsets = new Set<number>();
    for (let t = 0; t < CAROUSEL.rotationPeriod; t += 0.05) {
      const m = mountState(index, t);
      offsets.add(m.y - carouselGeometry().platformY - Math.round(m.z * CAROUSEL.carriageDepthDrop));
    }
    expect([...offsets].sort()).toEqual([0, CAROUSEL.carriageSway]);
    expect(CAROUSEL.carriageSway).toBe(1);
  });

  it('뒤쪽으로 돌면 말과 같이 작아지고, 자리도 좌우가 뒤집혀 따라간다', () => {
    const index = CAROUSEL.carriageIndices[0];
    const half = CAROUSEL.rotationPeriod / 2;
    const frontTime = (CAROUSEL.rotationPeriod * (CAROUSEL.horseCount - index)) / CAROUSEL.horseCount;
    const front = mountState(index, frontTime);
    const back = mountState(index, frontTime + half);
    expect(front.z).toBeCloseTo(1, 6);
    expect(back.z).toBeCloseTo(-1, 6);
    expect(mountSize('carriage', back.z).w).toBeLessThan(mountSize('carriage', front.z).w);
    expect(mountSeats(back)[0].scale).toBeCloseTo(CAROUSEL.backScale, 1);
    // 앞에서는 뒷자리가 왼쪽, 뒤로 돌면 오른쪽
    expect(mountSeats(front)[0].x).toBeLessThan(mountSeats(front)[1].x);
    expect(mountSeats(back)[0].x).toBeGreaterThan(mountSeats(back)[1].x);
    expect(seatPosition(index, 1, frontTime)).toEqual(mountSeats(front)[1]);
  });

  it('두 사람이 앉으면 화면에서 앞에 있는 사람을 나중에 그린다', () => {
    const approaching = { ...mountState(CAROUSEL.carriageIndices[0], 0), angle: -0.5 };
    const leaving = { ...approaching, angle: 0.5 };
    expect(riderDepth(approaching, 1)).toBeGreaterThan(riderDepth(approaching, 0));
    expect(riderDepth(leaving, 0)).toBeGreaterThan(riderDepth(leaving, 1));
  });
});

describe('목마 회전', () => {
  it('탈 것 8개, 한 바퀴 약 12초', () => {
    const now = mountStates(1.234);
    expect(now).toHaveLength(8);
    const later = mountStates(1.234 + CAROUSEL.rotationPeriod);
    for (const h of now) {
      const same = later.find((l) => l.index === h.index)!;
      expect(same.x).toBeCloseTo(h.x, 6);
      expect(same.z).toBeCloseTo(h.z, 6);
    }
  });

  it('뒤 → 앞 순서로 그리고, 앞쪽 말은 밝고 아래(가까이)에 있다', () => {
    const horses = mountStates(0.5);
    for (let i = 1; i < horses.length; i++) expect(horses[i].z).toBeGreaterThanOrEqual(horses[i - 1].z);
    expect(shadeLevel(1)).toBe(0);
    expect(shadeLevel(-1)).toBe(CAROUSEL.shadeLevels - 1);
    // 앞쪽은 오른쪽으로, 뒤쪽은 왼쪽으로 지나간다
    for (const h of horses) expect(h.facing).toBe(h.z >= 0 ? 'right' : 'left');
  });

  it('말마다 위상이 달라 오르내림이 다르다', () => {
    const at = (t: number) =>
      mountStates(t)
        .filter((h) => h.kind === 'horse')
        .map((h) => ({ i: h.index, y: h.y, z: h.z }));
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
  it('가로등 2개, 왼쪽 끝은 전나무 줄', () => {
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
