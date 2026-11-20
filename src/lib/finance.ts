// 매출 계산식 (DB 함수 public.tour_pnl과 같은 식. 화면 표시는 DB 함수 결과를 쓰고,
// 이 파일은 테스트와 입력 중 미리보기용입니다. 숫자 자체는 코드에 두지 않아요.)
//   이익 = N·P − (N·V + F + N·P·r),  마진율 = 이익 / (N·P)
import type { CostItem, PnlRow } from './types';

export interface CostTotals {
  perPersonKrw: number; // V
  fixedKrw: number; // F
}

export function toKrw(item: Pick<CostItem, 'amount' | 'quantity' | 'currency'>, fx: Record<string, number>): number {
  const rate = item.currency === 'KRW' ? 1 : fx[item.currency];
  if (rate === undefined || rate === null || Number.isNaN(rate)) {
    throw new Error(`환율이 없는 통화: ${item.currency}`);
  }
  return item.amount * item.quantity * rate;
}

export function costTotals(items: CostItem[], fx: Record<string, number>): CostTotals {
  let v = 0;
  let f = 0;
  for (const it of items) {
    const krw = toKrw(it, fx);
    if (it.kind === 'per_person') v += krw;
    else f += krw;
  }
  return { perPersonKrw: Math.round(v), fixedKrw: Math.round(f) };
}

export function pnl(params: { pax: number; price: number; v: number; f: number; r: number }): PnlRow {
  const { pax: n, price: p, v, f, r } = params;
  const revenue = n * p;
  const totalCost = n * v + f + n * p * r;
  const profit = revenue - totalCost;
  const denom = p * (1 - r) - v;
  return {
    price: p,
    pax: n,
    revenue: Math.round(revenue),
    total_cost: Math.round(totalCost),
    profit: Math.round(profit),
    margin: revenue === 0 ? null : Math.round((profit / revenue) * 10000) / 10000,
    breakeven_pax: denom <= 0 ? null : Math.ceil(f / denom),
  };
}

export function pnlGrid(prices: number[], paxes: number[], v: number, f: number, r: number): PnlRow[] {
  const rows: PnlRow[] = [];
  for (const price of prices) for (const pax of paxes) rows.push(pnl({ pax, price, v, f, r }));
  return rows;
}

export function defaultPax(minPax: number): number[] {
  return [minPax, minPax + 6, minPax + 12];
}

export const won = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : `${Math.round(n).toLocaleString('ko-KR')}원`;

export const manwon = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : `${(Math.round(n / 10000)).toLocaleString('ko-KR')}만 원`;

export const pct = (m: number | null | undefined) =>
  m === null || m === undefined ? '–' : `${(m * 100).toFixed(1)}%`;
