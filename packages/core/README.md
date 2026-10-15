# @sil/core

모든 패키지가 함께 쓰는 것을 모은 곳이에요. **담당: 정민님** (다른 패키지에서 필요한 게 생기면 PR로 요청해요)

## 무엇이 있나요

| 위치                      | 내용                                                                                            | 가져오는 법                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `src/types/`              | 표 타입: 기준, 기준 버전, 충돌, 이슈, 확인할 변경, 답, 응답 기록 + 위키 불러오기 결과           | `import type { Standard } from '@sil/core'` |
| `src/rules.ts`            | 팀 위키 형식 규칙: 기준 ID 모양, 문장 경고(`check_wiki.py`와 같음), 확인할 변경 상태, 출처 이름 | `@sil/core`                                 |
| `src/changelog.ts`        | CHANGELOG 한 줄 만들기 (`data.changelog.format`)                                                | `@sil/core`                                 |
| `src/errors.ts`           | 팀 공통 에러 (`SilError`, `DbNotConfiguredError`, `NotImplementedError`)                        | `@sil/core`                                 |
| `src/fixtures/`           | 쿠폰 예시 데이터 (10/13 통합 확인 시나리오), 나에게 온 변경 예시(`inbox.ts`, 웹 앱 예시 데이터) | `@sil/core`                                 |
| `src/node/env.ts`         | `.env` 읽기와 검사                                                                              | `@sil/core/node`                            |
| `src/node/logger.ts`      | 로그 (항상 stderr)                                                                              | `@sil/core/node`                            |
| `src/data/client.ts`      | Supabase 연결 (공용 키), DB 에러 → 우리 에러. 브라우저와 Node 모두 (D50)                        | `@sil/core/data`, `@sil/core/node`          |
| `src/node/db.ts`          | Node에서 `.env`로 연결하고 DB 실패를 로그로 남겨요                                              | `@sil/core/node`                            |
| `src/data/standards.ts`   | 위키 읽기(목록, 기준 하나와 버전 기록)·쓰기(저장, 되돌리기, 폐기), 이슈 저장, 충돌 보류         | `@sil/core/data`, `@sil/core/node`          |
| `src/data/notify.ts`      | 이슈 목록, 확인할 변경 목록, 답 저장·취소, 응답 기록, "관계있다" 답                             | `@sil/core/data`, `@sil/core/node`          |
| `src/node/changelog.ts`   | DB 기록으로 CHANGELOG 줄 만들기 (`sil changelog`)                                               | `@sil/core/node`                            |
| `src/node/backup.ts`      | 표 전체 읽기 (`sil backup`, 매일 백업)                                                          | `@sil/core/node`                            |
| `src/node/scope-check.ts` | 위키 적용 범위의 코드 경로가 실제 파일과 맞는지 (`sil scope-check`)                             | `@sil/core/node`                            |
| `src/node/wiki-import.ts` | team-wiki/ 마크다운과 이슈 CSV 읽기, DB와 비교 (`sil import`가 써요)                            | `@sil/core/node`                            |
| `src/node/wiki-search.ts` | 목차 만들기, 키워드·영역·코드 경로로 찾기 (DB를 부르지 않는 순수 함수)                          | `@sil/core/node`                            |
| `src/node/fake-db.ts`     | **테스트 전용** 가짜 Supabase 클라이언트                                                        | `@sil/core/testing`                         |
| `src/node/run-command.ts` | 다른 프로그램 실행 (Windows `.cmd` 처리 포함)                                                   | `@sil/core/node`                            |

## 왜 입구가 셋인가요 (`@sil/core`, `@sil/core/data`, `@sil/core/node`)

- **`@sil/core`**: 어디서나 돌아가는 것(타입, 에러, 규칙, 예시 데이터)이에요.
- **`@sil/core/data`**: DB 연결과 읽기·쓰기예요. 브라우저(웹 앱)에서도 돌아요. 웹 앱은 `connectDb(주소, 공용 키)`로 연결한 뒤 써요 (D50).
- **`@sil/core/node`**: Node에서만 돌아가는 것(파일, `.env`, 로그)이에요. DB 함수도 다시 내보내고, 처음 쓸 때 `.env`로 알아서 연결해요. MCP 서버와 명령어는 여기서 가져와요.

웹 앱 화면에서 `@sil/core/node`를 가져오면 브라우저에서 깨져서, 린트가 막아요.

