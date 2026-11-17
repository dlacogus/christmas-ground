// 메인 광장 (x 480~960): 가운데 큰 트리, 양옆 마켓 노점 2곳, 앞뒤 가로등 4개.

import { SCENERY_SEED } from '../constants';
import { createMarketStall } from '../props/marketStall';
import { createStreetLamp } from '../props/streetLamp';
import { createTree } from '../props/tree';
import { createRng } from '../random';
import { LAMPS, OBSTACLES, ZONE_BOUNDS } from '../world';
import { pointsInZone, type Zone } from './zone';

/** 메인 광장 소품 시드 (배경 시드와 겹치지 않게) */
const PLAZA_SEED_OFFSET = 100;

export function createPlazaZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.plaza;
  const rng = createRng(SCENERY_SEED + PLAZA_SEED_OFFSET);
  const tree = createTree(rng);
  const stalls = OBSTACLES.filter((o) => o.id.startsWith('stall-')).map((o) => createMarketStall(o, rng));
  const lamps = LAMPS.map(createStreetLamp);

  return {
    name: 'plaza',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [tree, ...stalls, ...lamps],
    update(dt: number) {
      tree.update(dt);
    },
    draw() {},
  };
}
