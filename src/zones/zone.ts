import type { Camera } from '../camera';
import { INTERACTION_POINTS, type InteractionPoint, type ZoneName } from '../world';

export type { InteractionPoint };

/** 본 레이어에서 발밑 y로 앞뒤를 정렬해 그리는 것 (시설, 캐릭터 등) */
export interface DepthDrawable {
  /** 발밑 y — 클수록 앞에 그린다 */
  readonly footY: number;
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

/** 모든 구역이 따르는 공통 형태. */
export interface Zone {
  readonly name: ZoneName;
  readonly startX: number;
  readonly endX: number;
  /** 새 기능은 여기에 상호작용 지점을 추가하는 식으로 붙인다 */
  readonly interactionPoints: readonly InteractionPoint[];
  /** y 정렬 대상 (시설 등) */
  readonly props: readonly DepthDrawable[];
  update(dt: number): void;
  /** 바닥에 붙은 납작한 것 (y 정렬 없이 시설보다 먼저 그림) */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}

/** 이 구역 x 범위 안의 상호작용 지점 */
export function pointsInZone(startX: number, endX: number): InteractionPoint[] {
  return INTERACTION_POINTS.filter((p) => p.x >= startX && p.x < endX);
}
