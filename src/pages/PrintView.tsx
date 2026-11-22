// A4 인쇄용 기획안. 표지 → 루트 지도 → 일차별 일정표 → 자유일 근교 옵션 → 매출(내부용만)
// 매출 페이지는 관리자(2단계 인증)가 '내부용'으로 열 때만 DB에서 불러와 넣습니다.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { costTotalsRpc, getCosts, getTour, logExport, pnlRpc } from '../lib/api';
import { buildItinerary, totalNights } from '../lib/itinerary';
import { staticMapUrl } from '../lib/maps';
import { manwon, pct, toKrw, won } from '../lib/finance';
import type { CostItem, PdfMode, PnlRow, Stop, Tour } from '../lib/types';
import ItineraryTable from '../components/ItineraryTable';
import { FINANCE_DISCLAIMER } from '../components/FinancePanel';

export default function PrintView() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const { session, profile, financeAccess } = useAuth();
  const asked = (sp.get('mode') as PdfMode) ?? 'leader';
  const mode: PdfMode = asked === 'internal' && !financeAccess ? 'leader' : asked;
  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [fin, setFin] = useState<{ rows: PnlRow[]; costs: CostItem[]; v: number; f: number; r: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const t = await getTour(id);
        setTour(t.tour);
        setStops(t.stops);
        if (mode === 'internal') {
          const [rows, costs, tot] = await Promise.all([pnlRpc(id), getCosts(id), costTotalsRpc(id)]);
          setFin({ rows, costs, v: tot.per_person_krw, f: tot.fixed_krw, r: tot.fee_rate });
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [id, mode]);

  const days = useMemo(() => (tour ? buildItinerary(stops, tour) : []), [tour, stops]);
  if (err) return <div className="page">{err}</div>;
  if (!tour) return <div className="page muted">불러오는 중…</div>;

  const showMemo = mode !== 'customer';
  const today = new Date().toISOString().slice(0, 10);
  const watermark = mode === 'customer' ? null : `대외비 · ${profile?.display_name || session?.user.email} · ${today}`;
  const mapUrl = staticMapUrl(stops);
  const nearbyRows = [...stops]
    .sort((a, b) => a.position - b.position)
    .filter((s) => s.nearby?.length)
    .map((s) => ({ base: s.name, days: days.filter((d) => d.isFree && d.base === s.name).map((d) => d.day), list: s.nearby }));
  const modeLabel = { internal: '내부용', leader: '트래블리더용', customer: '고객용' }[mode];

  async function print() {
    try {
      await logExport(tour!.id, `pdf_${mode}`, mode === 'internal', session!.user.id);
    } catch (e) {
      setErr(`내보내기 기록을 남기지 못했어요: ${(e as Error).message}`);
      return;
    }
    window.print();
  }

  const prices = fin ? [...new Set(fin.rows.map((r) => r.price))] : [];
  const paxes = fin ? [...new Set(fin.rows.map((r) => r.pax))] : [];

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <span>{modeLabel} 기획안 미리보기</span>
        {asked === 'internal' && mode !== 'internal' && <span className="note">트래블리더용으로 열었어요.</span>}
        <button className="primary" onClick={print}>인쇄 / PDF로 저장</button>
      </div>
      {watermark && (
        <div className="watermark" aria-hidden>
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i}>{watermark}</span>
          ))}
        </div>
      )}

      <section className="sheet cover">
        <div className="brand-mark big" />
        <p className="eyebrow">WANNAGO TRIP · {modeLabel}</p>
        <h1>{tour.name}</h1>
        <p className="lead">{tour.concept}</p>
        <p>
          {days.length}일 · 현지 {totalNights(stops)}박 {tour.return_overnight && '+ 기내 1박'}
          {tour.depart_date && ` · ${tour.depart_date} 출발`}
        </p>
        <p className="route-line">
          {[...stops].sort((a, b) => a.position - b.position).filter((s) => s.kind === 'stay' && s.nights > 0).map((s) => `${s.name} ${s.nights}박`).join(' → ')}
        </p>
      </section>

      <section className="sheet">
        <h2>루트 지도</h2>
        {mapUrl ? <img className="static-map" src={mapUrl} alt="루트 지도" /> : <p className="muted">지도 키가 없거나 좌표가 없어 지도를 넣지 못했어요.</p>}
      </section>

      <section className="sheet">
        <h2>일차별 일정</h2>
        <ItineraryTable days={days} canEdit={false} showMemo={showMemo} />
      </section>

      {nearbyRows.length > 0 && (
        <section className="sheet">
          <h2>자유일 근교 옵션</h2>
          <table className="itinerary">
            <thead>
              <tr>
                <th>자유일</th>
                <th>거점</th>
                <th>근교 옵션</th>
              </tr>
            </thead>
            <tbody>
              {nearbyRows.map((r) => (
                <tr key={r.base}>
                  <td>{r.days.map((d) => `${d}일차`).join(', ') || '-'}</td>
                  <td>{r.base}</td>
                  <td>
                    {r.list.map((n) => (
                      <div key={n.name}>
                        {n.name}
                        {n.note && <span className="small muted"> · {n.note}</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {mode === 'internal' && fin && (
        <section className="sheet">
          <h2>매출 계산 (대외비)</h2>
          <table className="costs">
            <thead>
              <tr>
                <th>항목</th>
                <th>구분</th>
                <th className="num">원화</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {fin.costs.map((c) => (
                <tr key={c.id ?? c.label}>
                  <td>{c.label}</td>
                  <td>{c.kind === 'per_person' ? '1인 변동비' : '고정비'}</td>
                  <td className="num">{won(toKrw({ ...c, amount: Number(c.amount), quantity: Number(c.quantity) }, tour.fx_rates, totalNights(stops)))}</td>
                  <td className="small">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            1인 변동비 {won(fin.v)} · 고정비 {won(fin.f)} · 결제 수수료 {pct(fin.r)}
          </p>
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
                    const r = fin.rows.find((x) => x.price === p && x.pax === n);
                    return (
                      <td key={n} className="num">
                        {manwon(r?.profit)} <span className="small muted">{pct(r?.margin)}</span>
                      </td>
                    );
                  })}
                  <td className="num">{fin.rows.find((x) => x.price === p)?.breakeven_pax ?? '–'}명</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">{FINANCE_DISCLAIMER}.</p>
        </section>
      )}
    </div>
  );
}
