// 메인 광장 (x 480~960): 가운데 큰 트리, 바닥 맨 뒤에 늘어선 마켓 오두막, 앞뒤 가로등 4개, 회전목마·아이스링크를 가리키는 이정표.

import { SCENERY_SEED } from '../constants';
import { createHutsInZone } from '../props/marketHut';
import { createSignpost } from '../props/signpost';
import { createStreetLamp } from '../props/streetLamp';
import { createTree } from '../props/tree';
import { createRng } from '../random';
import { LAMPS, SIGNPOST, ZONE_BOUNDS, inZone } from '../world';
import { pointsInZone, type Zone } from './zone';

/** 메인 광장 소품 시드 (배경 시드와 겹치지 않게) */
const PLAZA_SEED_OFFSET = 100;

export function createPlazaZone(): Zone {
  const { startX, endX } = ZONE_BOUNDS.plaza;
  const rng = createRng(SCENERY_SEED + PLAZA_SEED_OFFSET);
  const tree = createTree(rng);
  const huts = createHutsInZone('plaza', SCENERY_SEED + PLAZA_SEED_OFFSET);
  const lamps = LAMPS.filter((l) => inZone('plaza', l.x)).map(createStreetLamp);

  return {
    name: 'plaza',
    startX,
    endX,
    interactionPoints: pointsInZone(startX, endX),
    props: [tree, createSignpost(SIGNPOST), ...huts, ...lamps],
    update(dt: number) {
      tree.update(dt);
      for (const h of huts) h.update(dt);
    },
    draw() {},
  };
}
