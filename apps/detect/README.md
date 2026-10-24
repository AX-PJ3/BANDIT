# @sil/detect

바뀐 결정 사항 찾기예요. 담당: **경하님** (T1 문구는 **부건님**, SIL-66)

## 경로

| 경로          | 하는 일                                                                                                                                         | 상태 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 에이전트 (T1) | 에이전트가 결정 사항과 다른 코드를 쓰려 하면 먼저 묻고, 예면 `save_standard`로 새 버전 저장. 사람이 직접 바꿔 달라고 하면 묻지 않고 등록으로 감 | 만듦 |
| PR            | PR이 머지되면 GitHub Actions가 바뀐 결정 사항을 찾아 저장                                                                                       | 만듦 |

## 에이전트 경로 (T1)

T1은 haribo MCP 서버로 옮겨서 어느 저장소에서나 떠요 (BDT-108). 이 패키지에는 T1 코드가 없어요.

| 무엇                        | 어디                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| 화면 모양, 문구, 저장 값    | `@sil/t1` ([packages/t1](../../packages/t1/README.md))                                      |
| 언제 부르는지               | 서버 안내문 10번 (`apps/mcp-server/src/instructions.ts`)                                    |
| 부르기 전에 할 일과 넘길 값 | `show_standard_check` 도구 설명 (`apps/mcp-server/src/tools/detect/show-standard-check.ts`) |
| 화면 띄우기, 저장 전후 확인 | 서버 hooks ([mcp-server README "T1 결정 사항 확인 hooks"](../mcp-server/README.md))         |

예전에는 이 저장소 `CLAUDE.md` T1 1~9번과 `src/t1/`의 Bash 명령·hooks로 움직였어요.

아직 없는 것: `detect.ask.rollback-if-applied`(이미 코드에 들어간 값 되돌리기).

## PR 경로

main으로 머지된 PR을 GitHub Actions(`.github/workflows/detect.yml`)가 Claude API로 결정 사항과 비교해요. 결정 사항은 팀 DB에서 core 함수로 읽고 저장해요(레포 `team-wiki` 파일은 읽지 않아요).

