# 데이터 모델과 migration

## 현재 core

Cloudflare D1 `DB`가 운영 데이터의 단일 원본입니다. 현재 core는 다음 네 테이블입니다.

| 테이블 | 역할 |
|---|---|
| `products` | 상품 속성, 가격, 활성 상태, `daily_limit` |
| `orders` | 주문자, 주문 합계, 결제 상태와 입금액 |
| `work_items` | 상품별 수령·배송 작업 행 |
| `work_item_events` | 작업·결제·도착·삭제 등의 감사 이력 |

`work_items`는 `orders`와 `products`를 필수 참조합니다. `work_item_events`는 `orders`를 필수 참조하고 `work_items`는 선택 참조합니다.

## 작업장 부가 테이블

다음 테이블은 작업장 기능을 위한 부가 모델입니다.

- `production_batches`
- `skin_packs`
- `skin_pack_labels`
- `packages`
- `package_skin_packs`
- `traceability_records`

이 테이블들은 작업 항목을 사용할 수 있으나 core 테이블은 부가 테이블에 의존하지 않습니다.

## 상태값

| 필드 | 허용값 |
|---|---|
| `orders.payment_status` | `unpaid`, `partial`, `paid` |
| `work_items.delivery_method` | `onsite_sale`, `onsite_reservation`, `delivery` |
| `work_items.work_status` | `received`, `confirmed`, `in_progress`, `ready`, `completed`, `cancelled` |
| `production_batches.status` | `planned`, `in_progress`, `completed`, `cancelled` |
| `skin_packs.status` | `available`, `assigned`, `voided`, `consumed` |
| `skin_pack_labels.status` | `draft`, `printed`, `void` |

`packages.package_status`, `work_item_events.event_type`, `traceability_records.source`는 schema의 `CHECK` 제약으로 열거하지 않습니다. 사용 가능한 값은 해당 API와 UI를 확인해야 합니다.

## 보존과 삭제

- `orders.idempotency_key`는 unique입니다.
- `products.daily_limit`은 `NULL` 또는 0 이상의 정수입니다.
- `work_item_events.work_item_id`는 `ON DELETE SET NULL`입니다.
- `work_item_events.order_id`는 삭제되지 않는 필수 참조입니다.
- package가 작업 항목을 참조하는 상태에서 직접 작업 행을 삭제할 수 없습니다. API는 package와 연결 정보를 먼저 정리합니다.

## migration 이력

`0000`부터 `0006`까지는 이전 모델의 이력입니다. `0007_work-items-core.sql`이 과거 주문, 수령, 판매기간, 결제, 고객 장부, 이전 생산·패키지 테이블을 삭제하고 현재 core와 부가 테이블을 새로 생성합니다.

`0007`은 과거 운영 행을 새 `orders`나 `work_items`로 이관하지 않습니다. 정적 상품 seed만 다시 삽입합니다. 기존 데이터가 있는 D1에 이 migration을 적용하는 일은 파괴적이므로, 외부 backup과 명시적 승인 없이 수행하지 않습니다.

기존 migration 파일은 수정하지 않습니다. schema 변경은 새 번호 migration으로 추가합니다.

## 로컬 D1

로컬 초기화는 새 상태에서 실행합니다.

```bash
npm run db:local
```

이 명령은 journal 순서대로 `0000`부터 `0007`까지 실행합니다. 기존 `.wrangler/state`에 이미 같은 migration이 적용되어 있으면 초기화 명령을 반복 실행하지 않습니다.

수동 D1 조회에는 아래처럼 저장 경로를 지정합니다.

```bash
npx wrangler d1 execute DB --local -c scripts/wrangler.jsonc --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

## schema 변경 검사

1. 새 migration 번호를 동시작업 claim에서 독점합니다.
2. `npm run db:generate`으로 생성 SQL을 확인합니다.
3. 새 로컬 D1에서 journal 전체를 적용합니다.
4. 기존 데이터가 있는 환경의 변경은 backup, row count, 외래 키 보존을 별도 계획으로 확인합니다.
5. lint, typecheck, 전체 test, build를 실행합니다.
