# Task: Shared operations UI foundation

- Status: Active
- Owner: Codex
- Branch: `codex/ui-foundation`
- Base commit: `d54a2c13560f6e974724983e49cc92058744f6ab`
- Started at: 2026-09-02
- Target environment: Local

## Goal

판매장, 작업장, 상품관리 화면이 공통 탐색, 탭, 입력, 표, 상태 라벨을 동일한 UI 기반으로 사용하도록 정리하고, 외부 페이지 CSS의 공통 프리미티브 재정의를 막는 기계 검사를 추가한다.

## Non-goals

- 판매장, 작업장, 상품관리 화면의 레이아웃 또는 콘텐츠를 재설계하지 않는다.
- 키오스크와 맞춤주문 화면을 수정하지 않는다.
- Production 배포, commit, push를 수행하지 않는다.

## Claimed paths

- `app/ui/navigation.css`
- `app/ui/tokens.css`
- `app/ui/components.css`
- `app/ui/Field.tsx`
- `app/ui/StatTiles.tsx`
- `app/ui/Toolbar.tsx`
- `app/ui/DataTable.tsx`
- `app/ui/settings.css`
- `app/sales/work-table.css`
- `app/workshop-flow.css`
- `app/components/SalesApp.tsx`
- `app/components/WorkshopApp.tsx`
- `app/components/SettingsApp.tsx`
- `app/lib/work-status.ts`
- `tests/design-system.test.mjs`
- `package.json`

## Shared contracts

- shared type/status: `WorkStatus`, ordered work status list, Korean labels
- CSS/shared navigation: `.app-nav`, `.ui-*` primitives

## Dependencies

- 먼저 병합되어야 하는 task/commit: 없음
- 이 작업을 기다리는 task: 판매장, 작업장, 상품관리 화면 재구성 작업

## Plan

1. 공통 UI 재정의와 상태 라벨 중복을 조사한다.
2. 공통 토큰, 프리미티브, 상태 모듈과 기계 검사를 구현한다.
3. lint, typecheck, test를 실행하고 금지 경로의 diff를 확인한다.

## Acceptance criteria

- [ ] 공통 탐색, 탭, 드롭다운이 단일 구현을 사용한다.
- [ ] StatTiles가 총계와 하위 합계를 계층적으로 표시한다.
- [ ] 작업 상태 라벨이 단일 모듈에서 제공된다.
- [ ] 외부 CSS의 `.ui-*` 직접 정의와 공통 CSS의 픽셀 반지름을 검사한다.

## Validation

- [ ] lint
- [ ] typecheck
- [ ] full test

## Integration notes

- 충돌 해결 내용: 없음
- backward compatibility: 기존 API, DB, 페이지 콘텐츠를 변경하지 않는다.
- Production 설정/migration 필요사항: 없음

## Completion

- Final commit: 사용자 지시에 따라 미수행
- GitHub remote/branch: 사용자 지시에 따라 미수행
- Push verification: 사용자 지시에 따라 미수행
- Completed at:
- Remaining TODO:
