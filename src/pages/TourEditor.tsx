import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getTour, replaceStops, updateTour } from '../lib/api';
import { buildItinerary, totalNights } from '../lib/itinerary';
import type { DayOverride, Stop, Tour } from '../lib/types';
import StopList from '../components/StopList';
import RouteMap from '../components/RouteMap';
import ItineraryTable from '../components/ItineraryTable';
import FinancePanel from '../components/FinancePanel';

type Tab = 'itinerary' | 'finance' | 'pdf';

export default function TourEditor() {
  const { id } = useParams<{ id: string }>();
  const { session, isAdmin, financeAccess } = useAuth();
  const me = session!.user.id;
  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('itinerary');
  const [fxText, setFxText] = useState('');

  useEffect(() => {
    if (!id) return;
    getTour(id)
      .then(({ tour, stops }) => {
        setTour(tour);
        setStops(stops);
        setFxText(fxToText(tour.fx_rates));
        setDirty(false);
      })
      .catch((e) => setMsg(e.message));
  }, [id]);

  // 저장 안 한 변경이 있으면 창 닫기 전에 경고
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const days = useMemo(() => (tour ? buildItinerary(stops, tour) : []), [stops, tour]);

  if (!tour) return <div className="page">{msg ?? '불러오는 중…'}</div>;
  const canEdit = tour.created_by === me || isAdmin;

  const patch = (p: Partial<Tour>) => {
    setTour({ ...tour, ...p });
    setDirty(true);
  };
  const editDay = (day: number, p: DayOverride) => {
    const cur = tour.itinerary?.[String(day)] ?? {};
    const next = { ...cur, ...p };
    const itinerary = { ...tour.itinerary };
    if (!next.plan?.trim() && !next.memo?.trim()) delete itinerary[String(day)];
    else itinerary[String(day)] = next;
    patch({ itinerary });
  };

  async function save() {
    if (!tour) return;
    const fx = textToFx(fxText);
    if (!fx) return setMsg('환율 형식: EUR=1500, CZK=60');
    setSaving(true);
    setMsg(null);
    try {
      const { id: tid, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = tour;
      await updateTour(tid, { ...rest, fx_rates: fx });
      const saved = await replaceStops(tid, stops);
      setStops(saved);
      setTour({ ...tour, fx_rates: fx });
      setDirty(false);
      setMsg('저장했어요.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pdfLink = (mode: string) => `#/tours/${tour.id}/print?mode=${mode}`;

  return (
    <div className="page wide">
      <div className="row between">
        <div className="row gap">
          <Link to="/" className="muted">← 투어</Link>
          <span className={`badge ${tour.status === 'final' ? 'final' : ''}`}>{tour.status === 'final' ? '확정' : '초안'}</span>
          {!canEdit && <span className="badge">읽기 전용</span>}
        </div>
        <div className="row gap">
          {msg && <span className="small">{msg}</span>}
          {canEdit && (
            <button className="primary" disabled={!dirty || saving} onClick={save}>
              {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
            </button>
          )}
        </div>
      </div>

      <fieldset className="card tour-meta" disabled={!canEdit}>
        <input className="title-input" value={tour.name} onChange={(e) => patch({ name: e.target.value })} />
        <input className="concept-input" value={tour.concept} placeholder="컨셉 한 줄" onChange={(e) => patch({ concept: e.target.value })} />
        <div className="row gap wrap">
          <label>
            출발일
            <input type="date" value={tour.depart_date ?? ''} onChange={(e) => patch({ depart_date: e.target.value || null })} />
          </label>
          <label>
            최소 인원
            <input type="number" min={1} value={tour.min_pax} onChange={(e) => patch({ min_pax: Math.max(1, Number(e.target.value)) })} />
          </label>
          <label>
            출발·귀국 공항
            <input value={tour.origin_label} onChange={(e) => patch({ origin_label: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={tour.return_overnight} onChange={(e) => patch({ return_overnight: e.target.checked })} />
            귀국편 기내 1박
          </label>
          <label>
            환율 (원)
            <input value={fxText} placeholder="EUR=1500, CZK=60" onChange={(e) => { setFxText(e.target.value); setDirty(true); }} />
          </label>
          <label>
            상태
            <select value={tour.status} onChange={(e) => patch({ status: e.target.value as Tour['status'] })}>
              <option value="draft">초안</option>
              <option value="final">확정</option>
            </select>
          </label>
        </div>
        <p className="small muted">
          현지 {totalNights(stops)}박 · 총 {days.length}일
        </p>
      </fieldset>

      <div className="editor">
        <aside>
          <StopList stops={stops} onChange={(s) => { setStops(s); setDirty(true); }} canEdit={canEdit} />
        </aside>
        <section>
          <RouteMap stops={stops} />
        </section>
      </div>

      <div className="tabs">
        <button className={tab === 'itinerary' ? 'on' : ''} onClick={() => setTab('itinerary')}>일정표</button>
        {financeAccess && (
          <button className={tab === 'finance' ? 'on' : ''} onClick={() => setTab('finance')}>매출 계산</button>
        )}
        <button className={tab === 'pdf' ? 'on' : ''} onClick={() => setTab('pdf')}>PDF</button>
      </div>

      {tab === 'itinerary' && <ItineraryTable days={days} canEdit={canEdit} showMemo onEdit={editDay} />}
      {tab === 'finance' && financeAccess && <FinancePanel tourId={tour.id} fx={tour.fx_rates} minPax={tour.min_pax} />}
      {tab === 'pdf' && (
        <div className="card">
          {dirty && <p className="note warn">저장하지 않은 변경은 PDF에 들어가지 않아요. 먼저 저장해 주세요.</p>}
          <p>A4 인쇄용 페이지를 새 탭으로 열어요. 거기서 '인쇄 / PDF로 저장'을 누르세요.</p>
          <div className="row gap wrap">
            {financeAccess && (
              <a className="button primary" href={pdfLink('internal')} target="_blank" rel="noreferrer">내부용 (대외비)</a>
            )}
            <a className="button" href={pdfLink('leader')} target="_blank" rel="noreferrer">트래블리더용</a>
            <a className="button" href={pdfLink('customer')} target="_blank" rel="noreferrer">고객용 (내부 메모 제외)</a>
          </div>
        </div>
      )}
    </div>
  );
}

function fxToText(fx: Record<string, number>) {
  return Object.entries(fx)
    .filter(([k]) => k !== 'KRW')
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

function textToFx(text: string): Record<string, number> | null {
  const out: Record<string, number> = { KRW: 1 };
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z]{3})\s*=\s*([\d.]+)$/);
    if (!m || Number(m[2]) <= 0) return null;
    out[m[1].toUpperCase()] = Number(m[2]);
  }
  return out;
}
