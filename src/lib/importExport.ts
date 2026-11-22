// 루트 가져오기·내보내기 JSON 형식 (wannago-tour/v1)
// Claude 대화에서 이 형식으로 루트를 정리해 붙여 넣으면 '초안' 투어로 만들어집니다.
import { itineraryByDayNumber, normalizeItinerary } from './itinerary';
import type { CostItem, CostKind, DayOverride, NearbyOption, Pricing, Stop, StopKind, Tour, TravelMode } from './types';

export const FORMAT = 'wannago-tour/v1';

export interface TourFile {
  format: typeof FORMAT;
  tour: {
    name: string;
    concept?: string;
    depart_date?: string | null;
    min_pax?: number;
    fx_rates?: Record<string, number>;
    origin_label?: string;
    return_overnight?: boolean;
  };
  stops: Array<{
    name: string;
    lat?: number | null;
    lng?: number | null;
    place_id?: string | null;
    kind?: StopKind;
    nights?: number;
    arrive_mode?: TravelMode;
    arrive_note?: string;
    free_days?: number;
    nearby?: NearbyOption[];
    memo?: string;
  }>;
  days?: Array<{ day: number; plan?: string; memo?: string; free?: boolean }>;
  finance?: {
    costs: Array<{ label: string; kind: CostKind; currency?: string; amount: number; quantity?: number; per_night?: boolean; note?: string }>;
    price_options?: number[];
    pax_options?: number[];
    fee_rate?: number;
  };
}

export interface ParsedImport {
  tour: Omit<Tour, 'id' | 'created_by' | 'created_at' | 'updated_at'>;
  stops: Stop[];
  costs: CostItem[];
  pricing: Pricing | null;
  hasFinance: boolean;
  warnings: string[];
}

const KINDS: StopKind[] = ['stay', 'via'];
const MODES: TravelMode[] = ['flight', 'bus', 'train', 'car', 'ferry'];
const COST_KINDS: CostKind[] = ['per_person', 'fixed'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || v === null || isNum(v);

export function parseTourFile(text: string): { ok: true; value: ParsedImport } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON을 읽을 수 없어요: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const f = raw as TourFile;
  if (!f || typeof f !== 'object') return { ok: false, errors: ['최상위가 객체여야 해요'] };
  if (f.format !== FORMAT) errors.push(`format은 "${FORMAT}"이어야 해요`);
  if (!f.tour || typeof f.tour.name !== 'string' || !f.tour.name.trim()) errors.push('tour.name(투어 이름)이 필요해요');
  if (!Array.isArray(f.stops) || f.stops.length === 0) errors.push('stops(도시 목록)가 1개 이상 필요해요');

  const fx: Record<string, number> = { KRW: 1, ...(f.tour?.fx_rates ?? {}) };
  for (const [k, v] of Object.entries(fx)) if (!isNum(v) || v <= 0) errors.push(`fx_rates.${k}는 0보다 큰 숫자여야 해요`);
  if (f.tour?.min_pax !== undefined && (!Number.isInteger(f.tour.min_pax) || f.tour.min_pax <= 0))
    errors.push('tour.min_pax는 1 이상의 정수여야 해요');
  if (f.tour?.depart_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.tour.depart_date))
    errors.push('tour.depart_date는 YYYY-MM-DD 형식이어야 해요');

  (f.stops ?? []).forEach((s, i) => {
    const at = `stops[${i}]`;
    if (!s || typeof s.name !== 'string' || !s.name.trim()) errors.push(`${at}.name이 필요해요`);
    if (s?.kind && !KINDS.includes(s.kind)) errors.push(`${at}.kind는 stay 또는 via`);
    if (s?.arrive_mode && !MODES.includes(s.arrive_mode)) errors.push(`${at}.arrive_mode는 ${MODES.join('/')} 중 하나`);
    if (s?.nights !== undefined && (!Number.isInteger(s.nights) || s.nights < 0)) errors.push(`${at}.nights는 0 이상의 정수`);
    if (s?.free_days !== undefined && (!Number.isInteger(s.free_days) || s.free_days < 0)) errors.push(`${at}.free_days는 0 이상의 정수`);
    if (!optNum(s?.lat) || !optNum(s?.lng)) errors.push(`${at}.lat/lng는 숫자`);
    if (s && (s.lat === undefined || s.lat === null)) warnings.push(`${s.name}: 좌표가 없어 지도에 안 나와요(편집 화면에서 검색해 넣기)`);
    if (s?.kind === 'via' && s.nights) warnings.push(`${s.name}: 경유지라 박수는 무시돼요`);
  });

  (f.days ?? []).forEach((d, i) => {
    if (!Number.isInteger(d?.day) || d.day < 1) errors.push(`days[${i}].day는 1 이상의 정수`);
  });

  let costs: CostItem[] = [];
  let pricing: Pricing | null = null;
  if (f.finance) {
    if (!Array.isArray(f.finance.costs)) errors.push('finance.costs는 배열이어야 해요');
    costs = (f.finance.costs ?? []).map((c, i) => {
      const at = `finance.costs[${i}]`;
      if (!c?.label) errors.push(`${at}.label이 필요해요`);
      if (!COST_KINDS.includes(c?.kind)) errors.push(`${at}.kind는 per_person 또는 fixed`);
      if (!isNum(c?.amount) || c.amount < 0) errors.push(`${at}.amount는 0 이상의 숫자`);
      const currency = (c?.currency ?? 'KRW').toUpperCase();
      if (currency !== 'KRW' && !fx[currency]) errors.push(`${at}: ${currency} 환율이 tour.fx_rates에 없어요`);
      return {
        position: i + 1,
        label: c?.label ?? '',
        kind: c?.kind,
        currency,
        amount: c?.amount ?? 0,
        quantity: c?.quantity ?? 1,
        per_night: Boolean(c?.per_night),
        note: c?.note ?? '',
      };
    });
    const fr = f.finance.fee_rate ?? 0.025;
    if (!isNum(fr) || fr < 0 || fr >= 1) errors.push('finance.fee_rate는 0~1 사이(예: 0.025)');
    pricing = {
      price_options: f.finance.price_options ?? [],
      pax_options: f.finance.pax_options ?? [],
      fee_rate: fr,
    };
  }

  if (errors.length) return { ok: false, errors };

  const itinerary: Record<string, DayOverride> = {};
  for (const d of f.days ?? []) {
    const v: DayOverride = {};
    if (d.plan?.trim()) v.plan = d.plan;
    if (d.memo?.trim()) v.memo = d.memo;
    if (typeof d.free === 'boolean') v.free = d.free;
    if (Object.keys(v).length) itinerary[String(d.day)] = v;
  }

  const stops: Stop[] = f.stops.map((s, i) => {
    const kind = s.kind ?? 'stay';
    const nights = kind === 'via' ? 0 : s.nights ?? 0;
    return {
      position: i + 1,
      name: s.name.trim(),
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      place_id: s.place_id ?? null,
      kind,
      nights,
      arrive_mode: s.arrive_mode ?? (i === 0 ? 'flight' : 'bus'),
      arrive_note: s.arrive_note ?? '',
      free_days: Math.min(s.free_days ?? 0, Math.max(0, nights - 1)),
      nearby: (s.nearby ?? []).map((n) => ({ name: n.name, lat: n.lat ?? null, lng: n.lng ?? null, note: n.note ?? '' })),
      memo: s.memo ?? '',
    };
  });

  return {
    ok: true,
    value: {
      tour: {
        name: f.tour.name.trim(),
        concept: f.tour.concept ?? '',
        depart_date: f.tour.depart_date ?? null,
        min_pax: f.tour.min_pax ?? 10,
        fx_rates: fx,
        origin_label: f.tour.origin_label ?? '인천',
        return_overnight: f.tour.return_overnight ?? true,
        // 일차 번호로 받은 내용을 도시 키로 바꿔 저장(이후 하루를 넣고 빼도 내용이 따라감)
        itinerary: normalizeItinerary(stops, { origin_label: f.tour.origin_label ?? '인천', return_overnight: f.tour.return_overnight ?? true, itinerary }),
        status: 'draft', // 가져오기는 항상 초안
      },
      stops,
      costs,
      pricing,
      hasFinance: Boolean(f.finance),
      warnings,
    },
  };
}

