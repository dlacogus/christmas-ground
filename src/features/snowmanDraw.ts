// 눈덩이와 눈사람 그리기. 눈덩이는 살짝 울퉁불퉁한 픽셀 원(지름 2~64px)을 크기별로 한 번만 그려 두고 다시 쓴다.
// 굴러가는 게 보이도록 표면 얼룩(하늘색 점, 가끔 돌멩이·나뭇잎)이 굴러간 각도만큼 돌아간다.
// 눈사람은 눈덩이를 쌓고 그 위에 얼굴·팔·단추·목도리·양동이 모자를 얹는다 (크기에 맞춰 늘어난다).

import { layerOffsetX } from '../camera';
import { LAYER_FACTORS, OUTFITS, SCREEN_WIDTH, SNOWBALL as B, SNOWMAN as M, SNOWMAN_COLORS as C, type OutfitName } from '../constants';
import type { DepthDrawable } from '../zones/zone';
import { drawSnowmanBeanie } from './hatGift';
import { drawAttachedProps, PROP_SLOT } from './props';
import { snowmanHeight, snowmanKind, snowmanLook, tierBase, type Ball, type Snowman, type SnowmanKind, type SnowThing } from './snowman';
import type { BallFace } from '../shared/protocol';

const sprites = new Map<number, HTMLCanvasElement>();

/** 지름 d인 눈덩이 그림 (한 번만 그린다). 캔버스는 (d+2) 정사각형, 눈덩이 맨 아래 = 캔버스 아래에서 1px 위 */
function ballSprite(d: number): HTMLCanvasElement {
  const cached = sprites.get(d);
  if (cached) return cached;
  const size = d + 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const r = d / 2;
  const inside = (px: number, py: number): boolean => {
    const u = px + 0.5 - c;
    const v = py + 0.5 - c;
    const a = Math.atan2(v, u);
    // 살짝 울퉁불퉁 (작은 눈덩이는 그냥 원)
    const lump = d >= 8 ? 1 + 0.05 * Math.sin(3 * a + d) + 0.03 * Math.sin(5 * a + d * 2.1) : 1;
    return Math.hypot(u, v) <= r * lump;
  };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!inside(px, py)) continue;
      const u = (px + 0.5 - c) / r;
      const v = (py + 0.5 - c) / r;
      // 왼쪽 위에서 빛을 받는다: 아래쪽은 두 톤 그늘
      const dark = v * 0.85 + u * 0.3;
      let color: string = dark > 0.78 ? C.shadeDeep : dark > 0.42 ? C.shade : C.top;
      // 아래쪽 가장자리는 한 줄 더 짙게 (눈밭 위에서도 윤곽이 보이게)
      if (v > 0.2 && !inside(px, py + 1)) color = C.edge;
      ctx.fillStyle = color;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  sprites.set(d, canvas);
  return canvas;
}

