# Archived specification

> 이 문서는 과거 요구사항 기록입니다. Supabase, Postgres, `fulfillments`, `sales_seasons`, 이전 고객 장부와 인증 요구는 현재 구현을 설명하지 않습니다. 현재 구조는 상위 `docs/`의 as-built 문서와 source code를 기준으로 판단합니다.

# 정일품 명절 선물세트 예약·운영 시스템
## Codex 개발 명세서 v2.1

최종 목적: 명절 선물세트의 고객 주문, 판매장 운영, 작업장 실시간 작업, 방문수령/택배, 기업 대량납품, 서비스·증정, 라벨, 결제기록, 통계/Excel까지 하나의 시스템으로 운영한다.

---

# 0. 가장 중요한 개발 원칙

1. 고객 키오스크는 **태블릿 세로형(portrait-first)** 으로 구현한다.
2. 판매장 화면은 **통계 대시보드가 아니라 현장 업무 처리 화면**으로 구현한다.
3. 작업장 화면은 **무엇을 먼저 만들고, 무엇이 변경됐고, 무엇이 완료됐는지**에 집중한다.
4. 기능이 많아도 사용자별로 필요한 기능만 보이게 한다.
5. UI 검증만 믿지 말고, 중요한 무결성 규칙은 DB constraint / transaction / RLS로 강제한다.
6. 주문 중복, 동시수정, 잘못된 라벨, 오배송, 개인정보 노출을 P0 위험으로 취급한다.
7. 기존 가격/상품명을 코드에 하드코딩하지 않는다.
8. 서비스·증정은 매출 0원이지만 실제 제작/출고/BOM 집계에는 포함한다.
9. hard delete 금지. 취소/무효화/정정 이력으로 관리한다.
10. 애니메이션은 화려함보다 **사용자 인지와 오류 방지**를 우선한다.

---

# 1. 기술 스택

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- Framer Motion
- Supabase
  - Postgres
  - Auth
  - Realtime
  - Storage
  - Row Level Security
- Vercel
- GitHub
- PWA
- Excel import/export: ExcelJS 권장

---

# 2. 사용자 모드

## 2.1 고객 키오스크 `/kiosk`
로그인 없음.

가능:
- 상품 조회
- 상품 상세
- 장바구니
- 방문수령 주문
- 택배발송 주문
- 고객정보 입력
- 주소검색
- 음성입력 보조
- 주문 최종확인
- 주문 접수완료 확인

불가능:
- 기존 고객 조회
- 기존 주문 조회
- 다른 고객 정보 조회
- 결제내역 조회
- 관리자 기능
- 작업상태 상세
- 라벨
- 증정관리
- 기업관리

## 2.2 판매장 `/admin`
Supabase Auth 필수.

역할:
- sales
- admin
- superadmin

## 2.3 작업장 `/workshop`
작업에 필요한 최소정보만 노출.

---

# 3. 고객 키오스크 UI — 절대 변경하지 말 것

## 3.1 기본 화면 방향
- portrait-first
- 기준 768×1024 이상
- 반응형 가능하되 portrait 우선
- 세로형 태블릿에서 가장 완성도 높게 보여야 함

## 3.2 메인 상품 화면 구조

구조:
- 상단: 로고 + 브랜드명 + 장바구니
- 좌측: 카테고리
- 우측: 2열 상품 그리드
- 하단: 선택 수량 / 금액 / 주문하기 고정

와이어프레임:

```text
┌──────────────────────────────┐
│ [로고] 정일품 명절 선물세트  │
│ 좋은 선물을 골라주세요   🛒2 │
├───────┬──────────────────────┤
│ 진공  │ [상품] [상품]        │
│ 세트  │ [상품] [상품]        │
├───────┤                      │
│프리미엄│ [상품] [상품]        │
├───────┤                      │
│LA갈비 │                      │
├───────┤                      │
│뼈세트 │                      │
├───────┤                      │
│O'meat │                      │
├───────┤                      │
│ 직원  │                      │
│ 문의  │                      │
├───────┴──────────────────────┤
│ 선택 2세트 / 400,000원       │
│            [ 주문하기 ]       │
└──────────────────────────────┘
```

### 상품 카드 규칙
모든 카드:
- 동일 크기
- 동일 사진 비율
- 상품명 위치 동일
- 가격 위치 동일
- 수량 컨트롤 위치 동일
- 2열 grid 고정
- 상품명 2줄 이내
- 카드 전체 터치 가능

카드 내용:
- 상품 이미지
- 상품명
- 짧은 설명
- 가격
- `[-] 0 [+]`

---

# 4. 로고 구조

메인 상단에 관리자 교체 가능한 로고 슬롯.

지원:
- 투명 PNG
- 정사각형/가로형
- 비율 유지
- 자동 축소
- 로고가 없으면 텍스트 브랜드명 표시

권장:
- Supabase Storage에 저장
- 관리자 설정에서 업로드/교체

---

# 5. 상품 상세 모달

상품 클릭 시 전체 페이지 이동 금지.

동작:
1. 배경 dim
2. 중앙 큰 모달
3. 상품 이미지 크게 표시
4. 상품 설명
5. 구성/중량
6. 수량
7. 장바구니 담기

와이어프레임:

```text
┌──────────────────────────────┐
│      배경 상품화면 dim        │
│  ┌────────────────────────┐  │
│  │                    ✕   │  │
│  │     [큰 상품 이미지]    │  │
│  │                        │  │
│  │ 봉황세트               │  │
│  │ 200,000원              │  │
│  │                        │  │
│  │ 상품 설명              │  │
│  │ 구성 / 중량            │  │
│  │                        │  │
│  │      [-] 1 [+]         │  │
│  │   [장바구니 담기]       │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

애니메이션:
- scale + fade
- 180~220ms
- 닫을 때 reverse

---

# 6. 고객 키오스크 화면 전환

## 6.1 핵심
주문 흐름은 route 이동 중심이 아니라 **single flow container + step state** 권장.

예:
- `step=products`
- `step=cart`
- `step=fulfillment`
- `step=pickup-info`
- `step=pickup-time`
- `step=shipping-sender`
- `step=shipping-recipient`
- `step=shipping-address`
- `step=review`
- `step=done`

## 6.2 전환 규칙
- 다음: 오른쪽 → 왼쪽 slide
- 이전: 왼쪽 → 오른쪽 slide
- 220~280ms
- 버튼 press feedback 100~150ms
- 과도한 bounce 금지
- 자동 캐러셀 금지
- 긴 애니메이션 금지

Framer Motion 사용 권장.

---

# 7. 장바구니 확인

`주문하기` 직후 바로 수령방법으로 가지 않고 장바구니 확인 1회.

```text
┌──────────────────────────────┐
│ ←        주문 상품 확인      │
├──────────────────────────────┤
│ [사진] 봉황세트              │
│ 200,000원         [-] 2 [+]  │
├──────────────────────────────┤
│ [사진] LA갈비 1.8kg          │
│ 99,000원          [-] 1 [+]  │
├──────────────────────────────┤
│ 총 3세트 / 499,000원         │
│             [ 다음 ]         │
└──────────────────────────────┘
```

---

# 8. 수령방법 선택

고객에게 전면 노출:
- 방문수령
- 택배발송

복합 주문은 고객용 키오스크에서는 단순화:
- `복합 주문은 직원에게 문의해주세요`

```text
┌──────────────────────────────┐
│ ←                            │
│      어떻게 받으시겠어요?    │
│                              │
│ [      방문수령      ]       │
│ 매장에서 직접 받기           │
│                              │
│ [      택배발송      ]       │
│ 원하는 곳으로 보내기         │
│                              │
│ 복합 주문은 직원에게 문의     │
└──────────────────────────────┘
```

---

# 9. 방문수령 흐름

## 9.1 고객정보
- 성함
- 연락처
- 요청사항(선택)
- 음성입력 보조 가능

## 9.2 방문 날짜/시간
- 날짜 버튼
- 시간대 버튼
- 직접 시간 입력 금지
- 예약 마감일은 disable + `예약마감` 문구

## 9.3 최종 확인
- 상품
- 수량
- 고객명
- 연락처
- 방문일
- 시간
- 요청사항
- 총 금액

---

# 10. 택배발송 흐름

택배는 한 화면에 모든 입력을 몰지 않는다.

## Step 1 보내는 분
- 이름
- 연락처

## Step 2 받는 분
- 이름
- 연락처

## Step 3 주소
- 주소검색
- 상세주소
- 음성입력 보조
- 음성결과 자동확정 금지
- 후보 선택 후 확정

## Step 4 최종확인
- 주문상품
- 보내는 분
- 받는 분
- 주소
- 요청사항
- 금액

---

# 11. 음성입력

보조기능.
지원 브라우저에서만 feature detection.

권장 필드:
- 이름
- 수령인 이름
- 주소검색어
- 상세주소
- 요청사항

전화번호는 숫자 키패드 사용.

음성결과:
- 자동 저장 금지
- `이렇게 입력할까요?` 확인 필요

지원 안 돼도 모든 주문 가능해야 함.

---

# 12. 직원 도움 버튼

고객 주문 입력 페이지마다:
`직원 도움`

동작:
- 현재 입력값 유지
- 화면 초기화 금지
- 직원 인증 후 이어서 입력 가능

---

# 13. 주문완료 오류방지

`주문 접수`:
- 첫 클릭 후 버튼 잠금
- `주문을 접수하고 있습니다...`
- 서버 성공 전 완료화면 금지
- idempotency key 사용
- 동일 key 재요청 시 기존 주문 반환

인터넷 끊김:
- 입력값 임시보존
- `주문이 아직 접수되지 않았습니다`
- `다시 접수하기`
- 같은 idempotency key 재사용

---

# 14. 판매장 UI — 대시보드 금지

판매장 홈은 통계 대시보드가 아니라 업무 허브.

메인 큰 버튼 4개:
1. 주문 찾기
2. 주문 받기
3. 상품 찾아가기
4. 오늘 보낼 상품

하단:
- 홈
- 주문
- 방문수령
- 배송
- 더보기

상단 알림:
- 주문변경
- 고객도착
- 긴급 이슈

통계 카드 다수 노출 금지.

---

# 15. 판매장 홈 와이어프레임

```text
┌──────────────────────────────┐
│ 정일품 주문관리   🔔변경 2   │
├──────────────────────────────┤
│                              │
│ [ 🔍 주문 찾기 ]             │
│                              │
│ [ ＋ 주문 받기 ]             │
│                              │
│ [ 🎁 상품 찾아가기 ]         │
│                              │
│ [ 🚚 오늘 보낼 상품 ]        │
│                              │
├──────────────────────────────┤
│ 지금 확인해주세요            │
│ 🔴 작업 중 주문변경 1건      │
│ 🟠 주소 미입력 배송 3건      │
├──────────────────────────────┤
│ 홈 | 주문 | 방문 | 배송 | 더보기 │
└──────────────────────────────┘
```

---

# 16. 판매장 주문 찾기

검색:
- 이름
- 전화번호
- 끝 4자리
- 주문번호
- 수령인
- 기업명

결과는 카드형.

주문 상세:
- 주문상품
- 받는방법
- 진행상황
- 결제
- 하단 액션

주요 버튼:
- 주문 수정
- 결제 기록
- 고객 도착

보조:
- 라벨
- 변경이력
- 취소

---

# 17. 판매장 상품 찾아가기

시간순 목록.

예:
- 고객명
- 상품
- 수량
- 준비상태
- `찾으러 왔어요`

누르면 작업장에 실시간 알림.

판매장 상태:
- 작업장 확인대기
- 작업장 확인
- 상품 준비완료
- 고객 전달완료

---

# 18. 작업장 UI — 통계 대시보드 금지

작업장은:
- 무엇을 먼저 만들지
- 변경이 있는지
- 고객이 왔는지
- 라벨 조치가 있는지

에 집중.

상단 긴급:
- 고객도착
- 주문변경
- 라벨조치

하단:
- 오늘 작업
- 상품별
- 가용품
- 더보기

---

# 19. 작업장 기본 와이어프레임

```text
┌──────────────────────────────┐
│ 오늘 작업                    │
│ 🚨 고객도착 1  🔴변경 2      │
│ 🏷 라벨조치 1                │
├──────────────────────────────┤
│ 🚨 고객 도착                 │
│ 김철수                       │
│ 봉황 2 / 진 1                │
│ 요청: 지방 적게              │
│        [ 확인했습니다 ]       │
├──────────────────────────────┤
│ 14:30 방문                   │
│ 박영희                       │
│ 팔영 2                       │
│        [ 작업 시작 ]          │
├──────────────────────────────┤
│ 오늘작업 | 상품별 | 가용품 | 더보기 │
└──────────────────────────────┘
```

---

# 20. 작업장 작업 카드

보여줄 것:
- 고객명/기업명
- 상품
- 수량
- 방문시간/배송일
- 요청사항
- 라벨
- 현재단계

보여주지 않을 것:
- 결제금액
- 잔액
- 결제수단
- 고객 전체 이력

버튼:
- 대기 → 작업 시작
- 작업중 → 작업 완료
- 완료 → 완료됨

한 시점에 주요 액션 버튼 1개만 표시.

---

# 21. 주문변경 실시간 알림

판매장/작업장 동시.

Critical:
- 상품 변경
- 수량 감소
- 작업중 변경
- 작업완료 후 취소
- 라벨 폐기 발생
- 임박 방문 변경

작업장 예:

```text
🚨 작업 중 주문 변경

김철수
봉황 5 → 4

중단 대상:
BH-0142-05

[ 변경 내용 확인 ]
```

확인 전까지 persistent alert.

판매장에는:
- 작업장 미확인
- 작업장 확인완료

표시.

---

# 22. 라벨 폐기

주문 변경 시 시스템이 정확한 폐기 라벨 지정.

예:
- BH-0142-05

라벨 상태:
- valid
- void
- needs_reprint
- destroyed

void QR 스캔 시:
`사용할 수 없는 라벨입니다`

작업장:
`폐기 완료` 처리 전까지 경고 유지.

---

# 23. 상품 라인업

## 진공세트
- 실속세트 144,000원
- 봉황세트 200,000원
- 팔영세트 300,000원

## 프리미엄
- 진 320,000원
- 선 270,000원
- 미 220,000원

## O'meat
- O'meat Signature 289,000원
- O'meat Prestige 389,000원

## LA갈비
- LA갈비 1호 99,000원
  - 현재 기준 1.8kg
- LA갈비 2호 148,000원
  - 현재 기준 2.7kg

고객 화면에서는 반드시 `LA갈비 1호`, `LA갈비 2호`를 상품명으로 사용한다.
중량은 상세정보/보조설명에 표시한다.

## 뼈세트
- 사골×우족 59,000원
- 사골×잡뼈×꼬리 99,000원

## 맞춤
- 직원 문의

### 상품 데이터 원칙
- 모든 상품은 DB `products`에서 조회한다.
- 코드에 상품명/가격을 하드코딩하지 않는다.
- 위 가격은 현재 초기 seed 기준값이며 관리자에서 수정 가능해야 한다.
- 주문 생성 시 상품명/정상가/실판매단가를 snapshot으로 보존한다.

---

# 24. 기업 주문

실제 140세트 규모 지원.

필수:
- 기업별 계약단가
- 일반 판매가와 분리
- 서비스 수량 별도
- Excel 대량 업로드
- 배송지 검증
- 작업수량 집계

예:
- 유상 140
- 서비스 3
- 총작업 143

---

# 25. 서비스·증정

실제 규모:
- LA갈비 약 50~70
- 구이용 약 10

관리:
- Excel 업로드
- 사람별 수령여부
- 방문/택배/직접전달/미정
- 완료/미완료
- 작업상태
- 증정 현황판

증정 현황판:
국회 본회의장 좌석표처럼 grid.

카드:
- 이름
- 상품
- 준비상태
- 전달상태

필터:
- 전체
- 미완료
- 방문
- 택배
- 직접전달
- 상품별
- 관계별

---

# 26. 현장 즉시판매

관리자 더보기에서:
- 상품 선택
- 수량
- 결제기록
- 판매완료

고객정보 선택사항.

---

# 27. DB 핵심 테이블

- products
- product_availability
- product_bom_items
- sales_seasons
- customers
- organizations
- orders
- order_items
- recipients
- fulfillments
- fulfillment_items
- packages
- package_assignments
- package_labels
- label_actions
- payments
- shipments
- shipment_packages
- gift_batches
- bulk_import_batches
- operational_alerts
- order_events
- user_profiles

---

# 28. 주문상태

orders:
- submitted
- confirmed
- fulfilled
- cancelled

packages:
- planned
- queued
- in_progress
- completed
- available
- handed_over
- shipped
- voided

fulfillments:
- pending
- ready
- arrived
- handed_over
- shipping_ready
- shipped
- completed
- cancelled

---

# 29. 오류방지 P0

필수:
- idempotency
- transaction
- optimistic concurrency
- package active assignment unique
- fulfillment 수량 합계 검증
- 일일한도 transaction 검증
- 주문 hard delete 금지
- void 라벨 차단
- 주소 없는 배송 출고 차단
- 고객 kiosk SELECT 제한
- workshop payment 접근 제한
- server success 전 주문완료 금지
- order events audit
- 주문변경 acknowledgement

---

# 30. 통계/Excel

통계:
- 유상 판매수량
- 실매출
- 정상가 기준
- 할인액
- 서비스수량
- 총출고
- 총제작
- 취소
- 재배정
- 현장판매
- 품목별
- 일자별
- 판매경로별
- 기업별
- D-Day 시즌비교

Excel:
- 시즌요약
- 일자별판매
- 품목별판매
- 판매경로
- 일자별작업
- 서비스증정
- 취소재배정
- 결제기록
- 주문상세
- BOM 예상사용량

---

# 31. Codex 구현 순서

## Phase 0
- scaffold
- env validation
- Supabase clients
- migrations
- RLS
- seed
- auth
- CI

## Phase 1
- 고객 키오스크 UI를 본 명세대로 먼저 구현
- 상품/카테고리
- 상품 상세 모달
- 장바구니
- 방문수령
- 기본 택배발송
- 주문 제출
- admin login
- 주문 찾기/상세
- workshop 기본 queue
- realtime

## Phase 2
- 주문수정
- 라벨
- 변경 알림
- 가용품
- 다중배송
- 결제

## Phase 3
- 기업 Excel
- 서비스 Excel
- 증정 현황판
- 즉시판매

## Phase 4
- 통계/Excel
- BOM
- 음성입력
- PWA polish

---

# 32. Acceptance Criteria — 고객 키오스크

반드시:
1. 세로형 태블릿에서 좌측 카테고리 + 우측 2열 상품카드
2. 모든 카드 크기 동일
3. 상품 클릭 시 중앙 모달
4. 메인에 관리자 교체 가능한 로고 슬롯
5. 하단 CTA 고정
6. 주문하기 → 장바구니 확인 → 수령방법
7. 방문수령 / 택배발송 버튼 분리
8. 방문/택배 폼 서로 분리
9. 다음/이전 slide transition
10. 입력값 뒤로 가도 유지
11. 주문 중복 생성 없음
12. 서버 성공 전 완료화면 없음
13. 오류 발생 시 기존 입력 유지
14. 고령자 기준 큰 터치영역/큰 글씨
15. 고객화면에 관리자/결제/작업대시보드 노출 금지

---


---

# 34. GitHub / Supabase / Vercel 저장·배포 운영 명세

이 프로젝트는 단순히 로컬에서 실행되는 앱이 아니라, GitHub를 중심으로 소스와 DB 변경 이력을 관리하고, Supabase와 Vercel에 안전하게 배포하는 구조로 운영한다.

## 34.1 역할 분담

### GitHub
담당:
- 전체 소스코드 저장
- 버전관리
- 변경이력
- branch/commit 관리
- Codex가 수정한 코드 검토
- 배포의 기준 source of truth

반드시 GitHub에 포함:
- `src/`
- `public/`
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/seed.sql`
- 테스트 코드
- `package.json`
- lock file
- README
- 본 SPEC 파일

절대 GitHub에 올리지 말 것:
- `.env.local`
- Supabase service role key
- DB password
- access token
- GitHub token
- Vercel token
- 기타 secret

`.gitignore`에서 비밀정보 파일을 반드시 제외한다.

---

## 34.2 GitHub 저장소 최초 구성

프로젝트 루트에서:

```bash
git init
git add .
git commit -m "chore: initialize jeongilpum holiday ordering system"
git branch -M main
git remote add origin <GITHUB_REPOSITORY_URL>
git push -u origin main
```

기존 저장소가 이미 연결되어 있으면 `git init`/`remote add`를 중복 실행하지 않는다.

### 권장 저장소
- Private repository 권장
- `main` = 운영 배포 기준
- 개발 중 큰 변경은 feature branch 권장

예:
```bash
git checkout -b feature/kiosk-v2
```

작업 완료:
```bash
git add .
git commit -m "feat: rebuild portrait kiosk flow"
git push -u origin feature/kiosk-v2
```

검증 후 main에 merge.

### 최소 commit 원칙
서로 다른 기능을 한 commit에 과도하게 섞지 않는다.

권장 예:
- `feat: add portrait kiosk product grid`
- `feat: add pickup order flow`
- `fix: prevent duplicate kiosk submission`
- `feat: add workshop realtime alerts`
- `db: add package label lifecycle`

---

# 35. Supabase 환경 구성

## 35.1 개발 원칙

DB schema를 Supabase Dashboard에서만 수동으로 관리하지 않는다.

모든 중요한 구조 변경:
- table
- column
- index
- enum
- RLS
- function/RPC
- constraint

은 `supabase/migrations/` SQL 파일로 남긴다.

따라서 GitHub clone만으로도 DB 구조를 재현할 수 있어야 한다.

---

## 35.2 Supabase CLI 설치 및 초기화

프로젝트 dependency 방식 권장:

```bash
npm install supabase --save-dev
npx supabase init
```

로컬 Supabase 실행:

```bash
npx supabase start
```

로컬 DB를 migration 기준으로 다시 생성:

```bash
npx supabase db reset
```

주의:
`db reset`은 로컬 DB 데이터를 삭제 후 migration+seed를 재적용한다.

---

## 35.3 원격 Supabase 프로젝트 연결

로그인:

```bash
npx supabase login
```

원격 프로젝트 연결:

```bash
npx supabase link --project-ref <PROJECT_REF>
```

`PROJECT_REF`는 Supabase Dashboard project URL에서 확인.

이미 원격 Supabase에서 직접 만든 schema가 존재한다면, 먼저:

```bash
npx supabase db pull
npx supabase db reset
```

