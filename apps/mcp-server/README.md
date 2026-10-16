# @sil/mcp

팀이 **함께 쓰는 MCP 서버 하나**예요. Streamable HTTP로 열고, 올린 곳(호스팅)이 HTTPS를 붙여 줘요.
팀원은 각자 서버를 켜지 않고 `claude mcp add --transport http <주소>` 한 줄로 붙어요.
위키 도구(정민님, SIL-19)와 알리기 도구(민수님, SIL-67)가 이 한 서버에 올라가요.

```
Claude Code ──HTTPS──▶ 호스팅 ──HTTP──▶ haribo MCP 서버(/mcp) ──공용 키──▶ Supabase
 (팀원마다)          (TLS를 붙여 줌)     토큰 확인 → 도구        (읽기 + 저장 함수만)
```

## 폴더

```
mcp-server/
├── bin/sil-mcp.mjs         서버를 켜는 파일 (Node가 TypeScript를 읽는지 확인한 뒤 src/index.ts 실행). 내 컴퓨터·호스팅 모두 이걸로
├── scripts/check.ts        pnpm mcp:check    — Claude Code 없이 HTTP로 붙어 서버를 확인 (--url: 올린 서버)
├── scripts/register.ts     pnpm mcp:register — 내 Claude Code에 팀 서버 등록 + 터미널 알림 hooks 설치
├── hooks-client/haribo-hook.mjs  팀원 PC에서 도는 hooks 스크립트 (register가 ~/.claude/haribo/에 복사)
├── scripts/token.ts        pnpm mcp:token    — 팀 토큰 만들기
├── scripts/status.ts       pnpm mcp:status   — 등록된 haribo 보기 (팀 토큰은 가림, src/mask-secrets.ts)
└── src/
    ├── index.ts            Node 시작점 (http://SIL_MCP_HOST:PORT/mcp)
    ├── http.ts             웹 표준 fetch 서버: /health, /mcp, Origin·토큰 확인 → SDK createMcpHandler
    ├── auth.ts             팀 토큰 확인, 부른 사람(X-Sil-User) 읽기
    ├── server.ts           요청마다 MCP 서버 만들기, 도구 묶음 등록, 이름 겹침 검사
    ├── instructions.ts     세션 시작 때 넣는 안내문 + 항상 적용 기준 (최대 10개)
    ├── lib/define-tool.ts  도구 공통 틀 (결과 감싸기, 에러 처리, 로그, 부른 사람)
    └── tools/
        ├── index.ts        묶음 목록 (새 "묶음"이 생길 때만 고쳐요)
        ├── _template.ts    새 도구 본보기
        ├── system/         ping (연결 확인)
        ├── wiki/           위키 도구 5개 — 정민님 (SIL-19, wiki.mcp.five-tools)
        └── notify/         알리기 도구 2개 — 민수님 (SIL-67). 규칙은 @sil/notify, 여기서는 DB에서 데이터만 모아요
    └── hooks/              터미널 알림 hooks — 민수님 (SIL-67). /hooks/<이벤트> 처리(notify-hooks.ts), 사용자 설정에 깔기(install.ts)
```

## 도구

| 도구               | 하는 일                                                                                                                    | 읽기만 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| `ping`             | 서버·DB 연결, 누구로 들어왔는지 확인                                                                                       | ✔      |
| `get_index`        | 목차: 항상 적용 기준, 기준 전체 목록(ID·영역·제목), 영역별 수                                                              | ✔      |
| `search_standards` | 키워드, 영역, 코드 경로(glob)로 기준 찾기                                                                                  | ✔      |
| `get_standard`     | 기준 하나의 최신 내용과 버전 기록 (`currentVersion`)                                                                       | ✔      |
| `save_standard`    | 새 기준·새 버전 저장. ID·제목·값·이유·항상 적용이 없으면 빠진 칸을 알려 주고 거절                                          |        |
| `revert`           | 앞선 버전으로 되돌리기. 되돌림도 새 버전으로 쌓임                                                                          |        |
| `list_pending`     | 나(`X-Sil-User`)에게 온 확인할 변경 목록. 제목·이전 값·지금 값·이유·이슈와, 대기 항목에는 물을 질문(`questions`)을 붙여 줌 | ✔      |
| `respond`          | 확인할 변경에 답 저장 (관계, 알았나, 관계없는 이유). 답한 곳은 터미널                                                      |        |
| `mark_reflected`   | 관계있다로 답한 변경을 내 작업에 반영했다고 표시하거나 풀기. 사람이 직접 말했을 때만                                       |        |

