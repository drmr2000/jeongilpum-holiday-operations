# 시스템 아키텍처

## 논리 구조

```text
Browser
├─ public kiosk
└─ operator pages
        ↓ same-origin HTTP
Vinext / React routes
        ↓
Cloudflare Worker route handlers
├─ input validation
├─ operator session validation
├─ version and idempotency checks
└─ D1 prepared statements / batch
        ↓
Cloudflare D1 (SQLite)
```

## 코드 경계

- `app/components/`: 화면 UI와 클라이언트 상태
- `app/api/`: HTTP method, 입력 검증, 인증, D1 변경 경계
- `app/lib/`: 인증, 도메인 계산, 공유 client 함수
- `db/`: Drizzle schema와 D1 연결
- `drizzle/`: 순차 SQL migration
- `tests/`: 현재 동작을 고정하는 검사
- `scripts/`: 로컬 D1 초기화와 Wrangler 설정

## 주문과 작업

```text
POST /api/orders
→ orders
→ work_items
→ work_item_events
```

`orders`는 주문자, 주문 금액, 결제 상태를 보관합니다. `work_items`는 상품별 작업 행이며 수령방법과 `due_at`을 보관합니다. 운영 화면의 조회·편집·상태 변경은 `work_items`를 기준으로 동작합니다.

현장판매는 고객 주문 접수 시 `completed` 작업과 `paid` 주문으로 생성합니다. 현장예약과 택배예약은 `received` 작업으로 생성하고 운영자가 상태와 결제를 수정합니다.

## 감사와 삭제

`work_item_events`는 작업 상태, 결제, 도착, 생성, 복제, 삭제와 같은 운영 변경을 기록합니다. `work_item_id`는 nullable 외래 키이며 삭제 후 `NULL`이 될 수 있습니다. `order_id`는 필수이므로 작업 행이 삭제되어도 주문 기준 이력은 남습니다.

작업 행 삭제 API는 연결 package와 Skin Pack 배정을 먼저 정리한 뒤 작업 행을 삭제합니다. 이 순서는 최종 schema의 외래 키 제약을 충족하기 위한 처리입니다.

## 생산·패키지 부가 기능

```text
work_items
→ production demand
→ production_batches
→ skin_packs and skin_pack_labels
→ packages and package_skin_packs
```

생산·패키지 테이블은 작업 항목을 사용할 수 있으나 주문·작업 핵심 테이블은 이 부가 기능을 참조하지 않습니다. `traceability_records`는 production batch와 Skin Pack의 추적성 정보를 보관합니다.

## 인증 경계

키오스크 주문은 공개입니다. 운영자가 passcode를 `POST /api/operator-session`으로 제출하면 `jip_operator` HttpOnly 쿠키가 설정됩니다. 운영 page와 운영 API는 이 쿠키를 다시 확인합니다.

인증은 `OPERATOR_PASSCODE` 하나를 기반으로 하며 사용자 ID, 이메일 allowlist, Supabase Auth에 의존하지 않습니다.

## 최신성 및 동시 수정

- 운영 API 응답은 `Cache-Control: no-store`를 사용합니다.
- 작업과 주문 수정은 `expectedVersion`을 확인해 오래된 화면의 덮어쓰기를 막습니다.
- 주문, 작업 생성, 생산·패키지 처리 중 일부는 idempotency key를 사용합니다.
- 다중 테이블 변경은 D1 `batch()`로 처리합니다.

## 키오스크 날짜 범위

`GET /api/products`는 서울 기준 오늘부터 365일 뒤까지의 범위를 키오스크에 반환합니다. 응답의 `activeSeason` 이름은 호환 응답 필드일 뿐, `sales_seasons` 테이블이나 판매기간 설정을 의미하지 않습니다.
