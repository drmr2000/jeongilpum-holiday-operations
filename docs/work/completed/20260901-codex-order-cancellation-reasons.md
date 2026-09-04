# Task: 테스트 주문 취소 사유와 고객 장부 정리

- Status: Completed
- Owner: Codex
- Branch: `codex/order-cancellation-reasons`
- Base commit: `5b451586ce04ee2dc9182f51aaaf1652b952f431`
- Started at: 2026-09-01
- Target environment: Production

## Goal

테스트·고객취소 주문을 실제 삭제하지 않고 감사 이력이 남는 취소 상태로 전환한다. 취소 주문은 통계·미수·생산 집계에서 제외하고 구매 검색에서는 유지한다. 사유는 테스트/취소/직접입력 드롭다운으로 받으며, 결제 이력이 없는 취소 전용 고객은 고객 장부 기본 목록에서 숨긴다.

## Claimed paths

- `app/components/SalesOrderDetail.tsx`
- `app/components/SalesApp.tsx`
- `app/api/orders/status/route.ts`
- `app/api/customer-ledger/route.ts`
- `app/sales-flow.css`
- `tests/commerce.test.mjs`
- `tests/sales-operations.test.mjs`
- `docs/PAGES_AND_FEATURES.md`
- `docs/API_AND_INTEGRATIONS.md`

## Shared contracts

- 주문 `cancelled` 상태 전환 payload와 `order_events.reason`
- 고객 장부 기본 목록 노출 조건

## Plan

1. 기존 취소·통계·장부 조회 계약 확인
2. 사유 선택 UI와 서버 검증·감사 기록 구현
3. 취소 전용 무결제 고객의 장부 목록 제외
4. 전체 검사와 Production 배포

## Validation

- [x] lint
- [x] typecheck
- [x] full test (66/66)
- [x] build
- [x] Production smoke

## Completion

- Final implementation commit: `8d3b2f6`
- Deployed source commit: `c20aee77ae98bcdf8e119f4302abe8b9f4bd4b87`
- Sites version: 22
- Deployment ID: `appgdep_6a9626a44e148191b4cbb9017f528598`
- Production URL: `https://jeongilpum-chuseok-mvp.bonbu2012.chatgpt.site`
- Data preservation: 핵심 14개 테이블 배포 전후 row count 동일
- Completed at: 2026-09-01
- Remaining TODO: 없음
