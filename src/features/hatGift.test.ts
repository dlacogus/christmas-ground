import { describe, expect, it } from 'vitest';
import { createCharacter } from '../character/character';
import { HAT_GIFT } from '../constants';
import { validHat, validSnowman } from '../shared/protocol';
import { canGiveHat, createHatGift, giveHat, hatOnEntry, takeKind } from './hatGift';
import { createPropsPlay } from './propsPlay';
import { createHat } from './sneeze';
import { createSnowWorld } from './snowman';

const DT = 1 / 60;

function setup(name = '산타', scarf = 1) {
  const ch = createCharacter(620, 236);
  ch.hatColor = scarf;
  const hat = createHat(ch, () => 0.5);
  const world = createSnowWorld(() => 0.5);
  const puts: string[] = [];
  const gift = createHatGift(ch, hat, world, { me: () => ({ name, scarf }), put: (s) => puts.push(s.hat ? s.hat.name : '-') });
  const snowman = world.addSnowman(ch.x + 20, ch.y, [24, 16], 'me');
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) gift.update(DT);
  };
  return { ch, hat, world, gift, snowman, puts, run };
}

describe('내 털모자 씌워주기', () => {
  it('모자를 쓰고 있고 손이 비어 있을 때만 씌워줄 수 있다', () => {
    expect(canGiveHat('on', null)).toBe(true);
    expect(canGiveHat('on', 'carrot')).toBe(false);
    expect(canGiveHat({ x: 1, y: 2 }, null)).toBe(false);
    expect(canGiveHat('onSnowman', null)).toBe(false);

    const { ch, gift, snowman } = setup();
    expect(gift.nearestToGive()?.snowman).toBe(snowman);
    ch.holding.set('broom');
    expect(gift.nearestToGive()).toBeNull();
    expect(gift.give(snowman)).toBe(false);
  });

  it('씌워주면 바로 대머리가 되고, 눈사람이 내 모자(닉네임·색)를 쓴다', () => {
    const { ch, hat, gift, snowman, puts, run } = setup('산타', 1);
    expect(gift.give(snowman)).toBe(true);
    // 즉시 대머리
    expect(ch.hat.get()).toBe('onSnowman');
    expect(hat.on).toBe(false);
    expect(hat.lying).toBe(false);
    run(HAT_GIFT.giveSeconds + HAT_GIFT.shiverSeconds + 0.1);
    expect(snowman.hat).toEqual({ name: '산타', color: 1 });
    expect(puts).toEqual(['산타']);
    expect(gift.busy).toBe(false);
    // 재채기해도 날아갈 모자가 없다
    hat.launch({ x: ch.x, y: ch.y }, 'right', { kind: 'ground' });
    expect(ch.hat.get()).toBe('onSnowman');
    // 서버가 받는 형식
    expect(validHat('onSnowman')).toBe(true);
    expect(validSnowman({ x: 500, y: 240, tiers: [20, 12], seed: 1, owner: 'a', hat: snowman.hat })).toBe(true);
    expect(validSnowman({ x: 500, y: 240, tiers: [20, 12], seed: 1, owner: 'a', hat: { name: '', color: 9 } })).toBe(false);
  });

  it('이미 모자가 있으면 바꾼다: 다른 사람 털모자는 내가 쓰고, 노점 모자는 내 손에 온다', () => {
    const swapped = giveHat({ hat: { name: '루돌프', color: 3 }, props: [{ p: 'carrot', by: 'a' }] }, { name: '산타', color: 1 });
    expect(swapped.hat).toEqual({ name: '산타', color: 1 });
    expect(swapped.wear).toEqual({ name: '루돌프', color: 3 });
    expect(swapped.hold).toBeNull();
    expect(swapped.props).toHaveLength(1);
    const withProp = giveHat({ hat: null, props: [{ p: 'santaHat', by: 'a' }, { p: 'carrot', by: 'a' }] }, { name: '산타', color: 1 });
    expect(withProp.hold).toBe('santaHat');
    expect(withProp.wear).toBeNull();
    expect(withProp.props.map((a) => a.p)).toEqual(['carrot']);

    // 실제 조작: 루돌프 모자를 쓴 눈사람에 내 모자를 씌우면 내가 루돌프 모자(색)를 쓴다
    const { ch, gift, snowman, run } = setup('산타', 1);
    snowman.hat = { name: '루돌프', color: 3 };
    gift.give(snowman);
    run(HAT_GIFT.giveSeconds + 0.1);
    expect(snowman.hat).toEqual({ name: '산타', color: 1 });
    expect(ch.hat.get()).toBe('on');
    expect(ch.hatColor).toBe(3);
    expect(ch.hatOwner).toBe('루돌프');
  });

  it("'돌려받기'는 내 모자만 — 남의 모자는 '가져가기'이고 그 사람 모자 색을 쓴다", () => {
    expect(takeKind('onSnowman', { name: '산타', color: 1 }, '산타')).toBe('back');
    expect(takeKind('onSnowman', { name: '루돌프', color: 3 }, '산타')).toBe('take');
    // 모자를 쓰고 있으면 가져올 수 없고, 모자 없는 눈사람에서도 못 가져온다
    expect(takeKind('on', { name: '산타', color: 1 }, '산타')).toBeNull();
    expect(takeKind('onSnowman', null, '산타')).toBeNull();

    const { ch, gift, snowman, run } = setup('산타', 1);
    gift.give(snowman);
    run(HAT_GIFT.giveSeconds + HAT_GIFT.shiverSeconds + 0.1);
    expect(gift.nearestToTake()).toMatchObject({ kind: 'back' });
    expect(gift.take(snowman)).toBe(true);
    run(HAT_GIFT.takeSeconds + 0.1);
    expect(ch.hat.get()).toBe('on');
    expect(ch.hatColor).toBe(1);
    expect(ch.hatOwner).toBeNull();
    expect(snowman.hat).toBeNull();

    // 남의 모자 가져가기
    const other = setup('루돌프', 3);
    other.snowman.hat = { name: '산타', color: 1 };
    other.hat.giveAway();
    expect(other.gift.nearestToTake()).toMatchObject({ kind: 'take' });
    other.gift.take(other.snowman);
    other.run(HAT_GIFT.takeSeconds + 0.1);
    expect(other.ch.hatColor).toBe(1);
    expect(other.ch.hatOwner).toBe('산타');
  });

  it('다시 들어오면 새 모자를 쓰고 온다 (눈사람에게 준 모자는 남는다)', () => {
    expect(hatOnEntry(4)).toEqual({ hat: 'on', color: 4, owner: null });
  });

  it('털모자를 쓴 눈사람에는 노점 머리 소품을 달 수 없다', () => {
    const { ch, world, snowman } = setup();
    const props = createPropsPlay(ch, world, { me: () => '산타' });
    ch.holding.set('santaHat');
    expect(props.nearestSnowman()?.snowman).toBe(snowman);
    snowman.hat = { name: '루돌프', color: 3 };
    expect(props.nearestSnowman()).toBeNull();
    ch.holding.set('carrot');
    expect(props.nearestSnowman()?.snowman).toBe(snowman);
  });
});
