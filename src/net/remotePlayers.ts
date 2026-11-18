// 같은 광장에 들어와 있는 친구들. 서버가 전해 준 위치·상태·한 번짜리 동작으로 내 화면에 그린다.
// 위치는 받은 것 사이를 부드럽게 이어서, 100ms 뒤따라 그린다. 재채기·눈사람·점프·스핀·넘어짐·손 흔들기도 같은 연출로 나온다.

import { layerOffsetX } from '../camera';
import { createCharacter, type Character } from '../character/character';
import { drawCharacter } from '../character/render';
import { BENCH_SIT, CAROUSEL, COPUSH, FOOTPRINTS, LAYER_FACTORS, NET, ROOF_SNOW_COLORS, SCREEN_WIDTH, SKATE, type OutfitName, type PropId } from '../constants';
import { drawHeldProp } from '../features/props';
import { drawFaceSnow } from '../features/snowmanDraw';
import { createSnowHits, type SnowHits } from '../features/roofSnow';
import { createHat, createSneeze, type Hat, type Sneeze } from '../features/sneeze';
import type { Act, ServerMessage, WireHat, WirePlayer, WireState } from '../shared/protocol';
import { syncToSeat, type Occupant, type Seats } from '../zones/carouselRide';
import type { DepthDrawable } from '../zones/zone';

interface Sample {
  t: number;
  x: number;
  y: number;
  f: 0 | 1;
  vx: number;
  vy: number;
}

