# haribo

MVP 사일로의 모노레포예요. 팀 기준 위키(MCP 서버), 명령어(CLI), 알리기, 웹 앱(PWA), 바뀐 기준 찾기를 **한 저장소**에서 만들어요.
데이터는 Supabase(Postgres) 하나에 모으고, MCP 서버는 HTTPS 주소 하나로 팀이 함께 써요.

> 왜 한 저장소인가요: 세 기능을 따로 만들면 마지막 날 합치다가 무너져요. 처음부터 같은 타입(`@sil/core`)을 쓰면 매일 합칠 수 있어요. (SIL-16)

## 지금 상태 (10/12)

| 항목                   | 상태                                                                                                                | 담당 이슈              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 저장소 구조, 개발 환경 | ✅ 빌드 없이 Node 24.18이 `.ts`를 바로 실행. PR마다 도는 검사(CI)는 아직                                            | SIL-16, SIL-61         |
| MCP 서버               | ✅ Streamable HTTP + 팀 토큰. 위키 도구 5개 + 알리기 도구 2개 + `ping`. **HTTPS로 올릴 곳은 아직**                  | SIL-19, SIL-67         |
| 명령어                 | ✅ `doctor`, `import`, `deprecate`, `changelog`, `export`, `backup`, `scope-check`                                  | SIL-28, SIL-39, SIL-65 |
| 알리기                 | ◐ 확인할 변경 만들기(DB 함수, `createPendingChecks`), MCP 도구 `list_pending`·`respond`. 터미널 카드·앱 알림은 아직 | SIL-67                 |
| 웹 앱 (PWA)            | ✅ 켜짐, 설치 가능(로컬에서 확인). 화면 세 칸은 자리만 있음. 배포 주소는 아직                                       | SIL-65, SIL-42·44·45   |
| 바뀐 기준 찾기         | ⏳ 경하님이 `apps/detect`에 붙여요                                                                                  | SIL-66                 |
| 데이터베이스           | ✅ Supabase. 기준·버전·이슈·확인할 변경·답·충돌 표와 저장 함수, 규칙 검사 211개                                     | SIL-14, SIL-18, SIL-65 |
| 공통 타입              | ✅ 착수 안내 "데이터 항목 목록 v2"를 따름                                                                           | SIL-65                 |

위키 도구와 데이터베이스는 연결됐어요. 알리기 도구, 화면, 바뀐 기준 찾기는 "어디에 무엇을 붙이면 되는지"까지만 만들어 두었어요.
팀 위키(team-wiki/)의 기준 중 저장소가 지킬 수 있는 것은 DB 함수와 검사로 맞춰 두었어요. 디자이너와 팀원용 설명은 [docs/설계-지침서.md](docs/설계-지침서.md)에 있어요. 기능을 만들 때 쓰는 타입과 이름 연결표는 [docs/타입명세서.md](docs/타입명세서.md)에 있어요.

## 10분 안에 실행하기

준비물: **Node 24.18**(`.nvmrc`. nvm을 쓰면 `nvm install` 다음 `nvm use`), **pnpm**, Git. Claude Code는 5단계에만 필요해요. Docker는 필요 없어요.

서버·웹 앱 켜기, Claude Code에서 쓰기, `sil` 명령어까지 한곳에 모은 안내는 [docs/실행-방법.md](docs/실행-방법.md)에 있어요.

```bash
# 1. 받기 (1분)
git clone <저장소 주소> haribo
cd haribo

# 2. 설치 (1~3분)
#    pnpm이 없으면: npm install -g pnpm
#    pnpm 버전은 package.json에 적힌 버전으로 자동으로 맞춰져요.
pnpm install

# 3. 환경 확인 (10초). .env가 없으면 자동으로 만들어 줘요.
pnpm onboard

# 4. MCP 서버 확인 (10초) → "✔ MCP 서버가 HTTP로 답해요"가 나오면 성공
pnpm mcp:check

# 5. 내 Claude Code에 팀 서버 등록 (30초). 한 번만 하면 어느 저장소에서든 haribo 도구가 보여요.
#    정민님에게 받은 주소와 토큰을 .env의 SIL_MCP_URL, SIL_MCP_TOKEN에 넣고:
pnpm mcp:register
```

