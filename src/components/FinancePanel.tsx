// 매출 계산 (관리자 + 2단계 인증 전용). 숫자는 Supabase에서만 읽고 쓰며, 이익·마진은 DB 함수 tour_pnl이 계산.
import { useEffect, useMemo, useState } from 'react';
import { costTotalsRpc, getCosts, getPricing, pnlRpc, replaceCosts, savePricing } from '../lib/api';
import { costTotals, defaultPax, manwon, pct, toKrw, won } from '../lib/finance';
import type { CostItem, CostKind, PnlRow, Pricing } from '../lib/types';

export const FINANCE_DISCLAIMER = '빠진 것: 부가세, 마케팅비, 환차손';

export default function FinancePanel({
  tourId,
  fx,
  minPax,
  nights,
  routeDirty,
}: {
  tourId: string;
  fx: Record<string, number>;
  minPax: number;
  nights: number; // 편집 중인 루트의 총 박수
  routeDirty: boolean; // 루트에 저장 안 한 변경이 있는지
}) {
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [pricing, setPricing] = useState<Pricing>({ price_options: [], pax_options: [], fee_rate: 0.025 });
  const [rows, setRows] = useState<PnlRow[]>([]);
  const [totals, setTotals] = useState<{ per_person_krw: number; fixed_krw: number; fee_rate: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [c, p] = await Promise.all([getCosts(tourId), getPricing(tourId)]);
      setCosts(c.map((x) => ({ ...x, amount: Number(x.amount), quantity: Number(x.quantity) })));
      if (p)
        setPricing({
          price_options: p.price_options.map(Number),
          pax_options: p.pax_options.map(Number),
          fee_rate: Number(p.fee_rate),
        });
      await calc();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function calc() {
    const [t, r] = await Promise.all([costTotalsRpc(tourId), pnlRpc(tourId)]);
    setTotals(t);
    setRows(r);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  // 루트를 저장하면(박수가 바뀌었을 수 있으니) DB 계산을 다시 불러옴
  useEffect(() => {
    if (!routeDirty) void calc().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDirty]);

  // 입력 중 미리보기(저장 전). 저장 후에는 DB 함수 결과로 표를 다시 그림
  const preview = useMemo(() => {
    try {
      return costTotals(costs, fx, nights);
    } catch (e) {
      return (e as Error).message;
    }
  }, [costs, fx, nights]);

  const setCost = (i: number, patch: Partial<CostItem>) => {
    setCosts(costs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    setDirty(true);
  };
  const addCost = (kind: CostKind) => {
    setCosts([...costs, { position: costs.length + 1, label: '', kind, currency: 'KRW', amount: 0, quantity: 1, note: '' }]);
    setDirty(true);
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await replaceCosts(tourId, costs);
      await savePricing(tourId, {
        ...pricing,
        price_options: pricing.price_options.filter((p) => p > 0),
        pax_options: pricing.pax_options.filter((p) => p > 0),
      });
      await calc();
      setDirty(false);
      setMsg('저장하고 다시 계산했어요.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const prices = [...new Set(rows.map((r) => r.price))];
  const paxes = [...new Set(rows.map((r) => r.pax))];
  const cell = (p: number, n: number) => rows.find((r) => r.price === p && r.pax === n);
  const priceInputs = [0, 1, 2].map((i) => pricing.price_options[i] ?? 0);
  const paxInputs = pricing.pax_options.length ? pricing.pax_options : defaultPax(minPax);

  return (
    <div className="finance">
      <p className="note warn">{FINANCE_DISCLAIMER}. 금액은 투어의 환율로 원화 환산해요.</p>

      <h3>비용</h3>
      <table className="costs">
        <thead>
          <tr>
            <th>항목</th>
            <th>구분</th>
            <th>통화</th>
            <th className="num">금액</th>
            <th className="num">수량</th>
            <th className="num">원화</th>
            <th>메모</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {costs.map((c, i) => {
            let krw: string;
            try {
              krw = won(toKrw(c, fx, nights));
            } catch {
              krw = '환율 없음';
            }
            return (
              <tr key={i}>
                <td><input value={c.label} onChange={(e) => setCost(i, { label: e.target.value })} /></td>
                <td>
                  <select value={c.kind} onChange={(e) => setCost(i, { kind: e.target.value as CostKind })}>
                    <option value="per_person">1인 변동비</option>
                    <option value="fixed">고정비</option>
                  </select>
                </td>
                <td>
                  <select value={c.currency} onChange={(e) => setCost(i, { currency: e.target.value })}>
                    {Object.keys(fx).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </td>
                <td><input className="num" type="number" value={c.amount} onChange={(e) => setCost(i, { amount: Number(e.target.value) })} /></td>
                <td>
                  <input
                    className="num short"
                    type="number"
                    disabled={c.per_night}
                    value={c.per_night ? nights : c.quantity}
                    onChange={(e) => setCost(i, { quantity: Number(e.target.value) })}
                  />
                  <label className="check small per-night" title="투어 총 박수를 수량으로 써요">
                    <input type="checkbox" checked={Boolean(c.per_night)} onChange={(e) => setCost(i, { per_night: e.target.checked })} /> 박수 연동
                  </label>
                </td>
                <td className="num small">{krw}</td>
                <td><input value={c.note} onChange={(e) => setCost(i, { note: e.target.value })} /></td>
                <td>
                  <button className="small danger" onClick={() => { setCosts(costs.filter((_, j) => j !== i)); setDirty(true); }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row gap">
        <button className="small" onClick={() => addCost('per_person')}>1인 변동비 추가</button>
        <button className="small" onClick={() => addCost('fixed')}>고정비 추가</button>
      </div>
      {routeDirty && costs.some((c) => c.per_night) && (
        <p className="small note warn">루트에 저장하지 않은 변경이 있어요. '박수 연동' 항목의 DB 계산은 위쪽 저장 후에 반영돼요.</p>
      )}
      <p className="small">
        {typeof preview === 'string'
          ? preview
          : `입력값 기준: 1인 변동비 ${won(preview.perPersonKrw)} · 고정비 ${won(preview.fixedKrw)}`}
      </p>

      <h3>참가비와 인원</h3>
      <div className="row gap wrap">
        {priceInputs.map((p, i) => (
          <label key={i}>
            참가비 {i + 1}
            <input
              type="number"
              step={10000}
              value={p || ''}
              onChange={(e) => {
                const next = [...priceInputs];
                next[i] = Number(e.target.value);
                setPricing({ ...pricing, price_options: next });
                setDirty(true);
              }}
            />
          </label>
        ))}
        <label>
          비교 인원 (쉼표로)
          <input
            defaultValue={paxInputs.join(', ')}
            onBlur={(e) => {
              const list = e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0);
              setPricing({ ...pricing, pax_options: list });
              setDirty(true);
            }}
          />
        </label>
        <label>
          결제 수수료율 (%)
          <input
            type="number"
            step={0.1}
            value={Math.round(pricing.fee_rate * 1000) / 10}
            onChange={(e) => {
              setPricing({ ...pricing, fee_rate: Number(e.target.value) / 100 });
              setDirty(true);
            }}
          />
        </label>
      </div>
      <div className="row gap">
        <button className="primary" disabled={busy} onClick={save}>{dirty ? '저장하고 계산' : '다시 계산'}</button>
        {msg && <span className="small">{msg}</span>}
      </div>

      <h3>이익·마진율 (DB 계산)</h3>
      {totals && (
        <p className="small muted">
          1인 변동비 V = {won(totals.per_person_krw)} · 고정비 F = {won(totals.fixed_krw)} · 수수료 r = {pct(totals.fee_rate)}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="muted">참가비를 입력하고 저장하면 표가 나와요.</p>
      ) : (
        <table className="pnl">
          <thead>
            <tr>
              <th>참가비 \ 인원</th>
              {paxes.map((n) => (
                <th key={n} className="num">{n}명</th>
              ))}
              <th className="num">손익분기</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p}>
                <th>{manwon(p)}</th>
                {paxes.map((n) => {
                  const r = cell(p, n);
                  return (
                    <td key={n} className={`num ${r && r.profit < 0 ? 'neg' : ''}`}>
                      <div className="strong">{manwon(r?.profit)}</div>
                      <div className="small muted">{pct(r?.margin)}</div>
                    </td>
                  );
                })}
                <td className="num">{rows.find((r) => r.price === p)?.breakeven_pax ?? '–'}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small muted">이익 = N·P − (N·V + F + N·P·r), 마진율 = 이익 ÷ (N·P). {FINANCE_DISCLAIMER}.</p>
    </div>
  );
}
