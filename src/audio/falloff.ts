/** 거리에 따른 음량: near 안에서는 max, far 밖에서는 0, 그 사이는 제곱으로 줄어든다 */
export function falloffVolume(distance: number, near: number, far: number, max: number): number {
  if (distance <= near) return max;
  if (distance >= far) return 0;
  const f = 1 - (distance - near) / (far - near);
  return max * f * f;
}
