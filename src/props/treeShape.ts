// 큰 트리의 모양 (순수 계산 — 그림도 DOM도 없다). 트리 그림(tree.ts)과 장식 달 자리 판정(features/treeDecor.ts),
// 그리고 서버(달기 위치 검사)가 같이 쓴다.

import { TREE } from '../constants';

/** 잎 한 단: 위는 좁고 아래로 넓어지는 사다리꼴 */
export interface Tier {
  top: number;
  bottom: number;
  topHalf: number;
  bottomHalf: number;
}

export function treeTiers(): Tier[] {
  const height = TREE.foliageBottomY - TREE.tipY;
  return Array.from({ length: TREE.tiers }, (_, i) => {
    const bottom = TREE.tipY + Math.round((height * (i + 1)) / TREE.tiers);
    const top = i === 0 ? TREE.tipY : TREE.tipY + Math.round((height * i) / TREE.tiers) - TREE.tierOverlap;
    const bottomHalf = Math.round((TREE.baseHalfWidth * (i + 1)) / TREE.tiers);
    // 단 윗변은 그 높이의 원뿔 폭보다 살짝 좁게 — 꼭대기까지 한 줄기 원뿔로 자연스럽게 이어진다
    const topHalf = Math.round(((TREE.baseHalfWidth * (top - TREE.tipY)) / height) * TREE.tierTopRatio);
    return { top, bottom, topHalf, bottomHalf };
  });
}

/** 한 단의 y 줄 반폭 (단 밖이면 -1) */
export function tierHalfAt(tier: Tier, y: number): number {
  if (y < tier.top || y > tier.bottom) return -1;
  const f = (y - tier.top) / (tier.bottom - tier.top);
  return Math.round(tier.topHalf + (tier.bottomHalf - tier.topHalf) * f);
}

export const TIERS: readonly Tier[] = treeTiers();

/** 잎 전체의 y 줄 반폭 (잎 밖이면 -1) */
export function foliageHalfWidth(y: number): number {
  let half = -1;
  for (const t of TIERS) half = Math.max(half, tierHalfAt(t, y));
  return half;
}
