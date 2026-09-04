# Task: 고객 결제·미수 통합 장부

- Status: Completed
- Owner: Codex
- Branch: `codex/customer-payment-ledger`
- Base commit: `0a5cac955b7b4a4ee9785995ddf93ec8b747d80f`
- Started at: 2026-08-31
- Target environment: Local
- Related issue/spec: 대화에서 확정한 고객별 결제·부분결제·외상·미수·선수금 관리

## Goal

동일 이름·전화번호 고객의 여러 주문과 입금·정정을 하나의 장부로 집계하고, 사업주가 이중 관리자 패스워드 확인 아래 미수·선수금·상담 메모를 안전하게 관리할 수 있게 한다.

## Non-goals

- 실제 PG·카드사 승인 연동
- Production migration 또는 배포
- 자동 환불 처리
- 결제금액의 상품·주문별 임의 배분

## Claimed paths

- `db/schema.ts`
- `drizzle/**`
- `app/api/customer-ledger/**`
- `app/api/orders/route.ts`
- `app/api/orders/payments/route.ts`
- `app/lib/customer-ledger-*`
- `app/components/CustomerLedgerApp.tsx`
- `app/components/SalesApp.tsx`
- `app/components/SalesOrderDetail.tsx`
- `app/components/AdminApp.tsx`
- `app/components/types.ts`
- `app/sales-flow.css`
- `tests/commerce.test.mjs`
- `tests/sales-operations.test.mjs`
- `.env.example`
- `docs/PAGES_AND_FEATURES.md`
- `docs/ARCHITECTURE.md`
- `docs/API_AND_INTEGRATIONS.md`
- `docs/DATA_AND_MIGRATIONS.md`
- `docs/SECURITY_AND_RELIABILITY.md`
- `docs/DECISIONS.md`

## Shared contracts

- API route/field: `/api/customer-ledger/**`, `/api/orders` 결제 요약
- DB table/column: 고객 계정, 고객 거래, 관리자 장부 세션, 상담 메모, 주문-고객 연결; migration 0006
- shared type/event/status: 고객 미수·선수금 상태, 결제·정정·상담 event
- CSS/shared navigation: 판매장 내부 고객 결제·미수 surface

## Dependencies

- 먼저 병합되어야 하는 task/commit: 없음
- 이 작업을 기다리는 task: 없음

## Plan

1. 고객 장부 schema와 migration 추가
2. 이중 관리자 패스워드와 장부 API 구현
3. 판매장 고객 장부 UI 구현
4. 기존 결제 호환, 테스트와 문서 갱신
5. 전체 검증

## Acceptance criteria

- [x] 동일 이름·전화번호 고객의 여러 주문이 한 장부에 집계된다.
- [x] 상품·주문별 임의 배분 없이 미수금·선수금이 계산된다.
- [x] 장부 진입과 각 금액 변경에 관리자 패스워드를 확인한다.
- [x] 5분 비활동 후 장부 접근이 잠긴다.
- [x] 결제 정정은 원본을 보존하고 상쇄 거래를 추가한다.
- [x] 상담 메모를 남기고 이후 장부 분리에 적용할 수 있다.
- [x] 고객 장부 데이터와 API가 운영자·관리자 권한으로 보호된다.

## Validation

- [x] lint: `npm run lint`
- [x] typecheck: `npm run typecheck`
- [x] related tests: customer ledger + sales tests 통과
- [x] full test: `npm test`, 66/66
- [x] build: `npm run build`
- [x] migration test: 0000→0006 empty/production-like DB, 기존 결제 backfill 및 unique 제약 검증
- [x] manual smoke: local server 기동, `/sales` 인증 redirect와 장부 access 401 확인

## Integration notes

- 충돌 해결 내용: 없음
- backward compatibility: 기존 `payments`와 주문 결제 이력을 보존하고 새 고객 장부에 연결
- Production 설정/migration 필요사항: 관리자 비밀번호·세션 secret 설정 및 migration 0006 적용 필요, 현재 작업에서는 미실행

## Completion

- Final implementation commit: `6c389ddf6335b1b89b13b0296e24c6c0483be6ce`
- Completed at: 2026-08-31
- Remaining TODO: 사용자 승인 후 Production backup·row count·0006 migration·두 환경변수 설정·앱 배포
