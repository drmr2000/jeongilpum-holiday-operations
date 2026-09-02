# AGENTS.md

이 문서는 저장소 전체에 적용됩니다. 모든 개발자와 코딩 에이전트는 작업 전에 이 파일과 `docs/README.md`를 읽어야 합니다.

## 1. 시작 순서

1. `docs/README.md`에서 문서 지도를 확인합니다.
2. `docs/WORK_MANAGEMENT.md`와 `docs/work/active/`에서 다른 작업자의 file ownership을 확인합니다.
3. 자신의 작업 파일을 `docs/work/active/YYYYMMDD-<owner>-<task>.md`로 만들고 담당 경로를 선언합니다.
4. 현재 branch, HEAD, working tree, Production 기준 commit을 확인합니다.
5. 관련 page, API, schema, migration, test를 읽은 뒤 수정합니다.

## 2. 사실의 우선순위

1. 현재 사용자의 명시적 요청
2. 안전·데이터 보존·Production 제한
3. 현재 source code, `db/schema.ts`, migration history
4. `docs/`의 as-built 문서
5. `docs/specs/`의 과거 요구 명세

`docs/specs/`는 구현 배경 기록이며 현재 기능의 자동 적용 지시가 아닙니다. 코드와 as-built 문서가 충돌하면 추측하지 말고 차이를 보고하고, 승인된 범위에서 문서를 함께 갱신합니다.

## 3. 현재 기준 상태

- 운영 데이터는 Cloudflare D1 `DB`입니다.
- 현재 core schema는 `products`, `orders`, `work_items`, `work_item_events`입니다.
- `0007_work-items-core.sql`은 이전 모델을 제거하고 이 core를 생성합니다.
- Production Sites version, Production commit, Production D1 적용 상태는 source tree만으로 확인할 수 없습니다.
- Production 또는 migration 작업에서는 외부 상태를 다시 확인합니다.

## 4. 데이터 규칙

- D1 `DB`가 운영 데이터의 단일 원본입니다.
- 주문·결제·생산 데이터를 mock, `localStorage`, `sessionStorage`에 운영 원본으로 저장하지 않습니다.
- `sessionStorage`는 키오스크 제출 전 주문 초안에만 사용합니다.
- 기존 migration 0000~0007은 수정하지 않습니다. DB 변경은 다음 번호 migration으로 추가합니다.
- `work_items`는 고객·상품·수령일시·수령방법·수령자 작업 단위입니다.
- `work_item_events`는 주문 기준 감사 이력입니다. 작업 항목 삭제 시 `work_item_id`만 `NULL`이 되고 `order_id`는 유지됩니다.
- `orders.payment_status`는 `unpaid`, `partial`, `paid`입니다. 실제 결제 연동 없이 운영자가 직접 수정합니다.
- `work_items.delivery_method`는 `onsite_sale`, `onsite_reservation`, `delivery`입니다.
- `work_items.work_status`는 `received`, `confirmed`, `in_progress`, `ready`, `completed`, `cancelled`입니다.
- 현장판매는 `completed`, `paid`, 주문 시각의 `due_at`으로 생성합니다.
- production, Skin Pack, package, traceability는 작업장 부가 모델입니다. 새 core schema가 이 모델을 필수 참조하지 않게 유지합니다.
- 고객 이름, 전화번호, 주소, 상세주소를 server log에 기록하지 않습니다.
- passcode와 비밀값을 client bundle에 넣지 않습니다.

## 5. 인증·권한 규칙

- `/kiosk`와 `/kiosk/custom` 주문 접수는 공개 고객 흐름입니다.
- `/sales`, `/workshop`, `/settings`은 `OPERATOR_PASSCODE` 기반 운영 세션을 요구합니다.
- `POST /api/operator-session`은 passcode를 HttpOnly `jip_operator` 쿠키로 교환합니다.
- 운영 API는 쿠키를 서버에서 다시 확인합니다.
- `OPERATOR_USER_IDS`, `OPERATOR_EMAILS`, 사용자 ID·이메일 allowlist, ChatGPT 로그인은 사용하지 않습니다.
- client의 버튼 숨김을 권한 통제로 간주하지 않습니다.
- 401과 403을 구분해야 하는 신규 API는 실제 구현한 상태 코드와 함께 문서화합니다.

## 6. 주문·일정·시간 규칙

- 작업 일정 기준은 `work_items.due_at`입니다.
- 현장판매, 현장예약, 택배예약 모두 작업 행의 `due_at`을 사용합니다.
- 판매장과 작업장 날짜 조회에서 주문 생성시각을 일정으로 사용하지 않습니다.
- 달력 표시 범위는 서울 기준 오늘부터 365일입니다.
- 이 범위는 code constant이며 설정 화면에 노출하지 않습니다.
- 판매기간과 `sales_seasons`는 사용하지 않습니다.
- `cancelled` 작업은 기본 집계에서 제외하고 이벤트 이력으로 추적합니다.

