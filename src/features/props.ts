// 노점 소품: 노점에서 하나 골라 들고 다니다가 눈사람에 달아준다.
// 여기는 규칙과 그림만 (DOM 없음, 테스트 가능). 조작은 propsPlay.ts.
//
// - 소품 8가지, 저마다 붙는 자리(slot)가 정해져 있다: 머리 위(산타 모자·귀마개), 얼굴(당근 코·안경), 목(리본), 몸통(석탄 단추·호랑가지), 팔(빗자루)
// - 한 번에 하나만 든다. 새로 받으면 들고 있던 것은 노점으로 돌아간다
// - 눈사람 하나에 자리마다 하나, 모두 5개까지. 같은 자리에 이미 있으면 바꿔 달고 떼어낸 것이 손에 온다
// - 눈사람 종류(미니·중간·엄청 큼)에 맞춰 1·2·3배 크기로 그린다

import { PROPS, PROP_COLORS, type PropId } from '../constants';
import type { AttachedProp } from '../shared/protocol';
import type { SnowmanKind } from './snowman';

export type PropSlot = 'head' | 'face' | 'neck' | 'body' | 'arm';

export const PROP_SLOT: Record<PropId, PropSlot> = {
  santaHat: 'head',
  earmuffs: 'head',
  carrot: 'face',
  glasses: 'face',
  ribbon: 'neck',
  coal: 'body',
  holly: 'body',
  broom: 'arm',
};

export const PROP_NAMES: Record<PropId, string> = {
  carrot: '당근 코',
  coal: '석탄 단추',
  ribbon: '빨간 리본',
  earmuffs: '귀마개',
  glasses: '안경',
  holly: '호랑가지',
  broom: '빗자루',
  santaHat: '산타 모자',
};

/** 눈사람에 달린 소품 하나: 무엇을(p), 누가 달았나(by = 닉네임) */
export type Attached = AttachedProp;

/** 한 번에 하나만 든다: 새 소품을 받으면 들고 있던 것은 노점으로 돌아간다 */
export function takeFromStall(holding: PropId | null, prop: PropId): { holding: PropId; returned: PropId | null } {
  return { holding: prop, returned: holding };
}

/** 이 눈사람에 이 소품을 달 수 있나 (같은 자리에 있으면 바꿔 달 수 있고, 아니면 5개까지) */
export function canAttach(props: readonly Attached[], prop: PropId): boolean {
  return props.some((a) => PROP_SLOT[a.p] === PROP_SLOT[prop]) || props.length < PROPS.maxPerSnowman;
}

/**
 * 소품을 단다. 같은 자리에 이미 있으면 바꿔 달고, 떼어낸 것(removed)이 손에 온다.
 * 자리가 비어 있어도 이미 5개면 달 수 없다 (ok = false, 그대로).
 */
export function attachProp(props: readonly Attached[], prop: PropId, by: string): { props: Attached[]; removed: PropId | null; ok: boolean } {
  const slot = PROP_SLOT[prop];
  const at = props.findIndex((a) => PROP_SLOT[a.p] === slot);
  if (at >= 0) {
    const next = props.map((a) => ({ ...a }));
    const removed = next[at].p;
    next[at] = { p: prop, by };
    return { props: next, removed, ok: true };
  }
  if (props.length >= PROPS.maxPerSnowman) return { props: props.map((a) => ({ ...a })), removed: null, ok: false };
  return { props: [...props.map((a) => ({ ...a })), { p: prop, by }], removed: null, ok: true };
}

/** 눈사람 종류에 맞는 소품 크기 (픽셀 배율): 미니 1, 중간 2, 엄청 큼 3 */
export function propScale(kind: SnowmanKind): number {
  return PROPS.scale[kind];
}

/** 달아주는 몸짓: 낮으면 쪼그려 앉고, 내 키쯤이면 까치발, 머리가 한참 높으면 폴짝 뛴다 */
export function attachStyle(snowmanHeight: number): 'crouch' | 'tiptoe' | 'jump' {
  if (snowmanHeight < PROPS.crouchBelow) return 'crouch';
  return snowmanHeight < PROPS.jumpFrom ? 'tiptoe' : 'jump';
}

// ───────────── 그림 ─────────────

/** 글자 = 픽셀 (PROP_COLORS). 오른쪽을 보는 모습으로 그려 둔다. anchor = 붙는 점 (칸 좌표) */
interface PropSprite {
  rows: readonly string[];
  ax: number;
  ay: number;
}

