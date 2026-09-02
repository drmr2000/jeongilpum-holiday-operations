# Production 배포 runbook

## 배포 경계

- Production deploy와 D1 migration은 시스템 소유자의 명시적 요청이 있을 때만 수행합니다.
- 이 문서는 현재 작업 트리의 코드와 migration을 기준으로 작성했습니다.
- 실제 Production version, commit, D1 migration 상태는 배포 전에 외부 시스템에서 다시 확인합니다.

## 앱 변경만 있는 경우

1. 배포 대상 branch와 commit을 확인합니다.
2. schema와 `drizzle/` 변경이 없음을 확인합니다.
3. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`를 실행합니다.
4. 배포 시스템에서 해당 commit의 saved version을 생성합니다.
5. 승인된 version을 Production에 배포합니다.
6. 공개 키오스크와 운영 세션, 판매장, 작업장, 설정 화면을 점검합니다.
7. 실제 Production version과 commit을 기록합니다.

## schema 변경이 있는 경우

1. Production D1의 migration 이력과 핵심 table 존재 여부를 읽기 전용으로 확인합니다.
2. 새 migration 번호와 이미 적용된 migration을 확인합니다.
3. timestamp가 포함된 backup을 생성하고 row count를 기록합니다.
4. 새 migration SQL과 로컬 전체 migration 검사를 재확인합니다.
5. migration을 한 번만 적용합니다.
6. 새 table, index, row count, 외래 키 보존을 확인합니다.
7. 성공한 경우에만 schema 의존 앱 version을 배포합니다.

## `0007_work-items-core.sql` 특별 규칙

`0007_work-items-core.sql`은 이전 주문·수령·결제·고객 장부·판매기간·생산 테이블을 삭제한 뒤 현재 `work_items` 모델을 생성합니다. 과거 행을 이관하는 SQL이 없습니다.

따라서 기존 운영 데이터를 가진 D1에 `0007`을 적용하는 작업은 일반 migration으로 취급하지 않습니다. 전체 backup 복원 절차, 데이터 손실 승인, 재구축 계획이 없는 상태에서는 배포하지 않습니다.

## 배포 후 점검

### Kiosk

- 활성 상품과 일일 한정수량 표시
- 방문예약, 택배예약, 현장판매 주문 접수
- 주문 성공 후 작업 항목 생성

### Sales

- 상태별 현황과 수령방법별 소계
- 작업 행 수정, 도착·주문 확인 전환
- 고객별 잔액과 주문 단위 결제 수정
- 다중 선택 상태·수령일시·결제·복제·삭제

### Workshop

- 당일 현장과 택배의 분리 조회
- 작업 상태 변경
- 상품별 수량 집계
- production batch, Skin Pack, package가 배포 범위에 포함된 경우 관련 route와 CSV

## 배포 보고

- 배포 대상 commit과 version
- 실행한 lint, typecheck, test, build 결과
- migration 여부와 backup 위치
- migration 전후 row count
- 공개 주문과 운영 세션 점검 결과
- 확인하지 못한 항목과 사유

실제 고객정보, 운영 암호, token, API key는 배포 보고에 기록하지 않습니다.
