#!/usr/bin/env bash
# 맥 터미널에서 한 번 실행: 도구 확인 → 설치 → 테스트·타입 검사·빌드 → GitHub 첫 업로드
set -uo pipefail
cd "$(dirname "$0")/.."
REPO_URL="https://github.com/Kimi-Kimpan/wannago-tour-planner.git"

step() { echo; echo "── $1"; }
fail() { echo; echo "✗ $1"; echo "이 창의 내용을 Claude에게 붙여 넣어 주세요."; exit 1; }

step "1. 도구 확인"
command -v git >/dev/null || fail "git이 없어요 → 터미널에서 xcode-select --install 실행 후 다시"
command -v node >/dev/null || fail "Node가 없어요 → https://nodejs.org 에서 LTS(.pkg) 설치 후 터미널을 새로 열고 다시"
echo "git  : $(git --version)"
echo "node : $(node -v)   npm : $(npm -v)"
major=$(node -v | sed 's/^v//; s/\..*//')
[ "$major" -ge 20 ] || fail "Node 20 이상이 필요해요 → https://nodejs.org 에서 LTS 설치"

step "2. 패키지 설치"
npm install --no-fund --no-audit || fail "패키지 설치 실패"

step "3. 테스트 (매출 검산·일정표·가져오기)"
npm test > /tmp/planner-test.log 2>&1 || { tail -40 /tmp/planner-test.log; fail "테스트 실패"; }
grep -E "(tests|pass|fail) [0-9]+" /tmp/planner-test.log | tail -3

step "4. 타입 검사"
npm run typecheck || fail "타입 오류"

step "5. 빌드"
npm run build >/dev/null || fail "빌드 실패"
echo "빌드 성공"

step "6. GitHub 업로드"
if [ ! -d .git ]; then git init -b main >/dev/null; fi
if [ -z "$(git config user.email)" ]; then
  read -r -p "git에 쓸 이메일(GitHub 계정 이메일): " em; git config user.email "$em"
  read -r -p "git에 쓸 이름: " nm; git config user.name "$nm"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL"
if git ls-remote --heads origin 2>/dev/null | grep -q .; then
  fail "GitHub 저장소가 비어 있지 않아요(README 등). 덮어쓰지 않고 멈췄어요."
fi
git add -A
git ls-files | grep -E '^private/|^\.env(\.local)?$' && fail "비공개 파일이 올라가려 해요. 멈췄어요."
# 공개 저장소: 실제 상품 기획(독일 한 바퀴 등)이 섞여 들어가지 않았는지 마지막 확인
git grep -I -l -i -E '독일|germany|프라하|뮌헨' -- . ':!scripts/first-push.sh' && fail "실제 기획 내용이 든 파일이 있어요. 멈췄어요."

git commit -q -m "투어 루트 플래너 v1" || true
echo "GitHub 로그인 창이나 비밀번호 질문이 나오면 GitHub 계정으로 로그인하세요."
echo "(비밀번호 칸에는 GitHub 비밀번호가 아니라 개인 액세스 토큰을 넣어야 해요)"
git push -u origin main || fail "업로드 실패"

echo
echo "✓ 완료: https://github.com/Kimi-Kimpan/wannago-tour-planner"
echo "이 창의 내용을 Claude에게 붙여 넣어 주세요."
