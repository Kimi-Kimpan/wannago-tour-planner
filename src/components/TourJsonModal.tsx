// 투어 카드의 '수정': 지금 투어를 JSON으로 보여 주고, Claude와 상의해 고친 JSON을 붙여 넣으면
// 새 투어를 만들지 않고 이 투어에 바로 덮어씁니다. (상태·만든 사람은 그대로)
import { useEffect, useState } from 'react';
import { getCosts, getPricing, getTour, logExport, overwriteTour } from '../lib/api';
import { buildTourFile, CLAUDE_FORMAT_GUIDE, parseTourFile, type ParsedImport } from '../lib/importExport';
import { buildItinerary, totalNights } from '../lib/itinerary';
import type { Tour } from '../lib/types';

export default function TourJsonModal({
  tour,
  userId,
  isAdmin,
  financeAccess,
  onClose,
  onSaved,
}: {
  tour: Tour;
  userId: string;
  isAdmin: boolean;
  financeAccess: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [before, setBefore] = useState<{ stops: number; nights: number; days: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { tour: t, stops } = await getTour(tour.id);
      const fin = financeAccess ? { costs: await getCosts(tour.id), pricing: await getPricing(tour.id) } : undefined;
      if (isAdmin) await logExport(tour.id, 'json', Boolean(fin), userId).catch(() => undefined);
      const json = JSON.stringify(buildTourFile(t, stops, fin), null, 2);
      setCurrent(json);
      setText(json);
      setBefore({ stops: stops.length, nights: totalNights(stops), days: buildItinerary(stops, t).length });
    })().catch((e) => setErrors([(e as Error).message]));
  }, [tour.id, financeAccess, isAdmin, userId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  function check(t: string) {
    setText(t);
    setErrors([]);
    setParsed(null);
    if (!t.trim() || t === current) return;
    const body = t.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const r = parseTourFile(body);
    if (r.ok) setParsed(r.value);
    else setErrors(r.errors);
  }

  async function copyForClaude() {
    await navigator.clipboard.writeText(
      `${CLAUDE_FORMAT_GUIDE}\n\n아래는 지금 투어야. 상의한 내용대로 고친 전체 JSON을 다시 줘.\n\`\`\`json\n${current}\n\`\`\``,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function apply() {
    if (!parsed) return;
    if (!confirm(`'${tour.name}'의 루트·일정표${parsed.hasFinance && financeAccess ? '·비용' : ''}을 붙여 넣은 내용으로 바꿀까요? 투어 화면의 ↶ 되돌리기로는 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await overwriteTour(tour, parsed, financeAccess);
      onSaved();
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  const after = parsed
    ? { stops: parsed.stops.length, nights: totalNights(parsed.stops), days: buildItinerary(parsed.stops, parsed.tour).length }
    : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="JSON으로 수정">
        <div className="row between">
          <h2>JSON으로 수정 · {tour.name}</h2>
          <button className="icon ghost" title="닫기" onClick={onClose}>✕</button>
        </div>
        <ol className="small muted steps">
          <li>'Claude에게 보낼 내용 복사'를 눌러 Claude 대화에 붙여 넣고, 바꿀 점을 상의하세요.</li>
          <li>Claude가 준 고친 JSON 전체를 아래 칸에 붙여 넣으세요. (코드 블록째 붙여도 돼요)</li>
          <li>바뀌는 내용을 확인하고 '이 투어에 적용'을 누르세요. 새 투어가 생기지 않고 이 투어가 바뀌어요.</li>
        </ol>
        <div className="row gap">
          <button className="small" disabled={!current} onClick={copyForClaude}>{copied ? '복사됨' : 'Claude에게 보낼 내용 복사'}</button>
          <button className="small" disabled={!current || text === current} onClick={() => check(current)}>지금 내용으로 되돌리기</button>
        </div>
        <textarea className="code" rows={16} value={text} onChange={(e) => check(e.target.value)} placeholder="불러오는 중…" />
        {errors.length > 0 && (
          <ul className="note error">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        {parsed && before && after && (
          <div className="note">
            <b>바뀌는 내용</b>: 도시 {before.stops} → {after.stops}곳 · 현지 {before.nights} → {after.nights}박 · 총 {before.days} → {after.days}일
            {parsed.tour.name !== tour.name && ` · 이름 '${parsed.tour.name}'`}
            {parsed.hasFinance && financeAccess && ` · 비용 ${parsed.costs.length}개 항목과 참가비도 바꿔요`}
            {parsed.warnings.length > 0 && (
              <ul className="small">
                {parsed.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="row gap end">
          <button onClick={onClose}>닫기</button>
          <button className="primary" disabled={!parsed || busy} onClick={apply}>{busy ? '적용 중…' : '이 투어에 적용'}</button>
        </div>
      </div>
    </div>
  );
}