알리기 도구는 `X-Sil-User`의 이름으로만 움직여요. 다른 사람의 목록을 보거나 대신 답할 수 없고, 이름이 없으면 거절해요.
`respond`는 DB까지 가기 전에 `@sil/notify`의 `checkAnswer`로 먼저 검사해서 빠진 칸을 한국어로 알려 줘요. 이미 닫힌 변경이면 `closedStatus`(답함·대체됨·자동 닫힘)를 돌려줘요. "관계있다"로 저장되면 `scopeCheck`(그 버전의 적용 범위와 안내)도 돌려줘요. AI는 적용 범위부터 훑어 새 값과 다른 곳을 알려 주기만 하고 고치지 않아요. 적용 범위가 없거나 경로를 못 찾으면 그렇다고 말한 뒤 제목과 값으로 찾아요 (SIL-98). "잘 모르겠다"는 `unsure: true`로 불러서 DB에 쓰지 않고 대기로 남겨요 (notify.answer.unsure-later). "관계있다"로 저장되면 `rereadStandardId`를 돌려줘서 AI가 그 결정 사항을 `get_standard`로 다시 읽어요.
`mark_reflected`는 사람이 "작업에 반영했어요"라고 말했을 때만 불러요 (SIL-93). 관계있다로 답한 변경에만 표시할 수 있고(notify.check.reflected v2), 이 규칙은 `@sil/notify`의 `checkReflect`가 DB까지 가기 전에 봐요. 표시를 풀어도 이슈는 다시 열리지 않아요. DB가 거절하면 거절 문장을 그대로 돌려줘요.

팀 위키 `wiki.mcp.five-tools`에 따라 위키 도구는 다섯 개예요. 폐기는 사람이 `pnpm sil deprecate`로 해요.
`save_standard`와 `revert`는 결과에 CHANGELOG 한 줄(`changelogLine`)을 돌려줘요. 작업 중인 저장소에 `team-wiki/CHANGELOG.md`가 있으면 AI가 그 줄을 맨 아래에 붙여요 (`work.wiki.changelog`).
`save_standard`는 `check_wiki.py`와 같은 문장 경고(`warnings`)도 돌려줘요. 저장은 막지 않아요.
`save_standard`의 `aiDetected`(AI가 찾았나)는 에이전트 경로 T1이 `true`로 넣어요. 근거 필수·하루 두 번 제한은 PR에서 찾은 변경(`aiDetected: true` + `source: code`)에만 걸려요 (D61).

쓰기 도구는 모두 `baseVersion`(내가 보고 고친 버전)을 받아요. 그사이 누가 먼저 고쳤으면 `VERSION_CONFLICT`로 거절하고 "최신을 다시 보고 다시 저장하라"고 알려 줘요 (SIL-15 동시 수정). 거절된 변경은 버리지 않고 충돌로 보류해 둬요 (`detect.conflict.hold`).
거절 문구는 데이터베이스 함수가 만든 한국어 문장이 그대로 AI에게 가요. 문구에 "다음에 할 일"이 들어 있어서 AI가 사람에게 묻고 다시 시도해요.

항상 적용 기준은 **세션 시작 때** 서버 안내문(instructions)으로 들어가요. 서버는 먼저 말을 걸 수 없어서, Claude Code가 연결할 때 받는 안내문에 붙였어요 (사람마다 60초 동안 기억).
`X-Sil-User`로 들어온 사람이 진행 중인 이슈에서 "관계있다"고 답한 바뀐 기준도 같은 안내문에 넣어요 (`notify.answer.next-run-context`).
그 사람에게 답을 기다리는 확인할 변경이 있으면 그 수를 안내문 맨 앞에 넣어요. 안내문 7·8번에 따라 Claude는 사람이 작업을 시작하면 그 일보다 먼저 `list_pending`을 부르고, 하나씩 보여 준 뒤 `questions`를 AskUserQuestion으로 글자 그대로 물어요 (`notify.terminal.session-start`, `notify.terminal.one-change`). hooks 없이 서버만으로 돼요. 목록을 못 읽으면 "확인할 변경이 없다고 여기지 말라"고 적어요 (`notify.error.not-empty`).

## 터미널 알림 hooks (SIL-67)

부건님 시안(SIL-68)대로 터미널 알림 화면 글은 Claude가 옮겨 쓰지 않고 **hooks가 직접** 띄워요. Claude가 옮기면 줄이거나 건너뛰었기 때문이에요.

