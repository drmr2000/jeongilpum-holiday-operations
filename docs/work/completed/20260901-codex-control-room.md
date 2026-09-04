# Task: 관리자용 종합통제실

- Status: Active
- Owner: Codex
- Branch: `codex/control-room`
- Base commit: `d79a5ec0d7c04a630517162964e520bc47af36d7`
- Started at: 2026-09-01
- Target environment: Local validation only

## Goal

관리자·운영자 이중 allowlist로 보호되는 `/control-room`에서 오늘 실시간 주문·작업·생산·패키지 위험과 이후 7일 전망을 읽기 중심으로 확인하고 기존 운영 화면의 동일 날짜로 이동할 수 있게 한다.

## Claimed paths

- `app/control-room/**`
- `app/api/control-room/**`
- `app/components/ControlRoomApp.tsx`
- `app/components/AppNav.tsx`
- `app/components/SalesApp.tsx`
- `app/components/WorkshopApp.tsx`
- `app/components/ProductionApp.tsx`
- `app/lib/control-room-*.ts`
- `app/control-room-flow.css`
- `tests/control-room.test.mjs`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_AND_TESTING.md`
- `AGENTS.md`
- `docs/WORK_MANAGEMENT.md`
- `docs/work/TASK_TEMPLATE.md`

## Shared contracts

- 관리자 환경값: `CONTROL_ROOM_ADMIN_USER_IDS`, `CONTROL_ROOM_ADMIN_EMAILS`
- 기존 operator allowlist와 ChatGPT 인증
- 기존 고객장부 5분 세션과 `/api/customer-ledger` 조회 계약
- 주문·작업·생산·패키지 조회 계약
- `AppNav` 공통 navigation

## Coordination

- `20260831-codex-customer-ledger-production-deploy.md`가 `app/api/customer-ledger/**`, `.env.example`, 고객장부 문서와 테스트를 claim 중이므로 해당 경로는 수정하지 않는다.
- 통제실 금액 요약은 기존 장부 access/list API를 읽기 전용으로 사용한다.
- Production migration과 배포는 실행하지 않는다.
- 사용자 요청에 따라 GitHub 작업 완료 정책을 저장소 공통 지침과 task 템플릿에 추가하고, 기존 비-GitHub `origin`은 변경하지 않는다.

## Validation

- [ ] lint
- [ ] typecheck
- [ ] full test
- [ ] build
- [ ] local route response
- [ ] responsive implementation review

## Completion

- Final implementation commit:
- Completed at:
- Remaining TODO:
