# 개발과 테스트

## 로컬 요구사항

- Node.js 22.13 이상
- npm
- Vinext/Vite와 Cloudflare local runtime
- 저장소 루트의 `.wrangler/state`
- 운영 화면을 확인할 때는 gitignored `.dev.vars`의 `OPERATOR_PASSCODE`

## 기본 명령

```bash
npm install
npm run db:local
npm run dev
```

개발 서버 주소는 `http://localhost:3001`입니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

schema 변경에만 아래 명령을 추가합니다.

```bash
npm run db:generate
```

## 디렉터리 역할

| 경로 | 역할 |
|---|---|
| `app/**/page.tsx` | route와 page 단위 접근 제어 |
| `app/components/` | client UI와 화면 상태 |
| `app/api/` | HTTP, 검증, 인증, D1 변경 |
| `app/lib/` | 도메인 함수와 공통 client |
| `db/` | D1 연결과 Drizzle schema |
| `drizzle/` | migration과 snapshot |
| `tests/` | 현재 동작을 고정하는 자동 검사 |
| `scripts/` | 로컬 D1 초기화와 Wrangler 설정 |
| `docs/` | as-built 문서와 작업 claim |

## 테스트 정책

- `tests/` 아래의 모든 테스트 파일은 검사 대상입니다.
- 키오스크 고정성 검사는 기계적 검사이므로 생략하거나 선택 실행으로 제외하지 않습니다.
- 개별 파일 목록은 문서에 고정하지 않습니다. 테스트 재작성 또는 파일 이동 시에도 전체 검사 대상 원칙을 유지합니다.
- 사용자 흐름, D1 제약, idempotency, version 충돌, 작업 삭제 뒤 이력 보존을 함께 검사합니다.
- UI·API·schema 변경은 관련 자동 검사와 전체 검사를 함께 실행합니다.
- 실행하지 못한 검사는 통과로 기록하지 않고 사유를 보고합니다.

## 변경 유형별 검사

### 문서 변경

- 문서 내부 상대 링크 확인
- `git diff --check`

### UI 또는 API 변경

- `npm run lint`
- `npm run typecheck`
- 관련 test
- `npm test`

### schema 변경

- `npm run db:generate`
- 새 D1 상태에서 migration journal 전체 적용
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

`0007_work-items-core.sql`은 과거 테이블을 제거하므로 기존 운영 데이터를 사용하는 migration 검증에는 backup과 데이터 보존 계획이 별도로 필요합니다.

## 로컬 D1 주의사항

```bash
npx wrangler d1 execute DB --local -c scripts/wrangler.jsonc --persist-to .wrangler/state --command "SELECT COUNT(*) AS product_count FROM products"
```

`--persist-to .wrangler/state`를 생략하면 Wrangler가 config 파일 기준 경로를 사용하여 빈 데이터베이스를 조회할 수 있습니다.