export const PROP_SPRITES: Record<PropId, PropSprite> = {
  // 코: 얼굴에서 앞으로 뻗는다
  carrot: { rows: ['OOOo', 'Oo..'], ax: 0, ay: 0 },
  // 단추 세 개가 세로로
  coal: { rows: ['K', '.', 'K', '.', 'K'], ax: 0, ay: 2 },
  ribbon: { rows: ['RR.RR', 'RRrRR', 'RR.RR', '.r.r.'], ax: 2, ay: 1 },
  earmuffs: { rows: ['.BBB.', 'B...B', 'M...M', 'M...M'], ax: 2, ay: 2 },
  glasses: { rows: ['GGG.GGG', 'GLGGGLG', 'GGG.GGG'], ax: 3, ay: 1 },
  holly: { rows: ['d.R.d', 'ggRgg', '.g.g.'], ax: 2, ay: 1 },
  // 빗자루: 솔이 위로 가게 세운다
  broom: { rows: ['yYy', 'yyy', 'YyY', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.'], ax: 1, ay: 8 },
  santaHat: { rows: ['.....W.', '..RRRR.', '.RRRRr.', 'RRRRRRr', 'WWWWWWW'], ax: 3, ay: 4 },
};

export function propSize(prop: PropId, scale = 1): { w: number; h: number } {
  const s = PROP_SPRITES[prop];
  return { w: s.rows[0].length * scale, h: s.rows.length * scale };
}

/** 소품을 붙는 점(anchor)이 (x, y)에 오게 그린다. facing < 0이면 좌우를 뒤집는다 */
export function drawProp(ctx: CanvasRenderingContext2D, prop: PropId, x: number, y: number, scale = 1, facing = 1): void {
  const s = PROP_SPRITES[prop];
  const w = s.rows[0].length;
  let last = '';
  for (let r = 0; r < s.rows.length; r++) {
    const row = s.rows[r];
    for (let c = 0; c < w; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      if (ch !== last) {
        ctx.fillStyle = PROP_COLORS[ch as keyof typeof PROP_COLORS];
        last = ch;
      }
      const px = facing >= 0 ? x + (c - s.ax) * scale : x - (c - s.ax) * scale - (scale - 1);
      ctx.fillRect(px, y + (r - s.ay) * scale, scale, scale);
    }
  }
}

/** 소품을 가운데가 (cx, cy)에 오게 그린다 (진열대·손에 든 모습·고르는 화면) */
export function drawPropIcon(ctx: CanvasRenderingContext2D, prop: PropId, cx: number, cy: number, scale = 1, facing = 1): void {
  const s = PROP_SPRITES[prop];
  const w = s.rows[0].length;
  const h = s.rows.length;
  const left = Math.round(cx - (w * scale) / 2);
  const top = Math.round(cy - (h * scale) / 2);
  const ax = facing >= 0 ? left + s.ax * scale : left + (w - 1 - s.ax) * scale + (scale - 1);
  drawProp(ctx, prop, ax, top + s.ay * scale, scale, facing);
}

/** 손에 든 소품: 발밑 (footX, footY)인 캐릭터의 앞쪽 손에 */
export function drawHeldProp(ctx: CanvasRenderingContext2D, prop: PropId, footX: number, footY: number, facing: 'left' | 'right', lift = 0): void {
  const f = facing === 'right' ? 1 : -1;
  drawPropIcon(ctx, prop, footX + f * PROPS.handX, footY - PROPS.handY - lift, 1, f);
}

/** 눈사람에서 소품이 붙는 자리들 (화면 좌표) */
export interface SnowmanAnchors {
  /** 머리 가운데와 반지름, 머리 꼭대기 y */
  hx: number;
  hy: number;
  hr: number;
  headTop: number;
  /** 얼굴이 향한 쪽 (1 / -1) */
  f: number;
  /** 머리와 몸통 사이 */
  neckY: number;
  /** 몸통 가운데와 반지름 */
  bx: number;
  by: number;
  br: number;
  /** 바닥 */
  footY: number;
}

/** 눈사람에 달린 소품들을 그린다 */
export function drawAttachedProps(ctx: CanvasRenderingContext2D, props: readonly Attached[], a: SnowmanAnchors, kind: SnowmanKind): void {
  const s = propScale(kind);
  const faceX = a.hx + a.f * Math.round(a.hr * 0.2);
  for (const { p } of props) {
    switch (p) {
      case 'santaHat':
        drawProp(ctx, p, a.hx, a.headTop + s, s, a.f);
        break;
      case 'earmuffs': {
        // 머리 위를 넘는 띠와 양옆의 귀마개 (머리 크기에 맞춘다)
        const r = Math.round(a.hr);
        ctx.fillStyle = PROP_COLORS.B;
        ctx.fillRect(a.hx - r + 1, a.headTop - 1, r * 2 - 1, s > 1 ? 2 : 1);
        ctx.fillRect(a.hx - r, a.headTop, 1, Math.max(1, Math.round(a.hr * 0.6)));
        ctx.fillRect(a.hx + r, a.headTop, 1, Math.max(1, Math.round(a.hr * 0.6)));
        ctx.fillStyle = PROP_COLORS.M;
        const mw = s + 1;
        const mh = s * 2;
        ctx.fillRect(a.hx - r - Math.floor(mw / 2), a.hy - Math.floor(mh / 2), mw, mh);
        ctx.fillRect(a.hx + r - Math.floor(mw / 2) + 1, a.hy - Math.floor(mh / 2), mw, mh);
        break;
      }
      case 'carrot':
        drawProp(ctx, p, faceX + a.f, a.hy + (kind === 'mini' ? 0 : 1), s, a.f);
        break;
      case 'glasses':
        drawProp(ctx, p, faceX, a.hy - Math.max(1, Math.round(a.hr * 0.25)), s, a.f);
        break;
      case 'ribbon':
        drawProp(ctx, p, a.hx + a.f * Math.round(a.hr * 0.35), a.neckY, s, a.f);
        break;
      case 'coal':
        drawProp(ctx, p, a.bx + a.f, a.by, s, a.f);
        break;
      case 'holly':
        drawProp(ctx, p, a.bx - a.f * Math.round(a.br * 0.45), a.by - Math.round(a.br * 0.4), s, a.f);
        break;
      case 'broom':
        // 등 쪽 옆구리에 세워 둔다
        drawProp(ctx, p, a.bx - a.f * (Math.round(a.br * 0.95) + s), a.footY, s, a.f);
        break;
    }
  }
}
