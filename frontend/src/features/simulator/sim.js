import { PRODUCTS, BASE } from '../recommend/products';

const f1 = (n) => Math.round(n * 10) / 10;
const sign = (n) => (n > 0 ? '+' : '') + f1(n);

export function getEquipped(ids) {
  return ids.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean);
}

export function sumEffects(ids) {
  const eq = getEquipped(ids);
  const sum = (k) => eq.reduce((a, p) => a + p.eff[k], 0);
  return { cash: sum('cash'), interest: sum('interest'), debt: sum('debt'), credit: sum('credit') };
}

// baseCash: 진단에서 넘어온 실제 월 순수익(만원). 미지정 시 데모 기본값 사용.
export function buildSimRows(ids, baseCash = BASE.cash) {
  const d = sumEffects(ids);
  const mk = (name, before, delta, unit, goodUp) => {
    const good = delta === 0 ? null : goodUp ? delta > 0 : delta < 0;
    return {
      name,
      before: f1(before) + unit,
      after: f1(before + delta) + unit,
      delta: delta === 0 ? '변화 없음' : sign(delta) + unit,
      strike: delta === 0 ? 'none' : 'line-through',
      deltaColor: good === null ? '#B9B0A4' : good ? '#5E8A3E' : '#D0564C',
      deltaColorDark: good === null ? '#8A8178' : good ? '#A8D284' : '#F0968C',
      deltaBg: good === null ? '#F5EFE3' : good ? '#EDF5E1' : '#FDE8E6',
    };
  };
  return [
    mk('월 현금흐름', baseCash, d.cash, '만원', true),
    mk('월 이자 부담', BASE.interest, d.interest, '만원', false),
    mk('부채비율', BASE.debt, d.debt, '%', false),
    mk('신용점수', BASE.credit, d.credit, '점', true),
  ];
}

export { sign, f1 };