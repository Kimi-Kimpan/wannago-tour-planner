// 매출 계산식 테스트 (더미 숫자. 실제 상품의 비용·가격은 저장소에 넣지 않음)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costTotals, pnl, pnlGrid } from './finance.ts';
import type { CostItem } from './types.ts';

test('20명 · 참가비 200만 · 변동비 100만 · 고정비 1,000만 · 수수료 2.5% → 이익 900만, 마진 22.5%', () => {
  const r = pnl({ pax: 20, price: 2_000_000, v: 1_000_000, f: 10_000_000, r: 0.025 });
  assert.equal(r.revenue, 40_000_000);
  assert.equal(r.total_cost, 31_000_000);
  assert.equal(r.profit, 9_000_000);
  assert.equal(r.margin, 0.225);
});

test('손익분기 인원: 10,000,000 ÷ (2,000,000×0.975 − 1,000,000) = 10.5 → 11명', () => {
  assert.equal(pnl({ pax: 20, price: 2_000_000, v: 1_000_000, f: 10_000_000, r: 0.025 }).breakeven_pax, 11);
  assert.equal(pnl({ pax: 10, price: 1_000_000, v: 1_000_000, f: 1, r: 0.025 }).breakeven_pax, null);
});

test('표: 참가비 3 × 인원 3', () => {
  assert.equal(pnlGrid([1, 2, 3], [10, 16, 22], 0, 0, 0).length, 9);
});

test('통화 환산: EUR 60 × 7 × 1,500 + KRW 370,000 = 1인 변동비 1,000,000', () => {
  const items: CostItem[] = [
    { position: 1, label: '숙박', kind: 'per_person', currency: 'EUR', amount: 60, quantity: 7, note: '' },
    { position: 2, label: '보험·예비', kind: 'per_person', currency: 'KRW', amount: 370_000, quantity: 1, note: '' },
    { position: 3, label: '고정비', kind: 'fixed', currency: 'KRW', amount: 10_000_000, quantity: 1, note: '' },
  ];
  assert.deepEqual(costTotals(items, { KRW: 1, EUR: 1500 }), { perPersonKrw: 1_000_000, fixedKrw: 10_000_000 });
  assert.throws(() => costTotals([{ ...items[0], currency: 'CZK' }], { KRW: 1 }));
});
