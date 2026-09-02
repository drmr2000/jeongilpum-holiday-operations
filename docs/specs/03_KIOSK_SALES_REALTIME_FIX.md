# Archived specification

> 이 문서는 과거 요구사항 기록입니다. Supabase, 과거 수령 모델, 이전 실시간성 검토는 현재 구현을 설명하지 않습니다. 현재 구조는 상위 `docs/`의 as-built 문서와 source code를 기준으로 판단합니다.

# 고객 주문에서 판매장 연동 수정

## 중요도
P0.
고객이 주문을 접수했는데 판매장에 주문이 보이지 않는 현재 상태는 운영 불가 상태다.

---

# 1. 가장 먼저 원인 조사

Codex는 UI 수정 전에 아래를 실제 코드/DB 기준으로 확인한다.

1. kiosk submit 시 Supabase `orders` row가 실제 생성되는가?
2. `order_items`가 생성되는가?
3. pickup/shipping `fulfillments`가 생성되는가?
4. `fulfillment_items`가 생성되는가?
5. kiosk 완료 화면이 DB commit 전에 표시되는가?
6. kiosk가 mock/localStorage만 사용하는가?
7. sales 화면이 mock/static array를 사용하는가?
8. kiosk와 sales가 같은 `NEXT_PUBLIC_SUPABASE_URL`을 사용하는가?
9. Preview/Production 환경변수가 서로 다른 Supabase project를 보고 있지 않은가?
10. admin RLS가 sales user SELECT를 허용하는가?
11. Realtime publication/subscription이 설정되어 있는가?
12. selectedDate/timezone 필터가 신규 주문을 제외하고 있지 않은가?
13. pickup_at/ship_date 타입/날짜 변환이 KST 기준으로 맞는가?

원인을 추측하지 말고 실제 구현을 확인하고 보고한다.

---

# 2. Single Source of Truth

Supabase Postgres.

금지:
- localStorage-only order
- kiosk mock order
- sales mock order
- 서로 다른 data source
- UI state만으로 주문생성 완료 처리

---

# 3. 주문 생성 transaction

kiosk 주문:
- orders
- order_items
- fulfillment
- fulfillment_items
- order_event

가 하나의 transaction/RPC 단위로 성공해야 한다.

실패 시 모두 rollback.

idempotency_key unique.

서버 성공 response 후에만:
`주문 접수가 완료되었습니다.`

---

# 4. 판매장 날짜표 query

판매장 화면은 선택날짜 기준으로 실제 DB에서 조회.

pickup:
- pickup_at의 local date

shipping:
- ship_date

gift/direct:
- 해당 scheduled date

한국 운영시간 기준 timezone을 명확히 처리.
UTC 변환 때문에 오늘 주문이 전날/다음날로 빠지지 않도록 E2E 테스트.

---

# 5. Realtime

판매장 화면 open 시:
- orders
- order_items
- fulfillments
- operational_alerts
필요 테이블 구독.

권장:
Realtime event 수신
→ current query invalidate
→ Supabase DB refetch

event payload만으로 테이블 row를 임의 조립하지 않는다.

---

# 6. fallback

Realtime이 끊겨도 주문이 누락되지 않아야 한다.

- window focus refetch
- network reconnect refetch
- 날짜 변경 refetch
- 수동 refresh
- 15~30초 polling fallback 허용

---

# 7. E2E 필수 테스트

브라우저 A:
`/sales` 또는 현재 판매장 route

브라우저 B:
`/kiosk`

### 방문 주문
1. B에서 오늘 방문 주문 생성
2. kiosk 완료
3. 2~3초 이내 A 오늘 표에 표시
4. 새로고침 없이 표시
5. row 상세가 정확

### 택배 주문
1. B에서 발송 날짜 포함 택배 주문
2. 주문완료
3. A에서 해당 발송 날짜 선택
4. 주문 표시
5. 주소/수령인/ship_date 정확

### 중복
빠르게 주문접수 2회 클릭:
- DB order 1건
- sales 1건

### Realtime 장애
1. sales realtime 강제중단
2. kiosk 주문
3. reconnect
4. refetch로 주문 표시

### 영속성
- kiosk 브라우저 localStorage 삭제
- sales 새로고침
- 주문 유지

---

# 8. 완료 기준

아래 중 하나라도 실패하면 수정 완료 아님.

- 주문 DB 저장
- kiosk 성공 response
- sales DB 조회
- realtime 반영
- reconnect 복구
- 날짜/timezone 정확성
- shipping ship_date
- RLS 정상

---

# 9. 완료 보고

반드시:
- 실제 원인
- 수정 파일
- 변경 query/API/RPC
- migration
- RLS
- env 문제 여부
- Realtime 설정
- 방문 주문 E2E
- 택배 주문 E2E
- duplicate submit test
- reconnect test
을 보고한다.
