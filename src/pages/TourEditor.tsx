import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getTour, replaceStops, updateTour } from '../lib/api';
import {
  addDay,
  buildItinerary,
  deleteDay,
  moveDay,
  normalizeItinerary,
  rekeyAfterStopEdit,
  setFreeDay,
  totalNights,
  type RouteState,
} from '../lib/itinerary';
import type { DayOverride, Stop, Tour } from '../lib/types';
import StopList, { StopDetail } from '../components/StopList';
import RouteMap from '../components/RouteMap';
import ItineraryTable, { type DayActions } from '../components/ItineraryTable';
import FinancePanel from '../components/FinancePanel';

type Tab = 'itinerary' | 'finance' | 'pdf';

type Snap = { tour: Tour; stops: Stop[]; fxText: string };
interface History {
  past: Snap[];
  present: Snap | null;
  future: Snap[];
  lastKey?: string;
  lastAt?: number;
}
const HISTORY_LIMIT = 100;

export default function TourEditor() {
  const { id } = useParams<{ id: string }>();
  const { session, isAdmin, financeAccess } = useAuth();
  const me = session!.user.id;
  const [hist, setHist] = useState<History>({ past: [], present: null, future: [] });
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('itinerary');
  const [selected, setSelected] = useState<number | null>(null); // 오른쪽 패널에 연 도시

  const snap = hist.present;
  const tour = snap?.tour ?? null;
  const stops = snap?.stops ?? [];
  const fxText = snap?.fxText ?? '';
  const dirty = snap !== null && JSON.stringify(snap) !== savedJson;

  useEffect(() => {
    if (!id) return;
    getTour(id)
      .then(({ tour, stops }) => {
        // 예전 형식(일차 번호)으로 저장된 일정표 내용을 도시 키로 바꿔 둠
        const t = { ...tour, itinerary: normalizeItinerary(stops, tour) };
        const s: Snap = { tour: t, stops, fxText: fxToText(tour.fx_rates) };
        setHist({ past: [], present: s, future: [] });
        setSavedJson(JSON.stringify(s));
      })
      .catch((e) => setMsg(e.message));
  }, [id]);

  // 변경 기록: 같은 칸을 1초 안에 이어서 고치면 한 번으로 묶음
  const apply = useCallback((update: (s: Snap) => Snap, key?: string) => {
    setHist((h) => {
      if (!h.present) return h;
      const next = update(h.present);
      if (next === h.present) return h;
      const now = Date.now();
      const merge = key !== undefined && h.lastKey === key && now - (h.lastAt ?? 0) < 1000;
      return {
        past: merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: key,
        lastAt: now,
      };
    });
  }, []);
  const undo = useCallback(() => {
    setHist((h) => (h.past.length && h.present ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  }, []);
  const redo = useCallback(() => {
    setHist((h) => (h.future.length && h.present ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));
  }, []);

  // ⌘Z / ⌘⇧Z (입력 칸 안에서는 그 칸의 기본 되돌리기를 그대로 씀)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  // 저장 안 한 변경이 있으면 창 닫기 전에 경고
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const days = useMemo(() => (tour ? buildItinerary(stops, tour) : []), [stops, tour]);

  if (!tour || !snap) return <div className="page">{msg ?? '불러오는 중…'}</div>;
  const canEdit = tour.created_by === me || isAdmin;

  const patch = (p: Partial<Tour>, key?: string) => apply((s) => ({ ...s, tour: { ...s.tour, ...p } }), key);
  const setRoute = (r: RouteState | null) => {
    if (!r) return;
    apply((s) => ({ ...s, stops: r.stops, tour: { ...s.tour, itinerary: r.itinerary } }));
  };

  const setStops = (next: Stop[], key = 'stops') =>
    apply((s) => ({ ...s, stops: next, tour: { ...s.tour, itinerary: rekeyAfterStopEdit(s.stops, next, s.tour.itinerary) } }), key);
  const renumber = (list: Stop[]) => list.map((x, i) => ({ ...x, position: i + 1 }));
  const sel = selected !== null && selected < stops.length ? selected : null;
  const selStop = sel !== null ? stops[sel] : null;
  const selNumber =
    selStop && selStop.kind === 'stay' && selStop.nights > 0
      ? stops.slice(0, (sel as number) + 1).filter((x) => x.kind === 'stay' && x.nights > 0).length
      : null;
  const detailMove = (dir: -1 | 1) => {
    if (sel === null) return;
    const to = sel + dir;
    if (to < 0 || to >= stops.length) return;
    const list = [...stops];
    const [it] = list.splice(sel, 1);
    list.splice(to, 0, it);
    setStops(renumber(list), 'stops-move');
    setSelected(to);
  };
  const detailRemove = () => {
    if (sel === null) return;
    setStops(renumber(stops.filter((_, j) => j !== sel)), 'stops-remove');
    setSelected(null);
  };

  const actions: DayActions = {
    onEdit: (key, p) =>
      apply((s) => {
        const itinerary = { ...s.tour.itinerary };
        const next: DayOverride = { ...(itinerary[key] ?? {}), ...p };
        if (!next.plan?.trim()) delete next.plan;
        if (!next.memo?.trim()) delete next.memo;
        if (Object.keys(next).length) itinerary[key] = next;
        else delete itinerary[key];
        return { ...s, tour: { ...s.tour, itinerary } };
      }, `day:${key}:${Object.keys(p).join()}`),
    onMove: (idx, dir) => setRoute(moveDay(stops, tour, idx, dir)),
    onDelete: (idx) => setRoute(deleteDay(stops, tour, idx)),
    onToggleFree: (idx, free) => setRoute(setFreeDay(stops, tour, idx, free)),
    onAdd: (stopIndex) => setRoute(addDay(stops, tour, stopIndex)),
    canMove: (idx, dir) => moveDay(stops, tour, idx, dir) !== null,
  };

  async function save() {
    if (!tour || !snap) return;
    const fx = textToFx(fxText);
    if (!fx) return setMsg('환율 형식: EUR=1500, CZK=60');
    setSaving(true);
    setMsg(null);
    try {
      const { id: tid, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = tour;
      await updateTour(tid, { ...rest, fx_rates: fx });
      const saved = await replaceStops(tid, stops);
      const next: Snap = { tour: { ...tour, fx_rates: fx }, stops: saved, fxText: fxToText(fx) };
      // 저장 후에도 되돌리기 기록은 유지
      setHist((h) => ({ ...h, present: next, lastKey: undefined }));
      setSavedJson(JSON.stringify(next));
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
      <div className="editor-bar">
        <div className="row gap">
          <Link to="/" className="muted">← 투어</Link>
          <strong className="bar-title">{tour.name}</strong>
          <span className={`badge ${tour.status === 'final' ? 'final' : ''}`}>{tour.status === 'final' ? '확정' : '초안'}</span>
          {!canEdit && <span className="badge">읽기 전용</span>}
          <span className="small muted">현지 {totalNights(stops)}박 · 총 {days.length}일</span>
        </div>
        <div className="row gap">
          {msg && <span className="small">{msg}</span>}
          {canEdit && (
            <>
              <button onClick={undo} disabled={!hist.past.length} title="되돌리기 (⌘Z)">↶ 되돌리기</button>
              <button onClick={redo} disabled={!hist.future.length} title="다시하기 (⌘⇧Z)">↷ 다시하기</button>
              <button className="primary" disabled={!dirty || saving} onClick={save}>
                {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
              </button>
            </>
          )}
        </div>
      </div>

      <fieldset className="card tour-meta" disabled={!canEdit}>
        <input className="title-input" value={tour.name} onChange={(e) => patch({ name: e.target.value }, 'name')} />
        <input className="concept-input" value={tour.concept} placeholder="컨셉 한 줄" onChange={(e) => patch({ concept: e.target.value }, 'concept')} />
        <div className="row gap wrap">
          <label>
            출발일
            <input type="date" value={tour.depart_date ?? ''} onChange={(e) => patch({ depart_date: e.target.value || null })} />
          </label>
          <label>
            최소 인원
            <input type="number" min={1} value={tour.min_pax} onChange={(e) => patch({ min_pax: Math.max(1, Number(e.target.value)) }, 'min_pax')} />
          </label>
          <label>
            출발·귀국 공항
            <input value={tour.origin_label} onChange={(e) => patch({ origin_label: e.target.value }, 'origin')} />
          </label>
          <label className="check">
            <input type="checkbox" checked={tour.return_overnight} onChange={(e) => patch({ return_overnight: e.target.checked })} />
            귀국편 기내 1박
          </label>
          <label>
            환율 (원)
            <input value={fxText} placeholder="EUR=1500, CZK=60" onChange={(e) => { const v = e.target.value; apply((s) => ({ ...s, fxText: v }), 'fx'); }} />
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

      <div className={`editor ${selStop ? 'with-detail' : ''}`}>
        <aside>
          <StopList stops={stops} onChange={(next) => setStops(next)} canEdit={canEdit} selected={sel} onSelect={setSelected} />
        </aside>
        <div className="detail-slot">
          {selStop && (
            <StopDetail
              key={sel}
              stop={selStop}
              number={selNumber}
              canEdit={canEdit}
              onPatch={(p) => setStops(stops.map((x, j) => (j === sel ? { ...x, ...p } : x)), `stop:${sel}`)}
              onMove={detailMove}
              onRemove={detailRemove}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
        <section className="map-col">
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

      {tab === 'itinerary' && <ItineraryTable days={days} canEdit={canEdit} showMemo actions={actions} />}
      {tab === 'finance' && financeAccess && (
        <FinancePanel tourId={tour.id} fx={tour.fx_rates} minPax={tour.min_pax} nights={totalNights(stops)} routeDirty={dirty} />
      )}
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
