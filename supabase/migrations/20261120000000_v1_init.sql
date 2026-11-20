-- 투어 루트 플래너 v1 스키마
-- 이 파일 하나로 새 Supabase 프로젝트(또는 Supabase Auth가 있는 Postgres)에 그대로 재생성할 수 있어요.
-- 원칙: 매출·마진 숫자는 코드가 아니라 이 DB에만 두고, 관리자(+2단계 인증) 로그인으로만 꺼낸다.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 1. 사용자 프로필과 역할
-- ─────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('admin', 'leader');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role         public.user_role not null default 'leader',
  created_at   timestamptz not null default now()
);

-- 초대받은 사용자가 처음 생기면 트래블리더(leader)로 프로필 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 매출·비용은 관리자 + 2단계 인증(aal2) 세션에서만
create or replace function public.is_admin_mfa()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- ─────────────────────────────────────────────
-- 2. 투어
-- ─────────────────────────────────────────────
create table if not exists public.tours (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  concept          text not null default '',
  depart_date      date,
  min_pax          int  not null default 10 check (min_pax > 0),
  fx_rates         jsonb not null default '{"KRW": 1}'::jsonb,   -- 통화 → 원화 환율, 예: {"KRW":1,"EUR":1500}
  origin_label     text not null default '인천',
  return_overnight boolean not null default true,                 -- 귀국편 기내 1박 여부
  itinerary        jsonb not null default '{}'::jsonb,           -- 일차별 직접 고친 내용 {"3": {"plan": "...", "memo": "..."}}
  status           text not null default 'draft' check (status in ('draft', 'final')),
  created_by       uuid not null default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.tour_stops (
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references public.tours (id) on delete cascade,
  position    int  not null,
  name        text not null,
  lat         double precision,
  lng         double precision,
  place_id    text,                                               -- 구글 장소는 place_id만 저장
  kind        text not null default 'stay' check (kind in ('stay', 'via')),
  nights      int  not null default 0 check (nights >= 0),
  arrive_mode text not null default 'bus' check (arrive_mode in ('flight', 'bus', 'train', 'car', 'ferry')),
  arrive_note text not null default '',                           -- 예: 버스 약 2시간 30분
  free_days   int  not null default 0 check (free_days >= 0),
  nearby      jsonb not null default '[]'::jsonb,                 -- 자유일 근교 옵션 [{name, lat, lng, note}]
  memo        text not null default ''                            -- 내부 메모(고객용에는 안 나감)
);
create index if not exists tour_stops_tour_idx on public.tour_stops (tour_id, position);

-- 비용·가격은 별도 테이블: 관리자 전용
create table if not exists public.tour_costs (
  id        uuid primary key default gen_random_uuid(),
  tour_id   uuid not null references public.tours (id) on delete cascade,
  position  int  not null default 0,
  label     text not null,
  kind      text not null check (kind in ('per_person', 'fixed')),
  currency  text not null default 'KRW',
  amount    numeric(14, 2) not null check (amount >= 0),
  quantity  numeric(10, 2) not null default 1 check (quantity >= 0),
  note      text not null default ''
);
create index if not exists tour_costs_tour_idx on public.tour_costs (tour_id, position);

create table if not exists public.tour_pricing (
  tour_id       uuid primary key references public.tours (id) on delete cascade,
  price_options numeric[] not null default '{}',   -- 참가비 후보 3가지 (원)
  pax_options   int[]     not null default '{}',   -- 비교할 인원 (비우면 최소 인원, +6, +12)
  fee_rate      numeric(6, 4) not null default 0.025 check (fee_rate >= 0 and fee_rate < 1)
);

-- 내보내기 기록 (PDF·JSON)
create table if not exists public.export_log (
  id              bigint generated always as identity primary key,
  tour_id         uuid references public.tours (id) on delete set null,
  user_id         uuid not null default auth.uid() references public.profiles (id),
  kind            text not null check (kind in ('pdf_internal', 'pdf_leader', 'pdf_customer', 'json')),
  include_finance boolean not null default false,
  created_at      timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tours_touch on public.tours;
create trigger tours_touch before update on public.tours
  for each row execute function public.touch_updated_at();

create or replace function public.can_edit_tour(p_tour uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tours t
    where t.id = p_tour and (t.created_by = auth.uid() or public.is_admin())
  );
$$;

-- ─────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.tours        enable row level security;
alter table public.tour_stops   enable row level security;
alter table public.tour_costs   enable row level security;
alter table public.tour_pricing enable row level security;
alter table public.export_log   enable row level security;

-- profiles: 본인과 관리자만 읽기. 본인은 이름만 수정(역할은 set_user_role로만)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- tours: 팀원 누구나 읽기, 만든 사람·관리자만 쓰기
drop policy if exists tours_select on public.tours;
create policy tours_select on public.tours for select to authenticated
  using (public.is_member());
drop policy if exists tours_insert on public.tours;
create policy tours_insert on public.tours for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());
drop policy if exists tours_update on public.tours;
create policy tours_update on public.tours for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
drop policy if exists tours_delete on public.tours;
create policy tours_delete on public.tours for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- tour_stops: tours와 같음
drop policy if exists stops_select on public.tour_stops;
create policy stops_select on public.tour_stops for select to authenticated
  using (public.is_member());
drop policy if exists stops_write on public.tour_stops;
create policy stops_write on public.tour_stops for all to authenticated
  using (public.can_edit_tour(tour_id)) with check (public.can_edit_tour(tour_id));

-- tour_costs / tour_pricing: 관리자(2단계 인증)만. 트래블리더·로그아웃·고객은 빈 결과
drop policy if exists costs_admin on public.tour_costs;
create policy costs_admin on public.tour_costs for all to authenticated
  using (public.is_admin_mfa()) with check (public.is_admin_mfa());
drop policy if exists pricing_admin on public.tour_pricing;
create policy pricing_admin on public.tour_pricing for all to authenticated
  using (public.is_admin_mfa()) with check (public.is_admin_mfa());

-- export_log: 본인 기록만 쓰기(매출 포함 기록은 관리자만), 읽기는 관리자
drop policy if exists export_insert on public.export_log;
create policy export_insert on public.export_log for insert to authenticated
  with check (user_id = auth.uid() and public.is_member()
              and (not include_finance or public.is_admin_mfa())
              and (kind <> 'pdf_internal' or public.is_admin_mfa())
              and (kind <> 'json' or public.is_admin()));
drop policy if exists export_select on public.export_log;
create policy export_select on public.export_log for select to authenticated
  using (public.is_admin());

-- 로그아웃 상태(anon)는 어떤 테이블에도 접근 못 하게 권한 자체를 회수
revoke all on public.profiles, public.tours, public.tour_stops, public.tour_costs,
              public.tour_pricing, public.export_log from anon;

-- ─────────────────────────────────────────────
-- 4. 매출 계산 (관리자 전용 DB 함수)
--    이익 = N·P − (N·V + F + N·P·r),  마진율 = 이익 / (N·P)
-- ─────────────────────────────────────────────
create or replace function public.tour_cost_totals(p_tour uuid)
returns table (per_person_krw numeric, fixed_krw numeric, fee_rate numeric)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_fx jsonb;
  v_missing text;
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

  return query
  select
    coalesce(round(sum(c.amount * c.quantity * case when c.currency = 'KRW' then 1 else (v_fx ->> c.currency)::numeric end)
                   filter (where c.kind = 'per_person')), 0),
    coalesce(round(sum(c.amount * c.quantity * case when c.currency = 'KRW' then 1 else (v_fx ->> c.currency)::numeric end)
                   filter (where c.kind = 'fixed')), 0),
    coalesce((select p.fee_rate from public.tour_pricing p where p.tour_id = p_tour), 0.025)
  from public.tour_costs c
  where c.tour_id = p_tour;
end $$;

create or replace function public.tour_pnl(
  p_tour   uuid,
  p_prices numeric[] default null,
  p_pax    int[]     default null
)
returns table (
  price          numeric,
  pax            int,
  revenue        numeric,
  total_cost     numeric,
  profit         numeric,
  margin         numeric,
  breakeven_pax  int
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v numeric; f numeric; r numeric;
  v_prices numeric[];
  v_pax int[];
  v_min int;
begin
  select t.per_person_krw, t.fixed_krw, t.fee_rate into v, f, r from public.tour_cost_totals(p_tour) t;

  select coalesce(p_prices, nullif(pr.price_options, '{}')),
         coalesce(p_pax, nullif(pr.pax_options, '{}'))
    into v_prices, v_pax
  from public.tour_pricing pr where pr.tour_id = p_tour;
  v_prices := coalesce(v_prices, p_prices, '{}');

  if v_pax is null then
    select tt.min_pax into v_min from public.tours tt where tt.id = p_tour;
    v_pax := coalesce(p_pax, array[v_min, v_min + 6, v_min + 12]);
  end if;

  return query
  select
    pp.p,
    nn.n,
    round(nn.n * pp.p),
    round(nn.n * v + f + nn.n * pp.p * r),
    round(nn.n * pp.p - (nn.n * v + f + nn.n * pp.p * r)),
    case when nn.n * pp.p = 0 then null
         else round((nn.n * pp.p - (nn.n * v + f + nn.n * pp.p * r)) / (nn.n * pp.p), 4) end,
    case when pp.p * (1 - r) - v <= 0 then null
         else ceil(f / (pp.p * (1 - r) - v))::int end
  from unnest(v_prices) with ordinality as pp(p, i)
  cross join unnest(v_pax) with ordinality as nn(n, j)
  order by pp.i, nn.j;
end $$;

revoke execute on function public.tour_cost_totals(uuid) from public, anon;
revoke execute on function public.tour_pnl(uuid, numeric[], int[]) from public, anon;
grant execute on function public.tour_cost_totals(uuid) to authenticated;
grant execute on function public.tour_pnl(uuid, numeric[], int[]) to authenticated;

-- ─────────────────────────────────────────────
-- 5. 역할 변경 (관리자 전용)
-- ─────────────────────────────────────────────
create or replace function public.set_user_role(p_user uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_mfa() then
    raise exception '관리자(2단계 인증) 전용입니다' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;
revoke execute on function public.set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
