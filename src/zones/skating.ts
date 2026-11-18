// 스케이트 움직임 (DOM 없음, 테스트 가능): 관성 있는 미끄럼, 브레이크, 링크 벽에서 튕기기·넘어지기, 점프, 스핀, 어지러움.
// 링크 안쪽은 울타리 선과 같은 모서리 둥근 사각형(모서리 = 타원 1/4)에서 여유(margin)만큼 줄인 모양이다.

import type { Facing } from '../character/sprites';
import { RINK, SKATE as S } from '../constants';
import { rinkBounds } from '../props/iceRink';
import { INTERACTION_POINTS } from '../world';

export type SkatePhase = 'gliding' | 'spinning' | 'dizzy' | 'fallen';
export type SkateEvent = 'brake' | 'land' | 'bounce' | 'fall' | 'dizzy';

export interface Skate {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  phase: SkatePhase;
  /** 넘어짐·어지러움은 남은 시간, 스핀은 돈 시간 */
  timer: number;
  /** 점프 중이면 뛴 뒤 지난 시간, 아니면 null */
  jump: number | null;
  /** 이번 프레임에 방향키로 밀었나 / 브레이크를 걸었나 (자세·소리용) */
  pushing: boolean;
  braking: boolean;
  /** 밀어내는 동작 시계 */
  pushTime: number;
}

export interface MoveDir {
  x: number;
  y: number;
}

export function createSkate(x: number, y: number, facing: Facing = 'right'): Skate {
  return { x, y, vx: 0, vy: 0, facing, phase: 'gliding', timer: 0, jump: null, pushing: false, braking: false, pushTime: 0 };
}

export function speedOf(s: { vx: number; vy: number }): number {
  return Math.hypot(s.vx, s.vy);
}

// ───────────── 링크 모양 ─────────────

/** 탈 수 있는 안쪽: 왼·오른·뒤·앞 끝과 모서리 타원 반지름 */
export function skateArea() {
  const b = rinkBounds();
  const left = b.left + S.marginX;
  const right = b.right - 1 - S.marginX;
  const top = b.top + S.marginTop;
  const bottom = b.bottom - 1 - S.marginBottom;
  return {
    left,
    right,
    top,
    bottom,
    radiusX: RINK.cornerRadiusX - S.marginX,
    radiusY: RINK.cornerRadiusY - Math.min(S.marginTop, S.marginBottom),
  };
}

const AREA = skateArea();

/** 모서리 타원 가운데(또는 곧은 변에서는 그 점의 투영)까지: 점이 안쪽이면 d ≤ 1 */
function cornerMeasure(x: number, y: number) {
  const A = AREA;
  const cx = Math.min(Math.max(x, A.left + A.radiusX), A.right - A.radiusX);
  const cy = Math.min(Math.max(y, A.top + A.radiusY), A.bottom - A.radiusY);
  const ux = (x - cx) / A.radiusX;
  const uy = (y - cy) / A.radiusY;
  return { cx, cy, ux, uy, d: Math.hypot(ux, uy) };
}

/** 링크 안쪽(탈 수 있는 곳)인가 */
export function insideSkateArea(x: number, y: number): boolean {
  return cornerMeasure(x, y).d <= 1 + 1e-9;
}

/** 밖으로 나간 점을 벽 위로 되돌리고, 그 자리의 바깥쪽 법선(단위 벡터)을 준다. 안쪽이면 null */
export function wallContact(x: number, y: number): { x: number; y: number; nx: number; ny: number } | null {
  const m = cornerMeasure(x, y);
  if (m.d <= 1) return null;
  const A = AREA;
  // 벽 위 점 (조금 안쪽)
  const k = (1 - 1e-6) / m.d;
  const px = m.cx + m.ux * k * A.radiusX;
  const py = m.cy + m.uy * k * A.radiusY;
  // 타원의 기울기 방향 = 바깥쪽 법선
  const gx = m.ux / A.radiusX;
  const gy = m.uy / A.radiusY;
  const len = Math.hypot(gx, gy);
  return { x: px, y: py, nx: gx / len, ny: gy / len };
}

