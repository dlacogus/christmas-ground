import { describe, expect, it } from 'vitest';
import { nearestOnRect, rinkPan, rinkVolume } from '../audio/rinkSounds';
import { canStandAt } from '../character/character';
import { POSES } from '../character/sprites';
import { CHARACTER, DEFAULT_OUTFIT, RINK, RINK_LIGHTS, RINK_SOUND, SKATERS } from '../constants';
import { INTERACTION_POINTS, LAMPS, OBSTACLES, RINK_FIRS, RINK_FIR_LINE_X, WALK_AREA, ZONE_BOUNDS, getObstacle, inZone } from '../world';
import { gateSpan, onIce, reflectionColor, rinkBounds, rinkEdgeAt } from './iceRink';
import { bulbColorLevel, lightPoles, rinkBulbs, stringY } from './rinkLights';
import { skaterPose, updateTrail, wobbleLean, wobbleProgress, type SkaterSpec, type TrailMark } from './skater';

const specs = SKATERS.list as readonly SkaterSpec[];

describe('얼음 링크 모양', () => {
  const b = rinkBounds();

  it('구역 대부분을 차지하는 큰 링크, 바닥 띠 안쪽이고 앞뒤로 걸어 지나갈 수 있다', () => {
    expect(b.right - b.left).toBeGreaterThanOrEqual(400);
    expect(b.bottom - b.top).toBeGreaterThanOrEqual(100);
    expect(canStandAt(1200, b.top - 1)).toBe(true);
    expect(b.top).toBeGreaterThan(WALK_AREA.y + CHARACTER.footHeight);
    expect(b.bottom).toBeLessThan(WALK_AREA.y + WALK_AREA.h - CHARACTER.footHeight);
    expect(canStandAt(1200, b.bottom + CHARACTER.footHeight + 2)).toBe(true);
  });

  it('가로로 긴 납작한 모양, 모서리는 둥글다', () => {
    expect(b.right - b.left).toBeGreaterThan((b.bottom - b.top) * 3);
    const corner = rinkEdgeAt(b.left)!;
    const middle = rinkEdgeAt(b.centerX)!;
    expect(corner.top).toBeGreaterThan(middle.top);
    expect(corner.bottom).toBeLessThan(middle.bottom);
    expect(rinkEdgeAt(b.left - 1)).toBeNull();
  });

  it('링크 안으로는 들어갈 수 없다', () => {
    for (let x = b.left; x < b.right; x += 17) {
      for (let y = b.top + CHARACTER.footHeight; y <= b.bottom; y += 7) expect(canStandAt(x, y)).toBe(false);
    }
  });

  it('입구 문은 앞 울타리 곧은 부분에 있고, 그 앞에 RINK_GATE 자리', () => {
    const gate = gateSpan();
    const point = INTERACTION_POINTS.find((p) => p.id === 'RINK_GATE')!;
    expect(rinkEdgeAt(gate.left)!.bottom).toBe(b.bottom - 1);
    expect(rinkEdgeAt(gate.right - 1)!.bottom).toBe(b.bottom - 1);
    expect(point.x).toBe((gate.left + gate.right) / 2);
    expect(point.y).toBeGreaterThan(b.bottom);
    expect(canStandAt(point.x, point.y)).toBe(true);
  });

  it('비친 색은 원래 색의 반 밝기', () => {
    expect(reflectionColor('#ff8040')).toBe('#804020');
    expect(reflectionColor('#ffffff')).toBe('#808080');
  });
});

