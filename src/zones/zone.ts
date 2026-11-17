import type { Camera } from '../camera';

/** 구역 안의 상호작용 지점. 새 기능은 이걸 구역에 추가하는 식으로 붙인다. */
export interface InteractionPoint {
  id: string;
  x: number;
  y: number;
}

/** 모든 구역이 따르는 공통 형태. */
export interface Zone {
  readonly name: string;
  readonly startX: number;
  readonly endX: number;
  readonly interactionPoints: InteractionPoint[];
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void;
}
