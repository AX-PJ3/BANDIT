@team-wiki/INDEX.md
@team-wiki/일하는-방식.md

# HARIBO 팀 공통 지침

> 사람과 AI 모두 이 문서를 기준으로 작업합니다.
> 브랜치·리뷰처럼 팀 위키와 겹치는 규칙은 팀 위키가 원본입니다.

## 팀 위키 규칙

- 팀 위키 위치: team-wiki
- 작업을 시작하기 전에 팀 위키의 INDEX.md를 읽는다. "항상 적용되는 기준"은 모든 작업에서 지킨다.
- 이번 작업과 관련된 영역 파일만 열어 본다. 위키 전체를 읽지 않는다.
- 팀 위키에 있는 기준과 다르게 만들게 되면, 만들기 전에 사용자에게 "팀 기준을 바꾸는 건지" 먼저 묻는다 (T1, SIL-66). auto mode에서도 같다.
  문구는 `apps/detect/src/t1/copy.ts`의 `T1_COPY`를 글자 그대로 쓴다(바꿔 말하지 않는다). 선택지는 거기 있는 것만 쓰고 새로 만들지 않는다.
  1. haribo `get_standard`로 지금 영역·제목·값·`alwaysOn`·`currentVersion`과 적용 범위(`versions[0].scope`)를 읽는다.
  2. `ask`를 AskUserQuestion으로 묻는다 (예/아니오).
  3. 아니오면 저장하지 않고 `notChanged`를 보여 준 뒤 작업을 멈추고 기다린다. 지금 값대로도 코드를 쓰지 않는다. 사람이 "40자로 작업해 줘"처럼 어떻게 할지 다시 말할 때만 그대로 진행한다.
  4. 예면 이유를 정한다. 사람이 대화에서 한 말로 이유를 알 수 있으면 그 말을 한 문장으로 정리한다. 알 수 없으면 `reasonPrompt`를 글로 묻고(AskUserQuestion이 아님) 답을 한 문장으로 정리한다. 근거 없이 지어내지 않는다.
  5. ③ 등록될 모습: 등록할 값(`id`·`title`·`value`·`reason`·`alwaysOn`)을 JSON으로 `node apps/detect/src/t1/preview.ts <<'EOF' … EOF`에 넘겨 실행한다(화면은 hook이 띄운다). 그다음 `preview.confirm`을 AskUserQuestion으로 묻는다(header는 `preview.header`, 선택지는 `register`·`edit`·`cancel`의 label·description 그대로, 질문과 설명에 ③ 내용을 다시 적지 않는다. `registerWithIssues`는 아직 쓰지 않는다). 수정하기면 `editPrompt`를 글로 묻고 고친 뒤 5를 다시 한다. 취소하기면 저장하지 않고 `cancelled`를 보여 준 뒤 하던 작업을 멈추고 사람의 말을 기다린다. `cancelled`는 다른 작업 중에 T1이 떴으면 `withTask`, 결정 사항을 바꿔 달라는 것 자체가 요청이었으면 `noTask`를 쓴다.
  6. 등록하기면 haribo `save_standard`로 저장하고 `saved`를 보여 준 뒤 바꾼 값으로 하던 작업을 이어간다. `baseVersion`은 1에서 읽은 `currentVersion`, `alwaysOn`과 `scope`는 지금 값 그대로(scope를 비우면 적용 범위가 지워진다. 지금 값이 null이면 칸을 뺀다), `source`는 `ai_chat` (`apps/detect/src/t1/save-input.ts`와 같은 값). 저장 결과의 `changelogLine`을 team-wiki/CHANGELOG.md 맨 아래에 그대로 붙인다(work.wiki.changelog). 위키 파일의 값·버전은 고치지 않는다 (위키 문서 버전과 DB 버전은 별개).
  7. T1 선택 창을 Esc로 닫으면 취소하기와 같다. 다음 말이 오면 먼저 `cancelled`(5와 같은 기준으로 `withTask`·`noTask`)를 보여 주고 저장하지 않는다. "계속해 줘"처럼 어떻게 할지 분명하지 않으면 작업하지 않고 기다린다. 결정 사항을 바꾸라는 말이면 T1을 1부터 다시 한다.
  - 어느 경우든 6에서 저장하지 않았으면 결정 사항과 다른 값으로 코드를 쓰지 않는다.
