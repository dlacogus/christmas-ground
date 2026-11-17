// 회전목마 구역 (x 0~480): 빛나며 도는 회전목마, 노점 2곳, 벤치 2개, 가로등 2개, 왼쪽 끝 작은 전나무 줄.
// 이번에는 타지 못한다 — 회전목마 판은 장애물, 입구 앞에 CAROUSEL_ENTRY 자리만 있다.

import type { Camera } from '../camera';
import { SCENERY_SEED } from '../constants';
import { createBench } from '../props/bench';
import { createCarousel } from '../props/carousel';
import { createFirTree } from '../props/firTree';
import { createMarketStall } from '../props/marketStall';
import { createStreetLamp } from '../props/streetLamp';
import { createRng } from '../random';
import { BENCHES, BENCH_HALF_WIDTH, FIRS, LAMPS, STALLS, ZONE_BOUNDS, getObstacle, inZone } from '../world';
import { pointsInZone, type Zone } from './zone';

/** 회전목마 구역 소품 시드 (다른 구역과 겹치지 않게) */
const CAROUSEL_SEED_OFFSET = 200;

export function createCarouselZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.carousel;
  const rng = createRng(SCENERY_SEED + CAROUSEL_SEED_OFFSET);
  const carousel = createCarousel();
  const stalls = STALLS.flatMap((s, i) =>
    inZone('carousel', s.x) ? [createMarketStall(getObstacle(`stall-${i + 1}`), rng, s.roof)] : [],
  );
  const lamps = LAMPS.filter((l) => inZone('carousel', l.x)).map(createStreetLamp);
  const benches = BENCHES.map((b) => createBench(b, BENCH_HALF_WIDTH, rng));
  const firs = FIRS.map(createFirTree);

  return {
    name: 'carousel',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [carousel, ...stalls, ...lamps, ...benches, ...firs],
    update(dt: number) {
      carousel.update(dt);
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      carousel.drawFloorGlow(ctx, camera);
    },
  };
}