describe('전구 줄', () => {
  const poles = lightPoles();
  const b = rinkBounds();

  it('링크 양쪽 기둥 사이에 3~4줄, 가운데가 처진다', () => {
    expect(RINK_LIGHTS.sags.length).toBeGreaterThanOrEqual(3);
    expect(RINK_LIGHTS.sags.length).toBeLessThanOrEqual(4);
    expect(poles.leftX).toBe(b.left);
    expect(poles.rightX).toBe(b.right - 1);
    RINK_LIGHTS.sags.forEach((_, i) => {
      const end = stringY(i, poles.leftX);
      expect(stringY(i, (poles.leftX + poles.rightX) / 2)).toBeGreaterThan(end);
      expect(stringY(i, poles.rightX)).toBeCloseTo(end, 6);
      expect(end).toBeGreaterThanOrEqual(poles.top);
    });
    expect(poles.top).toBeGreaterThan(0);
  });

  it('전구는 빨강·초록·금·파랑, 스케이터 머리보다 위에 있다', () => {
    const bulbs = rinkBulbs();
    expect(new Set(bulbs.map((x) => x.colorIndex)).size).toBe(4);
    const lowest = Math.max(...bulbs.map((x) => x.y)) + RINK_LIGHTS.bulbHeight;
    const highestHead = Math.min(...specs.map((s) => skaterPose(s, Math.PI).y - CHARACTER.spriteHeight));
    expect(lowest).toBeLessThan(highestHead);
  });

  it('한 색씩 차례로 천천히 밝아진다', () => {
    const brightest = (t: number) => {
      const levels = RINK_LIGHTS.bulbs.map((_, c) => bulbColorLevel(c, t));
      return levels.indexOf(Math.max(...levels));
    };
    const quarter = RINK_LIGHTS.cyclePeriod / RINK_LIGHTS.bulbs.length;
    expect([0, 1, 2, 3].map((k) => brightest(k * quarter))).toEqual([0, 1, 2, 3]);
    for (let t = 0; t < 10; t += 0.3) {
      for (let c = 0; c < 4; c++) {
        expect(bulbColorLevel(c, t)).toBeGreaterThanOrEqual(RINK_LIGHTS.minLevel - 1e-9);
        expect(bulbColorLevel(c, t)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('NPC 스케이터', () => {
  it('3명, 주인공과 다른 옷 색, 미끄럼 자세 2장', () => {
    expect(specs).toHaveLength(3);
    expect(new Set(specs.map((s) => s.outfit)).size).toBe(3);
    for (const s of specs) expect(s.outfit).not.toBe(DEFAULT_OUTFIT);
    expect(POSES.glide).toHaveLength(2);
    expect(POSES.glide[0]).not.toEqual(POSES.glide[1]);
  });

  it('언제나 얼음 위에서 돈다 (몸 양옆도 울타리 안)', () => {
    for (const spec of specs) {
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const p = skaterPose(spec, a);
        expect(onIce(p.x, p.y), `${spec.outfit} ${a.toFixed(2)}`).toBe(true);
        for (const dx of [-CHARACTER.spriteWidth / 2, CHARACTER.spriteWidth / 2]) {
          expect(rinkEdgeAt(Math.round(p.x + dx))).not.toBeNull();
        }
      }
    }
  });

  it('맨 앞을 지날 때 앞 울타리에 발이 살짝 가린다', () => {
    const b = rinkBounds();
    const front = Math.max(...specs.map((s) => skaterPose(s, 0).y));
    expect(front).toBeGreaterThan(b.bottom - RINK.fenceHeight);
    expect(front).toBeLessThan(b.bottom);
  });

  it('앞쪽은 오른쪽, 뒤쪽은 왼쪽으로 지나간다', () => {
    expect(skaterPose(specs[0], 0).facing).toBe('right');
    expect(skaterPose(specs[0], Math.PI).facing).toBe('left');
  });

  it('한 명만 30초마다 비틀거리다 균형을 잡는다', () => {
    expect(specs.filter((s) => s.wobbles)).toHaveLength(1);
    expect(SKATERS.wobbleInterval).toBe(30);
    const first = SKATERS.wobbleFirstDelay;
    expect(wobbleProgress(first - 0.5)).toBeNull();
    expect(wobbleProgress(first + 0.5)).not.toBeNull();
    expect(wobbleProgress(first + SKATERS.wobbleDuration + 1)).toBeNull();
    expect(wobbleProgress(first + 30 + 0.5)).not.toBeNull();
    expect(wobbleProgress(first + 15)).toBeNull();
    const leans = Array.from({ length: 50 }, (_, i) => wobbleLean(i / 50));
    expect(Math.max(...leans.map(Math.abs))).toBeGreaterThan(0);
    expect(wobbleLean(0.999)).toBe(0);
  });

  it('얼음 자국은 잠깐 남았다 사라진다', () => {
    const trail: TrailMark[] = [{ x: 1100, y: 200, age: 0 }];
    updateTrail(trail, SKATERS.trailLifetime / 2);
    expect(trail).toHaveLength(1);
    updateTrail(trail, SKATERS.trailLifetime);
    expect(trail).toHaveLength(0);
  });
});

describe('스케이트장 주변', () => {
  const b = rinkBounds();

  it('링크 뒤에 노점·오두막이 없다 (뒤쪽 길은 가로등뿐)', () => {
    for (const o of OBSTACLES) {
      if (o.y + o.h > b.top || !inZone('rink', o.x) || o.id === 'rink-firs') continue;
      expect(o.id, o.id).toMatch(/^lamp-/);
    }
  });

  it('오른쪽 끝은 전나무 여러 그루로 막고, 링크와 겹치지 않는다', () => {
    expect(RINK_FIRS.length).toBeGreaterThanOrEqual(5);
    for (const f of RINK_FIRS) expect(f.x).toBeGreaterThanOrEqual(RINK_FIR_LINE_X);
    expect(b.right).toBeLessThan(RINK_FIR_LINE_X);
    expect(ZONE_BOUNDS.rink.endX).toBe(WALK_AREA.x + WALK_AREA.w);
  });

  it('링크 뒤에 선 가로등이 있어 얼음에 비친다', () => {
    const behind = LAMPS.filter((l) => inZone('rink', l.x) && l.y <= b.top);
    expect(behind.length).toBeGreaterThan(0);
    for (const l of behind) expect(onIce(l.x, b.midY)).toBe(true);
  });
});

describe('스케이트장 소리', () => {
  const rink = getObstacle('rink');

  it('링크 가까이서 크게, 멀어지면 안 들린다', () => {
    expect(rinkVolume(rink, 1200, rink.y + rink.h + 5)).toBe(RINK_SOUND.maxVolume);
    expect(rinkVolume(rink, 900, 200)).toBeLessThan(RINK_SOUND.maxVolume);
    expect(rinkVolume(rink, 600, 200)).toBe(0);
  });

  it('링크가 오른쪽에 있으면 오른쪽에서 들린다', () => {
    expect(rinkPan(rink, 800, 200)).toBeGreaterThan(0);
    expect(rinkPan(rink, 1200, 250)).toBe(0);
    expect(nearestOnRect(rink, 1200, 250).distance).toBeGreaterThan(0);
  });
});
