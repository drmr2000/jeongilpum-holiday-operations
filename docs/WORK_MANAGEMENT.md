# 동시작업 관리

## 목적

여러 작업자가 같은 저장소에서 작업할 때 파일, API 계약, migration 번호 충돌을 예방합니다. 중앙 목록을 함께 수정하지 않고 작업자별 claim 파일을 사용합니다.

## claim 위치

- 진행 중: `docs/work/active/`
- 완료 기록: `docs/work/completed/`
- 템플릿: `docs/work/TASK_TEMPLATE.md`

파일 이름:

```text
YYYYMMDD-<owner-or-agent>-<short-task>.md
```

## 작업 시작 절차

1. 현재 branch, HEAD, working tree를 확인합니다.
2. `docs/work/active/`의 모든 claim에서 `Claimed paths`와 `Shared contracts`를 읽습니다.
3. 동일 파일 또는 동일 API·schema 계약이 겹치면 구현 전에 담당 범위를 조율합니다.
4. 자신의 active task 파일을 만들고 기준 commit과 담당 경로를 기록합니다.
5. 관련 source, schema, migration, test를 읽은 뒤 수정합니다.

## 독점 claim이 필요한 구역

- `db/schema.ts`
- `drizzle/**`와 migration 번호
- `package.json`, `package-lock.json`
- `app/components/types.ts`
- `app/components/AppNav.tsx`
- `app/globals.css`
- `app/api/orders/route.ts`
- `app/api/work-items/route.ts`
- `app/api/work-items/bulk/route.ts`
- `OPERATOR_PASSCODE`와 운영 세션 계약
- `orders.payment_status`, `work_items.work_status`, `work_item_events`

## 영역별 경계

| 영역 | 대표 경로 | 공유 계약 |
|---|---|---|
| Kiosk | `KioskApp`, `CustomOrderApp`, kiosk CSS | `/api/products`, `/api/orders` |
| Sales | `SalesApp`, sales CSS | `/api/work-items`, orders payment·status·arrival |
| Workshop | `WorkshopApp`, workshop route | work item 상태와 이벤트 |
| Production | `ProductionApp`, production route | production batch, Skin Pack, traceability |
| Package | package page, package route | package, Skin Pack 연결 |
| Settings | `SettingsApp`, settings route | products, `daily_limit` |
| Platform | operator session, hosting, build | protected route |
| DB | schema, migration | 모든 API와 test |

## 인터페이스 변경

API 응답, shared type, schema처럼 여러 영역에 영향을 주는 변경에는 다음을 적용합니다.

1. task 문서에 새 계약과 소비자를 기록합니다.
2. migration 번호와 shared type을 명시적으로 claim합니다.
3. 가능한 경우 shared contract 변경을 별도 commit으로 구성합니다.
4. 관련 as-built 문서를 같은 작업에서 갱신합니다.

## 완료 절차

1. 관련 검사와 문서 갱신을 마칩니다.
2. final commit, 원격 branch, 검사 결과를 task 파일에 기록합니다.
3. task 상태를 Completed로 바꿉니다.
4. task 파일을 `docs/work/completed/`로 이동합니다.
5. 현재 branch를 GitHub 원격에 push하고 원격 branch가 HEAD를 포함하는지 확인합니다.

명시적으로 커밋·push를 금지한 작업은 그 제약과 인계 상태를 task 기록에 적고, 담당 orchestrator가 완료 절차를 수행합니다.
