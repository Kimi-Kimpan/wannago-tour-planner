# 투어 루트 플래너 (wannago-tour-planner)

트래블리더가 도시와 박수를 넣으면 워너고트립 스타일 지도, 일차별 일정표, 매출 계산이 한 번에 나오고 PDF 기획안으로 내보내는 웹앱입니다. (v1: 루트 기획)

- 프론트엔드: Vite + React + TypeScript → GitHub Actions로 GitHub Pages에 배포
- 데이터·로그인: Supabase (Postgres + Auth + Row Level Security)
- 지도: Google Maps JavaScript API + Map ID, Places API (New), Maps Static API

## 보안 원칙

**매출·마진 숫자는 코드에 넣지 않고 Supabase에만 두며, 관리자(+2단계 인증) 로그인으로만 꺼냅니다.** GitHub Pages에 올라간 앱 파일은 누구나 내려받을 수 있기 때문이에요.

| 데이터 | 로그아웃 | 트래블리더 | 관리자(2단계 인증 전) | 관리자(2단계 인증 후) |
|---|---|---|---|---|
| 투어·도시·일정표 | ✗ | 읽기 + 내 투어 쓰기 | 모두 읽기·쓰기 | 모두 읽기·쓰기 |
| 비용(`tour_costs`)·참가비(`tour_pricing`) | ✗ | 빈 결과 | 빈 결과 | 읽기·쓰기 |
| 이익·마진(`tour_pnl` 함수) | ✗ | 거부 | 거부 | 계산 |
| PDF | – | 트래블리더용·고객용 | 트래블리더용·고객용 | + 내부용(매출 포함) |
| JSON 내보내기 | – | ✗ | 루트만 | 매출 포함 선택 |

- 공개 가입은 끄고 초대로만 계정을 만듭니다. 새 계정은 자동으로 트래블리더(`leader`)입니다.
- 내부용·트래블리더용 PDF에는 '대외비 · 내보낸 사람 · 날짜' 워터마크가 들어가고, PDF·JSON 내보내기는 `export_log`에 기록됩니다.
- 브라우저에는 Supabase **publishable(anon) 키**와 리퍼러로 제한한 **구글 지도 키**만 들어갑니다. secret/service_role 키는 어디에도 저장하지 않습니다.
- 실제 비용이 든 가져오기 파일은 `private/`에 두며 git에 올라가지 않습니다(`.gitignore`).

## 폴더 구조

```
supabase/migrations/   DB 구조(테이블·RLS·매출 함수). 새 Supabase 프로젝트에 그대로 실행
supabase/tests/        로컬·CI용 RLS·매출 검산 테스트
src/lib/               계산식(finance), 일정표 생성(itinerary), 가져오기 형식(importExport), DB 호출(api)
src/pages, components  화면
examples/              더미 예시 루트(가상의 이베리아 9일, 매출 없음)
private/               (git 제외) 실제 상품 루트·비용 파일과 그 검산 테스트(npm run test:private)
.github/workflows/     테스트 → 빌드 → Pages 배포
```

## 환경변수

`.env.example`을 `.env.local`로 복사해 로컬에서 쓰고, 배포 때는 GitHub 저장소 **Settings → Secrets and variables → Actions**에 같은 이름으로 넣습니다.

| 이름 | 어디서 | 비고 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys | publishable(anon)만 |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud → API 및 서비스 → 사용자 인증 정보 | 리퍼러·API 제한 필수 |
| `VITE_GOOGLE_MAP_ID` | Google Cloud → Google Maps Platform → 지도 관리 | 벡터, JavaScript |
| `VITE_BASE_PATH` (Variables) | 비우면 `/<저장소명>/` | 자체 도메인이면 `/` |

## 명령

```bash
npm install          # 처음 한 번
npm run dev          # 로컬 실행 (http://localhost:5173)
npm test             # 매출 계산·일정표·가져오기 테스트 (더미 데이터)
npm run test:private # (로컬 전용) private/ 안의 실제 상품 검산
npm run typecheck    # 타입 검사
npm run test:db      # DB 테스트 (psql + Postgres 필요, CI에서 자동 실행)
npm run build        # dist/ 생성
```

## 매출 계산

```
이익 = N·P − (N·V + F + N·P·r)      마진율 = 이익 ÷ (N·P)
N 인원, P 1인 참가비, V 1인 변동비, F 고정비, r 결제 수수료율(기본 2.5%)
```

모든 금액은 투어별 환율로 원화 환산합니다. 빠진 것: 부가세, 마케팅비, 환차손.

계산식 테스트(더미 숫자): 20명 · 참가비 200만 · V 100만 · F 1,000만 · r 2.5% → 이익 9,000,000원, 마진율 22.5%, 손익분기 11명. 실제 상품의 검산은 `private/`에서 로컬로만 합니다.

## 루트 가져오기 형식 (`wannago-tour/v1`)

앱의 **가져오기·내보내기** 화면에서 'Claude에게 줄 형식 안내 복사'를 눌러 Claude 대화에 붙이면 같은 형식으로 정리해 줍니다. 예시는 `examples/sample-iberia-9d.route.json`(가상의 더미 투어).

