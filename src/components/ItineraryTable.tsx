import { transferText, type ItineraryDay } from '../lib/itinerary';
import type { DayOverride } from '../lib/types';

export default function ItineraryTable({
  days,
  canEdit,
  showMemo,
  onEdit,
}: {
  days: ItineraryDay[];
  canEdit: boolean;
  showMemo: boolean;
  onEdit?: (day: number, patch: DayOverride) => void;
}) {
  if (days.length === 0) return <p className="muted">숙박 도시를 추가하면 일정표가 자동으로 만들어져요.</p>;
  return (
    <table className="itinerary">
      <thead>
        <tr>
          <th className="c-day">일차</th>
          <th className="c-move">이동</th>
          <th>주요 일정</th>
          <th className="c-sleep">숙박</th>
          {showMemo && <th className="c-memo">내부 메모</th>}
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.day} className={d.isFree ? 'free' : d.transfer ? 'move' : ''}>
            <td className="c-day">{d.day}</td>
            <td className="c-move small">{d.transfer ? transferText(d.transfer) : '-'}</td>
            <td>
              {d.isFree && <span className="badge free">자유일</span>}
              {canEdit && onEdit ? (
                <textarea
                  rows={2}
                  value={d.plan}
                  placeholder={d.autoPlan || '주요 일정'}
                  onChange={(e) => onEdit(d.day, { plan: e.target.value })}
                />
              ) : (
                <span>{d.plan}</span>
              )}
              {d.edited && canEdit && onEdit && (
                <button className="link small" onClick={() => onEdit(d.day, { plan: '' })} title="자동 일정으로 되돌리기">
                  자동으로 되돌리기
                </button>
              )}
            </td>
            <td className="c-sleep">{d.sleep}</td>
            {showMemo && (
              <td className="c-memo">
                {canEdit && onEdit ? (
                  <textarea rows={2} value={d.memo} onChange={(e) => onEdit(d.day, { memo: e.target.value })} />
                ) : (
                  <span className="small">{d.memo}</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
