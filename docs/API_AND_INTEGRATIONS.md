# API와 외부 연동

## API 원칙

- route handler가 HTTP, 인증, validation, transaction 경계다.
- 운영 GET/쓰기 API는 공용 운영 암호 세션을 확인한다.
- 공개 주문 POST는 운영자 인증을 요구하지 않지만 서버 validation과 idempotency를 적용한다.
- 모든 SQL parameter는 prepared statement `.bind()`를 사용한다.
- 운영 조회 response는 cache를 비활성화한다.
- error response에 내부 SQL, token, PII를 노출하지 않는다.

## API 목록

| Method | Route | 책임 | 접근 |
|---|---|---|---|
| GET | `/api/products` | 활성 상품, 시즌, headline | 공개 |
| POST | `/api/orders` | main kiosk 주문 원자적 생성 | 공개 |
| GET | `/api/orders` | 날짜별 주문·검색·상세 데이터 | 운영자 |
| POST | `/api/orders/fulfillment` | legacy 주문 일정 지정 | 운영자 |
| POST/DELETE | `/api/operator-session` | 운영 세션 생성·삭제 | 공개 |
| GET | `/api/customer-ledger` | 고객 장부 목록·상세·미수·선수금 조회 | 운영자 |
| POST | `/api/customer-ledger/transactions` | 고객 결제와 원본 보존 정정 | 운영자 |
| POST | `/api/customer-ledger/consultations` | 상담 메모 및 상담 후 장부 분리 적용 | 운영자 |
| GET/PATCH | `/api/settings` | 상품·시즌·headline 조회/수정 | 운영자 |
| GET | `/api/workshop/orders` | 작업장 날짜별 데이터 | 운영자 |
| POST | `/api/workshop/actions` | 수락·시작·준비완료 | 운영자 |
| GET/POST | `/api/workshop/production` | 생산 overview와 Batch/Skin Pack action | 운영자 |
| POST | `/api/workshop/packages/assemble` | Skin Pack package 조립 | 운영자 |
| POST | `/api/workshop/packages/reassign` | 1:1 package 재배정 | 운영자 |
| GET/PATCH | `/api/workshop/packages/:code` | package 상세·label action | 운영자 |
| GET | `/api/workshop/packages/:code/csv` | package long CSV | 운영자 |
| GET | `/api/workshop/production/batches/:id/csv` | batch long CSV | 운영자 |

## 주문 API 계약의 핵심

- client가 보낸 가격을 받지 않는다.
- 상품 ID와 수량으로 D1 상품을 조회해 총액을 계산한다.
- 방문수령은 pickup date/time, 택배는 ship date와 주소를 검증한다.
- custom item은 허용 category, 예산 최소 200,000원을 검증한다.
- 한정수량은 DB 조건부 reservation으로 동시 주문을 방어한다.
- commit 후 생성 주문을 응답한다.
- 고객 이름·전화번호 정규화 계정을 만들거나 재사용하고 주문을 고객 장부에 연결한다.

## 고객 장부 API 계약

- 고객 잔액은 취소되지 않은 주문 총액에서 고객 장부 순입금을 뺀 값이다.
- 취소 시 `cancelReasonType`은 `test`, `customer_cancelled`, `custom` 중 하나이며 직접입력은 200자 이하 `cancelReason`을 요구한다. 사유는 `order_events.reason`에 보존한다.
- 활성 주문·결제거래·상담이 모두 없는 취소 전용 고객은 장부 기본 목록에서 제외하지만 주문 검색과 감사이력은 유지한다.
- 양수는 미수금, 0은 결제완료, 음수는 선수금이다.
- 입금은 현금·카드·계좌이체이며 잔액보다 큰 금액도 선수금으로 기록할 수 있다.
- 실제 결제자 이름·전화번호·관계·메모는 선택값이다.
- 모든 금액 변경은 idempotency key와 D1 batch를 사용하며 기존 거래를 UPDATE/DELETE하지 않는다.

## polling 계약

- Sales와 Workshop은 2.5초 interval을 유지한다.
- focus/online에서 즉시 refetch한다.
- active tab이 아니면 브라우저 timer throttling이 발생할 수 있다.
- API는 `Cache-Control: no-store, no-cache, must-revalidate`를 사용한다.
- Realtime event 기반 구조로 바꿀 경우 polling fallback을 제거하지 말고 별도 설계결정을 기록한다.

## 외부 연동

### OpenAI Sites

- source version 저장, Production 배포, 접근정책을 담당한다.
- `.openai/hosting.json`의 project와 D1 논리 binding을 재사용한다.
- Production deploy는 saved version 단위다.

### Cloudflare Worker와 D1

- Vinext 앱과 API 실행 runtime이다.
- `cloudflare:workers`에서 `env.DB`를 주입받는다.
- D1은 SQLite 기반 운영 DB다.
- R2 binding은 현재 `null`이다.

### 운영 암호 세션

- Worker 환경값 `OPERATOR_PASSCODE`로 PBKDF2-HMAC-SHA256 토큰을 계산한다.
- `jip_operator` HttpOnly 쿠키는 30일 동안 유효하며 HTTPS 요청에서만 `Secure` 속성을 사용한다.
- 운영 route handler는 공용 세션 검사 실패 시 401을 응답한다.

### Kakao 우편번호

- 고객 배송주소 검색 시 `https://t1.kakaocdn.net/.../postcode.v2.js`를 동적으로 로드한다.
- road address, jibun, zonecode, reference를 분리한다.
- 로드 실패 시 직접입력으로 진행한다.

### QR

- npm `qrcode` 라이브러리로 data URL을 생성한다.
- 외부 QR API 호출은 없다.
- payload에는 package 식별정보만 넣고 PII를 금지한다.

### Open Label CSV

- 외부 API 연동이 아니라 호환 long CSV 다운로드다.
- UTF-8 BOM, CSV escaping, one row per Skin Pack을 유지한다.

### 제품 이미지

- 설정에는 URL 문자열만 저장한다.
- 자체 upload와 R2 저장은 없다.
- 외부 URL의 가용성·권한·CORS는 해당 host에 의존한다.

## 연동되지 않은 시스템

- GPT/OpenAI model inference API
- Supabase DB/Auth/Realtime
- Vercel
- GitHub 배포 remote
- PG·카드사 승인 API
- SMS·Kakao 알림 발송
- WebSocket/SSE
- Open Label API 또는 프린터 직접 제어

`.env.example`의 Supabase key 이름은 과거 흔적이며 현재 runtime에서 사용하지 않는다. 새 코드가 이를 다시 사용하지 않도록 한다.