## 왜 빌드 없이 TypeScript 그대로 쓰나요

`package.json`의 `exports`가 `.ts` 파일을 바로 가리켜요. MCP 서버와 명령어는 Node 24.18이, 앱은 Vite가 그대로 읽어요 (D48).
그래서 core를 고치면 **빌드 없이 바로** 모든 패키지에 반영돼요. "고쳤는데 옛날 결과가 나옴"이 없어요.

## 타입은 "데이터 항목 목록 v2"를 따라요

칸 하나하나의 뜻, 비어 있을 수 있는지, DB 칸 이름은 [docs/타입명세서.md](../../docs/타입명세서.md)에 정리돼 있어요.

표 모양은 착수 안내(10/9)의 "데이터 항목 목록 v2"가 약속이에요 (SIL-65). 바뀌면 이 폴더만 고치고, 타입 검사(`pnpm typecheck`)가 고쳐야 할 곳을 모두 알려 줘요.

- 필수 칸은 ID, 제목, 값, 이유, 항상 적용 5개예요. 근거·적용 범위·잠금·상태는 예전 위키 값을 저장만 해요.
- 사람은 이름으로만 구분해요 (`PersonRef` = 이름). `person.ts`의 사람 표는 v2에서 쓰지 않아요.
- 답 타입 이름이 `Response`가 아니라 `Answer`인 이유: fetch의 `Response`와 이름이 겹쳐서요.

## 데이터베이스 (Supabase, SIL-14)

- **연결**: `getDb()`가 `.env`의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`로 supabase-js 클라이언트를 한 번 만들어 재사용해요. 값이 없으면 `DbNotConfiguredError`를 던지고, MCP 도구는 그 문구를 AI에게 그대로 전해요.
- **공용 키로 연결하는 이유**: 이 키로는 읽기와 저장 함수 호출만 돼요. 표에 직접 쓰거나 지우는 건 데이터베이스가 막아요 (SIL-18). 그래서 서버, 앱, GitHub Actions 어디서 써도 같은 규칙이 지켜져요.
- **쓰기는 데이터베이스 함수로만**: `saveStandard`, `revertStandard`, `deprecateStandard`, `saveIssue`, `resolveConflict`, `saveAnswer`, `saveReflected`는 `save_standard`, `save_answer`, `save_reflected` 등 SQL 함수를 불러요. 형식 검사, 잠금, 버전 충돌(`baseVersion`), 되돌림 표시가 함수 안에 있어요. 거절하면 hint에 우리 에러 코드를 담아 보내고, `toSilError`가 같은 코드의 `SilError`로 바꿔요.
- **DB가 돌려준 모양은 zod로 한 번 더 확인해요.** 스키마와 코드가 어긋나면 엉뚱한 값 대신 "마이그레이션을 확인해 주세요"라고 알려요.
- 스키마는 저장소 맨 위 `supabase/migrations/`, 규칙 검사는 `supabase/tests/`의 `wiki.test.sql`, `v2.test.sql`(SIL-65 조건, 데모 순서), `compat.test.sql`(팀 위키 기준), `always_on_per_version.test.sql`(항상 적용 버전마다)에 있어요. 루트 README의 "데이터베이스" 절을 봐 주세요.
- **실시간 구독**: `watchPendingChecks({ recipient, onChange, onError })`는 그 사람의 확인할 변경이 생기거나 바뀌면 알려 줘요 (Realtime, app.notify.realtime). 웹 앱이 OS 알림(A1)에 써요. 끊기면 `onError`로 알리고, 다시 연결되면 `onChange`를 불러서 새로 고치지 않아도 목록이 이어져요. 돌려준 함수로 끊어요.
- **불러오지 못하면 빈 목록 대신 에러를 던져요.** 화면이 실패를 "변경 없음"으로 보여 주면 안 돼요 (`notify.error.not-empty`).

### 함수 추가하기

1. 표가 새로 필요하면 `supabase/migrations/`에 **새 파일**로 추가해요 (이미 올린 파일은 고치지 않아요).
2. 이 폴더에 `<표 이름>.ts`를 만들고 읽기·쓰기 함수를 둬요. 행 모양은 zod 스키마로 확인하고, 결과는 `src/types/`의 타입으로 바꿔요.
3. `node/index.ts`에서 내보내고, `fake-db.ts`로 테스트를 붙여요.