```
Claude Code hooks ──stdin──▶ ~/.claude/haribo/hook.mjs ──POST /hooks/<이벤트>──▶ 이 서버 ──▶ DB
       ▲                        (Node만 있으면 돌아요)        토큰 + X-Sil-User       @sil/notify가 화면 글을 만듦
       └──────────── 서버가 돌려준 JSON(systemMessage 등)을 그대로 출력 ◀─────────────┘
```

| Claude Code 이벤트                            | 서버 주소                   | 띄우는 것                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart` (startup)                      | `POST /hooks/session-start` | 켤 때 알림 `[app] 결정 사항이 1건 변경되었어요.`(앞에 노란 막대) 답할 변경이 없으면 아무것도                                                                                                                                                                                                                                                                              |
| `UserPromptSubmit`                            | `POST /hooks/prompt-submit` | 첫 변경 상세 + Claude에게 질문 순서 안내. 같은 세션에서 닫고 넘어갔으면 화면에는 아무것도 안 띄우고 Claude가 요청을 그대로 처리 (한 줄은 작업을 마친 뒤 Stop이 띄워요). `결정 사항 확인`을 입력하면 다시 물어요. `이슈 반영`을 입력하면 관계있다로 답한 변경 목록 + 고를 질문 (SIL-93). 이슈 반영할 변경이 남았으면 상세를 띄우지 않는 입력에 안내 한 줄 (세션마다 한 번) |
| `PostToolUse` (`mcp__haribo__respond`)        | `POST /hooks/after-respond` | `✓ 기록했어요` + 다음 변경 상세, 또는 마무리 한 줄                                                                                                                                                                                                                                                                                                                        |
| `PostToolUse` (`mcp__haribo__mark_reflected`) | `POST /hooks/after-reflect` | `✓ 이슈에 반영했어요  #5 · 제목` 한 줄. 표시를 풀었거나 거절됐으면 아무것도                                                                                                                                                                                                                                                                                               |
| `Stop`                                        | `POST /hooks/after-work`    | 이번 세션에서 질문을 닫고 넘어갔거나 다 답한 뒤 새 변경이 왔으면 입력 칸 바로 위에 `확인할 변경 N건 · "결정 사항 확인"을 입력하면 …` 한 줄 (SIL-80 B5, `notify.terminal.new-after-answered` v2)                                                                                                                                                                           |

- **설치:** `pnpm mcp:register --user <이름>`이 서버 등록과 함께 hooks를 사용자 설정(`~/.claude/settings.json`)에 깔아요. 서버가 이미 등록돼 있어도 hooks는 깔아요. 다른 hooks와 설정은 그대로 두고, 고치기 전 설정은 `settings.json.bak-haribo`에 남겨요. 깔지 않으려면 `--no-hooks`.
- **10/15에 더한 이벤트는 다시 설치해야 보여요:** `after-reflect`와 `after-work`(Stop)는 10/15에 더했어요. 그전에 설치한 사람은 `pnpm mcp:register --user <이름>`을 다시 실행해야 `✓ 이슈에 반영했어요` 줄, 작업을 마친 뒤 한 줄, 새 연결 실패 줄(노란 막대)이 보여요. 다시 설치하기 전에는 닫고 넘어간 뒤 한 줄이 보이지 않아요. 다시 설치하지 않아도 `이슈 반영` 목록과 질문은 서버만 바뀌면 돼요.
- **Windows와 Mac:** hooks 명령은 `node "<경로>/hook.mjs" <이벤트>` 한 줄이에요. 경로를 슬래시로 쓰고 따옴표로 감싸서 cmd, PowerShell, Git Bash, Mac에서 같아요.
- **실패해도 작업은 막지 않아요:** 서버에 못 붙으면 "서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요."를 띄우고, Claude는 요청을 그대로 처리해요 (`notify.error.no-block-retry`). 스크립트는 언제나 0으로 끝나요.
- **세션 상태**("이번 세션에서 이미 물었는지")는 서버 메모리에 사람·세션별로 둬요. 서버를 다시 켜면 처음처럼 물어요.
- **안내문 7·8번과의 관계:** hooks가 없는 사람은 안내문대로 Claude가 표로 보여 주고 물어요. hooks가 있으면 작업을 입력할 때 hooks의 안내가 "표를 다시 그리지 말고 질문만"을 덧붙여서 같은 내용이 두 번 나오지 않아요.

## 왜 이렇게 나눴나요