function hash(seed: number, k: number): number {
  const n = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** 바닥 타원 그림자 */
function drawShadow(ctx: CanvasRenderingContext2D, sx: number, y: number, width: number, alpha: number): void {
  const w = Math.max(3, Math.round(width));
  const h = Math.max(2, Math.round(width * 0.18));
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.shadow;
  ctx.fillRect(sx - Math.floor(w / 2) + 1, y - Math.floor(h / 2), w - 2, h);
  ctx.fillRect(sx - Math.floor(w / 2), y - Math.floor(h / 2) + 1, w, Math.max(1, h - 2));
  ctx.globalAlpha = 1;
}

/**
 * 눈덩이 하나. (sx, y) = 화면에서 바닥에 닿은 맨 아래 가운데, z = 바닥에서 뜬 높이.
 * roll만큼 표면 얼룩이 돌아간다.
 */
export function drawBall(ctx: CanvasRenderingContext2D, sx: number, y: number, diameter: number, roll: number, seed: number, z = 0, shadow = true): void {
  const d = Math.max(2, Math.min(B.maxSize, Math.round(diameter)));
  if (shadow) drawShadow(ctx, sx, y, d * 0.95 - z * 0.3, 0.28);
  const sprite = ballSprite(d);
  const top = y - Math.round(z) - d - 1;
  ctx.drawImage(sprite, sx - Math.floor(sprite.width / 2), top);
  if (d < 6) return;
  // 표면 얼룩: 바퀴처럼 굴러간 각도만큼 돈다
  const cx = sx;
  const cy = top + 1 + d / 2;
  const count = B.speckBase + Math.floor(d / B.speckPer);
  for (let i = 0; i < count; i++) {
    const rho = (0.2 + hash(seed, i * 3 + 1) * 0.62) * (d / 2);
    const theta = hash(seed, i * 3 + 2) * Math.PI * 2 + roll;
    const debris = hash(seed, i * 3 + 3);
    ctx.fillStyle = debris < B.debrisChance / 2 ? C.pebble : debris < B.debrisChance ? C.leaf : C.speck;
    ctx.fillRect(Math.round(cx + rho * Math.cos(theta)), Math.round(cy + rho * Math.sin(theta)), 1, 1);
  }
}

/** (x0, y0)에서 (x1, y1)까지 1px 선 */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= steps; k++) {
    ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / steps), Math.round(y0 + ((y1 - y0) * k) / steps), 1, 1);
  }
}

