// 왼쪽 도시 목록: 끌어서 순서 바꾸기, 박수·이동 수단·경유지·근교 당일치기 후보
import { useState } from 'react';
import PlaceSearch from './PlaceSearch';
import ConfirmButton from './ConfirmButton';
import { MODE_LABEL, type NearbyOption, type Stop, type TravelMode } from '../lib/types';

const MODES = Object.keys(MODE_LABEL) as TravelMode[];

export function newStop(position: number, partial: Partial<Stop> = {}): Stop {
  return {
    position,
    name: '',
    lat: null,
    lng: null,
    place_id: null,
    kind: 'stay',
    nights: 1,
    arrive_mode: position === 1 ? 'flight' : 'bus',
    arrive_note: '',
    free_days: 0,
    nearby: [],
    memo: '',
    ...partial,
  };
}

const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

export default function StopList({
  stops,
  onChange,
  canEdit,
  selected,
  onSelect,
}: {
  stops: Stop[];
  onChange: (s: Stop[]) => void;
  canEdit: boolean;
  selected: number | null; // 오른쪽 설정 패널에 열린 도시
  onSelect: (i: number | null) => void;
}) {
  const open = selected;
  const setOpen = onSelect;
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const renumber = (list: Stop[]) => list.map((s, i) => ({ ...s, position: i + 1 }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length || from === to) return;
    const list = [...stops];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    onChange(renumber(list));
    if (open === from) setOpen(to); // 열린 도시는 따라 움직임
  };
  const remove = (i: number) => {
    onChange(renumber(stops.filter((_, j) => j !== i)));
    setOpen(null);
  };
  const add = (partial: Partial<Stop>) => {
    onChange(renumber([...stops, newStop(stops.length + 1, partial)]));
    setOpen(stops.length);
  };

  let stayNo = 0;
  const totalNights = stops.filter((s) => s.kind === 'stay').reduce((a, s) => a + s.nights, 0);

  return (
    <div className="stop-list">
      <div className="row between">
        <h3>도시 순서</h3>
        <span className="small muted">현지 {totalNights}박</span>
      </div>
      <ol>
        {stops.map((s, i) => {
          const isStay = s.kind === 'stay' && s.nights > 0;
          if (isStay) stayNo += 1;
          return (
            <li
              key={s.id ?? `new-${i}`}
              className={`stop ${s.kind} ${open === i ? 'open' : ''}`}
              draggable={canEdit}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
              }}
            >
              <div className="stop-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                {canEdit && <span className="handle" title="끌어서 순서 바꾸기">⋮⋮</span>}
                <span className={`stop-num ${isStay ? '' : 'hollow'}`}>{isStay ? stayNo : ''}</span>
                <span className="stop-name">{s.name || '이름 없음'}</span>
                <span className="small muted">
                  {isStay ? `${s.nights}박` : '경유'} · {MODE_LABEL[s.arrive_mode]}
                  {s.lat === null && ' · 좌표 없음'}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <div className="add-stop">
          <PlaceSearch placeholder="도시 검색해서 추가" onPick={(p) => add({ name: p.name, lat: p.lat, lng: p.lng, place_id: p.place_id })} />
          <div className="row gap">
            <button type="button" className="small" onClick={() => add({})}>숙박 도시 직접 추가</button>
            <button type="button" className="small" onClick={() => add({ kind: 'via', nights: 0 })}>경유지 직접 추가</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 도시를 고르면 목록 오른쪽으로 빠져나오는 설정 패널 */
export function StopDetail({
  stop: s,
  number,
  canEdit,
  onPatch,
  onMove,
  onRemove,
  onClose,
}: {
  stop: Stop;
  number: number | null; // 숙박 도시 순번(경유지는 null)
  canEdit: boolean;
  onPatch: (patch: Partial<Stop>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const set = onPatch;
  return (
    <div className="stop-detail">
      <div className="stop-detail-head">
        <span className={`stop-num big ${number ? '' : 'hollow'}`}>{number ?? ''}</span>
        <h3>{s.name || '이름 없음'}</h3>
        <button type="button" className="icon ghost" title="닫기" onClick={onClose}>✕</button>
      </div>
      <fieldset className="stop-body" disabled={!canEdit}>
        <div className="grid2">
          <label>
            도시 이름
            <input value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            역할
            <select
              value={s.kind}
              onChange={(e) =>
                set(e.target.value === 'via' ? { kind: 'via', nights: 0, free_days: 0 } : { kind: 'stay', nights: Math.max(1, s.nights) })
              }
            >
              <option value="stay">숙박</option>
              <option value="via">경유(1박 안 함)</option>
            </select>
          </label>
          {s.kind === 'stay' && (
            <>
              <label>
                박수
                <input type="number" min={1} value={s.nights} onChange={(e) => set({ nights: Math.max(0, Number(e.target.value)) })} />
              </label>
            </>
          )}
          <label>
            도착 이동 수단
            <select value={s.arrive_mode} onChange={(e) => set({ arrive_mode: e.target.value as TravelMode })}>
              {MODES.map((m) => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
          </label>
          <label>
            이동 메모
            <input value={s.arrive_note} placeholder="예: 버스 약 3시간" onChange={(e) => set({ arrive_note: e.target.value })} />
          </label>
          <label>
            위도
            <input value={s.lat ?? ''} onChange={(e) => set({ lat: num(e.target.value) })} />
          </label>
          <label>
            경도
            <input value={s.lng ?? ''} onChange={(e) => set({ lng: num(e.target.value) })} />
          </label>
        </div>
        {canEdit && (
          <PlaceSearch
            placeholder="구글에서 이 도시 찾아 좌표 넣기"
            onPick={(p) => set({ name: s.name || p.name, lat: p.lat, lng: p.lng, place_id: p.place_id })}
          />
        )}
        <label>
          내부 메모 <span className="small muted">(고객용에는 안 나가요)</span>
          <textarea rows={2} value={s.memo} onChange={(e) => set({ memo: e.target.value })} />
        </label>
        {s.kind === 'stay' && (
          <NearbyEditor list={s.nearby} onChange={(nearby) => set({ nearby })} canEdit={canEdit} />
        )}
        {canEdit && (
          <div className="row gap">
            <button type="button" className="small" onClick={() => onMove(-1)}>위로</button>
            <button type="button" className="small" onClick={() => onMove(1)}>아래로</button>
            <ConfirmButton className="small danger" confirmLabel="정말 빼기" onConfirm={onRemove}>빼기</ConfirmButton>
          </div>
        )}
      </fieldset>
    </div>
  );
}

function NearbyEditor({ list, onChange, canEdit }: { list: NearbyOption[]; onChange: (l: NearbyOption[]) => void; canEdit: boolean }) {
  const set = (i: number, patch: Partial<NearbyOption>) => onChange(list.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  return (
    <div className="nearby">
      <div className="small strong">근교 당일치기 후보</div>
      {list.map((n, i) => (
        <div className="nearby-row" key={i}>
          <input value={n.name} placeholder="도시" onChange={(e) => set(i, { name: e.target.value })} />
          <input value={n.note ?? ''} placeholder="기차 시간 등" onChange={(e) => set(i, { note: e.target.value })} />
          <input className="coord" value={n.lat ?? ''} placeholder="위도" onChange={(e) => set(i, { lat: num(e.target.value) })} />
          <input className="coord" value={n.lng ?? ''} placeholder="경도" onChange={(e) => set(i, { lng: num(e.target.value) })} />
          {canEdit && (
            <button type="button" className="small danger" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <PlaceSearch placeholder="근교 도시 검색해서 추가" onPick={(p) => onChange([...list, { name: p.name, lat: p.lat, lng: p.lng, note: '' }])} />
          <button type="button" className="small" onClick={() => onChange([...list, { name: '', note: '' }])}>직접 추가</button>
        </>
      )}
    </div>
  );
}