- **HTTP 서버 하나를 함께 씀**: Supabase 키는 서버에만 있어요. 팀원과 다른 팀 컴퓨터에는 팀 토큰만 가요. 서버를 고치면 모두에게 바로 반영돼요.
- **웹 표준 `fetch` 하나로 만듦** (`src/http.ts`): Node, Vercel, Cloudflare 등 어디에 올려도 이 파일은 그대로예요. 올리는 곳에 맞는 입구만 하나 더 만들면 돼요.
- **팀 토큰 + 이름 헤더**: 사람별 로그인은 MVP 범위 밖이에요 (SIL-18). 팀마다 토큰을 따로 줘서 새면 그 팀 것만 바꿔요. `X-Sil-User`는 "고친 사람"으로만 남아요. 이슈 담당자와 같은 **사람 이름**(예: 부건)이어야 "바꾼 본인에게는 알리지 않는다"가 맞아요. HTTP 헤더에 한글을 그대로 못 넣어서 `pnpm mcp:register`가 퍼센트 인코딩해 보내고, 서버가 풀어서 읽어요.
- **토큰이 없으면 localhost만**: 토큰을 깜빡하고 올려도 밖에서 온 요청은 403이에요.
- **담당자별 폴더(묶음)**: 정민님은 `wiki/`, 민수님은 `notify/`만 고쳐요. 합칠 때 충돌이 안 나요.
- **`defineTool` 공통 틀**: 도구를 만드는 사람은 "입력 → 결과 데이터"만 써요. 응답 모양, 에러 문구, 로그, 부른 사람은 틀이 맞춰 줘요.
- **빌드 없음**: Node 24.18이 TypeScript를 바로 실행해요 (D48). 호스팅도 Node 24.18로 켜요.
- **SDK v2** (`@modelcontextprotocol/server`의 `createMcpHandler`): 2026-07-28 스펙이고, 예전(2025) 클라이언트도 자동으로 받아 줘요.

## 내 컴퓨터에서 켜 보기

```bash
pnpm mcp:serve                 # http://127.0.0.1:3333/mcp  (토큰이 없으면 localhost만 받아요)
pnpm mcp:register --local      # 내 Claude Code에 이 주소로 등록
```

고치면서 쓰려면 `pnpm mcp:dev` (저장하면 서버가 다시 켜져요). Claude Code는 `/mcp`에서 다시 연결해요.

## 올리기 (HTTPS)

서버는 HTTP만 열어요. HTTPS는 올린 곳이 붙여 줘요. 저장소를 연결하면 Node를 계속 켜 두는 호스팅(웹 서비스)이면 어디든 아래만 맞추면 돼요. 빌드 단계는 없어요 (D48).

| 설정           | 값                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| 실행 폴더      | 저장소 맨 위 (호스팅의 Root Directory는 비워 둬요)                                                              |
| Node           | 24.18 (`.nvmrc`. 호스팅이 읽지 못하면 환경 변수 `NODE_VERSION=24.18.0`)                                         |
| 설치(빌드)     | `corepack pnpm install --frozen-lockfile --prod --filter "@sil/mcp..."`                                         |
| 실행           | `node apps/mcp-server/bin/sil-mcp.mjs`                                                                          |
| 환경 변수      | `SIL_MCP_HOST=0.0.0.0`, `SIL_MCP_TOKENS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (`PORT`는 호스팅이 넣어요) |
| 상태 확인 경로 | `GET /health` (토큰 필요 없음)                                                                                  |
| MCP 주소       | `https://<올린 주소>/mcp`                                                                                       |

팀 토큰은 `pnpm mcp:token haribo`로 만들어서 `SIL_MCP_TOKENS=haribo:…,team-b:…`처럼 이어 붙여요.

왜 이렇게 하나요 (D54):

- **설치는 MCP 서버가 쓰는 것만** (`--prod --filter "@sil/mcp..."`): MCP 서버와 core가 실행 때 쓰는 패키지 15개만 받아요(약 3초). 웹 앱(Vite), 테스트 도구, Supabase CLI(설치 때 실행 파일을 따로 내려받아요)는 받지 않아서 설치 스크립트 허락(allowBuilds)도 필요 없어요.
- **pnpm은 corepack으로**: Node 24.18에 들어 있는 corepack이 `package.json`의 `packageManager`(pnpm 11.25.0)를 받아서 실행해요. 호스팅에 pnpm을 따로 깔지 않아요.
- **실행은 `node`로 바로**: `pnpm mcp:serve`와 같은 파일을 켜지만, 실행할 때 pnpm이 필요 없고 호스팅이 끌 때 보내는 신호(SIGTERM)를 서버가 바로 받아 정리하고 꺼져요.
- **`SIL_MCP_HOST=0.0.0.0`**: 기본값 `127.0.0.1`이면 호스팅이 서버에 닿지 못해 `/health`부터 실패해요.
- **한 대면 충분**: 요청마다 서버를 새로 만들어서(무상태) 세션을 기억하지 않아요. 기억하는 건 사람별 안내문 60초뿐이라 두 대 이상 켜도 동작은 같아요.

