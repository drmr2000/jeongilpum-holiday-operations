# Task: 현장판매 직원영역 분리와 무기명 기록

- Status: Completed
- Owner: Codex
- Branch: `codex/onsite-staff-placement`
- Base commit: `95a951bdd168c857a00c040905e79f43c0b75a4e`
- Started at: 2026-09-01
- Target environment: Local

## Goal

현장판매 버튼을 방문수령·택배발송과 분리해 화면 하단 직원 전용 영역에 배치하고, 현장판매는 고객정보 입력 없이 결제 단계로 이동하여 상품·매출·결제 기록을 남긴다.

## Non-goals

- 운영자 인증 및 allowlist 완화
- schema 또는 migration 변경
- Production 배포

## Claimed paths

- `app/components/KioskApp.tsx`
- `app/kiosk-flow.css`
- `app/api/orders/route.ts`
- `tests/onsite-sales.test.mjs`
- `tests/v2-spec.test.mjs` (현장판매 단계·Step 2 기대값만)

## Shared contracts

- `POST /api/orders`: `fulfillmentType=onsite`일 때 buyerName/buyerPhone을 필수로 요구하지 않고 서버의 무기명 현장판매 식별값으로 기록한다.
- 실제 현장판매 저장의 운영자 인증·allowlist 및 D1 batch 계약은 유지한다.

## Plan

1. 고객용 수령 버튼과 하단 직원용 현장판매 영역 분리
2. 현장판매 고객정보 단계를 제거하고 결제 단계로 직접 이동
3. 고객정보가 없는 onsite payload의 서버 저장과 회귀검사

## Acceptance criteria

- [x] 방문수령·택배발송만 기본 선택 영역에 보인다.
- [x] 현장판매 버튼은 하단의 명확한 직원 전용 영역에 별도 배치된다.
- [x] 현장판매는 고객정보 입력 없이 결제 단계로 이동한다.
- [x] 무기명 현장판매도 상품·매출·결제·감사이력이 원자적으로 기록된다.
- [x] 현장판매 저장 권한 검사는 유지된다.

## Validation

- [x] lint
- [x] typecheck
- [x] related tests
- [x] full test
- [x] build

## Integration notes

- `docs/PAGES_AND_FEATURES.md`와 `docs/API_AND_INTEGRATIONS.md`는 활성 고객 장부 배포 작업이 claim 중이어서 수정하지 않았다.
- 동시에 진행된 키오스크 헤더 작업의 스테이징 내용은 별도로 보존하고 복원했다.

## Completion

- Final commit: `84594a9`
- Completed at: 2026-09-01
- Production deployment: 수행하지 않음