으로 원격 변경을 migration 이력에 반영한 뒤 개발을 계속한다.

---

## 35.4 Migration 생성

예:

```bash
npx supabase migration new create_orders
```

생성:
`supabase/migrations/<timestamp>_create_orders.sql`

그 안에 table / RLS / index / function SQL 작성.

로컬 검증:

```bash
npx supabase db reset
```

migration이 처음부터 끝까지 오류 없이 재생되는지 확인해야 한다.

---

## 35.5 원격 DB 배포

운영 DB에 반영하기 전:

```bash
npx supabase db push --dry-run
```

적용 예정 migration을 확인한다.

문제가 없으면:

```bash
npx supabase db push
```

운영/실데이터 DB에서는 임의의 destructive SQL을 실행하지 않는다.

### 절대 금지
운영 DB에:
```bash
npx supabase db reset --linked
```
사용 금지.

이 명령은 원격 데이터를 파괴할 수 있으므로 dev/staging에서만 사용 가능.

---

# 36. 개발/운영 Supabase 분리

최소 권장:

## 개발
- local Supabase
- 테스트 seed 데이터

## 운영
- hosted Supabase production project
- 실제 고객 데이터

가능하다면:
- staging Supabase project 추가

### 운영 DB에 금지
- 테스트 고객 seed
- 테스트 기업명단
- 가짜 주문
- 개발자 테스트용 증정명단

---

# 37. Supabase TypeScript 타입 동기화