/** 눈사람. sx = 화면에서 발밑 x */
export function drawSnowman(ctx: CanvasRenderingContext2D, sx: number, s: Snowman): void {
  const y = Math.round(s.y);
  const kind = snowmanKind(snowmanHeight(s.tiers));
  const look = snowmanLook(s.seed, kind, s.makers);
  // 녹는 중이면 전체가 낮아진다
  const melt = Math.max(0, s.melt);
  const tiers = s.tiers.map((d) => Math.max(2, Math.round(d * (1 - 0.75 * melt))));
  const top = tiers.length - 1;
  // 주변 그림자: 엄청 큰 눈사람은 크고 엷게 하나 더
  if (kind === 'giant') drawShadow(ctx, sx + 3, y + 1, tiers[0] * 1.5, 0.12 * (1 - melt));
  drawShadow(ctx, sx, y, tiers[0] * 0.95, 0.28);

  // 맨 위 눈덩이가 불안하게 좌우로 흔들흔들하다 자리를 잡는다
  const wobble = s.wobble > 0 ? Math.round(Math.sin(s.age * 11) * M.wobblePx * (s.wobble / M.wobbleSeconds)) : 0;
  const cx: number[] = [];
  const cy: number[] = [];
  tiers.forEach((d, i) => {
    const x = sx + (i === top && i > 0 ? wobble : 0);
    const base = Math.round(tierBase(tiers, i));
    cx.push(x);
    cy.push(y - base - d / 2);
    drawBall(ctx, x, y - base, d, hash(s.seed, 40 + i) * 6, s.seed + i, 0, false);
  });

  const hx = cx[top];
  const hy = Math.round(cy[top]);
  const hr = tiers[top] / 2;
  const f = look.face;
  // 머리가 떨어져 나갔으면 맨 위 단이 몸통이다
  const body = s.headless ? top : Math.max(0, top - 1);
  const bx = cx[body];
  const by = Math.round(cy[body]);
  const br = tiers[body] / 2;

  // 나뭇가지 팔 (몸통에서 비스듬히 위로). 미니는 없다
  if (kind !== 'mini' && melt < 0.5) {
    ctx.fillStyle = C.twig;
    const length = kind === 'giant' ? br * 1.1 + 6 : br * 0.9 + 3;
    for (const side of [-1, 1]) {
      const x0 = bx + side * Math.round(br * 0.85);
      const y0 = by - Math.round(br * 0.2);
      // 머리가 떨어지면 깜짝 놀란 듯 팔이 살짝 들린다
      const angle = look.armAngle + (side === f ? 0.15 : 0) + (s.headless ? 0.45 : 0);
      const x1 = x0 + side * Math.cos(angle) * length;
      const y1 = y0 - Math.sin(angle) * length;
      line(ctx, x0, y0, x1, y1);
      // 끝이 갈라진 잔가지
      if (length >= 8) {
        line(ctx, x0 + side * Math.cos(angle) * length * 0.7, y0 - Math.sin(angle) * length * 0.7, x1 - side * 1, y1 - 3);
      }
    }
  }

  // 몸통 석탄 단추
  if (look.buttons > 0 && br >= 4) {
    ctx.fillStyle = C.coal;
    const size = kind === 'giant' ? 2 : 1;
    for (let k = 0; k < look.buttons; k++) {
      const t = (k + 1) / (look.buttons + 1);
      ctx.fillRect(bx + f, Math.round(by - br * 0.55 + br * 1.1 * t), size, size);
    }
  }

  // 목도리: 머리와 몸통 사이를 두르고 한쪽으로 늘어진다
  if ((look.scarf !== null || look.stripes) && top > 0 && hr >= 2 && !s.headless) {
    const neck = y - Math.round(tierBase(tiers, top)) - 1;
    const half = Math.max(2, Math.round(hr * 0.9));
    const thick = kind === 'giant' ? 3 : 2;
    const tail = Math.round(hr * 0.9) + 2;
    const tailX = hx - f * Math.round(half * 0.6);
    if (look.stripes) {
      // 같이 만든 눈사람: 만든 사람들 목도리 색이 번갈아 나오는 줄무늬
      const stripe = kind === 'giant' ? 3 : 2;
      const colorAt = (k: number) => OUTFITS[`scarf${look.stripes![Math.floor(k / stripe) % look.stripes!.length]}` as OutfitName].scarf;
      for (let k = 0; k <= half * 2; k++) {
        ctx.fillStyle = colorAt(k);
        ctx.fillRect(hx - half + k, neck - thick + 1, 1, thick);
      }
      for (let k = 0; k < tail; k++) {
        ctx.fillStyle = colorAt(k);
        ctx.fillRect(tailX, neck + k, thick, 1);
      }
    } else {
      ctx.fillStyle = C.scarves[look.scarf!];
      ctx.fillRect(hx - half, neck - thick + 1, half * 2 + 1, thick);
      ctx.fillRect(tailX, neck, thick, tail);
    }
  }

  // 얼굴: 석탄 눈 두 개, 당근 코(바라보는 쪽), 석탄 점 웃음
  if (hr >= 1.5 && !s.headless) {
    const eye = kind === 'giant' ? 2 : 1;
    const gap = Math.max(1, Math.round(hr * 0.38 * look.eyeGap));
    const faceX = hx + f * Math.round(hr * 0.2);
    const eyeY = hy - Math.max(1, Math.round(hr * 0.25));
    ctx.fillStyle = C.coal;
    ctx.fillRect(faceX - gap - (eye - 1), eyeY, eye, eye);
    ctx.fillRect(faceX + gap, eyeY, eye, eye);
    if (kind !== 'mini' && hr >= 4) {
      // 웃는 입: 양 끝이 올라간 석탄 점
      const dots = kind === 'giant' ? 5 : 3;
      const mouthY = hy + Math.round(hr * 0.45);
      for (let k = 0; k < dots; k++) {
        const off = k - (dots - 1) / 2;
        ctx.fillRect(Math.round(faceX + off * 2), mouthY - (Math.abs(off) >= (dots - 1) / 2 ? 1 : 0), 1, 1);
      }
    }
    const noseLength = kind === 'mini' ? 1 : kind === 'giant' ? Math.round(7 * look.nose) : Math.max(2, Math.round(2.5 * look.nose));
    ctx.fillStyle = C.carrot;
    if (melt > 0.3) {
      // 녹으면 코가 떨어져 바닥에 구른다
      ctx.fillRect(sx + f * Math.round(tiers[0] / 2 + 2), y - 1, noseLength, 1);
    } else {
      const noseY = hy + (kind === 'mini' ? 0 : 1);
      const x0 = f > 0 ? faceX + 1 : faceX - noseLength;
      ctx.fillRect(x0, noseY, noseLength, 1);
      if (kind === 'giant') {
        // 굵은 당근: 뿌리 쪽 절반은 2px
        const root = Math.ceil(noseLength / 2);
        ctx.fillRect(f > 0 ? faceX + 1 : faceX - root, noseY - 1, root, 1);
        ctx.fillStyle = C.carrotDark;
        ctx.fillRect(f > 0 ? faceX + 1 : faceX - 1, noseY, 1, 1);
      }
    }
  }

  // 양동이 모자
  let headTop = hy - Math.round(hr);
  // 머리에 소품(산타 모자·귀마개)을 씌워 줬으면 양동이는 벗는다
  const headProp = s.hat !== null || s.props.some((a) => PROP_SLOT[a.p] === 'head');
  if (look.bucket && !headProp && !s.headless && hr >= 3 && melt < 0.5) {
    const w = Math.max(3, Math.round(hr * 1.2));
    const h = Math.max(2, Math.round(hr * 0.8));
    ctx.fillStyle = C.bucket;
    ctx.fillRect(hx - Math.floor(w / 2), headTop - h + 2, w, h);
    ctx.fillStyle = C.bucketDark;
    ctx.fillRect(hx - Math.floor(w / 2) - 1, headTop + 1, w + 2, 1);
    ctx.fillRect(hx + Math.floor(w / 2) - 1, headTop - h + 2, 1, h);
    headTop -= h - 2;
  }
  // 달아준 노점 소품
  if (s.props.length > 0 && melt < 0.5) {
    drawAttachedProps(ctx, s.props, { hx, hy, hr, headTop, f, neckY: s.headless ? hy - Math.round(hr) + 1 : y - Math.round(tierBase(tiers, top)) - 1, bx, by, br, footY: y }, kind);
    if (s.props.some((a) => a.p === 'santaHat')) headTop -= 4 * (kind === 'mini' ? 1 : kind === 'giant' ? 3 : 2);
  }
  // 누가 씌워 준 털모자 (머리 크기에 맞춘다. 미니는 헐렁해서 눈까지 덮는다)
  if (s.hat && melt < 0.5) headTop = Math.min(headTop, drawSnowmanBeanie(ctx, s.hat, hx, hy, hr, kind === 'mini'));
  // 지붕 눈이 머리에 얹혔다
  if (s.capped && hr >= 2) {
    const w = Math.max(3, Math.round(hr * 1.3));
    ctx.fillStyle = C.top;
    ctx.fillRect(hx - Math.floor(w / 2), headTop - 1, w, 2);
    ctx.fillRect(hx - Math.floor(w / 2) + 1, headTop - 2, Math.max(1, w - 2), 1);
    headTop -= 2;
  }
  // 엄청 큰 눈사람: 가끔 작은 새가 머리에 앉았다 날아간다
  if (kind === 'giant' && melt <= 0 && !s.headless) {
    const cycle = M.birdMinGap + hash(s.seed, 9) * (M.birdMaxGap - M.birdMinGap);
    const t = (s.age % cycle) - (cycle - M.birdStay);
    if (t >= 0) {
      const leaving = Math.max(0, t - (M.birdStay - 0.7));
      const bxp = hx - 1 + Math.round(leaving * 40);
      const byp = headTop - 2 - Math.round(leaving * 45);
      ctx.fillStyle = C.bird;
      ctx.fillRect(bxp, byp, 3, 2);
      ctx.fillRect(bxp + (leaving > 0 ? -1 : 2), byp - 1, 2, 1);
      ctx.fillStyle = C.birdBelly;
      ctx.fillRect(bxp + 1, byp + 1, 1, 1);
      ctx.fillStyle = C.carrot;
      ctx.fillRect(bxp + 3, byp, 1, 1);
    }
  }
}

