# Task: 고객 결제 장부 Production 배포

- Status: Active
- Owner: Codex
- Branch: `codex/customer-payment-ledger`
- Base commit: `2ec72bb9ab3db87995779d64f9352d1704a07343`
- Started at: 2026-08-31
- Target environment: Production

## Goal

고객 장부 진입용 직원 패스워드와 금액 변경용 관리자 패스워드를 분리하고, Production 데이터 백업·보존 확인 후 migration 0005~0006과 검증된 앱을 Sites에 배포한다.

## Claimed paths

- `app/lib/customer-ledger-auth.ts`
- `app/api/customer-ledger/**`
- `app/components/CustomerLedgerApp.tsx`
- `.env.example`
- `tests/commerce.test.mjs`
- `docs/PAGES_AND_FEATURES.md`
- `docs/API_AND_INTEGRATIONS.md`
- `docs/SECURITY_AND_RELIABILITY.md`
- `docs/DEPLOYMENT_RUNBOOK.md`

## Plan

1. Sites 접근정책·Production version·DB·환경값 확인
2. 직원/관리자 패스워드 분리 및 전체 검사
3. timestamp backup과 migration 전 row count 기록
4. migration 포함 version 저장·배포
5. migration 후 row count·신규 schema·Production route 확인

## Validation

- [ ] lint
- [ ] typecheck
- [ ] full test
- [ ] build
- [ ] db:generate
- [ ] Production backup and row counts
- [ ] Production deployment and smoke

## Completion

- Final implementation commit:
- Sites version:
- Production URL:
- Completed at:
- Remaining TODO:
