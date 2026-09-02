# Archived specification

> 이 문서는 과거 요구사항 기록입니다. Supabase, Postgres, `fulfillments`, 판매기간, 과거 인증 요구는 현재 구현을 설명하지 않습니다. 현재 구조는 상위 `docs/`의 as-built 문서와 source code를 기준으로 판단합니다.

# Codex 수정 명령: 메인화면 Step2 / 방문수령 / 택배발송 / 판매장 연동

업로드한 모든 MD 파일을 읽고 기존 MVP에 적용해줘.

이번 작업은 기존 고객용 메인화면 디자인 전체를 다시 만드는 작업이 아니다.
이미 완성된 메인 상품선택 화면은 최대한 유지하고,
아래 기능만 우선 수정/보완한다.

## 우선순위
P0
1. 고객 주문이 실제 Supabase DB에 저장되는지 확인
2. 주문 접수 후 판매장 화면에 실시간으로 나타나게 수정
3. 택배 발송일 선택이 없어 주문 접수가 막히는 문제 수정
4. 도로명주소 저장 오류/참고항목 오류 수정

P1
5. Step2 방문수령/택배발송 UI 단순화
6. 방문 날짜/시간 선택 UX 개선

## 반드시 지킬 것
- 기존 정상 동작 DB schema, RLS, transaction, idempotency, audit는 가능한 한 유지
- 기존 migration 수정 금지. 필요한 경우 새 migration 추가
- kiosk/admin mock data 금지
- Supabase Postgres를 Single Source of Truth로 사용
- 서버 저장 성공 전 주문완료 화면 표시 금지
- 사용자 입력값은 뒤로가기/에러 시 유지
- 고객용 화면에 관리자 기능 노출 금지
- 기존 메인 상품선택 화면 디자인은 요청사항 외 임의 재설계 금지

## 작업 순서
1. `01_KIOSK_STEP2_PICKUP.md`
2. `02_KIOSK_SHIPPING.md`
3. `03_KIOSK_SALES_REALTIME_FIX.md`
4. lint / typecheck / build / integration test
5. 브라우저 2개로 실제 kiosk→sales 연동 테스트

## 완료 후 반드시 보고
1. 기존 연동 실패 원인
2. 변경 파일
3. DB migration/RLS 변경 여부
4. 방문수령 수정 결과
5. 택배주소 수정 결과
6. 발송일 선택 수정 결과
7. kiosk→sales 실시간 테스트 결과
8. 남은 문제/TODO
9. Vercel/Supabase에 추가 설정 필요한 항목

페이지를 임의로 더 확장하지 말고 위 명세만 정확하게 구현해.
