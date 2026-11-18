import { describe, expect, it } from 'vitest';
import { PROP_IDS, PROPS } from '../constants';
import { createCharacter } from '../character/character';
import { validProps, validSnowman } from '../shared/protocol';
import { STALLS } from '../world';
import { attachProp, attachStyle, canAttach, PROP_SLOT, PROP_SPRITES, propScale, propSize, takeFromStall, type Attached } from './props';
import { createPropsPlay, stallFront } from './propsPlay';
import { createSnowWorld, snowmanKind } from './snowman';

const none = { x: 0, y: 0 };
const noActions = { tap: false, hold: false, cancel: false, up: false, debugFriend: false };
const space = { ...noActions, tap: true };
const DT = 1 / 60;

describe('노점 소품', () => {
  it('소품은 8가지이고 저마다 붙는 자리가 정해져 있다', () => {
    expect(PROP_IDS).toHaveLength(8);
    expect(PROP_SLOT.santaHat).toBe('head');
    expect(PROP_SLOT.earmuffs).toBe('head');
    expect(PROP_SLOT.carrot).toBe('face');
    expect(PROP_SLOT.glasses).toBe('face');
    expect(PROP_SLOT.ribbon).toBe('neck');
    expect(PROP_SLOT.coal).toBe('body');
    expect(PROP_SLOT.holly).toBe('body');
    expect(PROP_SLOT.broom).toBe('arm');
    // 그림은 모든 줄 길이가 같다
    for (const id of PROP_IDS) expect(new Set(PROP_SPRITES[id].rows.map((r) => r.length)).size).toBe(1);
  });

  it('노점마다 2~3개씩 다르게 놓여 있고, 모든 소품이 어딘가에 있다', () => {
    for (const stall of STALLS) {
      expect(stall.props.length).toBeGreaterThanOrEqual(2);
      expect(stall.props.length).toBeLessThanOrEqual(3);
    }
    expect(new Set(STALLS.flatMap((s) => s.props)).size).toBe(PROP_IDS.length);
    expect(new Set(STALLS.map((s) => s.props.join())).size).toBe(STALLS.length);
  });

  it('한 번에 하나만 든다: 새로 받으면 들고 있던 것은 노점으로 돌아간다', () => {
    expect(takeFromStall(null, 'carrot')).toEqual({ holding: 'carrot', returned: null });
    expect(takeFromStall('carrot', 'broom')).toEqual({ holding: 'broom', returned: 'carrot' });
  });

  it('자리마다 하나: 같은 자리에 달면 바뀌고 떼어낸 것이 손에 온다', () => {
    let props: Attached[] = [];
    let r = attachProp(props, 'carrot', '산타');
    expect(r).toMatchObject({ ok: true, removed: null });
    props = r.props;
    r = attachProp(props, 'glasses', '루돌프');
    expect(r).toMatchObject({ ok: true, removed: 'carrot' });
    expect(r.props).toEqual([{ p: 'glasses', by: '루돌프' }]);
    // 다른 자리는 그대로 더해진다
    expect(attachProp(r.props, 'broom', '산타').props).toHaveLength(2);
  });

  it('눈사람 하나에 5개까지', () => {
    let props: Attached[] = [];
    for (const p of ['santaHat', 'carrot', 'ribbon', 'coal', 'broom'] as const) props = attachProp(props, p, 'a').props;
    expect(props).toHaveLength(PROPS.maxPerSnowman);
    // 꽉 차도 같은 자리는 바꿔 달 수 있다
    const swapped = attachProp(props, 'earmuffs', 'b');
    expect(swapped).toMatchObject({ ok: true, removed: 'santaHat' });
    expect(swapped.props).toHaveLength(5);
    // 한도를 넘는 목록, 없는 소품은 서버가 받지 않는다
    expect(validProps([...props, { p: 'holly', by: 'a' }])).toBe(false);
    expect(validProps(props)).toBe(true);
    expect(validProps([{ p: 'sword', by: 'a' }])).toBe(false);
    expect(validSnowman({ x: 500, y: 240, tiers: [20, 12], seed: 1, owner: 'a', props })).toBe(true);
    // 자리가 비어 있어도 이미 5개면 못 단다
    const full: Attached[] = [...props.slice(0, 4), { p: 'holly', by: 'a' }];
    expect(full.map((a) => PROP_SLOT[a.p])).not.toContain('arm');
    expect(canAttach(full, 'broom')).toBe(false);
    expect(attachProp(full, 'broom', 'a')).toMatchObject({ ok: false, removed: null });
  });

  it('소품 크기는 눈사람 종류를 따른다: 미니 1배, 중간 2배, 엄청 큼 3배', () => {
    expect(propScale(snowmanKind(18))).toBe(1);
    expect(propScale(snowmanKind(40))).toBe(2);
    expect(propScale(snowmanKind(80))).toBe(3);
    expect(propSize('santaHat', 3).w).toBe(propSize('santaHat', 1).w * 3);
    // 달아주는 몸짓: 낮으면 쪼그려 앉고, 높으면 폴짝 뛴다
    expect(attachStyle(16)).toBe('crouch');
    expect(attachStyle(30)).toBe('tiptoe');
    expect(attachStyle(70)).toBe('jump');
  });

  it('노점에서 고르고 받아 눈사람에 달아준다', () => {
    const front = stallFront(3);
    const ch = createCharacter(front.x, front.y);
    const world = createSnowWorld(() => 0.5);
    const puts: number[] = [];
    const play = createPropsPlay(ch, world, { me: () => '산타', put: (s) => puts.push(s.props.length) });
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += DT) play.update(DT, none, noActions);
    };
    expect(play.nearestStall()).toMatchObject({ index: 3, distance: 0 });
    play.open(3);
    expect(play.phase).toBe('browse');
    // → 한 번: 두 번째 소품
    play.update(DT, { x: 1, y: 0 }, noActions);
    play.update(DT, none, noActions);
    play.update(DT, none, space);
    run(PROPS.takeSeconds + 0.1);
    expect(play.holding).toBe(STALLS[3].props[1]);
    // 다시 받으면 바뀐다 (들고 있던 것은 돌아간다)
    play.open(3);
    play.update(DT, none, space);
    run(PROPS.takeSeconds + 0.1);
    expect(play.holding).toBe(STALLS[3].props[0]);
    expect(play.ground).toHaveLength(0);
    // Esc로 닫는다
    play.open(3);
    play.update(DT, none, { ...noActions, cancel: true });
    expect(play.phase).toBe('idle');

    // 눈사람에 달아준다
    ch.y += 40;
    const snowman = world.addSnowman(ch.x + 20, ch.y, [24, 16], 'me');
    expect(play.nearestSnowman()?.snowman).toBe(snowman);
    expect(play.decorate(snowman)).toBe(true);
    run(PROPS.attachSeconds + 0.1);
    expect(snowman.props).toEqual([{ p: STALLS[3].props[0], by: '산타' }]);
    expect(play.holding).toBeNull();
    expect(puts).toEqual([1]);
    expect(play.nearestSnowman()).toBeNull();
  });

  it('눈 굴리기·재채기 때는 내려놓고, 바닥의 소품은 다시 줍는다', () => {
    const ch = createCharacter(620, 236);
    const play = createPropsPlay(ch, createSnowWorld(() => 0.5), { me: () => '산타' });
    ch.holding.set('broom');
    play.putDown();
    expect(play.holding).toBeNull();
    expect(play.ground.map((g) => g.prop)).toEqual(['broom']);
    // 다른 것을 든 채 주우면 바꿔 든다
    ch.holding.set('carrot');
    play.pickUp(play.nearestGround()!.item);
    expect(play.holding).toBe('broom');
    expect(play.ground.map((g) => g.prop)).toEqual(['carrot']);
    play.putDown(true);
    expect(play.ground).toHaveLength(2);
  });
});
