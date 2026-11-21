// Supabase 데이터 접근. 권한은 DB의 RLS가 판단하고, 여기서는 호출만 합니다.
import { supabase } from './supabase';
import type { CostItem, PdfMode, PnlRow, Pricing, Profile, Stop, Tour } from './types';
import type { ParsedImport } from './importExport';

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const STOP_COLS = 'id,tour_id,position,name,lat,lng,place_id,kind,nights,arrive_mode,arrive_note,free_days,nearby,memo';

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await supabase.from('profiles').select('id,display_name,role').eq('id', userId).maybeSingle();
  return check(res) as Profile | null;
}

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  check(await supabase.from('profiles').update({ display_name: name }).eq('id', userId));
}

export async function listTours(): Promise<Tour[]> {
  return check(await supabase.from('tours').select('*').order('updated_at', { ascending: false })) as Tour[];
}

export async function getTour(id: string): Promise<{ tour: Tour; stops: Stop[] }> {
  const tour = check(await supabase.from('tours').select('*').eq('id', id).single()) as Tour;
  const stops = check(
    await supabase.from('tour_stops').select(STOP_COLS).eq('tour_id', id).order('position'),
  ) as Stop[];
  return { tour, stops };
}

type TourInput = Omit<Tour, 'id' | 'created_by' | 'created_at' | 'updated_at'>;

export async function createTour(input: TourInput, userId: string): Promise<Tour> {
  return check(await supabase.from('tours').insert({ ...input, created_by: userId }).select('*').single()) as Tour;
}

export async function updateTour(id: string, patch: Partial<TourInput>): Promise<void> {
  check(await supabase.from('tours').update(patch).eq('id', id));
}

export async function deleteTour(id: string): Promise<void> {
  check(await supabase.from('tours').delete().eq('id', id));
}

export async function replaceStops(tourId: string, stops: Stop[]): Promise<Stop[]> {
  check(await supabase.from('tour_stops').delete().eq('tour_id', tourId));
  if (stops.length === 0) return [];
  const rows = stops.map((s, i) => {
    // id는 새로 매김 (삭제 후 재삽입)
    const { id: _id, tour_id: _t, ...rest } = s;
    return { ...rest, position: i + 1, tour_id: tourId };
  });
  return check(await supabase.from('tour_stops').insert(rows).select(STOP_COLS).order('position')) as Stop[];
}

// ── 관리자(2단계 인증) 전용: RLS가 아니면 빈 결과/오류 ──
export async function getCosts(tourId: string): Promise<CostItem[]> {
  return check(await supabase.from('tour_costs').select('*').eq('tour_id', tourId).order('position')) as CostItem[];
}

export async function replaceCosts(tourId: string, costs: CostItem[]): Promise<void> {
  check(await supabase.from('tour_costs').delete().eq('tour_id', tourId));
  if (!costs.length) return;
  const rows = costs.map((c, i) => {
    const { id: _id, tour_id: _t, ...rest } = c;
    return { ...rest, position: i + 1, tour_id: tourId };
  });
  check(await supabase.from('tour_costs').insert(rows));
}

export async function getPricing(tourId: string): Promise<Pricing | null> {
  return check(await supabase.from('tour_pricing').select('*').eq('tour_id', tourId).maybeSingle()) as Pricing | null;
}

export async function savePricing(tourId: string, p: Pricing): Promise<void> {
  check(
    await supabase.from('tour_pricing').upsert({
      tour_id: tourId,
      price_options: p.price_options,
      pax_options: p.pax_options,
      fee_rate: p.fee_rate,
    }),
  );
}

export async function costTotalsRpc(tourId: string): Promise<{ per_person_krw: number; fixed_krw: number; fee_rate: number }> {
  const rows = check(await supabase.rpc('tour_cost_totals', { p_tour: tourId })) as Array<{
    per_person_krw: number;
    fixed_krw: number;
    fee_rate: number;
  }>;
  const r = rows[0] ?? { per_person_krw: 0, fixed_krw: 0, fee_rate: 0.025 };
  return { per_person_krw: Number(r.per_person_krw), fixed_krw: Number(r.fixed_krw), fee_rate: Number(r.fee_rate) };
}

export async function pnlRpc(tourId: string): Promise<PnlRow[]> {
  const rows = check(await supabase.rpc('tour_pnl', { p_tour: tourId })) as PnlRow[];
  return rows.map((r) => ({
    price: Number(r.price),
    pax: Number(r.pax),
    revenue: Number(r.revenue),
    total_cost: Number(r.total_cost),
    profit: Number(r.profit),
    margin: r.margin === null ? null : Number(r.margin),
    breakeven_pax: r.breakeven_pax === null ? null : Number(r.breakeven_pax),
  }));
}

export async function logExport(tourId: string, kind: 'json' | `pdf_${PdfMode}`, includeFinance: boolean, userId: string) {
  check(await supabase.from('export_log').insert({ tour_id: tourId, kind, include_finance: includeFinance, user_id: userId }));
}

// 가져오기: 항상 '초안'으로 생성. 매출 정보는 관리자(2단계 인증)일 때만 저장
export async function importTour(p: ParsedImport, userId: string, financeAllowed: boolean): Promise<Tour> {
  const tour = await createTour({ ...p.tour, status: 'draft' }, userId);
  await replaceStops(tour.id, p.stops);
  if (p.hasFinance && financeAllowed) {
    await replaceCosts(tour.id, p.costs);
    if (p.pricing) await savePricing(tour.id, p.pricing);
  }
  return tour;
}

export async function duplicateTour(id: string, userId: string, financeAllowed: boolean): Promise<Tour> {
  const { tour, stops } = await getTour(id);
  const { id: _i, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = tour;
  const copy = await createTour({ ...rest, name: `${tour.name} (복사)`, status: 'draft' }, userId);
  await replaceStops(copy.id, stops);
  if (financeAllowed) {
    const costs = await getCosts(id);
    if (costs.length) await replaceCosts(copy.id, costs);
    const pricing = await getPricing(id);
    if (pricing) await savePricing(copy.id, pricing);
  }
  return copy;
}