### 올린 뒤 확인

1. 호스팅 로그에 `haribo MCP 서버를 켰어요`가 찍히고 `warn` 줄이 없는지 봐요. 밖에서 받도록 켰는데 `SIL_MCP_TOKENS`나 Supabase 값이 비어 있으면 켜는 순간 `warn`으로 알려요.
2. 내 컴퓨터 `.env`의 `SIL_MCP_TOKEN`에 팀 토큰을 넣고 올린 주소로 검사해요.
   ```bash
   pnpm mcp:check --url https://<올린 주소>/mcp
   ```
   https 주소인지, `/health`, 토큰 없는 요청과 틀린 토큰의 401, 도구 목록, ping, (DB가 있으면) 목차까지 봐요. 토큰은 명령줄로 받지 않아요. pnpm이 실행하는 명령을 화면과 CI 로그에 그대로 찍거든요.
3. 팀원은 `.env`에 `SIL_MCP_URL`, `SIL_MCP_TOKEN`을 넣고 `pnpm mcp:register`로 등록해요.

### 호스팅 고를 때

- **Docker 이미지를 직접 만들지 않아요.** 저장소를 연결하면 위 설치·실행 명령으로 켜 주는 곳(Node 웹 서비스)을 골라요.
- **쉬는 무료 플랜은 첫 연결이 느려요.** 한동안 요청이 없으면 멈췄다가 다음 요청에 깨어나는 곳은 깨는 데 1분 가까이 걸리기도 해요. 그동안 Claude Code가 세션을 켜면 haribo 연결이 실패할 수 있어요 (`/mcp`에서 다시 연결). `pnpm mcp:check --url`은 `/health`를 90초까지 기다려요.
- **서버리스**(Vercel Functions, Cloudflare Workers)도 `http.ts`는 그대로 쓸 수 있지만, 그곳에 맞는 입구 파일이 하나 더 필요하고 `.ts` import를 그대로 실행하는지 따로 확인해야 해요 (D23). 지금 코드 그대로 올리려면 Node를 계속 켜 두는 곳이에요.

## 도구 추가하기 (5분)

1. `src/tools/_template.ts`를 내 묶음 폴더로 복사해요. 예: `src/tools/notify/list-pending.ts`
2. 이름(snake_case), 설명, 입력 모양(zod), `handler(input, context)`를 채워요.
   - 설명은 AI가 "언제 이 도구를 쓸지" 고르는 근거예요. 무엇을 하고, 언제 쓰고, 무엇을 돌려주는지 적어요.
   - 읽기만 하는 도구는 `annotations: { readOnlyHint: true }`
   - 부른 사람은 `context.user`(없으면 `context.client`)로 남겨요.
   - 실패는 `throw`로 알려요. `@sil/core`의 `SilError` 계열이면 문구가 그대로 AI에게 가요.
3. 같은 폴더 `index.ts`의 `tools` 배열에 넣어요.
4. `pnpm mcp:check` → 도구 목록에 보이면 끝.

## 확인

| 명령                                 | 무엇을 보나요                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm test`                          | `src/http.test.ts`: 토큰·Origin 막기, 도구 6개, 저장 거절, 고친 사람, CHANGELOG 줄, 사람별 안내문 (가짜 DB) |
| `pnpm mcp:check`                     | 진짜 HTTP로 켜서 401 거절, 도구 목록, ping. `.env`에 Supabase가 있으면 목차까지 (읽기만)                    |
| `pnpm mcp:check --url https://…/mcp` | 올린 서버를 같은 방법으로 확인 + https 주소, `/health`, 틀린 토큰. 토큰은 `.env`의 `SIL_MCP_TOKEN`          |

SQL 규칙(형식 검사, 잠금, 버전 충돌, 삭제 막기)은 저장소 맨 위 `supabase/tests/wiki.test.sql`이 실제 Postgres에서 검사해요.

## 꼭 지킬 것

- **로그는 `createLogger('mcp')`로만** 남겨요. 린트가 `console.log`를 막아 줘요.
- **DB는 직접 부르지 않아요.** `@sil/core/node`의 함수만 써요. 필요한 함수가 없으면 core에 추가해 달라고 PR로 요청해요 (SIL-17).
- **토큰은 저장소·채널에 올리지 않아요.** 호스팅 환경 변수와 Slack DM으로만 오가요.
