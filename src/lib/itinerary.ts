// 루트(도시 순서·박수·경유지·자유일)에서 일차별 일정표를 만들고,
// 일정표에서 하루를 추가·삭제·위아래로 옮기면 그 결과를 다시 루트(박수·자유일)에 반영합니다.
//
// 일차별로 직접 고친 내용은 tours.itinerary에 '도시#순번:그 도시의 몇 번째 날' 키로 저장해요.
// 예: "뮌헨#1:2" = 첫 번째 뮌헨 체류의 셋째 날. 'depart' = 귀국편 출발일, 'return' = 귀국일.
// (예전 형식인 일차 번호 키 "3"도 읽을 수 있고, 편집을 시작하면 새 형식으로 바뀌어요.)
import { MODE_LABEL, type DayOverride, type Stop, type Tour, type TravelMode } from './types';

export interface ItineraryDay {
  day: number;
  key: string;
  stopIndex: number | null; // 정렬된 stops 배열에서의 위치 (출국·귀국일은 null)
  k: number | null; // 그 도시의 몇 번째 날(0 = 도착일)
  base: string | null; // 그날 머무는 거점 도시
  transfer: null | {
    from: string;
    to: string;
    mode: TravelMode;
    note: string;
    vias: string[];
  };
  sleep: string; // 숙박 도시, '기내', '-'
  isFree: boolean;
  freeOptions: string[];
  autoPlan: string;
  plan: string; // 직접 고친 값이 있으면 그 값
  rawPlan: string; // 직접 고친 값(없으면 '')
  memo: string; // 내부 메모
  edited: boolean;
}

type Itin = Record<string, DayOverride>;
type TourLike = Pick<Tour, 'origin_label' | 'return_overnight'> & { itinerary?: Itin };

const isStay = (s: Stop) => s.kind === 'stay' && s.nights > 0;
const sorted = (stops: Stop[]) => [...stops].sort((a, b) => a.position - b.position);
const isLegacyKey = (k: string) => /^\d+$/.test(k);

export function totalNights(stops: Stop[]): number {
  return stops.filter(isStay).reduce((a, s) => a + s.nights, 0);
}

/** 정렬된 stops 각각의 체류 키 (경유지는 null). 같은 도시를 두 번 가면 #1, #2 */
export function stayKeys(stops: Stop[]): (string | null)[] {
  const seen: Record<string, number> = {};
  return stops.map((s) => {
    if (!isStay(s)) return null;
    seen[s.name] = (seen[s.name] ?? 0) + 1;
    return `${s.name}#${seen[s.name]}`;
  });
}

export function buildItinerary(stopsIn: Stop[], tour: TourLike): ItineraryDay[] {
  const stops = sorted(stopsIn);
  const keys = stayKeys(stops);
  const itin = tour.itinerary ?? {};
  const legacy = Object.keys(itin).length > 0 && Object.keys(itin).every(isLegacyKey);
  const days: ItineraryDay[] = [];
  const origin = tour.origin_label || '출발지';
  let d = 1;
  let pendingVias: string[] = [];
  let prevStay: string = origin;

  const blank = (day: number, key: string, base: string | null, stopIndex: number | null, k: number | null): ItineraryDay => ({
    day,
    key,
    stopIndex,
    k,
    base,
    transfer: null,
    sleep: '-',
    isFree: false,
    freeOptions: [],
    autoPlan: '',
    plan: '',
    rawPlan: '',
    memo: '',
    edited: false,
  });
  const lookup = (day: ItineraryDay): DayOverride | undefined => (legacy ? itin[String(day.day)] : itin[day.key]);

  stops.forEach((s, si) => {
    if (!isStay(s)) {
      pendingVias.push(s.name);
      return;
    }
    const nights = s.nights;
    const freeCount = Math.min(Math.max(0, s.free_days), nights - 1);
    for (let k = 0; k < nights; k++) {
      const day = blank(d + k, `${keys[si]}:${k}`, s.name, si, k);
      day.sleep = s.name;
      if (k === 0) {
        day.transfer = { from: prevStay, to: s.name, mode: s.arrive_mode, note: s.arrive_note, vias: pendingVias };
      } else {
        const explicit = lookup(day)?.free;
        // 직접 정한 자유일이 있으면 그대로, 없으면 머무는 날의 끝에서부터 free_days일
        day.isFree = explicit !== undefined ? explicit : k >= nights - freeCount;
      }
      if (day.isFree) day.freeOptions = (s.nearby ?? []).map((n) => n.name).filter(Boolean);
      days.push(day);
    }
    pendingVias = [];
    prevStay = s.name;
    d += nights;
  });

  if (days.length > 0) {
    const dep = blank(d, 'depart', null, null, null);
    dep.transfer = { from: prevStay, to: origin, mode: 'flight', note: '', vias: pendingVias };
    dep.sleep = tour.return_overnight ? '기내' : '-';
    days.push(dep);
    if (tour.return_overnight) {
      const arr = blank(d + 1, 'return', null, null, null);
      arr.autoPlan = `${origin} 도착`;
      days.push(arr);
    }
  }

  for (const day of days) {
    if (!day.autoPlan) {
      // 자유일 표시는 쓰지 않음(워너고는 전 일정 조별 자유여행). 이동일만 경유지를 자동으로 적음
      if (day.transfer) {
        day.autoPlan = day.transfer.vias.length ? `${day.transfer.vias.join('·')} 경유` : '';
      }
    }
    const o = lookup(day);
    day.rawPlan = o?.plan?.trim() ? (o.plan as string) : '';
    day.plan = day.rawPlan || day.autoPlan;
    day.memo = o?.memo ?? '';
    day.edited = Boolean(day.rawPlan);
  }
  return days;
}

