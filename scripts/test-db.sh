#!/usr/bin/env bash
# 마이그레이션 + RLS + 매출 계산 함수를 빈 Postgres에서 검증합니다.
# 필요: psql 과 접속 가능한 Postgres (GitHub Actions에서는 자동). 예: PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:db
set -euo pipefail
DB="${TEST_DB:-planner_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/local_auth_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/rls_and_pnl_test.sql 2>&1 | grep -v -E "NOTICE|set_config|^ *\{|^-+$|^\(1 row\)|^$"