export interface Remote {
  info: WirePlayer;
  /** 그리는 데 쓰는 캐릭터 (내 캐릭터와 같은 그림·자세) */
  ch: Character;
  /** 회전목마 자리에 앉힐 때 쓰는 모습 */
  occupant: Occupant;
  samples: Sample[];
  sneeze: Sneeze;
  hits: SnowHits;
  hat: Hat;
  fallLeft: number;
  /** 점프한 뒤 지난 시간 (안 뛰는 중이면 -1) */
  jump: number;
  spinning: boolean;
  /** 두 손을 들고 있는 남은 시간 (하이파이브) */
  cheerLeft: number;
  /** 마지막 발자국 뒤로 걸은 거리 */
  walked: number;
  /** 눈덩이에 맞아 얼굴에 눈이 묻어 있는 남은 시간 */
  faceSnow: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

const PUFF_LIFE = 0.7;

export function outfitOf(scarf: number): OutfitName {
  return `scarf${Math.max(0, Math.min(NET.scarves - 1, Math.floor(scarf)))}` as OutfitName;
}

/** 받은 위치 사이를 이어 그릴 자리 (renderTime = 지금보다 조금 전) */
export function samplePosition(samples: readonly Sample[], renderTime: number): { x: number; y: number; f: 0 | 1 } | null {
  if (samples.length === 0) return null;
  const last = samples[samples.length - 1];
  if (renderTime >= last.t) {
    // 마지막으로 받은 뒤: 스케이트 중이면 받은 속도로 잠깐 미끄러진다
    const ahead = Math.min(0.3, renderTime - last.t);
    return { x: last.x + last.vx * ahead, y: last.y + last.vy * ahead, f: last.f };
  }
  for (let i = samples.length - 2; i >= 0; i--) {
    const a = samples[i];
    if (a.t > renderTime) continue;
    const b = samples[i + 1];
    const k = (renderTime - a.t) / Math.max(1e-6, b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, f: b.f };
  }
  return { x: samples[0].x, y: samples[0].y, f: samples[0].f };
}

export interface RemotePlayers {
  readonly count: number;
  get(id: string): Remote | undefined;
  all(): Iterable<Remote>;
  /** 들어왔다 (puff = 눈가루가 포슬 하며 나타난다) */
  add(player: WirePlayer, now: number, puff: boolean): void;
  remove(id: string): void;
  clear(): void;
  /** 서버가 전해 준 위치·상태·동작 */
  handle(message: ServerMessage, now: number): void;
  update(dt: number, now: number): void;
  /** 발밑 y로 앞뒤 정렬해 그릴 것들 (사람이 들고 날 때마다 바뀐다) */
  drawables(): readonly DepthDrawable[];
  /** 머리 위 닉네임 자리 (내부 해상도 화면 좌표) */
  names(offsetX: number): { id: string; name: string; sx: number; sy: number }[];
}

export function createRemotePlayers(seats: Seats, rideTime: () => number, onStep?: (x: number, y: number, dx: number, dy: number) => void): RemotePlayers {
  const remotes = new Map<string, Remote>();
  const puffs: Puff[] = [];
  let list: DepthDrawable[] = [];

  const puffAt = (x: number, y: number) => {
    for (let i = 0; i < NET.puffCount; i++) {
      const a = Math.random() * Math.PI * 2;
      puffs.push({ x: x + (Math.random() - 0.5) * 8, y: y - 6 - Math.random() * 20, vx: Math.cos(a) * 14, vy: Math.sin(a) * 10 - 10, age: 0 });
    }
  };

  const applyState = (r: Remote, state: WireState, hat: WireHat, animate: boolean, hold: PropId | null = null, hc: number | null = null, ho: string | null = null) => {
    r.info.state = state;
    r.info.hat = hat;
    r.info.hold = hold;
    r.info.hc = hc;
    r.info.ho = ho;
    // 털모자 색: 따로 없으면 자기 목도리 색
    r.ch.hatColor = hc ?? r.info.scarf;
    r.ch.hatOwner = ho;
    r.occupant.hatColor = r.ch.hatColor;
    r.ch.state.set(state.kind === 'skating' ? { kind: 'skating', vx: 0, vy: 0 } : state);
    if (state.kind !== 'skating') {
      r.spinning = false;
      r.jump = -1;
      r.fallLeft = 0;
    }
    if (hat === 'on') {
      if (!r.hat.on) r.hat.putOn();
    } else if (hat === 'onSnowman') r.hat.giveAway();
    else if (r.hat.on && animate) r.hat.flyTo({ x: r.ch.x, y: r.ch.y }, hat);
    else r.hat.placeAt(hat);
  };

  const bodyOf = (r: Remote): DepthDrawable => ({
    get footY() {
      return r.ch.y;
    },
    draw(ctx, camera) {
      const kind = r.info.state.kind;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      const footX = Math.round(r.ch.x) - ox;
      if (footX < -30 || footX > SCREEN_WIDTH + 30) return;
      const footY = Math.round(r.ch.y);
      // 회전목마에 탄 친구는 회전목마가 탈 것과 함께 그린다
      if (kind !== 'riding') {
        if (r.hits.snowman) r.hits.drawSnowman(ctx, footX, footY);
        else if (kind === 'sitting') drawCharacter(ctx, r.ch, ox, { pose: 'sit', lift: BENCH_SIT.lift, shadow: false });
        else if (kind === 'skating') {
          if (r.fallLeft > 0) drawCharacter(ctx, r.ch, ox, { pose: 'crouch' });
          else if (r.spinning) {
            const flip = Math.floor(performance.now() / 1000 / SKATE.spinFlipSeconds) % 2 === 0;
            drawCharacter(ctx, r.ch, ox, { pose: 'glide', index: 1, facing: flip ? 'right' : 'left' });
          } else {
            const lift = r.jump >= 0 ? SKATE.jumpHeight * Math.sin((Math.PI * r.jump) / SKATE.jumpSeconds) : 0;
            drawCharacter(ctx, r.ch, ox, { pose: 'skateGlide', lift });
          }
        } else if (r.cheerLeft > 0) drawCharacter(ctx, r.ch, ox, { pose: 'cheer', index: 0 });
        else drawCharacter(ctx, r.ch, ox);
        if (r.faceSnow > 0 && !r.hits.snowman) drawFaceSnow(ctx, footX, footY, r.ch.facing, kind === 'sitting' ? BENCH_SIT.lift : 0);
        // 손에 든 노점 소품
        if (r.info.hold && kind !== 'skating' && !r.hits.snowman) drawHeldProp(ctx, r.info.hold, footX, footY, r.ch.facing, kind === 'sitting' ? BENCH_SIT.lift : 0);
        r.hits.drawOver(ctx, footX, footY, ox);
      }
      r.sneeze.draw(ctx, ox);
    },
  });

  const puffLayer: DepthDrawable = {
    footY: 9000,
    draw(ctx, camera) {
      if (puffs.length === 0) return;
      const ox = layerOffsetX(camera, LAYER_FACTORS.main);
      ctx.fillStyle = ROOF_SNOW_COLORS.dust;
      for (const p of puffs) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / PUFF_LIFE);
        ctx.fillRect(Math.round(p.x) - ox, Math.round(p.y), 1, 1);
      }
      ctx.globalAlpha = 1;
    },
  };

  const rebuild = () => {
    list = [puffLayer];
    for (const r of remotes.values()) list.push(bodyOf(r), r.hat);
  };
  rebuild();

  const act = (r: Remote, a: Act) => {
    if (a === 'sneeze') r.sneeze.start();
    else if (a === 'snowman') r.hits.handle([{ type: 'snowman', id: r.info.id, x: r.ch.x, y: r.ch.y, afterHat: false }], r.info.id);
    else if (a === 'fall') r.fallLeft = SKATE.fallSeconds;
    else if (a === 'jump') r.jump = 0;
    else if (a === 'spin') r.spinning = true;
    else if (a === 'spinEnd') r.spinning = false;
    else if (a === 'wave') r.occupant.waveLeft = CAROUSEL.waveSeconds;
    else if (a === 'highfive' || a === 'cheer' || a === 'decorate') r.cheerLeft = COPUSH.highFiveSeconds;
  };

  return {
    get count() {
      return remotes.size;
    },
    get: (id) => remotes.get(id),
    all: () => remotes.values(),
    add(player, now, puff) {
      const ch = createCharacter(player.x, player.y, outfitOf(player.scarf));
      ch.facing = player.f ? 'right' : 'left';
      const r: Remote = {
        info: { ...player },
        ch,
        occupant: { id: player.id, outfit: ch.outfit, waveLeft: 0, bald: false },
        samples: [{ t: now, x: player.x, y: player.y, f: player.f, vx: 0, vy: 0 }],
        sneeze: createSneeze(),
        hits: createSnowHits(),
        hat: createHat(ch),
        fallLeft: 0,
        jump: -1,
        spinning: false,
        cheerLeft: 0,
        walked: 0,
        faceSnow: 0,
      };
      remotes.set(player.id, r);
      applyState(r, player.state, player.hat, false, player.hold ?? null, player.hc ?? null, player.ho ?? null);
      if (puff) puffAt(player.x, player.y);
      rebuild();
    },
    remove(id) {
      const r = remotes.get(id);
      if (!r) return;
      puffAt(r.ch.x, r.ch.y);
      remotes.delete(id);
      rebuild();
    },
    clear() {
      remotes.clear();
      rebuild();
    },
    handle(message, now) {
      if (message.t !== 'pos' && message.t !== 'state' && message.t !== 'act') return;
      const r = remotes.get(message.id);
      if (!r) return;
      if (message.t === 'pos') {
        r.samples.push({ t: now, x: message.x, y: message.y, f: message.f, vx: message.vx ?? 0, vy: message.vy ?? 0 });
        if (r.samples.length > 12) r.samples.shift();
      } else if (message.t === 'state') applyState(r, message.state, message.hat, true, message.hold ?? null, message.hc ?? null, message.ho ?? null);
      else act(r, message.a);
    },
    update(dt, now) {
      for (let k = puffs.length - 1; k >= 0; k--) {
        const p = puffs[k];
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.age >= PUFF_LIFE) puffs.splice(k, 1);
      }
      for (const r of remotes.values()) {
        const ch = r.ch;
        if (r.info.state.kind === 'riding') {
          // 자리는 서버가 정한 배열에서: 탈 것을 따라 움직인다
          syncToSeat(ch, seats, r.info.id, rideTime());
          ch.moving = false;
        } else {
          const p = samplePosition(r.samples, now - NET.renderDelay);
          if (p) {
            const moved = Math.hypot(p.x - ch.x, p.y - ch.y);
            // 걸은 거리만큼 발자국을 남긴다 (한 번에 멀리 옮겨지면 찍지 않는다)
            if (r.info.state.kind !== 'walk' || moved > FOOTPRINTS.stride) r.walked = 0;
            else if (moved > 0) {
              r.walked += moved;
              if (r.walked >= FOOTPRINTS.stride) {
                r.walked = 0;
                onStep?.(p.x, p.y, p.x - ch.x, p.y - ch.y);
              }
            }
            ch.x = p.x;
            ch.y = p.y;
            ch.facing = p.f ? 'right' : 'left';
            const moving = moved > 0.02;
            if (moving !== ch.moving) {
              ch.moving = moving;
              ch.animTime = 0;
            }
          }
        }
        ch.animTime += dt;
        if (r.sneeze.update(dt)) r.sneeze.burst(ch.x, ch.y, ch.facing);
        ch.lean = r.sneeze.lean(ch.facing);
        r.faceSnow = Math.max(0, r.faceSnow - dt);
        ch.eyesClosed = r.sneeze.active || r.faceSnow > 0;
        r.hat.update(dt);
        r.hits.follow(ch.x, ch.y);
        r.hits.update(dt);
        r.fallLeft = Math.max(0, r.fallLeft - dt);
        r.cheerLeft = Math.max(0, r.cheerLeft - dt);
        if (r.jump >= 0) {
          r.jump += dt;
          if (r.jump >= SKATE.jumpSeconds) r.jump = -1;
        }
        r.occupant.bald = !r.hat.on;
      }
    },
    drawables: () => list,
    names(offsetX) {
      const out: { id: string; name: string; sx: number; sy: number }[] = [];
      for (const r of remotes.values()) {
        const lift = r.info.state.kind === 'riding' ? CAROUSEL.riderAboveSeat - 30 : 0;
        out.push({ id: r.info.id, name: r.info.name, sx: r.ch.x - offsetX, sy: r.ch.y - NET.nameAbove - lift });
      }
      return out;
    },
  };
}