/** 예전 형식(일차 번호 키)을 새 형식(도시 키)으로 바꿈. 이미 새 형식이면 그대로 */
export function normalizeItinerary(stops: Stop[], tour: TourLike): Itin {
  const itin = tour.itinerary ?? {};
  const keys = Object.keys(itin);
  if (keys.length === 0 || !keys.every(isLegacyKey)) return itin;
  const out: Itin = {};
  for (const day of buildItinerary(stops, tour)) {
    const o = itin[String(day.day)];
    if (!o) continue;
    const v: DayOverride = {};
    if (o.plan?.trim()) v.plan = o.plan;
    if (o.memo?.trim()) v.memo = o.memo;
    if (o.free !== undefined && day.k) v.free = o.free;
    if (Object.keys(v).length) out[day.key] = v;
  }
  return out;
}

/** 새 형식 → 일차 번호 형식 (JSON 내보내기용) */
export function itineraryByDayNumber(stops: Stop[], tour: TourLike): Array<{ day: number; plan?: string; memo?: string; free?: boolean }> {
  const itin = tour.itinerary ?? {};
  const legacy = Object.keys(itin).length > 0 && Object.keys(itin).every(isLegacyKey);
  return buildItinerary(stops, tour)
    .map((d) => {
      const o = (legacy ? itin[String(d.day)] : itin[d.key]) ?? {};
      const row: { day: number; plan?: string; memo?: string; free?: boolean } = { day: d.day };
      if (d.rawPlan) row.plan = d.rawPlan;
      if (d.memo) row.memo = d.memo;
      if (o.free !== undefined && d.k) row.free = o.free;
      return row;
    })
    .filter((r) => Object.keys(r).length > 1);
}

// ─────────────────────────────────────────────
// 일정표에서 하루 단위로 고치기 (추가·삭제·위아래 이동)
// ─────────────────────────────────────────────
interface Item {
  stop: number; // 정렬된 stops에서의 위치
  arrival: boolean; // 그 도시에 도착하는 날(이동일)
  content: DayOverride;
}

export interface RouteState {
  stops: Stop[];
  itinerary: Itin;
}

function norm(stops: Stop[], tour: TourLike): TourLike {
  return { ...tour, itinerary: normalizeItinerary(stops, tour) };
}

function toItems(stops: Stop[], tour: TourLike): Item[] {
  return buildItinerary(stops, tour)
    .filter((d) => d.stopIndex !== null)
    .map((d) => ({
      stop: d.stopIndex as number,
      arrival: d.k === 0,
      content: { plan: d.rawPlan, memo: d.memo, free: d.k === 0 ? undefined : d.isFree },
    }));
}

function fromItems(stopsSorted: Stop[], items: Item[], tour: TourLike): RouteState {
  // 각 날을 바로 앞의 도착일이 속한 도시에 붙임
  let current = -1;
  const assigned = items.map((it) => {
    if (it.arrival) current = it.stop;
    return { ...it, stop: it.arrival ? it.stop : current };
  });
  const count: Record<number, Item[]> = {};
  for (const it of assigned) (count[it.stop] ??= []).push(it);

  const newStops = stopsSorted.map((s, i) => {
    if (!isStay(s)) return s;
    const list = count[i] ?? [];
    if (list.length === 0) return { ...s, kind: 'via' as const, nights: 0, free_days: 0 }; // 하루도 안 남으면 경유지로
    return { ...s, nights: list.length, free_days: list.filter((x) => !x.arrival && x.content.free).length };
  });

  const keys = stayKeys(newStops);
  const old = tour.itinerary ?? {};
  const itinerary: Itin = {};
  if (old.depart) itinerary.depart = old.depart;
  if (old.return) itinerary.return = old.return;
  const k: Record<number, number> = {};
  for (const it of assigned) {
    const idx = (k[it.stop] = (k[it.stop] ?? -1) + 1);
    const key = `${keys[it.stop]}:${idx}`;
    const v: DayOverride = {};
    if (it.content.plan?.trim()) v.plan = it.content.plan;
    if (it.content.memo?.trim()) v.memo = it.content.memo;
    if (idx > 0) v.free = Boolean(it.content.free); // 자유일 위치를 그대로 유지
    if (Object.keys(v).length) itinerary[key] = v;
  }
  return { stops: newStops, itinerary };
}

