# 정일품 상시 주문·작업 운영 시스템

고객 주문, 판매장 처리, 작업장 준비, 생산·패키지 부가 기능을 Cloudflare D1에서 관리하는 웹앱입니다. 주문의 운영 단위는 `work_items`이며, 고객·상품·수령일시·수령방법·수령자 정보를 한 행으로 관리합니다.

## 기술 구성

- Vinext, Vite, React, TypeScript
- Cloudflare Workers와 D1
- Drizzle ORM 및 SQL migration
- npm과 `package-lock.json`

Supabase, Postgres, `pnpm-lock.yaml`은 현재 시스템에 사용하지 않습니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run db:local
npm run dev
```

개발 서버는 `http://localhost:3001`에서 실행됩니다.

`npm run db:local`은 `scripts/wrangler.jsonc` 설정으로 `drizzle/*.sql`을 로컬 D1에 적용합니다.

## 운영 암호

작업 트리 루트의 gitignored `.dev.vars`에 `OPERATOR_PASSCODE`를 설정합니다. 실제 암호값은 문서, 로그, 커밋에 기록하지 않습니다.

`POST /api/operator-session`은 전달된 암호를 검증한 뒤 HttpOnly 쿠키를 발급합니다. `/sales`, `/workshop`, `/settings`의 운영 변경 API는 이 쿠키를 확인합니다. 키오스크의 `POST /api/orders`는 공개 주문 접수 API입니다.

## 화면

- `/kiosk`, `/kiosk/custom`: 고정된 고객 주문 흐름입니다. 변경하지 않습니다.
- `/sales`: 수령일시와 상품 단위의 작업 테이블, 고객별 미수 현황, 작업·결제 일괄 처리입니다.
- `/workshop`: 현장예약·택배·상품별 작업과 생산·패키지 부가 기능입니다.
- `/settings`: 상품 편집 전용 화면입니다. `daily_limit`도 이 화면에서만 수정합니다.

예약 달력의 조회 범위는 오늘부터 365일입니다. 코드 상수로만 존재하며 설정 화면에서 변경하지 않습니다.

## 검사

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

schema 변경이 있는 경우에만 다음 명령을 추가합니다.

```bash
npm run db:generate
```

## 로컬 D1 조회

수동 조회에는 지속 경로를 명시해야 합니다. 생략하면 Wrangler가 설정 파일 기준의 다른 경로를 읽어 빈 데이터베이스를 조회할 수 있습니다.

```bash
npx wrangler d1 execute DB --local -c scripts/wrangler.jsonc --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

## 문서

현재 구현의 상세 내용은 [문서 지도](docs/README.md)를 확인합니다. `docs/specs/`는 과거 요구사항 기록이며 현재 구현의 근거가 아닙니다.