- (T1로 저장한 경우는 위 6을 따르고 이 줄은 하지 않는다) 기준을 바꾸기로 하면: 해당 기준의 값·이유·근거를 고치고 버전을 1 올린 뒤, CHANGELOG.md 맨 아래에 한 줄을 남긴다.
  형식: 날짜 시각 | 누가 | 기준 ID 이전→새 버전 | 이전 값 → 새 값 | 이유 | 출처(코드/AI 대화/Figma/회의/Slack)
- 관련 기준이 없어서 새로 정했다면 기준-작성-원칙.md대로 새 기준을 추가하고 CHANGELOG에 남긴다.
- `잠금: 예`인 기준은 고치지 않고 사용자에게 알린다.
- 기준은 지우지 않는다. 쓰지 않게 되면 상태를 폐기로 바꾸고 대체 ID를 적는다.
- 위키를 고친 뒤 `python3 team-wiki/scripts/check_wiki.py team-wiki`를 실행해 오류가 없는지 확인한다.

## 네이밍 규칙

- **변수 및 함수**: `camelCase`를 사용합니다.
  - boolean 변수는 `is`, `has`, `should` 등의 접두사를 사용합니다. (예: `isLoading`, `hasError`)
  - 함수 이름은 동사로 시작합니다. (예: `fetchData`, `updateUser`)
  - 쓰지 않는 변수는 지운다. `_` 접두사는 함수 모양 때문에 받아야 하지만 쓰지 않는 인자와 catch의 에러 변수에만 쓴다.
- **타입 및 클래스**: `PascalCase`를 사용합니다. (예: `UserProfile`, `OrderService`)
- **상수**: `UPPER_SNAKE_CASE`를 사용합니다. (예: `MAX_ITEMS_COUNT`)

## 포매팅 및 린트

- **Prettier**: 코드 포매팅은 Prettier에 맡기고, 저장할 때 자동으로 포맷되도록 에디터를 설정합니다.
  - 옵션은 루트의 `.prettierrc.json`이 원본입니다. 포맷하지 않을 경로는 `.prettierignore`에 있습니다.
- **ESLint**: 사용하지 않는 변수는 Error로 처리합니다.
- 린트 규칙을 끄는 주석(`eslint-disable`)을 쓸 때는 같은 줄에 이유를 적습니다.
- 커밋하기 전에 린트와 포맷 검사를 통과해야 합니다.

## 패키지 규칙

- 모든 패키지의 `package.json`에 `"type": "module"`을 넣습니다.
- 상대 경로 import에는 `.ts` 확장자를 붙입니다. (예: `import { foo } from './foo.ts'`, 화면 컴포넌트는 `.tsx`)
  - 빌드하지 않고 Node 24.18이 `.ts` 파일을 바로 실행합니다. 그래서 `dist/`를 만들지 않고, 패키지의 `exports`는 `src/*.ts`를 가리킵니다.
  - Node가 지울 수 없는 문법(`enum`, `namespace`, 생성자 매개변수 속성)은 쓰지 않습니다. `tsconfig.base.json`의 `erasableSyntaxOnly`가 막습니다.
  - `.js`로 쓰면 타입 검사와 테스트는 통과해도 Node로 실행할 때 파일을 찾지 못합니다.
- 타입만 가져올 때는 `import type`을 씁니다.
- 각 패키지의 `tsconfig.json`은 루트의 `tsconfig.base.json`을 `extends` 합니다.

## 저장소 구조

- `apps/`는 직접 실행하는 프로그램, `packages/`는 가져다 쓰는 코드다 (D49). 패키지 이름은 `@sil/*` 그대로다.
- `packages/notify` 알리기(`@sil/notify`, 민수님 SIL-67). 확인할 변경 만들기(`createPendingChecks`), 목록(`listPending`), 답(`respond`), 임시 저장소. 테스트는 `node:test`. 타입은 자기 `types.ts`에 있어요(core와 합치기는 민수님과 정함)
- `packages/core` 공통 타입·에러·위키 규칙(`rules.ts`)·예시 데이터(`@sil/core`), 브라우저·Node 공통 DB 연결과 읽기쓰기(`@sil/core/data`), Node 전용 env·로그와 .env 연결(`@sil/core/node`, data 함수도 다시 내보냄), 테스트용 가짜 DB(`@sil/core/testing`)
- `apps/mcp-server` 팀이 함께 쓰는 MCP 서버 (Streamable HTTP, `src/http.ts`). Claude Code 등록 이름은 `haribo`(`src/server-info.ts`, D55. 환경 변수 `SIL_MCP_*`·헤더 `X-Sil-User`·명령어 `sil`은 그대로). 도구는 `src/tools/<묶음>/`에 파일 하나씩, 같은 폴더 `index.ts`의 `tools` 배열에 등록
- `supabase/migrations` DB 표·함수·권한, `supabase/tests` DB 규칙 검사 (SQL)
- `apps/cli` `sil` 명령어. `src/commands/`에 파일 하나씩, `index.ts` 배열에 등록
- `apps/web` 웹 앱(PWA, Vite, D50). 화면은 `src/screens/`, 화면↔데이터 약속은 `src/api/types.ts`, 설치 정보와 서비스 워커는 `public/`
- `apps/detect` 바뀐 기준 찾기 (`@sil/detect`, 경하님 SIL-66). 에이전트 경로 T1 문구와 저장 값은 `src/t1/`. PR 경로는 아직 없음