/** 눈덩이에 맞아 얼굴에 묻은 눈 (발밑 footX, footY인 캐릭터) */
export function drawFaceSnow(ctx: CanvasRenderingContext2D, footX: number, footY: number, facing: 'left' | 'right', lift = 0): void {
  const f = facing === 'right' ? 1 : -1;
  const x = footX + f - 3;
  const y = footY - 24 - lift;
  ctx.fillStyle = C.top;
  ctx.fillRect(x, y, 6, 4);
  ctx.fillRect(x + 1, y - 1, 3, 1);
  ctx.fillRect(x + 1 + f, y + 4, 2, 1);
}

/** 떨어진 머리 눈덩이의 얼굴: 눈·당근 코와, 붙어 간 머리·얼굴 소품, 털모자. (sx, bottom) = 눈덩이 바닥 가운데 */
export function drawBallFace(ctx: CanvasRenderingContext2D, sx: number, bottom: number, d: number, face: BallFace): void {
  const hr = d / 2;
  if (hr < 1.5) return;
  const hy = Math.round(bottom - hr);
  const kind: SnowmanKind = d <= 8 ? 'mini' : d >= 28 ? 'giant' : 'medium';
  const look = snowmanLook(face.seed, kind);
  const f = look.face;
  const eye = kind === 'giant' ? 2 : 1;
  const gap = Math.max(1, Math.round(hr * 0.38 * look.eyeGap));
  const faceX = sx + f * Math.round(hr * 0.2);
  const eyeY = hy - Math.max(1, Math.round(hr * 0.25));
  ctx.fillStyle = C.coal;
  ctx.fillRect(faceX - gap - (eye - 1), eyeY, eye, eye);
  ctx.fillRect(faceX + gap, eyeY, eye, eye);
  const noseLength = kind === 'mini' ? 1 : kind === 'giant' ? Math.round(7 * look.nose) : Math.max(2, Math.round(2.5 * look.nose));
  ctx.fillStyle = C.carrot;
  ctx.fillRect(f > 0 ? faceX + 1 : faceX - noseLength, hy + (kind === 'mini' ? 0 : 1), noseLength, 1);
  const headTop = hy - Math.round(hr);
  if (face.props && face.props.length > 0) drawAttachedProps(ctx, face.props, { hx: sx, hy, hr, headTop, f, neckY: bottom, bx: sx, by: hy, br: hr, footY: bottom }, kind);
  if (face.hat) drawSnowmanBeanie(ctx, face.hat, sx, hy, hr, kind === 'mini');
}