등록 뒤 아무 저장소에서 Claude Code를 새로 켜고 `/mcp`를 입력해 `haribo`가 `connected`인지 보고, "haribo 서버 ping 해 줘"라고 말해 보세요.

저장소를 받지 않는 다른 팀은 이 한 줄이면 돼요 (토큰과 이름만 바꿔서). 이름은 이슈 담당자와 같게 쓰고, 한글은 헤더에 그대로 못 넣어서 퍼센트 인코딩해요 (`node -e "console.log(encodeURIComponent('부건'))"`):

```bash
claude mcp add --transport http --scope user haribo https://<팀 서버 주소>/mcp --header "Authorization: Bearer <팀 토큰>" --header "X-Sil-User: <퍼센트 인코딩한 내 이름>"
```

## 데이터베이스 (Supabase)

위키는 Supabase(Postgres)에 있어요. **키는 MCP 서버에만** 두고, 팀원은 서버 주소와 팀 토큰만 받아요.

| 무엇             | 어디                                            | 내용                                                                                                                           |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 표와 저장 함수   | `supabase/migrations/`                          | 기준, 기준 버전, 목록 뷰, 이슈, 이슈와 기준 연결, 확인할 변경(반영함 포함), 답, 충돌, 응답 기록 뷰. 쓰기 함수 8개 (아래)       |
| 규칙 검사        | `supabase/tests/wiki.test.sql`                  | 공용 키로 못 지움, 형식 검사, 잠금, 버전 충돌, 되돌림, 항상 적용 10개, 삭제 막기 (41개)                                        |
| v2 검사          | `supabase/tests/v2.test.sql`                    | 필수 칸 5개, 저장만 하는 칸, 새 버전 알림 자리, 이슈 저장, 확인할 변경·답 표 모양, 데모 순서 (49개)                            |
| 위키 호환 검사   | `supabase/tests/compat.test.sql`                | 팀 위키 기준: ID 세 부분, AI 안전 규칙, 충돌 보류, 답 저장, 담당자 바뀜, 응답 기록, Realtime (49개)                            |
| 피드백 검사      | `supabase/tests/feedback_v2.test.sql`           | 10/12 피드백: 확인할 변경 만들기(상태 네 가지, 대체됨·자동 닫힘, 마지막으로 본 버전), 답 값, 필수 칸 5개와 PR 변경 근거 (27개) |
| 알리기 규칙 검사 | `supabase/tests/notify_rules.test.sql`          | 확인할 변경 만들기를 민수님 `createPendingChecks`(PR #7) 테스트 12개와 같은 장면으로 확인 (13개)                               |
| 반영함 검사      | `supabase/tests/reflected.test.sql`             | 받은 사람만·답한 변경에만 켜고 끄기, 풀어도 이슈를 다시 열지 않음, 공용 키로 칸 직접 고치기 막기 (11개)                        |
| 항상 적용 검사   | `supabase/tests/always_on_per_version.test.sql` | 항상 적용을 버전마다 남김, 되돌리면 그 값으로, 되돌려서 11개면 거절, 이미 있던 버전 채움 (15개)                                |
| AI가 찾았나 검사 | `supabase/tests/ai_detected_t1.test.sql`        | T1은 근거 없이 AI가 찾았나 예로 저장, PR 경로 규칙(근거 필수·하루 두 번)은 출처 코드에만 (6개)                                 |
| 읽기·쓰기 함수   | `packages/core/src/data/`                       | `standards.ts`(기준·이슈·충돌), `notify.ts`(확인할 변경·답). 다른 패키지는 SQL 대신 이것만 불러요. 웹 앱도 같은 함수예요 (D50) |

쓰기 함수는 `save_standard`, `revert_standard`, `deprecate_standard`, `save_issue`, `hold_conflict`, `resolve_conflict`, `save_answer`, `save_reflected`예요. 공용 키로 부를 수 있는 쓰기 통로는 이것뿐이에요. 확인할 변경은 따로 쓰지 않고, 기준을 저장하거나 되돌릴 때 `on_standard_version_saved`가 함께 만들어요.

규칙은 데이터베이스 안에 있어요. 공용 키(publishable)로는 **읽기와 저장 함수만** 되고, 표에 직접 쓰거나 지울 수 없어요. 기준 버전은 서비스 키나 SQL 편집기로도 고치거나 지울 수 없어요 (SIL-18).

### 처음 한 번 (정민님)

1. [Supabase](https://supabase.com)에서 프로젝트를 만들어요 (무료 플랜, 지역은 Seoul 추천). 이때 정하는 DB 비밀번호는 비밀번호 관리자에 보관해요.
2. `pnpm supabase login` → 브라우저에서 로그인해요.
3. `pnpm supabase link --project-ref <프로젝트 ID>` → DB 비밀번호를 물으면 직접 입력해요. 프로젝트 ID는 대시보드 주소 `/project/<ID>` 부분이에요.
4. `pnpm db:push` → 올릴 마이그레이션 9개(`20261008100000_wiki` → `20261009100000_v2_store` → `20261009200000_wiki_compat` → `20261009300000_always_on_per_version` → `20261012100000_feedback_v2` → `20261012200000_last_seen_order` → `20261012300000_term_decision` → `20261012400000_reflected` → `20261014100000_ai_detected_t1`)가 보이면 확인하고 올려요. 이미 올린 DB면 새 파일만 보여요.
   - SQL Editor에 붙여 넣어 올리지 않아요. 그러면 마이그레이션 기록이 남지 않아서 다음 `db push`가 처음부터 다시 올리려 해요. 이미 붙여 넣었다면 `pnpm supabase migration repair --status applied <파일 앞 번호>`로 기록을 맞춰요.
5. 규칙 검사 8개(`supabase/tests/`의 `wiki`, `v2`, `compat`, `always_on_per_version`, `feedback_v2`, `notify_rules`, `reflected`, `ai_detected_t1`)를 돌려요. 로컬 검사는 PostgreSQL 18에서 돌렸으니, Supabase의 Postgres에서 한 번 꼭 돌려요.
   - 대시보드 → **SQL Editor**에 하나씩 붙여 넣고 Run, 또는 `psql "<Session pooler 주소>" -v ON_ERROR_STOP=1 -f supabase/tests/wiki.test.sql` (주소는 대시보드 → **Connect**)
   - 마지막에 "…검사를 모두 통과했어요"가 나오면 돼요. 전부 ROLLBACK이라 흔적이 남지 않아요.
6. **Project Settings → API Keys**의 Project URL과 **Publishable key**를 `.env`(호스팅은 환경 변수)의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`에 직접 넣어요. Secret key(service_role)는 어디에도 넣지 않아요.
7. `pnpm mcp:check` → "✔ 데이터베이스 연결됨: 기준 0개"가 나오면 연결은 끝이에요.
8. `pnpm sil import`로 미리 보고, 확인한 뒤 `pnpm sil import --apply`로 team-wiki/의 기준을 넣어요. 기준은 지울 수 없으니 미리 보기를 꼭 먼저 봐요.
   - 이 저장소에 `team-wiki/`가 없으면 `--wiki <팀 저장소의 team-wiki 폴더>`로 알려 줘요.
   - `samples/`의 이슈 파일은 예시 데이터라 넣지 않아요 (팀 DB에 시험 데이터를 남기지 않아요).
   - 다시 `pnpm mcp:check` → "기준 90개"처럼 나오면 끝이에요.
9. 백업은 `pnpm sil backup`으로 표 전체를 JSON으로 남겨요. 매일 도는 백업 작업(GitHub Actions)은 아직 올리지 않았어요 (wiki.backup.daily).

> 무료 프로젝트는 7일 동안 요청이 없으면 멈춰요. 매일 백업 작업이 생기면 DB를 한 번씩 읽어서 멈추지 않아요.

### 표를 바꿀 때

이미 올린 마이그레이션 파일은 고치지 않고 **새 파일**을 더해요 (`pnpm supabase migration new <이름>`). 바꾼 규칙은 `supabase/tests/`에도 검사를 붙여요.

> `pnpm doctor`가 아니라 `pnpm onboard`예요. `pnpm doctor`는 pnpm 11에 이미 있는 명령이라 우리 검사가 아니라 pnpm 자체 검사가 실행돼요.

## 폴더 지도

```
haribo/
├── apps/                직접 실행하는 프로그램 (D49)
│   ├── mcp-server/  팀이 함께 쓰는 MCP 서버(HTTP). 도구는 tools/<묶음>/   정민님(위키) · 민수님(알리기)
│   ├── cli/         sil 명령어 (brief, status, revert, export 자리)     민수님 · 문구 부건님
│   ├── web/         웹 앱 (PWA). 브라우저로 열고 앱으로 설치            신지님(화면) · 정민님(데이터·배포)
├── packages/            가져다 쓰는 코드
│   ├── core/        공통 타입, 에러, 쿠폰 예시 데이터, DB 읽기·쓰기      정민님 (모두 사용)
│   └── notify/      알리기: 확인할 변경 만들기, 목록, 답 (임시 저장소)    민수님
├── supabase/
│   ├── migrations/            데이터베이스 표·함수·권한 (SQL)
│   └── tests/                 데이터베이스 규칙 검사 (SQL, Docker 없이 실행)
├── docs/
│   ├── 실행-방법.md           실행 방법 한곳에 (일반 · Claude Code · sil 명령어)
│   ├── 설계-지침서.md         팀원·디자이너용 설명 (위키 기준과 저장소가 맞는지)
│   ├── 타입명세서.md          타입과 이름 연결표 (착수 안내 ↔ 코드 ↔ DB)
│   ├── decisions.md           이 구조를 왜 이렇게 만들었는지
│   └── proposals/             아직 정하지 않은 것의 제안서 (SIL-15 사람 연결표)
└── CLAUDE.md                  Claude Code가 이 저장소에서 지킬 규칙
```

각 패키지 폴더의 `README.md`에 **무엇을 하는지, 왜 이렇게 나눴는지, 기능을 어디에 붙이는지**가 있어요.

## 기능을 붙이는 곳 (한눈에)

| 하고 싶은 일            | 붙이는 곳                                                                     | 안내                                           |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| MCP 도구 추가           | `apps/mcp-server/src/tools/<내 묶음>/` 파일 하나 + 같은 폴더 `index.ts` 한 줄 | [mcp-server/README](apps/mcp-server/README.md) |
| 명령어 추가             | `apps/cli/src/commands/` 파일 하나 + `index.ts` 한 줄                         | [cli/README](apps/cli/README.md)               |
| 앱 화면                 | `apps/web/src/screens/`                                                       | [web/README](apps/web/README.md)               |
| 화면에 데이터 연결      | `apps/web/src/api/types.ts`에 함수 약속 → database·mock                       | [web/README](apps/web/README.md)               |
| 공통 타입, DB 읽기·쓰기 | `packages/core/` (정민님에게 PR로 요청)                                       | [core/README](packages/core/README.md)         |
| 바뀐 기준 찾기          | `apps/detect/` (경하님, SIL-66)                                               | -                                              |

규칙 네 가지만 기억해요.

1. **타입은 `@sil/core`에만** 정의해요. 같은 모양을 다른 곳에서 다시 만들지 않아요.
2. **DB는 직접 부르지 않고** `@sil/core/node`의 함수만 써요.
3. **MCP 서버 코드에서는 `console.log` 금지.** 로그는 `createLogger`로 남겨요 (린트가 막아 줘요).
4. **표는 새 마이그레이션 파일로만 바꿔요.** 쓰기는 데이터베이스 함수(`save_standard` 등)로만 해요.

## 자주 쓰는 명령

| 명령                            | 하는 일                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm onboard`                  | 개발 환경 확인, .env 만들기                                                                 |
| `pnpm mcp:check`                | Claude Code 없이 MCP 서버가 HTTP로 켜지고 답하는지 확인 (`--url`: 올린 서버)                |
| `pnpm mcp:register`             | 내 Claude Code에 팀 MCP 서버 등록 (`--local`: 내 컴퓨터 서버)                               |
| `pnpm mcp:status`               | 내 Claude Code에 등록된 haribo 보기. 팀 토큰은 가려요 (`claude mcp get`은 그대로 보여 줘요) |
| `pnpm mcp:serve` / `mcp:dev`    | MCP 서버 켜기 (`dev`는 저장하면 다시 켜짐)                                                  |
| `pnpm mcp:token <팀 이름>`      | 팀 토큰 만들기 (서버의 `SIL_MCP_TOKENS`에 이어 붙여요)                                      |
| `pnpm db:push`                  | 마이그레이션을 연결한 Supabase 프로젝트에 올리기                                            |
| `pnpm app:web`                  | 웹 앱 화면 열기 (http://localhost:5173, .env에 Supabase 값이 없으면 예시 데이터)            |
| `pnpm app:build`                | 웹 앱 배포 파일 만들기 (`apps/web/dist/`)                                                   |
| `pnpm app:preview`              | 배포본 열기 (http://localhost:4173). PWA 설치와 서비스 워커는 여기서 확인                   |
| `pnpm sil <명령>`               | sil 명령어 실행. 예: `pnpm sil --help`                                                      |
| `pnpm check`                    | PR 올리기 전 전체 검사 (타입, 린트, 포맷, 테스트)                                           |
| `pnpm format` / `pnpm lint:fix` | 모양 맞추기 / 고칠 수 있는 린트 자동 수정                                                   |

## 브랜치와 PR

브랜치 이름, 커밋 메시지, PR 양식은 팀 공통 지침 [CLAUDE.md](CLAUDE.md)를 따라요. `main`으로 PR을 만들고 본인이 머지해요. 올리기 전에 `pnpm check`를 돌려요.

## 막히면

| 증상                                              | 해결                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`이 `ERR_PNPM_IGNORED_BUILDS`로 멈춤 | 설치 스크립트가 필요한 새 패키지예요. `pnpm approve-builds`로 허락하고 `pnpm-workspace.yaml`에 이유를 주석으로 남겨요  |
| `pnpm install`이 갓 나온 버전을 받지 않음         | pnpm 11은 나온 지 하루가 안 된 버전을 막아요. 버전 범위를 조금 낮춰요 (예: `^44.0.0`)                                  |
| `pnpm mcp:check`는 되는데 Claude Code에 안 보임   | `pnpm mcp:status`로 등록을 확인하고(토큰은 가려요), Claude Code를 완전히 껐다 켜요                                     |
| Claude Code에서 haribo가 `failed`·인증 요구       | 주소 끝이 `/mcp`인지, 토큰이 맞는지 봐요. `curl <주소에서 /mcp 뺀 것>/health`가 `ok`면 서버는 살아 있어요              |
| 위키 도구가 `DB_NOT_CONFIGURED`                   | 서버 환경 변수에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`가 없어요                                                   |
| 올린 서버의 `/health`가 안 열림                   | 서버 환경 변수 `SIL_MCP_HOST=0.0.0.0`을 봐요. 설치·실행 명령은 [mcp-server/README](apps/mcp-server/README.md) "올리기" |
| 올린 서버가 토큰 없는 요청에 403                  | 서버 환경 변수 `SIL_MCP_TOKENS`가 비어 있어요. `pnpm mcp:token haribo`로 만들어 넣어요                                 |
| 위키 도구가 "위키 표나 함수가 없어요"             | Supabase에 `supabase/migrations`를 아직 안 올렸어요 (위 "처음 한 번" 4번 `pnpm db:push`)                               |
| 저장이 `VERSION_CONFLICT`                         | 그사이 다른 사람이 먼저 고쳤어요. `get_standard`로 최신을 보고 그 버전을 `baseVersion`으로 다시 저장해요               |
