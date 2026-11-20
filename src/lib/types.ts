export type Role = 'admin' | 'leader';
export type StopKind = 'stay' | 'via';
export type TravelMode = 'flight' | 'bus' | 'train' | 'car' | 'ferry';
export type TourStatus = 'draft' | 'final';
export type CostKind = 'per_person' | 'fixed';
export type PdfMode = 'internal' | 'leader' | 'customer';

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
}

export interface NearbyOption {
  name: string;
  lat?: number | null;
  lng?: number | null;
  note?: string;
}

export interface DayOverride {
  plan?: string;
  memo?: string;
}

export interface Tour {
  id: string;
  name: string;
  concept: string;
  depart_date: string | null;
  min_pax: number;
  fx_rates: Record<string, number>;
  origin_label: string;
  return_overnight: boolean;
  itinerary: Record<string, DayOverride>;
  status: TourStatus;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface Stop {
  id?: string;
  tour_id?: string;
  position: number;
  name: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  kind: StopKind;
  nights: number;
  arrive_mode: TravelMode;
  arrive_note: string;
  free_days: number;
  nearby: NearbyOption[];
  memo: string;
}

export interface CostItem {
  id?: string;
  tour_id?: string;
  position: number;
  label: string;
  kind: CostKind;
  currency: string;
  amount: number;
  quantity: number;
  note: string;
}

export interface Pricing {
  tour_id?: string;
  price_options: number[];
  pax_options: number[];
  fee_rate: number;
}

export interface PnlRow {
  price: number;
  pax: number;
  revenue: number;
  total_cost: number;
  profit: number;
  margin: number | null;
  breakeven_pax: number | null;
}

export const MODE_LABEL: Record<TravelMode, string> = {
  flight: '항공',
  bus: '버스',
  train: '기차',
  car: '차량',
  ferry: '페리',
};