// ───────────── 입구·출구 ─────────────

const point = (id: string) => {
  const p = INTERACTION_POINTS.find((q) => q.id === id)!;
  return { x: p.x, y: p.y };
};

/** 링크 밖 입구 자리 (스케이트를 신는 곳) */
export function rinkGate(): { x: number; y: number } {
  return point('RINK_GATE');
}

/** 링크 밖 출구 자리 (스케이트를 벗고 나오는 곳) */
export function rinkExit(): { x: number; y: number } {
  return point('RINK_EXIT');
}

/** 입구 안쪽, 얼음 위 첫 자리 (신고 나서 여기로 나간다) */
export function rinkInside(): { x: number; y: number } {
  return { x: rinkGate().x, y: AREA.bottom - 1 };
}

/** 출구 안쪽, 얼음 위 (여기서 멈춰 벗는다) */
export function rinkExitInside(): { x: number; y: number } {
  return { x: rinkExit().x, y: AREA.bottom - 1 };
}

const within = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** 걸어서 입구 가까이 왔나 (스케이트를 신을 수 있다) */
export function nearGate(x: number, y: number): boolean {
  return within({ x, y }, rinkGate(), S.gateRadius);
}

/** 걸어서 출구 가까이 왔나 (여기서는 신을 수 없다 — 입구를 안내한다) */
export function nearExitOutside(x: number, y: number): boolean {
  return within({ x, y }, rinkExit(), S.gateRadius);
}

/** 얼음 위에서 출구 안쪽 가까이 있나 (이 근처에서는 점프·스핀 대신 벗기) */
export function nearInside(s: { x: number; y: number }): boolean {
  return within(s, rinkExitInside(), S.exitRadius);
}

/** 얼음 위에서 입구 안쪽 가까이 있나 (여기서는 벗을 수 없다 — 출구를 안내한다) */
export function nearEntranceInside(s: { x: number; y: number }): boolean {
  return within(s, rinkInside(), S.exitRadius);
}

/** 지금 스페이스로 벗을 수 있나: 출구 안쪽 가까이에서, 서서 천천히 미끄러질 때만 */
export function canTakeOff(s: Skate): boolean {
  return s.phase === 'gliding' && s.jump === null && nearInside(s) && speedOf(s) < S.exitMaxSpeed;
}

// ───────────── 기술 ─────────────

/** 점프: 충분히 빠르고 땅에 서 있을 때만 */
export function tryJump(s: Skate): boolean {
  if (s.phase !== 'gliding' || s.jump !== null || speedOf(s) < S.jumpMinSpeed) return false;
  s.jump = 0;
  return true;
}

/** 지금 떠 있는 높이 (px) */
export function jumpLift(s: Skate): number {
  if (s.jump === null) return 0;
  return S.jumpHeight * Math.sin((Math.PI * s.jump) / S.jumpSeconds);
}

/** 스핀: 느릴 때만 제자리에서 */
export function tryStartSpin(s: Skate): boolean {
  if (s.phase !== 'gliding' || s.jump !== null || speedOf(s) >= S.spinMaxSpeed) return false;
  s.phase = 'spinning';
  s.timer = 0;
  return true;
}

/** 스페이스를 떼면 멈춘다 */
export function stopSpin(s: Skate): void {
  if (s.phase === 'spinning') s.phase = 'gliding';
}

/** 지금 방향키를 받는가 */
export function controllable(s: Skate): boolean {
  return s.phase === 'gliding' && s.jump === null;
}

// ───────────── 한 걸음 ─────────────

/** 속도를 amount만큼 줄인다 (0 밑으로는 안 내려간다) */
function slowBy(s: Skate, amount: number): void {
  const speed = speedOf(s);
  if (speed <= amount) {
    s.vx = 0;
    s.vy = 0;
    return;
  }
  const k = (speed - amount) / speed;
  s.vx *= k;
  s.vy *= k;
}