## 코드 규칙

- 타입은 `packages/core/src/types/`에만 정의한다. 다른 패키지에서 같은 모양을 다시 만들지 않는다. 타입 설명과 이름 연결표(착수 안내 ↔ 코드 ↔ DB)는 `docs/타입명세서.md`에 있고, 타입을 바꾸면 이 문서도 고친다 (`spec-doc.test.ts`가 확인).
- DB는 Supabase다. DB를 직접 부르지 않고 core의 DB 함수(`data/standards.ts` 등)만 쓴다. Node는 `@sil/core/node`, 웹 앱은 `@sil/core/data`에서 같은 함수를 가져온다. 주소·키가 없으면 `getDb()`는 `DbNotConfiguredError`를 던진다.
- DB 쓰기는 데이터베이스 함수(`save_standard`, `revert_standard`, `deprecate_standard`, `save_issue`, `hold_conflict`, `resolve_conflict`, `save_answer`, `save_reflected`)로만 한다. 확인할 변경은 기준을 저장할 때 `on_standard_version_saved`가 만든다. 규칙은 `@sil/notify`의 `createPendingChecks`와 같게 두고, 한쪽을 고치면 다른 쪽과 `supabase/tests/notify_rules.test.sql`도 고친다 (D53). 표에 직접 insert/update/delete 하지 않는다 (공용 키는 막혀 있다).
- 화면·도구·안내 문구에서는 위키의 항목을 "결정 사항"이라고 쓰고 "기준"이라고 쓰지 않는다(copy.term.standard v2, D57). 코드 이름(`standard`)과 위키 파일 이름·응답 기록 열 이름은 그대로다.
- 표·칸 이름은 `용어.md`의 코드 이름을 따른다(`pending_checks`, `affected`, `known`). 위키 기준을 코드로 옮긴 곳에는 기준 ID를 주석에 남긴다.
- 위키 MCP 도구는 다섯 개다(`wiki.mcp.five-tools`). 새 위키 도구를 더하지 않는다. 폐기는 사람이 `sil deprecate`로 한다.
- 표 칸은 착수 안내 "데이터 항목 목록 v2"를 따른다. 기준 저장 필수 칸은 ID, 제목, 값, 이유, 항상 적용 5개다 (SIL-65).
- 사람은 이름으로만 구분한다. `X-Sil-User` 헤더는 이름을 퍼센트 인코딩해서 보낸다.
- 표를 바꿀 때는 이미 올린 마이그레이션을 고치지 않고 `supabase/migrations/`에 새 파일을 더하고, `supabase/tests/`에 검사를 붙인다.
- Docker를 쓰지 않는다. 로컬 Supabase(`supabase start`) 대신 SQL 검사는 `supabase/tests/*.sql`을 psql이나 SQL Editor로 돌린다 (전부 ROLLBACK).
- 기준은 지울 수 없으므로, 팀 DB에 테스트 데이터를 저장(커밋)하지 않는다.
- `apps/mcp-server/src`에서는 `console.log`를 쓰지 않는다. 로그는 `createLogger`.
- MCP 토큰, Supabase 키를 코드·로그·문서에 남기지 않는다.
- 웹 앱(`apps/web`) 코드에서는 `@sil/core/node`를 가져오지 않고 `@sil/core/data`를 쓴다 (린트가 막는다). 화면에 넣는 환경 변수는 Supabase 주소와 공용 키 두 개뿐이다.
- 서비스 워커(`apps/web/public/sw.js`)는 DB 응답을 저장하지 않는다 (notify.error.not-empty). 저장 목록과 저장 이름은 `pnpm app:build`가 채우므로 `const BUILD = 'dev';`와 `const PRECACHE = [];` 두 줄은 그대로 둔다 (D52).
- 웹 앱은 상대 경로(`base: './'`)로 빌드한다. 화면 이동은 주소 경로가 아니라 상태와 `?check=` 같은 쿼리로 한다 (어느 경로에 올려도 열리게, D52).
- Node는 24.18로 맞춘다(`.nvmrc`, `sil doctor`가 확인). `@types/node`도 실제 Node보다 높지 않게 24.13대로 둔다.
- 새 도구·명령은 각 폴더의 `_template.ts`를 복사해서 시작한다.
- 새 환경 변수는 `core/src/node/env.ts` 스키마와 `.env.example`에 함께 추가한다.
- 기능을 바꾸면 해당 패키지 README의 표도 함께 고친다.

