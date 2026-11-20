-- 로컬 검증: RLS(비용은 관리자+MFA만)와 매출 계산 함수가 설계서 검산 예시와 맞는지
-- 실행: npm run test:db  (scripts/test-db.sh 참고)
\set ON_ERROR_STOP on
\set admin '11111111-1111-1111-1111-111111111111'
\set leader '22222222-2222-2222-2222-222222222222'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'admin',  'admin@example.com',  '{"name":"관리자"}'),
  (:'leader', 'leader@example.com', '{"name":"트래블리더"}');
update public.profiles set role = 'admin' where id = :'admin';

-- 시드(슈퍼유저로 넣음). 더미 숫자만 씁니다 (실제 상품의 비용·가격은 저장소에 넣지 않음)
insert into public.tours (id, name, min_pax, fx_rates, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '[더미] 계산 검증', 20, '{"KRW":1,"EUR":1500}', :'admin');
insert into public.tour_costs (tour_id, label, kind, currency, amount, quantity) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '1인 변동비', 'per_person', 'KRW', 1000000, 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', '고정비', 'fixed', 'KRW', 10000000, 1);
insert into public.tour_pricing (tour_id, price_options, pax_options, fee_rate) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{2000000,2500000}', '{20}', 0.025);

insert into public.tours (id, name, min_pax, fx_rates, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '[더미] 이베리아 샘플 투어 9일', 20, '{"KRW":1,"EUR":1500}', :'admin');
insert into public.tour_costs (tour_id, position, label, kind, currency, amount, quantity) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 1, '숙박 (1인 1박)', 'per_person', 'EUR', 60, 7),
  ('aaaaaaaa-0000-0000-0000-000000000002', 2, '보험·예비비', 'per_person', 'KRW', 370000, 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 3, '고정비', 'fixed', 'KRW', 10000000, 1);
insert into public.tour_pricing (tour_id, price_options, pax_options, fee_rate) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '{1800000,2000000,2200000}', '{20,26,32}', 0.025);

create temp table results (name text, ok boolean, detail text);
grant all on results to anon, authenticated;

-- ── 1) 로그아웃(anon): 비용 테이블 접근 자체가 막혀야 함
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin
  begin
    perform count(*) from public.tour_costs;
    insert into results values ('anon tour_costs 차단', false, '읽힘');
  exception when insufficient_privilege then
    insert into results values ('anon tour_costs 차단', true, 'permission denied');
  end;
  begin
    perform count(*) from public.tours;
    insert into results values ('anon tours 차단', false, '읽힘');
  exception when insufficient_privilege then
    insert into results values ('anon tours 차단', true, 'permission denied');
  end;
  begin
    perform * from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000001');
    insert into results values ('anon tour_pnl 차단', false, '실행됨');
  exception when insufficient_privilege then
    insert into results values ('anon tour_pnl 차단', true, 'permission denied');
  end;
end $$;
reset role;

-- ── 2) 트래블리더: 투어는 보이고, 비용·가격·매출은 안 보여야 함
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","aal":"aal2"}', false);
insert into results select '트래블리더 tours 읽기', count(*) = 2, count(*)::text from public.tours;
insert into results select '트래블리더 tour_costs 빈 결과', count(*) = 0, count(*)::text from public.tour_costs;
insert into results select '트래블리더 tour_pricing 빈 결과', count(*) = 0, count(*)::text from public.tour_pricing;
do $$ begin
  begin
    perform * from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000001');
    insert into results values ('트래블리더 tour_pnl 거부', false, '실행됨');
  exception when insufficient_privilege then
    insert into results values ('트래블리더 tour_pnl 거부', true, sqlerrm);
  end;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    insert into results values ('트래블리더 스스로 관리자 승격 불가', false, '바뀜');
  exception when insufficient_privilege then
    insert into results values ('트래블리더 스스로 관리자 승격 불가', true, 'permission denied');
  end;
  begin
    insert into public.tour_costs (tour_id, label, kind, amount) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'fixed', 1);
    insert into results values ('트래블리더 비용 쓰기 불가', false, '들어감');
  exception when insufficient_privilege then
    insert into results values ('트래블리더 비용 쓰기 불가', true, 'RLS');
  end;
  begin
    update public.tours set name = '바꿈' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    insert into results select '트래블리더 남의 투어 수정 불가', name <> '바꿈', name from public.tours where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  end;
  begin
    insert into public.export_log (tour_id, kind, include_finance) values ('aaaaaaaa-0000-0000-0000-000000000001', 'pdf_internal', true);
    insert into results values ('트래블리더 내부용(매출) PDF 기록 불가', false, '들어감');
  exception when insufficient_privilege then
    insert into results values ('트래블리더 내부용(매출) PDF 기록 불가', true, 'RLS');
  end;
end $$;
insert into public.export_log (tour_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000002', 'pdf_leader');
insert into results values ('트래블리더 트래블리더용 PDF 기록 가능', true, 'ok');
reset role;

-- ── 3) 관리자지만 2단계 인증 전(aal1): 비용 안 보여야 함
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal1"}', false);
insert into results select '관리자 aal1 tour_costs 빈 결과', count(*) = 0, count(*)::text from public.tour_costs;
reset role;

-- ── 4) 관리자 + 2단계 인증(aal2): 매출 계산
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","aal":"aal2"}', false);
insert into results select '관리자 aal2 tour_costs 읽기', count(*) = 5, count(*)::text from public.tour_costs;

-- 계산식 검증: 20명 · 200만 · V 100만 · F 1,000만 · r 2.5% → 이익 900만, 마진 22.5%, 손익분기 11명
insert into results
select '20명·200만: 이익 9,000,000', profit = 9000000, to_char(profit, 'FM999,999,999') || '원'
from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000001') where pax = 20 and price = 2000000;
insert into results
select '20명·200만: 마진 22.5% / 손익분기 11명', margin = 0.2250 and breakeven_pax = 11, round(margin * 100, 1) || '% / ' || breakeven_pax || '명'
from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000001') where pax = 20 and price = 2000000;
insert into results
select '20명·250만: 이익 18,750,000 / 마진 37.5%', profit = 18750000 and margin = 0.3750, to_char(profit, 'FM999,999,999') || '원 / ' || round(margin * 100, 1) || '%'
from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000001') where pax = 20 and price = 2500000;

-- 통화 환산: EUR 60 × 7 × 1,500 + 370,000 = 1,000,000
insert into results
select '통화 환산 1인 변동비 = 1,000,000', per_person_krw = 1000000, per_person_krw::text
from public.tour_cost_totals('aaaaaaaa-0000-0000-0000-000000000002');
insert into results
select '표 크기 = 참가비 3 × 인원 3', count(*) = 9, count(*)::text
from public.tour_pnl('aaaaaaaa-0000-0000-0000-000000000002');
reset role;

\echo
\echo '──── 결과 ────'
select case when ok then 'PASS' else 'FAIL' end as "결과", name as "점검", detail as "값" from results;
do $$ begin
  if exists (select 1 from results where not ok) then raise exception '실패한 점검이 있습니다'; end if;
end $$;
