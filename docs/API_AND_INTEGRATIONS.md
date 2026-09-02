# API와 외부 연동

## API 원칙

- 공개 고객 주문은 `POST /api/orders` 하나입니다.
- 운영 조회와 운영 데이터 변경은 `jip_operator` 세션 쿠키를 확인합니다.
- version을 받는 변경 API는 충돌 시 `409`과 최신 version 정보를 반환할 수 있습니다.
- 운영 변경은 `work_item_events`에 감사 이벤트를 기록합니다.
- 고객 장부 전용 API와 `fulfillments` API는 현재 존재하지 않습니다.

## 세션과 상품

| Method | Route | 접근 | 입력 | 결과 |
|---|---|---|---|---|
| POST | `/api/operator-session` | 공개 | `{ passcode }` | 암호 검증 후 운영 쿠키 발급 |
| DELETE | `/api/operator-session` | 공개 | 없음 | 운영 쿠키 만료 |
| GET | `/api/products?date=` | 공개 | 선택 `date` | 활성 상품, 날짜별 작업수량, `dailyLimit`, 잔여수량, 키오스크 달력 범위 |
| GET | `/api/settings` | 운영 세션 | 없음 | 상품 revision과 비활성 상품 목록 |
| PATCH | `/api/settings` | 운영 세션 | `type: "product"`, `id`, `expectedVersion`, 상품 필드 | 기존 상품과 `daily_limit` 수정 |

`GET /api/products`의 `activeSeason`은 호환 응답 필드입니다. 판매기간 테이블이나 설정 값을 조회하지 않으며 오늘부터 365일 뒤까지의 달력 범위를 반환합니다.

## 주문과 작업

| Method | Route | 접근 | 입력 | 결과 |
|---|---|---|---|---|
| GET | `/api/orders?date=&q=` | 운영 세션 | 선택 `date`, `q` | 주문별 작업 항목과 이벤트 조회 |
| POST | `/api/orders` | 공개 | `idempotencyKey`, 주문자, 수령방법, 상품 배열, 예약·배송 정보, 맞춤주문 정보 | `orders`, `work_items`, `work_item_events` 생성 |
| PATCH | `/api/orders/arrival` | 운영 세션 | `{ workItemId }` 또는 `{ orderId }` | 현장예약 주문의 최초 도착시각 기록 |
| PATCH | `/api/orders/payment` | 운영 세션 | `{ orderId, paymentStatus, paidAmount, expectedVersion }` | 주문 결제 상태·금액과 관련 이벤트 수정 |
| PATCH | `/api/orders/status` | 운영 세션 | `{ workItemId, status, expectedVersion, cancelReasonType?, cancelReason? }` | 작업 상태 변경, 취소 사유 검증과 이벤트 기록 |
| GET | `/api/work-items` | 운영 세션 | `view`, 상태·수령방법·기간·검색·정렬 filter | 작업 목록과 상태·수령방법별 현황, 또는 고객별 주문·잔액 |
| PATCH | `/api/work-items` | 운영 세션 | `{ id, expectedVersion, changes }` | 작업 행, 주문 합계·도착 상태, 감사 이벤트 수정 |
| POST | `/api/work-items` | 운영 세션 | 생성용 `action: "create"` 또는 복제용 `sourceId`, `expectedVersion` | 새 작업 생성 또는 작업 복제 |
| DELETE | `/api/work-items` | 운영 세션 | `{ id, expectedVersion }` | package 연결 정리 후 작업 행 삭제 |
| PATCH | `/api/work-items/bulk` | 운영 세션 | 최대 100개 `items`와 action별 값 | 상태·수령일시·결제 일괄 변경, 복제, 삭제 |

`/api/work-items/bulk`의 action은 `status`, `due_at`, `payment`, `duplicate`, `delete`입니다.

## 작업장

| Method | Route | 접근 | 입력 | 결과 |
|---|---|---|---|---|
| GET | `/api/workshop/orders?date=` | 운영 세션 | 필수 `date` | 당일 현장예약·택배 작업, 상품별 수량, 이벤트 |
| POST | `/api/workshop/actions` | 운영 세션 | `{ workItemId, status, expectedVersion, idempotencyKey }` | idempotent 작업 상태 변경 |
| GET | `/api/workshop/production?date=` | 운영 세션 | 필수 `date` | 수요, 가용 Skin Pack, batch, 최근 이력번호 |
| POST | `/api/workshop/production` | 운영 세션 | action별 payload | batch·목표·추적성 구간·Skin Pack·완료 처리 |
| GET | `/api/workshop/production/batches/[batchId]/csv` | 운영 세션 | 경로 `batchId` | batch의 Skin Pack 라벨 CSV |
| GET | `/api/workshop/packages` | 운영 세션 | 없음 | 최근 package 목록 |
| GET | `/api/workshop/packages/[packageCode]` | 운영 세션 | 경로 `packageCode` | package, 연결 작업, Skin Pack, 최신 라벨 |
| PATCH | `/api/workshop/packages/[packageCode]` | 운영 세션 | `{ action: "preview_label" }` | 라벨 미리보기 |
| POST | `/api/workshop/packages/assemble` | 운영 세션 | `{ workItemId, assemblyKey }` | idempotent package 생성 |
| POST | `/api/workshop/packages/reassign` | 운영 세션 | `{ packageId, targetWorkItemId, idempotencyKey }` | package 작업 항목 재배정 |
| GET | `/api/workshop/packages/[packageCode]/csv` | 운영 세션 | 경로 `packageCode` | package의 Skin Pack 라벨 CSV |

`POST /api/workshop/production`의 action은 `create_batch`, `adjust_target`, `change_traceability`, `create_skin_pack`, `complete_batch`입니다.

## 외부 연동

### Cloudflare D1

- Worker runtime은 `cloudflare:workers`의 `env.DB`를 사용합니다.
- D1은 SQLite 기반 운영 데이터베이스입니다.
- SQL은 prepared statement와 `.bind()`를 사용합니다.

### OpenAI Sites

Sites project 연결 정보는 `.openai/hosting.json`에 보관합니다. 이 문서 작성 범위에서는 실제 Production version과 배포 상태를 조회하지 않았습니다.

### Kakao 우편번호

배송 주소 입력에서 Kakao 우편번호 스크립트를 동적으로 불러올 수 있습니다. 로드에 실패하면 주소를 직접 입력할 수 있습니다.

### QR와 CSV

- QR은 npm `qrcode` 라이브러리로 생성합니다.
- package QR에는 고객 개인정보를 포함하지 않습니다.
- 라벨 CSV는 외부 API 호출이 아닌 다운로드 응답입니다.

## 사용하지 않는 연동

- Supabase DB, Auth, Realtime
- Postgres
- Vercel
- PG·카드사 승인 API
- SMS·카카오 알림 API
- WebSocket, SSE
- Open Label API 또는 프린터 직접 제어