const drawables = new WeakMap<SnowThing, DepthDrawable>();

/** 눈덩이·눈사람을 발밑 y로 앞뒤 정렬해 그리는 것 (하나당 한 번만 만든다) */
export function drawableFor(thing: SnowThing): DepthDrawable {
  let d = drawables.get(thing);
  if (!d) {
    d = {
      get footY() {
        return thing.y;
      },
      draw(ctx, camera) {
        const sx = Math.round(thing.x) - layerOffsetX(camera, LAYER_FACTORS.main);
        const reach = (thing.kind === 'ball' ? thing.d : thing.tiers[0]) + 12;
        if (sx < -reach || sx > SCREEN_WIDTH + reach) return;
        if (thing.kind === 'ball') {
          const ball = thing as Ball;
          drawBall(ctx, sx, Math.round(ball.y), ball.d, ball.roll, ball.seed);
          // 만든 사람 수만큼 아주 작은 목도리 색 점 (누구 건지 알 수 있게)
          // 눈사람에서 떨어진 머리: 얼굴·소품·모자가 그대로 붙어 있다 (엎어져 있으면 안 보인다)
          if (ball.face && !ball.face.down) drawBallFace(ctx, sx, Math.round(ball.y), ball.d, ball.face);
          const top = Math.round(ball.y) - Math.round(ball.d) - 3;
          ball.makers.forEach((m, i) => {
            ctx.fillStyle = OUTFITS[`scarf${m.scarf}` as OutfitName].scarf;
            ctx.fillRect(sx - ball.makers.length + i * 2, top, 1, 1);
          });
        }
        else drawSnowman(ctx, sx, thing);
      },
    };
    drawables.set(thing, d);
  }
  return d;
}