/**
 * dt초 움직인다. dir = 방향키 (-1~1, 없으면 0). 일어난 일은 events에 넣는다.
 * - 방향키는 속도를 바로 정하지 않고 가속한다 (최대 속도까지). 반대 방향키는 브레이크.
 * - 입력이 없으면 천천히 미끄러지며 줄어든다.
 * - 벽에 닿으면 튕기며 속도가 절반, 너무 빠르게 부딪히면 넘어진다.
 */
export function stepSkate(s: Skate, dt: number, dir: MoveDir, events: SkateEvent[]): void {
  const wasBraking = s.braking;
  s.pushing = false;
  s.braking = false;

  if (s.jump !== null) {
    s.jump += dt;
    if (s.jump >= S.jumpSeconds) {
      s.jump = null;
      events.push('land');
    }
  }

  const len = Math.hypot(dir.x, dir.y);
  const speed = speedOf(s);
  if (s.phase === 'fallen') {
    slowBy(s, S.fallBrake * dt);
    s.timer -= dt;
    if (s.timer <= 0) s.phase = 'gliding';
  } else if (s.phase === 'spinning') {
    slowBy(s, S.spinBrake * dt);
    s.timer += dt;
    if (s.timer >= S.dizzyAfter) {
      s.phase = 'dizzy';
      s.timer = S.dizzySeconds;
      events.push('dizzy');
    }
  } else if (s.phase === 'dizzy') {
    slowBy(s, S.friction * dt);
    s.timer -= dt;
    if (s.timer <= 0) s.phase = 'gliding';
  } else if (len > 0 && s.jump === null) {
    const ux = dir.x / len;
    const uy = dir.y / len;
    const opposite = speed > S.stopSpeed && (ux * s.vx + uy * s.vy) / speed < S.brakeCos;
    if (opposite) {
      slowBy(s, S.brake * dt);
      s.braking = true;
      if (!wasBraking) events.push('brake');
    } else {
      s.vx += ux * S.accel * dt;
      s.vy += uy * S.accel * dt;
      const capped = speedOf(s);
      if (capped > S.maxSpeed) {
        s.vx *= S.maxSpeed / capped;
        s.vy *= S.maxSpeed / capped;
      }
      s.pushing = true;
      s.pushTime += dt;
      if (ux > 0.1) s.facing = 'right';
      else if (ux < -0.1) s.facing = 'left';
    }
  } else {
    slowBy(s, S.friction * dt);
  }
  if (!s.pushing) s.pushTime = 0;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  const hit = wallContact(s.x, s.y);
  if (hit) {
    s.x = hit.x;
    s.y = hit.y;
    const into = s.vx * hit.nx + s.vy * hit.ny;
    if (into > 0) {
      // 벽 쪽 성분을 뒤집고 전체 속도를 줄인다
      s.vx = (s.vx - 2 * into * hit.nx) * S.bounce;
      s.vy = (s.vy - 2 * into * hit.ny) * S.bounce;
      events.push('bounce');
      if (into > S.fallImpact && s.phase !== 'fallen') {
        s.phase = 'fallen';
        s.timer = S.fallSeconds;
        s.jump = null;
        events.push('fall');
      }
    }
  }
}

/** 다른 스케이터와 부딪혔다: (nx, ny) = 상대에서 나를 향한 단위 벡터. 내 쪽은 튕겨 나가며 느려진다 */
export function bumpSkate(s: Skate, nx: number, ny: number): void {
  const into = s.vx * nx + s.vy * ny;
  if (into < 0) {
    s.vx -= 2 * into * nx;
    s.vy -= 2 * into * ny;
  }
  s.vx = s.vx * S.bumpKeep + nx * S.bumpPush;
  s.vy = s.vy * S.bumpKeep + ny * S.bumpPush;
}

/** 두 발밑이 부딪힐 만큼 가까운가 (깊이 방향은 납작하게 본다) */
export function touching(ax: number, ay: number, bx: number, by: number): boolean {
  return ((ax - bx) / S.bumpRadiusX) ** 2 + ((ay - by) / S.bumpRadiusY) ** 2 < 1;
}
