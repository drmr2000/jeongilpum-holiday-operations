# Task: 로컬 판매장 인증 404 제거

- Status: Completed
- Owner: Codex local-sales-auth task
- Branch: `codex/local-sales-auth`
- Base commit: `20f97b6617b428530ecc25851ebc197f47484ef6`
- Started at: 2026-09-01
- Target environment: Local

## Goal

Sites dispatcher가 없는 로컬 Vinext에서 `/sales`가 로그인 경로 404로 이동하지 않도록 개발용 로컬 직원을 제공하고, 판매장 첫 화면의 주문·한정상품 조회가 정상 동작하게 한다.

## Non-goals

- Production 또는 비-loopback origin의 인증·operator allowlist 완화
- 판매장 상태변경 API 전체의 로컬 권한 확대
- 운영 D1 변경 또는 Production 배포

## Claimed paths

- 이전 플랫폼 인증 모듈 (인증 계약 독점 claim)
- 이전 로컬 개발 인증 모듈
- `app/api/orders/route.ts` (독점 claim)
- `app/api/availability/route.ts`
- `tests/onsite-sales.test.mjs`
- `docs/work/active/20260901-codex-local-sales-auth.md`
- `docs/work/completed/20260901-codex-local-sales-auth.md`

## Shared contracts

- 운영 빌드의 `/api/orders`, `/api/availability`는 당시의 운영 인증 계약을 유지한다.
- 로컬 직원은 development 빌드이면서 HTTP loopback host/request일 때만 생성·허용한다.
- 로컬 직원 ID와 이메일은 PII가 아닌 고정 개발용 값이다.

## Plan

1. 로컬 host에서만 개발 사용자 제공
2. 판매장 첫 화면 조회 API 두 곳에서만 로컬 개발 사용자 허용
3. 로컬 `/sales`와 조회 API smoke, 운영 빌드 상수, 전체 검사 확인

## Acceptance criteria

- [x] `http://localhost:3000/sales`가 로그인 404 없이 200으로 열린다.
- [x] 로컬 판매장 주문·한정상품 조회 API가 200으로 응답한다.
- [x] 운영 빌드에서는 로컬 사용자 생성과 허용 조건이 `false`로 고정된다.
- [x] 운영 Sites의 로그인·operator allowlist 검사는 유지된다.

## Validation

- [x] related test: `node --test tests/onsite-sales.test.mjs` (3 passed)
- [x] local sales/API smoke: `/sales`, `/api/orders`, `/api/availability` 모두 200
- [x] lint: `npm run lint`
- [x] typecheck: `npm run typecheck`
- [x] full test: `npm test` (66 passed)
- [x] build: `npm run build`; production bundle local host/actor 판별 인자가 `false`로 고정됨
- [x] local preview: `/sales` Codex 브라우저 열기 요청

## Completion

- Final commit: `d33863a`
- Completed at: 2026-09-01
- Remaining TODO: 판매장 상태변경·도착·일정지정 API는 운영 권한 원칙에 따라 이번 로컬 조회 예외 범위에 포함하지 않았다. Production 배포는 사용자 요청 전까지 수행하지 않는다.
