// 스케이트장 (x 960~1440): 전구 줄 아래 얼음 링크, 그 안을 도는 NPC 스케이터 3명,
// 링크 뒤 좁은 길의 가로등, 오른쪽 끝 전나무 줄. 링크는 나중에 직접 탈 수 있게 구역 대부분을 차지한다.
// 링크는 장애물이라 들어갈 수 없다 — 입구 문은 닫혀 있고 앞에 RINK_GATE 자리만 있다.

import type { Camera } from '../camera';
import { LAMP_COLORS, SCENERY_SEED, SKATERS, STREET_LAMP } from '../constants';
import { createFirTree } from '../props/firTree';
import { createIceRink, rinkBounds, type IceLight } from '../props/iceRink';
import { createRinkLights } from '../props/rinkLights';
import { createSkater } from '../props/skater';
import { createStreetLamp, lanternCenters } from '../props/streetLamp';
import { LAMPS, RINK_FIRS, ZONE_BOUNDS, inZone } from '../world';
import { pointsInZone, type Zone } from './zone';

/** 스케이트장 소품 시드 (다른 구역과 겹치지 않게) */
const RINK_SEED_OFFSET = 300;

export function createRinkZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.rink;
  const seed = SCENERY_SEED + RINK_SEED_OFFSET;
  const b = rinkBounds();
  const rink = createIceRink(seed);
  const lights = createRinkLights();
  const skaters = SKATERS.list.map(createSkater);
  const lampSpecs = LAMPS.filter((l) => inZone('rink', l.x));
  const lamps = lampSpecs.map(createStreetLamp);
  const firs = RINK_FIRS.map(createFirTree);

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
    props: [rink.backFence, rink.frontFence, lights, ...skaters, ...lamps, ...firs],
    update(dt: number) {
      rink.update(dt);
      lights.update(dt);
      for (const s of skaters) s.update(dt);
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      rink.drawIce(ctx, camera, lampLights);
      for (const s of skaters) s.drawReflection(ctx, camera);
      for (const s of skaters) s.drawTrail(ctx, camera);
    },
  };
}
