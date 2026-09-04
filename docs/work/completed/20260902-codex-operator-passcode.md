# Task: 운영 화면 공유 암호 세션 전환

- Status: Completed
- Owner: Codex
- Branch: `codex/operator-passcode`
- Base commit: `c600613cc34bab9aa77bbeb2caccf0a343cb7fc3`
- Started at: 2026-09-02
- Target environment: Local development

## Goal

ChatGPT 로그인과 운영자 allowlist를 단일 운영 암호 기반의 서버 세션으로 교체한다. 키오스크 공개 주문 흐름과 동결 경로는 변경하지 않는다.

## Claimed paths

- `app/chatgpt-auth.ts`
- `app/lib/operator-auth.ts`
- `app/lib/operator-session.ts`
- `app/lib/customer-ledger-auth.ts`
- `app/api/**/route.ts`
- `app/api/operator-session/route.ts`
- `app/sales/page.tsx`
- `app/workshop/page.tsx`
- `app/workshop/production/page.tsx`
- `app/workshop/packages/[packageCode]/page.tsx`
- `app/settings/page.tsx`
- `app/components/PasscodeGate.tsx`
- `app/components/SalesApp.tsx`
- `app/components/SettingsApp.tsx`
- `app/components/WorkshopApp.tsx`
- `app/globals.css`
- `.env.example`
- `.gitignore`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/API_AND_INTEGRATIONS.md`
- `docs/PAGES_AND_FEATURES.md`
- `docs/SECURITY_AND_RELIABILITY.md`
- `tests/onsite-sales.test.mjs`
- `tests/v2-spec.test.mjs`

## Shared contracts

- 운영 API는 유효한 `jip_operator` HttpOnly 세션 쿠키를 요구한다.
- `GET /api/products`와 모든 `POST /api/orders`는 공개 상태를 유지한다.

## Validation

- [x] npm ci
- [x] lint
- [ ] typecheck: 기존 `OrderRecord` 및 `OrderStatus` 타입 불일치로 실패
- [x] full test before and after: 52 passed, 14 failed
- [x] build
- [x] local curl smoke: port 3001 점유로 local Worker port 3002에서 확인
- [x] kiosk frozen diff
- [x] legacy auth grep

## Completion

- Final implementation commit: `73e1dcd`
- Completed at: 2026-09-02
- Remaining TODO: 기존 판매장 TypeScript 타입 계약 오류와 다른 process의 port 3001 점유는 이번 작업 범위에 포함하지 않았다.
