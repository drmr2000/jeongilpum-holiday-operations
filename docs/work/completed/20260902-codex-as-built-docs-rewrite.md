# Task: 현재 구현 기준 문서 재작성

- Status: Completed (orchestrator handoff)
- Owner: Codex
- Branch: `codex/docs`
- Base commit: `d54a2c1`
- Started at: 2026-09-02
- Target environment: Local documentation

## Goal

현재 작업 트리의 코드, migration, API route, 화면 구현을 기준으로 루트 문서와 `docs/`의 as-built 문서를 재작성한다. 과거 고객 장부, `fulfillments`, 판매기간, ChatGPT allowlist 인증, 이전 Production snapshot을 제거한다.

## Claimed paths

- `README.md`
- `AGENTS.md`
- `docs/`

## Shared contracts

- `db/schema.ts`
- `drizzle/0007_work-items-core.sql`
- `app/lib/operator-session.ts`
- `app/api/**`

## Validation

- [x] Document links
- [x] `git diff --check`

## Completion

- Final implementation commit: Deferred to orchestrator by explicit task constraint
- Completed at: 2026-09-02
- Remaining TODO: Orchestrator must commit the uncommitted documentation changes. Code tests were not run because this task changed documentation only and the test suite is being rewritten in parallel.
