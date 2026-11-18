// 회전목마 구역 (x 0~480): 빛나며 도는 회전목마(말 6 + 마차 2), 바닥 맨 뒤 마켓 오두막, 벤치 2개, 가로등 2개, 왼쪽 끝 작은 전나무 줄.
// 회전목마 판 둘레(난간)는 장애물이고, 빨간 카펫과 아치가 있는 입구(CAROUSEL_ENTRY)에서 탈 수 있다.
// 자리(누가 어느 탈 것 어느 자리에 앉았는지)는 이 구역이 갖고, 타고 내리는 규칙은 carouselRide.ts에 있다.

import type { Camera } from '../camera';
import { SCENERY_SEED } from '../constants';
import { createBench } from '../props/bench';
import { createCarousel } from '../props/carousel';
import { createCarouselEntrance } from '../props/carouselEntrance';
import { createFirTree } from '../props/firTree';
import { createHutsInZone } from '../props/marketHut';
import { createStreetLamp } from '../props/streetLamp';
import { createRng } from '../random';
import { BENCHES, BENCH_HALF_WIDTH, FIRS, LAMPS, ZONE_BOUNDS, inZone } from '../world';
import { createSeats, riderViews, updateWaves, type Seats } from './carouselRide';
import { pointsInZone, type Zone } from './zone';

/** 회전목마 구역 소품 시드 (다른 구역과 겹치지 않게) */
const CAROUSEL_SEED_OFFSET = 200;

export interface CarouselZone extends Zone {
  /** 탈 것마다 자리 배열: 말 1자리, 마차 2자리. 각 자리에 누가 앉았는지 */
  readonly seats: Seats;
  /** 회전목마가 돌아간 시간 (탈 것 위치를 정하는 시계) */
  rideTime(): number;
  /** 회전목마 시계를 서버 시각(초)에 맞춘다 — 모든 사람 화면에서 같은 각도 */
  syncRideTime(seconds: number): void;
  /** 캐릭터가 입구 가까이 있는가 — 아치 전구가 밝아지고 반짝이가 튄다 */
  setEntranceNear(near: boolean): void;
  /** 올라타는 순간: 입구 오른쪽 줄이 잠깐 풀렸다 다시 걸린다 */
  openEntranceRope(): void;
}

export function createCarouselZone(): CarouselZone {
  const { startX, endX } = ZONE_BOUNDS.carousel;
  const rng = createRng(SCENERY_SEED + CAROUSEL_SEED_OFFSET);
  const carousel = createCarousel();
  const huts = createHutsInZone('carousel', SCENERY_SEED + CAROUSEL_SEED_OFFSET);
  const lamps = LAMPS.filter((l) => inZone('carousel', l.x)).map(createStreetLamp);
  const benches = BENCHES.map((b) => createBench(b, BENCH_HALF_WIDTH, rng));
  const firs = FIRS.map(createFirTree);
  const seats = createSeats();
  const entrance = createCarouselEntrance();

  return {
    name: 'carousel',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [carousel, entrance.back, entrance.pillars, entrance.ropes, ...huts, ...lamps, ...benches, ...firs],
    seats,
    rideTime: () => carousel.time(),
    syncRideTime: (seconds) => carousel.setTime(seconds),
    setEntranceNear: (near) => entrance.setNear(near),
    openEntranceRope: () => entrance.openRope(),
    update(dt: number) {
      carousel.update(dt);
      entrance.update(dt);
      updateWaves(seats, dt);
      carousel.setRiders(riderViews(seats, carousel.time()));
      for (const h of huts) h.update(dt);
    },
    draw(ctx: CanvasRenderingContext2D, camera: Camera) {
      carousel.drawFloorGlow(ctx, camera);
      entrance.drawCarpet(ctx, camera);
    },
  };
}