DB migration 변경 후 TypeScript 타입을 생성한다.

예:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

또는 local 기준:
```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

이 파일도 GitHub에 commit한다.

Codex는 DB column을 임의 문자열로 추측하지 말고 생성된 타입을 우선 사용한다.

---

# 38. 환경변수 관리

로컬:
`.env.local`

예시 변수:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

원칙:
- `NEXT_PUBLIC_*`만 브라우저에서 접근 가능
- service role key는 서버 전용
- service role key를 client component에 전달 금지
- secret을 source code에 직접 작성 금지

`.env.example`에는 값 없이 변수명만 기록:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.env.example`은 GitHub commit 가능.
`.env.local`은 commit 금지.

---

# 39. Supabase Storage

사용:
- 로고
- 상품 이미지
- 기타 관리자 업로드 이미지

권장 bucket:
- `brand-assets`
- `product-images`

민감 개인정보 파일 저장용으로 public bucket을 사용하지 않는다.

로고/상품이미지는 필요시 public 또는 signed URL 정책을 명확히 설정한다.

관리자 업로드 시:
- 파일 형식 제한
- 용량 제한
- filename sanitization
- 권한 확인

---

# 40. Supabase Auth

관리자/판매장/작업장 계정은 Supabase Auth 사용.

`user_profiles`:
- auth_user_id
- name
- role
- active

역할:
- sales
- admin
- superadmin
- workshop

로그인 성공만으로 전체 데이터 접근 허용 금지.
RLS에서 role을 검증.

---

# 41. Supabase RLS 배포 검증

모든 PII 테이블은 RLS 활성화.

최소 테스트:
1. anon → customers SELECT 실패
2. anon → orders SELECT 실패
3. workshop → payments SELECT 실패
4. sales → 필요한 주문 접근 가능
5. admin → 관리자 기능 가능
6. superadmin → 전체 관리 가능

RLS 테스트가 실패하면 production 배포 금지.

---

# 42. Vercel 배포 구조

Next.js frontend/server는 Vercel에 배포.

## 최초 연결

1. GitHub에 repository push
2. Vercel 로그인
3. `Add New Project`
4. GitHub repository Import
5. Framework Preset = Next.js 자동감지
6. Root Directory = 프로젝트 루트
7. Build/Install 설정은 특별한 이유가 없으면 기본값
8. 환경변수 입력
9. Deploy

GitHub 연결 후 `main` push 시 production 자동배포 구조를 사용한다.

feature/PR branch는 Preview Deployment로 테스트 가능.

---

# 43. Vercel 환경변수

Vercel:
`Project → Settings → Environment Variables`

등록:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

scope:
- Production
- Preview
- Development

환경별로 다른 Supabase를 사용한다면 각 environment scope에 맞는 값을 넣는다.

환경변수 변경 후에는 재배포해야 적용되는 것으로 간주한다.

service role key는 민감정보로 취급.

---

# 44. 배포 전 필수 검증

main merge 전에 로컬 또는 CI에서:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

프로젝트 script 이름이 다르면 이에 맞게 조정.

다음 중 하나라도 실패하면 main merge/production 배포 금지.

- lint
- TypeScript
- unit test
- integration test
- build

---

# 45. 권장 배포 흐름

## 기능 개발
1. feature branch 생성
2. Codex 개발
3. local test
4. Supabase local migration test
5. GitHub push
6. Vercel Preview 확인
7. UI 실제 태블릿 확인
8. 테스트 통과
9. main merge

## DB 변경 포함 시
1. migration 생성
2. local `db reset`
3. test
4. GitHub commit
5. 필요시 staging `db push`
6. 앱 Preview 검증
7. production migration 적용
8. main production 배포

중대한 DB 변경은 앱과 DB의 배포 순서를 고려해 backward-compatible하게 설계한다.

---

# 46. Production Release Checklist

배포 전 체크리스트:

- [ ] GitHub main 최신
- [ ] working tree clean
- [ ] migration commit 완료
- [ ] RLS 적용 확인
- [ ] 환경변수 확인
- [ ] service role client 노출 없음
- [ ] `npm run build` 성공
- [ ] kiosk portrait 테스트
- [ ] 주문 중복 테스트
- [ ] 방문수령 정상
- [ ] 택배 정상
- [ ] 관리자 로그인 정상
- [ ] 작업장 realtime 정상
- [ ] 주문변경 알림 정상
- [ ] void label 차단 정상
- [ ] Excel import preview 정상
- [ ] 개인정보 접근권한 테스트 정상
- [ ] Vercel Preview 정상
- [ ] Supabase backup/복구 계획 확인
- [ ] production 배포 후 smoke test

---

# 47. Production 배포 직후 Smoke Test

실제 운영 URL에서 즉시 확인:

1. `/kiosk` 접속
2. 상품 로딩
3. 상품 상세 modal
4. 장바구니
5. 방문수령 테스트 주문
6. `/admin` 로그인
7. 해당 주문 검색
8. 주문 confirm
9. `/workshop` 실시간 표시
10. 작업완료
11. 고객도착/인계
12. 테스트 주문 cancelled 처리

실제 운영 데이터와 테스트가 섞이지 않도록 test 표시/정리 규칙을 둔다.

---

# 48. Backup / 복구 원칙

GitHub:
- 코드 및 migration의 복구 source of truth.

Supabase:
- 운영 DB는 plan에서 제공되는 backup 기능을 확인하고 사용.
- 중요한 release 전 schema/migration 상태를 기록.
- destructive migration 전 별도 검증.

Excel:
- 시즌 종료 후 통계 Excel 및 상세 raw data를 별도 보관.
- 단, 개인정보 포함 파일은 접근통제된 저장소에 보관.

---

# 49. README 필수 내용

Codex는 README에 아래를 반드시 작성한다.

1. 프로젝트 목적
2. 기술스택
3. 설치
4. `.env.local` 구성
5. 로컬 Next.js 실행
6. Supabase local 실행
7. migration 생성/적용
8. TypeScript DB 타입 생성
9. GitHub 저장 흐름
10. Vercel 배포
11. production migration 적용
12. 테스트
13. 사용자 role
14. troubleshooting
15. 절대 실행하면 안 되는 production destructive 명령

---

# 50. Codex 배포 관련 작업 지시

Codex는 구현 완료 시 코드만 수정하고 끝내지 말고 반드시 다음을 보고한다.

- 현재 Git branch
- 마지막 commit hash
- 변경 파일 목록
- migration 목록
- 로컬 test 결과
- build 결과
- 필요한 environment variables
- Supabase remote에 적용해야 할 migration
- Vercel에서 설정해야 할 항목
- production 배포 가능 여부
- 배포 전 blocker

Codex는 사용자 확인 없이 destructive remote DB 작업을 실행하지 않는다.

---

# 33. Codex에게 바로 입력할 실행 프롬프트

이 파일을 프로젝트 최상위 요구사항으로 사용하라.

기존 v1 UI 구현은 이 v2 명세와 충돌하면 v2를 우선한다.

먼저 고객 키오스크 UI를 본 명세 그대로 다시 구현하라.

특히:
- portrait-first
- 좌측 카테고리
- 우측 2열 동일크기 상품카드
- 상품상세 중앙 모달
- 로고 업로드 가능
- 하단 주문 CTA
- 장바구니 확인
- 방문수령/택배발송 선택
- 방문/택배 각각 별도 step flow
- Framer Motion 전환
- 다음=오른쪽→왼쪽
- 이전=왼쪽→오른쪽
- 입력값 유지
- 중복주문 방지
- server success 전 완료화면 금지

판매장 UI는 통계 대시보드 형태로 만들지 말고,
4개 큰 업무 버튼 중심으로 재구성하라.

작업장 UI도 통계 대시보드가 아니라 작업 카드/긴급알림 중심으로 구현하라.

Phase 1까지만 우선 수정/구현하고,
완료 후 아래를 보고하라:
- 변경한 화면
- 생성/수정 파일
- DB migration
- 테스트 결과
- 남은 문제
- v2와 충돌하는 기존 코드
- 다음 Phase 진행 전 확인사항

비즈니스 규칙을 임의로 바꾸지 말라.