/** idx = 일정표의 (일차 - 1). 위(-1)·아래(+1)로 옮길 수 있으면 새 상태, 아니면 null */
export function moveDay(stops: Stop[], tour: TourLike, idx: number, dir: -1 | 1): RouteState | null {
  const s = sorted(stops);
  tour = norm(s, tour);
  const items = toItems(s, tour);
  const j = idx + dir;
  if (idx < 0 || j < 0 || idx >= items.length || j >= items.length) return null;
  const [a, b] = dir === 1 ? [items[idx], items[j]] : [items[j], items[idx]];
  if (a.arrival && b.arrival) return null; // 도시 순서는 도시 목록에서 바꾸기
  const next = [...items];
  next[idx] = items[j];
  next[j] = items[idx];
  if (!next[0].arrival) return null; // 첫날은 항상 첫 도시 도착일
  return fromItems(s, next, tour);
}

/** 하루 빼기. 도착일을 빼면 그다음 날이 도착일이 되고, 마지막 하루면 그 도시는 경유지가 됨 */
export function deleteDay(stops: Stop[], tour: TourLike, idx: number): RouteState | null {
  const s = sorted(stops);
  tour = norm(s, tour);
  const items = toItems(s, tour);
  if (idx < 0 || idx >= items.length) return null;
  const it = items[idx];
  const next = items.filter((_, i) => i !== idx);
  if (it.arrival) {
    const follower = next[idx];
    if (follower && !follower.arrival && follower.stop === it.stop) {
      next[idx] = { ...follower, arrival: true, content: { ...follower.content, free: undefined } };
    }
  }
  if (next.length && !next[0].arrival) return null;
  return fromItems(s, next, tour);
}

/** stopIndex(정렬된 stops 기준) 도시의 마지막 날 뒤에 하루 추가 */
export function addDay(stops: Stop[], tour: TourLike, stopIndex: number): RouteState | null {
  const s = sorted(stops);
  if (!s[stopIndex] || !isStay(s[stopIndex])) return null;
  tour = norm(s, tour);
  const items = toItems(s, tour);
  let last = -1;
  items.forEach((it, i) => {
    if (it.stop === stopIndex) last = i;
  });
  const next = [...items];
  next.splice(last + 1, 0, { stop: stopIndex, arrival: false, content: { free: false } });
  return fromItems(s, next, tour);
}

/** 하루의 자유일 여부 바꾸기 */
export function setFreeDay(stops: Stop[], tour: TourLike, idx: number, free: boolean): RouteState | null {
  const s = sorted(stops);
  tour = norm(s, tour);
  const items = toItems(s, tour);
  if (!items[idx] || items[idx].arrival) return null;
  const next = [...items];
  next[idx] = { ...items[idx], content: { ...items[idx].content, free } };
  return fromItems(s, next, tour);
}

/** 도시 목록에서 이름·자유일 수를 바꿨을 때 일정표의 직접 고친 내용이 따라가게 */
export function rekeyAfterStopEdit(prev: Stop[], next: Stop[], itin: Itin): Itin {
  const a = sorted(prev);
  const b = sorted(next);
  if (a.length !== b.length) return itin;
  const ka = stayKeys(a);
  const kb = stayKeys(b);
  let out = itin;
  a.forEach((s, i) => {
    const t = b[i];
    if (!t) return;
    const renamed = ka[i] && kb[i] && ka[i] !== kb[i] && s.kind === t.kind;
    const freeChanged = s.free_days !== t.free_days;
    if (!renamed && !freeChanged) return;
    const copy: Itin = {};
    for (const [key, v] of Object.entries(out)) {
      const hit = ka[i] && key.startsWith(`${ka[i]}:`);
      if (!hit) {
        copy[key] = v;
        continue;
      }
      const newKey = renamed ? `${kb[i]}:${key.slice((ka[i] as string).length + 1)}` : key;
      const nv = { ...v };
      if (freeChanged) delete nv.free; // 자유일 수를 바꾸면 기본 규칙(끝에서부터)으로
      if (Object.keys(nv).length) copy[newKey] = nv;
    }
    out = copy;
  });
  return out;
}

export function transferText(t: ItineraryDay['transfer']): string {
  if (!t) return '-';
  const route = [t.from, ...t.vias, t.to].join(' → ');
  const extra = t.note ? `, ${t.note}` : '';
  return `${route} (${MODE_LABEL[t.mode]}${extra})`;
}
