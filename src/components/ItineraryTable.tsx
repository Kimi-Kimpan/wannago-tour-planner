import { useState } from 'react';
import { transferText, type ItineraryDay } from '../lib/itinerary';
import type { DayOverride } from '../lib/types';

export interface DayActions {
  onEdit: (key: string, patch: DayOverride) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  onDelete: (idx: number) => void;
  onToggleFree: (idx: number, free: boolean) => void;
  onAdd: (stopIndex: number) => void;
  canMove: (idx: number, dir: -1 | 1) => boolean;
}

export default function ItineraryTable({
  days,
  canEdit,
  showMemo,
  actions,
}: {
  days: ItineraryDay[];
  canEdit: boolean;
  showMemo: boolean;
  actions?: DayActions;
}) {
  const editable = canEdit && Boolean(actions);
  // 하루를 추가할 수 있는 도시(숙박지) 목록
  const stays = days
    .filter((d) => d.k === 0 && d.stopIndex !== null)
    .map((d) => ({ index: d.stopIndex as number, name: d.base as string }));
  const [addTo, setAddTo] = useState<number | ''>('');
  const target = addTo === '' ? stays[stays.length - 1]?.index : addTo;

  if (days.length === 0) return <p className="muted">숙박 도시를 추가하면 일정표가 자동으로 만들어져요.</p>;
  return (
    <>
      {editable && (
        <div className="day-toolbar">
          <select value={target ?? ''} onChange={(e) => setAddTo(e.target.value === '' ? '' : Number(e.target.value))}>
            {stays.map((s) => (
              <option key={s.index} value={s.index}>{s.name}</option>
            ))}
          </select>
          <button className="primary small" disabled={target === undefined} onClick={() => target !== undefined && actions!.onAdd(target)}>
            + 일정 추가 (하루)
          </button>
          <span className="small muted">고른 도시의 마지막 날 뒤에 하루가 늘어나고, 박수·총 일수·매출 계산에 함께 반영돼요.</span>
        </div>
      )}
      <table className="itinerary">
        <thead>
          <tr>
            <th className="c-day">일차</th>
            <th className="c-move">이동</th>
            <th>주요 일정</th>
            <th className="c-sleep">숙박</th>
            {showMemo && <th className="c-memo">내부 메모</th>}
            {editable && <th className="c-act" />}
          </tr>
        </thead>
        <tbody>
          {days.map((d, idx) => {
            const inStay = d.stopIndex !== null;
            return (
              <tr key={d.key} className={d.isFree ? 'free' : d.transfer ? 'move' : ''}>
                <td className="c-day">{d.day}</td>
                <td className="c-move small">{d.transfer ? transferText(d.transfer) : '-'}</td>
                <td>
                  {editable && inStay && d.k !== 0 ? (
                    <label className="free-toggle">
                      <input type="checkbox" checked={d.isFree} onChange={(e) => actions!.onToggleFree(idx, e.target.checked)} /> 자유일
                    </label>
                  ) : (
                    d.isFree && <span className="badge free">자유일</span>
                  )}
                  {editable ? (
                    <textarea
                      rows={2}
                      value={d.plan}
                      placeholder={d.autoPlan || '주요 일정'}
                      onChange={(e) => actions!.onEdit(d.key, { plan: e.target.value })}
                    />
                  ) : (
                    <span>{d.plan}</span>
                  )}
                  {d.edited && editable && (
                    <button className="link small" onClick={() => actions!.onEdit(d.key, { plan: '' })} title="자동 일정으로 되돌리기">
                      자동으로 되돌리기
                    </button>
                  )}
                </td>
                <td className="c-sleep">{d.sleep}</td>
                {showMemo && (
                  <td className="c-memo">
                    {editable ? (
                      <textarea rows={2} value={d.memo} onChange={(e) => actions!.onEdit(d.key, { memo: e.target.value })} />
                    ) : (
                      <span className="small">{d.memo}</span>
                    )}
                  </td>
                )}
                {editable && (
                  <td className="c-act">
                    {inStay ? (
                      <div className="day-actions">
                        <button className="icon" title="하루 위로" disabled={!actions!.canMove(idx, -1)} onClick={() => actions!.onMove(idx, -1)}>↑</button>
                        <button className="icon" title="하루 아래로" disabled={!actions!.canMove(idx, 1)} onClick={() => actions!.onMove(idx, 1)}>↓</button>
                        <button className="icon danger" title="이날 빼기" onClick={() => actions!.onDelete(idx)}>×</button>
                      </div>
                    ) : (
                      <span className="small muted">귀국</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {editable && (
        <p className="small muted">
          ↑↓로 이동일(도시 도착일)을 옮기면 앞뒤 도시의 박수가 바뀌어요. 같은 도시 안에서는 그날의 일정·메모·자유일이 자리를 바꿔요. 도시 순서는 위쪽 도시 목록에서 바꿔 주세요.
        </p>
      )}
    </>
  );
}
