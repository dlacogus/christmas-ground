// 스케이트장 (x 960~1440): 전구 줄 아래 얼음 링크, 그 안을 도는 NPC 스케이터 3명,
// 링크 뒤 좁은 길의 가로등, 오른쪽 끝 전나무 줄. 링크는 나중에 직접 탈 수 있게 구역 대부분을 차지한다.
// 링크는 걸어서는 들어갈 수 없는 장애물이다 — 왼쪽 입구(RINK_GATE)에서 스케이트를 신고 들어가, 오른쪽 출구(RINK_EXIT)로 벗고 나온다 (skatePlay.ts).
// 두 문 옆에는 화살표 팻말이 선다 (입구 초록 ↑, 출구 빨강 ↓).

import type { Camera } from '../camera';
import { LAMP_COLORS, SCENERY_SEED, SKATERS, STREET_LAMP } from '../constants';
import { createFirTree } from '../props/firTree';
import { createIceRink, rinkBounds, type IceLight } from '../props/iceRink';
import { createRinkLights } from '../props/rinkLights';
import { createRinkSign } from '../props/rinkSign';
import { createSkater, type Skater } from '../props/skater';
import { createStreetLamp, lanternCenters } from '../props/streetLamp';
import { INTERACTION_POINTS, LAMPS, RINK_FIRS, RINK_SIGN_FRONT, RINK_SIGN_SIDE, ZONE_BOUNDS, inZone } from '../world';
import { pointsInZone, type Zone } from './zone';

/** 스케이트장 소품 시드 (다른 구역과 겹치지 않게) */
const RINK_SEED_OFFSET = 300;

export interface RinkZone extends Zone {
  readonly skaters: readonly Skater[];
  /** 얼음 위에 납작하게 얹을 그림 (내 캐릭터의 얼음 자국·비친 모습). 얼음과 NPC 자국 다음에 그린다 */
  setIceOverlay(draw: (ctx: CanvasRenderingContext2D, camera: Camera) => void): void;
}

export function createRinkZone(): RinkZone {
  const { startX, endX } = ZONE_BOUNDS.rink;
  const seed = SCENERY_SEED + RINK_SEED_OFFSET;
  const b = rinkBounds();
  const rink = createIceRink(seed);
  const lights = createRinkLights();
  const skaters = SKATERS.list.map(createSkater);
  const lampSpecs = LAMPS.filter((l) => inZone('rink', l.x));
  const lamps = lampSpecs.map(createStreetLamp);
  const firs = RINK_FIRS.map(createFirTree);
  // 입구 팻말은 문 오른쪽, 출구 팻말은 문 왼쪽 (둘 다 링크 가운데 쪽)
  const gate = INTERACTION_POINTS.find((p) => p.id === 'RINK_GATE')!;
  const exit = INTERACTION_POINTS.find((p) => p.id === 'RINK_EXIT')!;
  const signs = [
    createRinkSign('enter', { x: gate.x + RINK_SIGN_SIDE, y: b.bottom + RINK_SIGN_FRONT }),
    createRinkSign('exit', { x: exit.x - RINK_SIGN_SIDE, y: b.bottom + RINK_SIGN_FRONT }),
  ];
  let iceOverlay: ((ctx: CanvasRenderingContext2D, camera: Camera) => void) | null = null;

  // 얼음에는 링크 뒤에 선 가로등만 비친다 (전구 줄은 비추지 않는다. 앞에 선 가로등은 뒤집힌 상이 얼음 밖에 생긴다).
  // 상은 가로등 발밑을 기준으로 뒤집힌 자리에 맺힌다
  const lampLights: IceLight[] = lampSpecs
    .filter((l) => l.y <= b.top)
    .flatMap((l) =>
      lanternCenters(l).map((c) => ({
        x: l.x + c.dx,
        footY: l.y,
        sourceY: c.y,
        poleX: l.x,
        poleTopY: l.y - STREET_LAMP.height,
        color: LAMP_COLORS.glow,
        level: 1,
      })),
    );

  return {
    name: 'rink',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [rink.backFence, rink.frontFence, lights, ...signs, ...skaters, ...lamps, ...firs],
    skaters,
    setIceOverlay(draw) {
      iceOverlay = draw;
    },
    update(dt: number) {
      rink.update(dt);
      lights.update(dt);
      for (const s of skaters) s.update(dt);
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      rink.drawIce(ctx, camera, lampLights);
      for (const s of skaters) s.drawReflection(ctx, camera);
      for (const s of skaters) s.drawTrail(ctx, camera);
      iceOverlay?.(ctx, camera);
    },
  };
}
