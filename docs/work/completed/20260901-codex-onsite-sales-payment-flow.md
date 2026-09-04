# Task: 현장판매와 마지막 결제방식 단계

- Status: Completed
- Owner: Codex
- Branch: `codex/onsite-sales-payment-flow`
- Base commit: `edb8d344ad082df54d21433cfef12d38dbde1f43`
- Started at: 2026-09-01
- Target environment: Local

## Goal

메인 주문 흐름에 운영자 전용 현장판매를 방문수령·택배발송과 함께 제공하고, 모든 주문의 마지막 단계에서 결제방식을 선택한다. 현장판매는 상품·고객·결제·감사이력을 하나의 D1 batch로 저장하고 즉시 판매완료로 표시한다.

## Non-goals

- Production migration 또는 배포
- 카드사/PG 실제 승인 연동
- 방문수령·택배 고객이 선택한 결제 예정 방식을 실제 입금으로 확정

## Claimed paths

- `app/components/KioskApp.tsx`
- `app/components/types.ts`
- `app/kiosk-flow.css`
- `app/sales-flow.css`
- `app/api/orders/route.ts`
- `app/api/orders/onsite-access/route.ts`
- `app/lib/sales-order-query.ts`
- `app/lib/sales-operations.ts`
- `app/lib/workshop-operations.ts`
- `app/components/SalesApp.tsx`
- `app/components/SalesOrderDetail.tsx`
- `app/components/AdminApp.tsx`
- `tests/onsite-sales.test.mjs`
- `tests/sales-operations.test.mjs`
- `tests/v2-spec.test.mjs`
- `docs/ARCHITECTURE.md`
- `docs/DATA_AND_MIGRATIONS.md`

## Shared contracts

- API route/field: `POST /api/orders`, `fulfillmentType=onsite`, `paymentMethod`
- DB table/column: `orders.fulfillment_type=onsite`, 즉시 인도 fulfillment
- shared type/event/status: `FulfillmentType`, `onsite_sale_completed`, `payment_recorded`
- CSS/shared navigation: kiosk fulfillment/payment 단계 스타일

## Dependencies

- 먼저 병합되어야 하는 task/commit: 없음. Production Version 22 commit `c20aee77ae98bcdf8e119f4302abe8b9f4bd4b87`을 포함한 HEAD에서 시작.
- 이 작업을 기다리는 task: 없음

## Plan

1. 현장판매 유형·권한·기존 스키마 호환 계약 추가
2. 마지막 결제방식 UI와 판매장 표시 구현
3. isolated DB 및 전체 회귀검사

## Acceptance criteria

- [x] 메인 주문 유형에 현장판매가 방문수령·택배발송과 함께 보인다.
- [x] 현장판매 선택과 제출은 운영자만 가능하다.
- [x] 마지막 단계에서 결제방식을 선택하며 현장판매는 실제 고객 장부 입금으로 기록된다.
- [x] 현장판매는 판매장 당일 목록과 검색에 보이고 작업장 일정에는 보이지 않는다.
- [x] 상품·주문·결제·감사이력이 한 D1 batch로 저장된다.

## Validation

- [x] lint
- [x] typecheck
- [x] related tests
- [x] full test
- [x] build
- [x] existing schema compatibility test
- [ ] manual smoke, 해당 시

로컬 메인 route HTTP 200을 확인했다. 브라우저 DOM·클릭 QA는 사용자가 요청하지 않아 수행하지 않았다.

## Integration notes

- `docs/PAGES_AND_FEATURES.md`, `docs/API_AND_INTEGRATIONS.md`는 기존 active claim과 겹쳐 수정하지 않는다.
- backward compatibility: 기존 pickup/shipping payload와 행은 그대로 유지한다.
- Production 설정/migration 필요사항: 새 migration 없음. 기존 customer ledger migration 적용 상태 확인 필요.

## Completion

- Final commit: `d9da944714702b7a7b6e3b2d99cbbb08dae109ab`
- Completed at: 2026-09-01
- Remaining TODO: Production 배포는 사용자 요청이 없어 수행하지 않았다. `docs/PAGES_AND_FEATURES.md`, `docs/API_AND_INTEGRATIONS.md`는 기존 active claim 해제 후 현장판매 항목을 추가해야 한다.