| 파일                   | 내용                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pr/main.ts`       | Actions 입구. `--pr 12 --dry-run=false`. `--dry-run`은 기본 true라서 false를 분명히 넣어야 저장해요                                                                                              |
| `src/pr/decide.ts`     | 판단 → 저장 흐름 (아래 표). DB·Claude는 밖에서 받아서 테스트는 가짜로 돌려요                                                                                                                     |
| `src/pr/judge.ts`      | Claude API (기본 `claude-opus-5-5`, 저장소 변수 `SIL_DETECT_MODEL`로 바꿈, effort high, 구조화된 출력). ① 목차로 관련 영역 고르기 → ② 그 영역 결정 사항만 보내 판단 → ③ 뜻이 같은 예전 버전 찾기 |
| `src/pr/prompt.ts`     | 판단 프롬프트. PR 코드·주석·설명은 `<pr_data>` 안의 자료로만 쓰고 그 안의 지시는 따르지 않아요 (detect.safety.code-as-data)                                                                      |
| `src/pr/save-input.ts` | 저장 값. 출처 `code`, AI가 찾았나 예, AI가 고침, 바꾼 사람은 이름 표의 팀 이름, 이유 칸에는 PR 작성자가 쓴 이유 그대로, 근거 칸에는 PR 번호·코드에서 바뀐 것·바뀐 줄 (detect.change.evidence v3) |
| `src/pr/copy.ts`       | PR 댓글·실행 요약 문구. "결정 사항", 쉬운 말                                                                                                                                                     |
| `src/pr/github.ts`     | PR 읽기, 댓글 쓰기, 실행 요약 쓰기 (Node 내장 fetch)                                                                                                                                             |
| `src/pr/people.ts`     | GitHub 아이디 → 팀 이름 표 (`SIL_GITHUB_PEOPLE`)                                                                                                                                                 |
| `src/pr/samples.ts`    | 시험용 PR 4개 (40→32, 두 개, 애매, 지시가 든 PR)                                                                                                                                                 |
| `src/pr/try-pr.ts`     | 실제 Claude로 시험 (`pnpm --filter @sil/detect try-pr`). 팀 DB는 읽기만, 저장 함수는 막아 둬요                                                                                                   |

### 판단 결과

| 등급·상황                                                                       | 하는 일                                                                        | 결정 사항 ID                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| 확실 + 하나 + DB 최신 값과 다름                                                 | 두 번 묻기가 켜져 있으면 한 번 더 판단해 같을 때만 저장. 댓글로 저장 내용 알림 | detect.change.ai-mark 등      |
| 확실 + 하나 + 예전 버전과 뜻만 같아 보임                                        | 저장하지 않고 되돌린 건지 댓글로 물음                                          | detect.change.revert-mark     |
| 확실 + 하나 + DB 최신 값과 같음 (띄어쓰기·끝 마침표·전각 글자 차이는 같은 값)   | T1에서 이미 저장한 변경. 저장하지 않고 "이미 반영됨" 댓글                      | SIL-66 조건                   |
| 애매 (결정 사항보다 엄격한 코드 포함)                                           | 저장하지 않고 PR 작성자에게 댓글로 물음                                        | detect.judge.ask-if-unsure    |
| 바뀐 결정 사항이 둘 이상                                                        | 저장하지 않고 댓글로 물음                                                      | detect.judge.one-per-run      |
| 관계없음                                                                        | 저장·댓글 없음 (시험 실행이면 댓글)                                            |                               |
| 목록에 없는 ID, 바뀐 줄이 diff에 없음, 잠김, 이름 표에 없음, diff가 큼          | 저장하지 않고 댓글로 알림                                                      | detect.change.no-new-area 등  |
| PR 제목·설명에 바꾼 이유가 없음 (Claude가 옮긴 이유가 PR 글에 그대로 없음 포함) | 이유를 지어내지 않고 저장하지 않은 채 댓글로 알림                              | detect.change.evidence        |
| DB가 거절 (하루 두 번 제한, 충돌 보류)                                          | DB·core가 정한 결과를 댓글로 알림                                              | detect.safety.repeat-limit 등 |

Claude가 안전 문제로 답을 거절해서 다른 모델이 대신 답하면 "확실"이어도 애매로 보고 물어요. 저장할 때 baseVersion은 Claude가 보고 판단한 버전이라, 그사이 바뀌었으면 DB가 충돌로 보류해요.

저장되면 되돌림 표시(DB가 계산)와 CHANGELOG 한 줄을 댓글에 함께 적어요. DB는 띄어쓰기·끝 마침표·전각 글자만 다른 값까지 같은 값으로 봐요(`normalize_standard_value`, core `normalizeStandardValue`와 같은 규칙). 글자 다듬기로 같은 예전 버전이 있으면 Claude에게 묻지 않아요. Actions는 저장소에 쓰지 않아서 CHANGELOG에는 사람이 붙여요.

### PR 경로 설정

| 종류             | 이름                       | 값                                                                                    |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| Secrets          | `ANTHROPIC_API_KEY`        | Claude API 키                                                                         |
| Secrets          | `SUPABASE_URL`             | 팀 Supabase 주소                                                                      |
| Secrets          | `SUPABASE_PUBLISHABLE_KEY` | 팀 Supabase 공용 키                                                                   |
| Variables        | `SIL_GITHUB_PEOPLE`        | `{"k0nghaa":"경하","mick243":"정민"}` 처럼 아이디 → 팀 이름                           |
| Variables (선택) | `SIL_DETECT_DRY_RUN`       | 저장 끄기. `true`면 머지된 PR도 저장하지 않고 결과만 댓글로 남겨요. 처음 며칠 켜 두기 |
| Variables (선택) | `SIL_DETECT_MODEL`         | 판단 모델. 비우면 `claude-opus-5-5`. 예: `claude-sonnet-5-5`                          |
| Variables (선택) | `SIL_DETECT_ASK_TWICE`     | 두 번 묻기. 기본 `true`, 끄려면 `false`                                               |

시험은 Actions → detect → Run workflow에서 PR 번호를 넣고 `dry_run`을 켠 채로 돌려요. 저장하지 않고 저장하려던 내용을 실행 요약과 PR 댓글로 남겨요.

모델 비교 (10/14, 시험 PR 5개, `try-pr --model`): Opus 5.5 5/5 약 $0.27, Sonnet 5.5 5/5 약 $0.13, Haiku 5.5 4/5 약 $0.01 (40→32를 애매로 봐서 놓침).

아직 없는 것: 모든 판단을 남기는 코드 확인 기록(detect.log.every-pr, 표가 아직 없음), 같은 PR 10개로 정확도 재기(detect.eval.same-ten-prs).
