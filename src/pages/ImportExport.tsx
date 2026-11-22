// 루트 가져오기(누구나, 항상 초안으로) · 내보내기(관리자만, 매출 포함 여부 선택)
// Claude 커넥터 대신 이 화면으로 JSON을 주고받습니다.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getCosts, getPricing, getTour, importTour, listTours, logExport } from '../lib/api';
import { buildTourFile, CLAUDE_FORMAT_GUIDE, parseTourFile, type ParsedImport } from '../lib/importExport';
import { buildItinerary, totalNights } from '../lib/itinerary';
import type { Tour } from '../lib/types';

export default function ImportExport() {
  const { session, isAdmin, financeAccess } = useAuth();
  const me = session!.user.id;
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [exportId, setExportId] = useState('');
  const [withFinance, setWithFinance] = useState(false);
  const [exported, setExported] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) listTours().then(setTours).catch(() => undefined);
  }, [isAdmin]);

  function check(t: string) {
    setText(t);
    setParsed(null);
    setErrors([]);
    if (!t.trim()) return;
    // ```json 코드 블록째 붙여 넣어도 되게
    const body = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const r = parseTourFile(body);
    if (r.ok) setParsed(r.value);
    else setErrors(r.errors);
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const t = await importTour(parsed, me, financeAccess);
      nav(`/tours/${t.id}`);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    if (!exportId) return;
    setBusy(true);
    try {
      const { tour, stops } = await getTour(exportId);
      const fin = withFinance && financeAccess ? { costs: await getCosts(exportId), pricing: await getPricing(exportId) } : undefined;
      await logExport(exportId, 'json', Boolean(fin), me);
      setExported(JSON.stringify(buildTourFile(tour, stops, fin), null, 2));
    } catch (e) {
      setExported(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, s: string) {
    await navigator.clipboard.writeText(s);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  function download() {
    const t = tours.find((x) => x.id === exportId);
    const blob = new Blob([exported], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(t?.name ?? 'tour').replace(/[\\/:*?"<>|]/g, '_')}${withFinance ? '-매출포함' : ''}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const preview = parsed ? buildItinerary(parsed.stops, parsed.tour) : [];

  return (
    <div className="page">
      <h1>루트 가져오기·내보내기</h1>

      <section className="card">
        <h2>가져오기</h2>
        <p className="muted small">
          Claude에서 정리한 루트 JSON을 붙여 넣거나 파일을 고르세요. 항상 <b>초안</b>으로 만들어지고, 확인한 뒤에만 들어가요.
        </p>
        <div className="row gap">
          <button className="small" onClick={() => copy('guide', CLAUDE_FORMAT_GUIDE)}>
            {copied === 'guide' ? '복사됨' : 'Claude에게 줄 형식 안내 복사'}
          </button>
          <label className="button small">
            파일 고르기
            <input type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) check(await f.text());
            }} />
          </label>
        </div>
        <textarea className="code" rows={10} value={text} onChange={(e) => check(e.target.value)} placeholder='{"format": "wannago-tour/v1", ...}' />
        {errors.length > 0 && (
          <ul className="note error">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {parsed && (
          <div className="preview">
            <p>
              <b>{parsed.tour.name}</b> · 도시 {parsed.stops.length}곳 · 현지 {totalNights(parsed.stops)}박 · 총 {preview.length}일
            </p>
            {parsed.hasFinance && (
              <p className={`note ${financeAccess ? '' : 'warn'}`}>
                {financeAccess
                  ? `비용 ${parsed.costs.length}개 항목과 참가비도 함께 저장해요.`
                  : '루트와 일정을 가져와요.'}
              </p>
            )}
            {parsed.warnings.length > 0 && (
              <ul className="small note warn">
                {parsed.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <button className="primary" disabled={busy} onClick={doImport}>초안 투어로 만들기</button>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="card">
          <h2>내보내기 <span className="badge admin">관리자</span></h2>
          <p className="muted small">투어를 JSON으로 내보내 Claude 대화에 붙여 넣을 수 있어요. 내보낸 기록이 남아요.</p>
          <div className="row gap wrap">
            <select value={exportId} onChange={(e) => { setExportId(e.target.value); setExported(''); }}>
              <option value="">투어 선택</option>
              {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="check">
              <input type="checkbox" checked={withFinance} disabled={!financeAccess} onChange={(e) => setWithFinance(e.target.checked)} />
              매출(비용·참가비) 포함 {!financeAccess && '(2단계 인증 필요)'}
            </label>
            <button className="primary" disabled={!exportId || busy} onClick={doExport}>내보내기</button>
          </div>
          {exported && (
            <>
              {withFinance && <p className="note warn">매출이 포함된 대외비 데이터예요. 공유 범위에 주의하세요.</p>}
              <textarea className="code" rows={12} readOnly value={exported} />
              <div className="row gap">
                <button className="small" onClick={() => copy('export', exported)}>{copied === 'export' ? '복사됨' : '복사'}</button>
                <button className="small" onClick={download}>파일로 받기</button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