## 확인 명령

- 전체 검사: `pnpm check` (타입, 린트, 포맷, 테스트)
- MCP 서버: `pnpm mcp:check` (HTTP로 켜서 401·도구 목록·ping 확인), 켜기: `pnpm mcp:serve`. 올린 서버는 `pnpm mcp:check --url https://…/mcp` (토큰은 `.env`의 `SIL_MCP_TOKEN`, 설치·실행 명령은 `apps/mcp-server/README.md` "올리기", D54)
- DB 규칙: `psql "<DB 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/wiki.test.sql` (`v2.test.sql`, `compat.test.sql`, `always_on_per_version.test.sql`, `feedback_v2.test.sql`, `notify_rules.test.sql`, `reflected.test.sql`도 같은 방법)
- 위키 적용 범위 경로 확인: `pnpm sil scope-check` (맞는 파일이 없는 코드 경로 목록)
- 위키 불러오기 미리 보기: `pnpm sil import` (저장은 `--apply`)
- 화면 미리보기: `pnpm app:web` (http://localhost:5173). PWA(설치·서비스 워커) 확인은 `pnpm app:build` 후 `pnpm app:preview` (http://localhost:4173)

## 커밋 메시지 규칙

형식: `태그: 설명` 또는 `태그(범위): 설명`

| 태그       | 언제 쓰나요                                                                       |
| ---------- | --------------------------------------------------------------------------------- |
| `feat`     | 새로운 기능, 화면, 요소 추가                                                      |
| `fix`      | 버그 수정, 기존 기능·화면·문구 수정                                               |
| `refactor` | 동작 변화 없이 코드 구조만 개선                                                   |
| `style`    | 코드 포매팅, 세미콜론 등 **코드 모양만** 수정 (화면에 보이는 변경은 `feat`/`fix`) |
| `docs`     | 문서 수정 (README 등)                                                             |
| `test`     | 테스트 추가·수정                                                                  |
| `chore`    | 빌드, 패키지 매니저, 설정 파일 수정                                               |

- 설명은 한국어로 씁니다.
- 범위는 선택이며, 변경한 기능 영역을 씁니다. (예: `feat(login): 로그인 UI 추가`)
- **작은 단위로 커밋합니다.** 커밋 하나에는 한 가지 변경만 담고, 그 커밋만으로도 다른 코드에 영향 없이 실행·빌드되는 상태여야 합니다. 이슈가 없는 작은 수정도 같은 기준을 따릅니다.

## 브랜치 규칙

- 형식: `타입/sil-번호-작업내용` (모두 소문자, 작업내용은 영어와 하이픈, 예: `docs/sil-60-add-claude-md`)
- 이슈 번호는 Linear MCP로 이슈를 가져와 `gitBranchName`을 쓴다. MCP를 쓸 수 없으면 이슈 번호를 소문자로 직접 쓴다.
- 타입은 커밋 메시지 태그와 같다: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`
- 작업 종류가 애매하면 브랜치를 만들기 전에 사용자에게 묻는다.
- 이슈가 없는 작업은 이슈를 먼저 만든다.

## PR 규칙

- `main`으로 PR을 만들고 **본인이 머지**한다. 리뷰 승인은 필요 없다.
- PR 본문은 `.github/pull_request_template.md` 양식대로 쓴다.

## AI와 함께 작업할 때

- AI가 만든 결과도 커밋한 사람이 책임집니다.
- AI가 요청한 작업 범위 밖의 파일을 고쳤다면 되돌립니다.
- 아래 작업은 개발자와 먼저 상의합니다.
  - 패키지 추가·삭제
  - 린트·포맷 설정 변경
  - 환경변수, 비밀키 관련 수정
- 비밀키, 토큰, `.env` 파일은 커밋하지 않습니다.
- 작업을 끝냈다고 판단하기 전에 린트와 포맷 검사를 실행합니다.
