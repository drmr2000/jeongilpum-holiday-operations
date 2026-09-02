# 보안과 신뢰성

## 인증과 권한

- 키오스크 주문 접수는 공개 흐름입니다.
- 운영자는 passcode를 `POST /api/operator-session`으로 제출합니다.
- passcode는 `OPERATOR_PASSCODE`에서 읽고 PBKDF2-HMAC-SHA-256으로 검증합니다.
- 성공한 세션은 `jip_operator` HttpOnly, `SameSite=Lax` 쿠키로 유지됩니다.
- HTTPS 요청에서만 쿠키에 `Secure` 속성이 추가됩니다.
- 운영 API는 세션이 없거나 유효하지 않으면 `401`을 반환합니다.

운영 인증은 사용자 ID, 이메일 allowlist, ChatGPT 로그인, Supabase Auth를 사용하지 않습니다.

## 비밀값과 개인정보

- `.dev.vars`의 `OPERATOR_PASSCODE`는 gitignored입니다.
- 실제 passcode, token, API key를 문서·로그·client bundle에 기록하지 않습니다.
- 고객 이름, 전화번호, 수령인, 배송주소는 필요한 화면과 API 응답에서만 사용합니다.
- package QR과 CSV는 고객 개인정보를 포함하지 않습니다.
- 운영 장애 조사 중에도 고객 개인정보를 로그에 복사하지 않습니다.

## 데이터 무결성

- 주문 생성은 `orders`, `work_items`, `work_item_events`를 D1 `batch()`로 기록합니다.
- `orders.idempotency_key` unique 제약이 재제출을 방어합니다.
- 작업, 주문, 결제 변경은 version 값을 확인합니다.
- 다중 선택 변경은 모든 선택 작업의 version을 확인합니다.
- 결제 상태와 입금액은 주문 단위로 수동 수정합니다.
- 취소 사유를 포함한 상태 변경과 결제 변경은 이벤트로 기록합니다.

## 작업 이력과 삭제

- `work_item_events.order_id`는 필수입니다.
- 작업 행 삭제 후에도 이벤트는 남고 `work_item_id`만 `NULL`이 될 수 있습니다.
- 작업 삭제 handler는 package와 Skin Pack 배정을 정리하는 D1 batch를 사용합니다.
- 삭제된 작업의 주문 합계와 버전을 같은 요청에서 갱신합니다.

## cache와 최신성

- 운영 조회 API는 `no-store` 응답을 사용합니다.
- Sales는 3초, Workshop은 2.5초 주기의 resource refresh를 사용합니다.
- focus와 online 상태에서 다시 조회합니다.
- 브라우저에 오래 남은 데이터를 기준으로 수정하지 않고 `expectedVersion`을 보냅니다.

## 입력 검증

- 주문 상품, 수량, 날짜, 수령방법, 배송 수령인·주소를 서버에서 검증합니다.
- 방문예약 시간은 08:00부터 21:00 사이의 30분 단위를 검증합니다.
- 맞춤주문은 허용 category와 최소 예산을 검증합니다.
- 작업 항목은 수령일시, 수령방법, 상품·단가·수량, 수령인·주소, 상태를 검증합니다.
- 결제 금액은 0 이상의 정수여야 합니다.
- 일괄 변경은 1개 이상 100개 이하 작업만 허용합니다.

## 장애 경계

- 주문 batch가 실패하면 주문 완료를 표시하지 않습니다.
- 주소 검색 스크립트가 실패하면 직접입력으로 진행합니다.
- version 충돌은 `409`으로 반환하고 최신 조회를 요구합니다.
- `0007_work-items-core.sql`은 과거 테이블을 제거하므로 기존 D1에 대한 무검증 적용을 금지합니다.