```json
{
  "format": "wannago-tour/v1",
  "tour": { "name": "...", "concept": "...", "depart_date": null, "min_pax": 20,
            "fx_rates": { "KRW": 1, "EUR": 1500 }, "origin_label": "인천", "return_overnight": true },
  "stops": [
    { "name": "리스본", "lat": 38.7223, "lng": -9.1393, "kind": "stay", "nights": 3,
      "arrive_mode": "flight", "arrive_note": "인천 → 리스본 항공", "free_days": 1,
      "nearby": [{ "name": "카스카이스", "lat": 38.70, "lng": -9.42, "note": "기차 약 40분" }] },
    { "name": "에보라", "lat": 38.57, "lng": -7.91, "kind": "via", "arrive_mode": "bus" }
  ],
  "days": [{ "day": 1, "plan": "도착, 환영 모임", "memo": "" }],
  "finance": { "costs": [{ "label": "숙박", "kind": "per_person", "currency": "EUR", "amount": 60, "quantity": 7 }],
               "price_options": [1800000, 2000000, 2200000], "pax_options": [20, 26, 32], "fee_rate": 0.025 }
}
```

- `stops`는 방문 순서. `kind`: `stay`(숙박) / `via`(경유, 박수 없음). `arrive_mode`: 그 도시에 **도착할 때** 수단(`flight`/`bus`/`train`/`car`/`ferry`).
- `free_days`: 도착일을 뺀 머무는 날 중 끝에서부터 자유일로 표시.
- `days`: 자동 일정표를 덮어쓸 날만. 가져온 투어는 항상 **초안**.
- `finance`는 관리자(2단계 인증)가 가져올 때만 저장되고, 그 외에는 무시됩니다.

## 처음 설정 (Supabase)

1. 새 프로젝트 → **SQL Editor**에 `supabase/migrations/` 파일 내용을 붙여 넣고 실행
2. **Authentication → Sign In / Providers**: 'Allow new users to sign up' 끄기
3. **Authentication → URL Configuration**: Site URL을 배포 주소로(예: `https://<사용자명>.github.io/wannago-tour-planner/`), Redirect URLs에 같은 주소와 `http://localhost:5173/` 추가
4. **Authentication → Users → Invite user**로 본인 초대 → 메일 링크로 로그인 → 앱 '내 계정'에서 비밀번호 설정
5. SQL Editor에서 본인을 관리자로: `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '본인 이메일');`
6. 앱에 다시 로그인하면 2단계 인증(TOTP) 등록 화면이 나옵니다. 이후 관리자 지정은 앱 밖 SQL 또는 `select public.set_user_role('<user id>', 'admin');`(관리자 세션)

## 회사 환경으로 옮기는 절차

설계상 코드는 그대로 두고 **값만** 바꾸면 됩니다.

1. **저장소 이전**: GitHub → Settings → Transfer ownership으로 회사 조직에 넘기거나, 회사 저장소에 `git push --mirror`
2. **Supabase 새로 설치**: 회사 계정에 새 프로젝트 → `supabase/migrations/*.sql` 순서대로 실행 → 위 '처음 설정' 2~6단계. 프로토타입의 데이터는 예시·추정치이므로 옮기지 않고, 필요한 루트만 앱의 JSON 내보내기 → 새 환경에서 가져오기(실제 원가는 회사 환경에서 새로 입력)
3. **구글 키 교체**: 회사 Google Cloud 프로젝트에서 세 API 켜기 → 새 키(리퍼러: 회사 도메인) → 지도 스타일을 만들고 새 Map ID 발급
4. **Secrets 교체**: 새 저장소 Secrets에 위 환경변수 4개를 회사 값으로
5. **도메인 연결**: Pages → Custom domain에 `tours.회사도메인` 입력, DNS에 CNAME(`<조직>.github.io`) 추가, Enforce HTTPS 켜기, 저장소 Variables에 `VITE_BASE_PATH=/`. Supabase Site URL·Redirect URLs와 구글 키 리퍼러도 새 도메인으로
6. (선택) **앱 입구 잠금**: 도메인 DNS를 Cloudflare로 옮긴 뒤 Cloudflare Access(회사 이메일 인증)를 내부 주소 앞에 두기
7. (선택) 다른 호스팅(Vercel 등)으로 옮길 때도 `npm run build` 결과(`dist/`)만 올리면 됩니다. 해시 라우팅이라 서버 설정이 필요 없어요.

Claude 커넥터(MCP)는 프로토타입에서 연결하지 않았습니다. 자동 연동이 필요하면 회사 보안 정책에 맞춰 결정하세요(설계서 'Claude 연동' 참고).

## 출시 전 점검

- [ ] 로그아웃 상태: 브라우저 개발자도구에서 `tour_costs` 요청이 401/빈 결과
- [ ] 트래블리더 계정: 메뉴에 '매출 계산'이 없고, 콘솔에서 `tour_costs`를 직접 조회해도 빈 결과, `tour_pnl` 호출은 거부
- [ ] 관리자 2단계 인증 전: 매출 탭이 안 보임
- [ ] 트래블리더용·고객용 PDF에 매출 페이지가 없음, 고객용에는 내부 메모도 없음
- [ ] 구글 키가 리퍼러·API로 제한돼 있음
