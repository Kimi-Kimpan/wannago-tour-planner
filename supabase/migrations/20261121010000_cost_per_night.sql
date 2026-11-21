-- 비용 항목의 수량을 '투어 총 박수'와 연동하는 옵션 (예: 숙박 1박 단가 × 박수)
-- 일정표에서 하루를 넣고 빼면 매출 계산에도 자동 반영돼요. 여러 번 실행해도 안전합니다.
alter table public.tour_costs add column if not exists per_night boolean not null default false;

create or replace function public.tour_cost_totals(p_tour uuid)
returns table (per_person_krw numeric, fixed_krw numeric, fee_rate numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_fx jsonb;
  v_missing text;
  v_nights numeric;
begin
  if not public.is_admin_mfa() then
    raise exception '관리자(2단계 인증) 전용입니다' using errcode = '42501';
  end if;

  select t.fx_rates into v_fx from public.tours t where t.id = p_tour;
  if v_fx is null then
    raise exception '투어를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  select string_agg(distinct c.currency, ', ') into v_missing
  from public.tour_costs c
  where c.tour_id = p_tour and c.currency <> 'KRW' and (v_fx ->> c.currency) is null;
  if v_missing is not null then
    raise exception '환율이 없는 통화: %', v_missing using errcode = '22023';
  end if;

  select coalesce(sum(s.nights), 0) into v_nights
  from public.tour_stops s where s.tour_id = p_tour and s.kind = 'stay';

  return query
  select
    coalesce(round(sum(c.amount * (case when c.per_night then v_nights else c.quantity end)
                       * case when c.currency = 'KRW' then 1 else (v_fx ->> c.currency)::numeric end)
                   filter (where c.kind = 'per_person')), 0),
    coalesce(round(sum(c.amount * (case when c.per_night then v_nights else c.quantity end)
                       * case when c.currency = 'KRW' then 1 else (v_fx ->> c.currency)::numeric end)
                   filter (where c.kind = 'fixed')), 0),
    coalesce((select p.fee_rate from public.tour_pricing p where p.tour_id = p_tour), 0.025)
  from public.tour_costs c
  where c.tour_id = p_tour;
end $$;

revoke execute on function public.tour_cost_totals(uuid) from public, anon;
grant execute on function public.tour_cost_totals(uuid) to authenticated;
