-- 권한을 명시적으로 부여 (Supabase 프로젝트에서 'Data API 자동 노출'이 꺼져 있으면
-- 새 테이블에 로그인 사용자 권한이 자동으로 붙지 않아 프로필을 못 읽는 문제가 생김)
-- 실제로 누가 어떤 행을 보는지는 여전히 RLS 정책이 결정합니다. 여러 번 실행해도 안전합니다.
grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, insert, update, delete on public.tours, public.tour_stops, public.tour_costs, public.tour_pricing to authenticated;
grant select, insert on public.export_log to authenticated;
grant usage on all sequences in schema public to authenticated;

grant execute on function public.is_member(), public.is_admin(), public.is_admin_mfa(), public.can_edit_tour(uuid) to authenticated;
grant execute on function public.tour_cost_totals(uuid), public.tour_pnl(uuid, numeric[], int[]) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

-- 이 파일보다 먼저 생긴 사용자 중 프로필이 빠진 사람 채우기
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1), '')
from auth.users u
on conflict (id) do nothing;