## 7. UI·상태 규칙

- 메인 상품선택 화면과 브랜드 구조를 임의로 전면 재설계하지 않습니다.
- `/kiosk`와 `/kiosk/custom`은 고정된 고객 흐름이므로 수정하지 않습니다.
- 정일품 로고, `정일품 정육식당` 표기를 유지합니다.
- 고정된 명절·연도 문구를 다시 넣지 않습니다.
- 공통 `AppNav`의 데스크톱 우측 세로 배너와 좁은 화면 우측 하단 가로 배너를 유지합니다.
- 판매장 메인에는 상태별 통계 대시보드와 수령방법별 소계를 표시합니다. 이는 시스템 소유자의 2026-09-02 요청에 따른 개정입니다.
- 판매장 메인에서 행 단위 고객 도착·주문 확인 전환과 팝업 기반 전체 작업 편집을 허용합니다. 이는 시스템 소유자의 2026-09-02 요청에 따른 개정입니다.
- 판매장에서는 다중 선택 상태·수령일시·결제·삭제·복제 처리를 유지합니다.
- 작업장에는 결제정보와 불필요한 고객 개인정보를 노출하지 않습니다.
- `/settings`은 상품 편집 전용입니다. `daily_limit`은 이 화면에서만 수정합니다.

## 8. 동시작업 규칙

- 작업 전 `docs/work/active/`의 모든 claim을 확인합니다.
- 동일 파일 또는 동일 DB/API 계약을 다른 작업자가 claim했다면 수정하지 말고 조율합니다.
- 한 작업자는 한 branch와 하나의 active task 문서를 소유합니다.
- 공용 충돌 구역은 `db/schema.ts`, `drizzle/`, `package.json`, lockfile, `app/components/types.ts`, `AppNav`, `app/globals.css`, `/api/orders`, `/api/work-items`, `/api/work-items/bulk`입니다.
- 운영 세션, `orders.payment_status`, `work_items.work_status`, `work_item_events` 변경 전에는 명시적 claim이 필요합니다.
- 다른 작업자의 미완료 변경을 revert, reset, checkout하지 않습니다.
- `ours` 또는 `theirs` 전체 선택으로 충돌을 덮지 않고 각 hunk를 검토합니다.
- 완료 기록은 `docs/work/completed/`에 이동하고 실제 commit과 검사 결과를 적습니다.

## 9. Git 규칙

- 기본 branch prefix는 `codex/`입니다.
- 작업 시작 commit을 task 문서에 기록합니다.
- 일반 작업은 필요한 검사를 마친 뒤 관련 변경을 commit하고 GitHub 원격에 현재 branch를 push해야 완료로 간주합니다.
- 사용자 지시가 커밋·push를 금지하면 해당 제약과 인계 상태를 task 문서에 기록하고 orchestrator에게 인계합니다.
- GitHub가 아닌 기존 `origin`은 임의로 교체하지 않습니다.
- 다른 작업자의 미완료 변경을 정리하거나 revert하지 않습니다.
- `git reset --hard`, 광범위 checkout, 강제 push를 사용하지 않습니다.
- DB migration과 Production 배포는 사용자가 명시적으로 요청한 경우에만 실행합니다.

## 10. 필수 검사

변경 범위에 따라 최소 다음을 실행합니다.

- 문서만 변경: link 확인, `git diff --check`
- UI/API 변경: `npm run lint`, `npm run typecheck`, 관련 test, `npm test`
- 주문·판매장·작업장 변경: `npm test`
- 배포 후보: lint, typecheck, test, build
- schema 변경: 위 검사, `npm run db:generate`, 새 D1 상태의 migration journal 전체 적용

`tests/` 아래 모든 파일은 검사 대상입니다. 키오스크 고정성 기계 검사는 생략하지 않습니다.

## 11. 문서 갱신 규칙

- page 기능 변경: `docs/PAGES_AND_FEATURES.md`
- 시스템 흐름 변경: `docs/ARCHITECTURE.md`
- API·외부 연동 변경: `docs/API_AND_INTEGRATIONS.md`
- schema·migration 변경: `docs/DATA_AND_MIGRATIONS.md`
- 인증·안전 규칙 변경: `docs/SECURITY_AND_RELIABILITY.md`
- 빌드·test 변경: `docs/DEVELOPMENT_AND_TESTING.md`
- 배포 절차 변경: `docs/DEPLOYMENT_RUNBOOK.md`
- 중요한 기술 결정: `docs/DECISIONS.md`

코드 변경과 관련 as-built 문서 변경은 같은 작업에 포함합니다.
