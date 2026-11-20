// 루트(도시 순서·박수·경유지·자유일)에서 일차별 일정표를 자동으로 만듭니다.
import { MODE_LABEL, type DayOverride, type Stop, type Tour, type TravelMode } from './types';

export interface ItineraryDay {
  day: number;
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
  memo: string; // 내부 메모
  edited: boolean;
}

type TourLike = Pick<Tour, 'origin_label' | 'return_overnight'> & { itinerary?: Record<string, DayOverride> };

export function totalNights(stops: Stop[]): number {
  return stops.filter((s) => s.kind === 'stay').reduce((a, s) => a + Math.max(0, s.nights), 0);
}

export function buildItinerary(stopsIn: Stop[], tour: TourLike): ItineraryDay[] {
  const stops = [...stopsIn].sort((a, b) => a.position - b.position);
  const days: ItineraryDay[] = [];
  const origin = tour.origin_label || '출발지';
  let d = 1;
  let pendingVias: string[] = [];
  let prevStay: string = origin;

  const blank = (day: number, base: string | null): ItineraryDay => ({
    day,
    base,
    transfer: null,
    sleep: '-',
    isFree: false,
    freeOptions: [],
    autoPlan: '',
    plan: '',
    memo: '',
    edited: false,
  });

  for (const s of stops) {
    // 박수가 0인 숙박지는 경유지처럼 다룸
    if (s.kind === 'via' || s.nights <= 0) {
      pendingVias.push(s.name);
      continue;
    }
    const arrival = d;
    for (let k = 0; k < s.nights; k++) {
      const day = blank(arrival + k, s.name);
      day.sleep = s.name;
      if (k === 0) {
        day.transfer = {
          from: prevStay,
          to: s.name,
          mode: s.arrive_mode,
          note: s.arrive_note,
          vias: pendingVias,
        };
      }
      days.push(day);
    }
    // 자유일: 도착일을 뺀 머무는 날 중 마지막 날부터
    const fullDays = s.nights - 1;
    const free = Math.min(Math.max(0, s.free_days), fullDays);
    for (let k = 0; k < free; k++) {
      const day = days[days.length - 1 - k];
      day.isFree = true;
      day.freeOptions = (s.nearby ?? []).map((n) => n.name).filter(Boolean);
    }
    pendingVias = [];
    prevStay = s.name;
    d += s.nights;
  }

  if (days.length > 0) {
    const dep = blank(d, null);
    dep.transfer = { from: prevStay, to: origin, mode: 'flight', note: '', vias: pendingVias };
    dep.sleep = tour.return_overnight ? '기내' : '-';
    days.push(dep);
    if (tour.return_overnight) {
      const arr = blank(d + 1, null);
      arr.autoPlan = `${origin} 도착`;
      days.push(arr);
    }
  }

  for (const day of days) {
    if (!day.autoPlan) {
      if (day.isFree) {
        day.autoPlan = day.freeOptions.length
          ? `자유일: ${day.base} 또는 ${day.freeOptions.join(' / ')}`
          : `자유일: ${day.base}`;
      } else if (day.transfer) {
        day.autoPlan = day.transfer.vias.length ? `${day.transfer.vias.join('·')} 경유` : '';
      }
    }
    const o = tour.itinerary?.[String(day.day)];
    day.plan = o?.plan?.trim() ? o.plan : day.autoPlan;
    day.memo = o?.memo ?? '';
    day.edited = Boolean(o?.plan?.trim());
  }
  return days;
}

export function transferText(t: ItineraryDay['transfer']): string {
  if (!t) return '-';
  const route = [t.from, ...t.vias, t.to].join(' → ');
  const extra = t.note ? `, ${t.note}` : '';
  return `${route} (${MODE_LABEL[t.mode]}${extra})`;
}
