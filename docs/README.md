# 정일품 운영 웹앱 문서

이 폴더는 현재 작업 트리의 코드 기준 as-built 문서입니다. 마지막 코드 대조일은 2026-09-02입니다.

## 문서 읽는 순서

1. [제품 개요](PRODUCT_OVERVIEW.md)
2. [페이지와 기능](PAGES_AND_FEATURES.md)
3. [시스템 아키텍처](ARCHITECTURE.md)
4. [데이터와 migration](DATA_AND_MIGRATIONS.md)
5. [API와 외부 연동](API_AND_INTEGRATIONS.md)
6. [보안과 신뢰성](SECURITY_AND_RELIABILITY.md)
7. [개발과 테스트](DEVELOPMENT_AND_TESTING.md)
8. [배포 runbook](DEPLOYMENT_RUNBOOK.md)
9. [기술 결정 기록](DECISIONS.md)
10. [동시작업 관리](WORK_MANAGEMENT.md)

저장소 전체 작업 규칙은 루트의 [AGENTS.md](../AGENTS.md)를 먼저 확인합니다.

## 현재 구현 기준

- 운영 데이터는 Cloudflare D1 `DB`입니다.
- 업무의 중심은 `work_items`와 `work_item_events`입니다.
- 주문은 `orders`, 작업 행은 `work_items`에 보관합니다.
- 작업장 부가 기능은 `production_batches`, `skin_packs`, `skin_pack_labels`, `packages`, `package_skin_packs`, `traceability_records`를 사용합니다.
- 판매기간과 고객 장부 전용 테이블은 현재 schema에 없습니다.
- 운영 인증은 `OPERATOR_PASSCODE`에서 발급한 HttpOnly 세션 쿠키입니다.

Production version, 배포 commit, Production D1의 적용 migration은 이 문서 대조 범위에서 확인하지 않았습니다. 배포 또는 migration 작업에서는 외부 상태를 별도로 조회해야 합니다.

## 문서 유형

- 이 폴더 루트의 문서: 현재 코드와 운영 규칙
- `docs/specs/`: 과거 요구사항·구현 배경 기록
- `docs/work/active/`: 진행 중 작업 claim
- `docs/work/completed/`: 완료된 작업 이력

`docs/specs/`와 `docs/work/completed/`의 과거 서술은 현재 기능 설명이 아닙니다. 현재 구조는 이 폴더 루트의 as-built 문서와 소스 코드로 판단합니다.

## 유지 원칙

- 코드 변경은 관련 as-built 문서를 같은 작업에서 갱신합니다.
- 외부 Production 상태는 코드만으로 단정하지 않습니다.
- 계획, 과거 요구사항, 현재 구현을 같은 문장으로 섞지 않습니다.
- 운영 암호, token, API key, 고객 개인정보를 문서에 기록하지 않습니다.