export function buildTourFile(
  tour: Tour,
  stops: Stop[],
  finance?: { costs: CostItem[]; pricing: Pricing | null },
): TourFile {
  const days = itineraryByDayNumber(stops, tour);
  const file: TourFile = {
    format: FORMAT,
    tour: {
      name: tour.name,
      concept: tour.concept,
      depart_date: tour.depart_date,
      min_pax: tour.min_pax,
      fx_rates: tour.fx_rates,
      origin_label: tour.origin_label,
      return_overnight: tour.return_overnight,
    },
    stops: [...stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        place_id: s.place_id,
        kind: s.kind,
        nights: s.nights,
        arrive_mode: s.arrive_mode,
        arrive_note: s.arrive_note,
        free_days: s.free_days,
        nearby: s.nearby,
        memo: s.memo,
      })),
    days,
  };
  if (finance) {
    file.finance = {
      costs: finance.costs.map((c) => ({
        label: c.label,
        kind: c.kind,
        currency: c.currency,
        amount: Number(c.amount),
        quantity: Number(c.quantity),
        ...(c.per_night ? { per_night: true } : {}),
        note: c.note,
      })),
      price_options: finance.pricing?.price_options.map(Number) ?? [],
      pax_options: finance.pricing?.pax_options ?? [],
      fee_rate: Number(finance.pricing?.fee_rate ?? 0.025),
    };
  }
  return file;
}

// Claude 대화에 붙여 넣을 형식 안내문
export const CLAUDE_FORMAT_GUIDE = `아래 JSON 형식(wannago-tour/v1)으로 루트를 정리해 줘. JSON만 코드 블록으로 줘.
{
  "format": "wannago-tour/v1",
  "tour": { "name": "투어 이름", "concept": "컨셉 한 줄", "depart_date": null, "min_pax": 20,
            "fx_rates": { "KRW": 1, "EUR": 1500 }, "origin_label": "인천", "return_overnight": true },
  "stops": [
    { "name": "도시", "lat": 38.7223, "lng": -9.1393, "kind": "stay", "nights": 3,
      "arrive_mode": "flight", "arrive_note": "인천 → 도시 항공",
      "nearby": [ { "name": "근교 도시", "lat": 38.70, "lng": -9.42, "note": "기차 약 1시간 30분" } ] },
    { "name": "경유 도시", "lat": 0, "lng": 0, "kind": "via", "arrive_mode": "bus" }
  ],
  "days": [ { "day": 1, "plan": "그날 주요 일정" } ]
}
규칙: stops는 방문 순서대로. kind는 stay(숙박) 또는 via(경유, 박수 없음). arrive_mode는 flight/bus/train/car/ferry 중 하나이고 '그 도시에 도착할 때'의 이동 수단.
nearby는 근교 당일치기 후보(선택). days는 자동 일정표를 덮어쓸 날만. 비용·가격(finance)은 넣지 마.`;
