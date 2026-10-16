# @sil/notify

담당자에게 알리기 (SIL-67). 기준이 바뀌면 연결된 이슈의 담당자에게 확인할 변경을 만들고, 담당자의 답을 기록해요.

## 흐름

```
새 버전 저장 ──▶ applyNewVersion ──▶ createPendingChecks ──▶ 확인할 변경 저장
                                    (누구에게 만들고 무엇을 닫을지)

담당자 화면 ──▶ listPending ──▶ 나에게 온 변경 목록
담당자 답   ──▶ respond     ──▶ 답 저장, 확인할 변경은 "답함"
```

정민님 DB(SIL-73)에 붙기 전까지는 JSON 파일이나 메모리에 저장해요. 저장소 모양은 `src/store.ts`의 `NotifyStore`이고, DB에 붙일 때 이 부분만 바꿔요.

## 함수

### `createPendingChecks` — 알릴 담당자 고르기

새 버전 하나와 이슈 목록을 받아서 목록 세 개를 돌려줘요. 새로 만들 것, 닫을 것, 건너뛴 이슈예요. 저장은 하지 않아요.

| 경우                           | 하는 일                                  | 위키 기준                            |
| ------------------------------ | ---------------------------------------- | ------------------------------------ |
| 연결된 이슈 (완료된 이슈 포함) | 이슈마다 확인할 변경 1개                 | notify.pending.one-per-issue         |
| 기준을 바꾼 본인               | 만들지 않음                              | notify.target.skip-author            |
| 담당자 없는 이슈               | 만들지 않음                              | notify.pending.no-owner              |
| 답하기 전에 또 바뀜            | 이전 건을 대체됨으로 닫고 새 건 만듦     | notify.pending.merge-versions        |
| 마지막으로 본 값과 같아짐      | 열린 건을 자동 닫힘으로 닫고 만들지 않음 | notify.pending.close-on-revert       |
| 이미 답한 뒤 다른 값으로 바뀜  | 관계와 상관없이 새로 만듦                | notify.pending.renotify-after-answer |

마지막으로 본 버전을 찾는 순서는 notify.pending.last-seen-order를 따라요.

### `applyNewVersion` — 새 버전 기록하기

새 버전을 저장소에 기록하고, `createPendingChecks` 결과대로 확인할 변경을 만들거나 닫아요. 지금은 데모와 테스트가 `save_standard` 대신 불러요. 버전 번호가 다음 번호가 아니면 저장하지 않아요.

### `listPending` — 나에게 온 변경 목록 (MCP 도구 `list_pending`)

```ts
const result = await listPending(store, { recipient: '민수' });
// { recipient: '민수', pendingCount: 1, items: [ ... ] }
```

- 항목마다 제목, 지금 값, 이전 값, 이유, 바꾼 사람과 시각, 출처, 이슈 번호·제목·상태를 붙여서 돌려줘요. 화면이 `get_standard`를 다시 부르지 않아도 돼요.
- 이전 값은 바로 앞 버전이 아니라 **받는 사람이 마지막으로 본 버전의 값**이에요. 새로 생긴 기준이면 비어 있어요.
- 기본은 대기만 돌려줘요. 터미널은 이걸 써요.
- `includeClosed: true`면 답함과 대체됨도 답과 함께 돌려줘요. 웹 앱 목록은 이 옵션으로 한 번만 부르고, 화면이 상태를 보고 "답할 변경"과 "답한 변경"으로 나눠요 (notify.list.one-call). 자동 닫힘은 돌려주지 않아요.
- 답함과 대체됨은 닫힌 지 7일이 지나면 목록에서 빠져요 (notify.list.closed-7-days). 기록은 지우지 않아요 (data.answer.keep-records). 대기는 오래돼도 계속 보여요.
- 최신 것이 먼저 와요.
- 기준 버전이나 이슈를 찾지 못하면 빈 목록 대신 오류를 내요 (notify.error.not-empty).
- `previousAnswer`: 같은 이슈에서 이 결정 사항의 이전 버전에 한 마지막 답이에요. `affected`가 true면 화면이 "지난번 변경을 반영하셨다면 다시 고쳐야 해요"를 붙여요 (SIL-77).
- 저장소 없이 데이터만으로 만드는 `buildPendingList`도 있어요. MCP 도구 `list_pending`은 DB에서 모은 데이터로 이 함수를 불러요.

### `respond` — 답 저장하기 (MCP 도구 `respond`)

```ts
const result = await respond(store, {
  pendingCheckId: 'c-1',
  answeredBy: '민수',
  affected: true,
  known: false,
  channel: 'terminal',
});
// 성공: { ok: true, answer, rereadStandardId: 'app.notify.title-length' }
// 실패: { ok: false, code: 'missing_fields', message: '빠진 칸이 있어요: …', missingFields: ['known'] }
```

- 관계있다면 알았나를, 관계없다면 이유(100자 이하)를 꼭 받아요. 맞지 않는 쪽 칸은 비워서 저장해요.
- 관계있다면 `rereadStandardId`를 돌려줘요. 에이전트는 이 기준을 `get_standard`로 다시 읽어요.
- 거절하는 경우: 없는 변경, 받는 사람이 아님, 이미 답했거나 닫힘, 답한 곳이 터미널·앱이 아님, 빠진 칸, 이유가 100자 넘음.
- 한 곳에서 답하면 그 변경은 대기가 아니라서 다른 곳 목록에서 빠져요 (notify.answer.one-place).
- 이미 닫힌 변경이면 `closedStatus`로 지금 상태(답함·대체됨·자동 닫힘)를 알려 줘요. 자동 닫힘이면 화면이 "원래대로 돌아와서 답하지 않아도 돼요"를 띄워요 (SIL-77).
- "잘 모르겠다"(notify.answer.unsure-later)는 답으로 기록하지 않아요. `checkUnsure`로 이 사람에게 온 대기 중인 변경인지만 보고, MCP 도구 `respond`는 `unsure: true`면 DB에 아무것도 쓰지 않아요. 이번 세션에 다시 묻지 않는 것은 서버 hooks가 기억하고, "결정 사항 확인"·다음 세션·앱에서는 다시 나와요.
- 저장 전 검사만 하는 `checkAnswer`도 있어요. MCP 도구 `respond`는 이 함수로 검사한 뒤 DB 함수 `save_answer`로 저장해요.

### `checkReflect` — 이슈 반영 표시 검사 (MCP 도구 `mark_reflected`)

"이슈 반영"은 담당자가 바뀐 결정 사항을 자기 이슈 결과물에 적용했다는 뜻이에요. 저장 전에 검사만 해요 (SIL-93).

```ts
checkReflect(check, answer, {
  pendingCheckId: 'c-1',
  markedBy: '민수',
  reflected: true,
});
// 통과: { ok: true }
// 거절: { ok: false, code: 'not_affected', message: '관계없다로 답한 확인할 변경이라 …' }
```

- 관계있다로 답한 변경에만 표시할 수 있어요 (notify.check.reflected v2). DB 함수 `save_reflected`는 답했는지만 봐서 이 규칙은 여기서 봐요.
- 표시 풀기는 관계없다로 답한 변경에도 받아요.
- 거절하는 경우: 없는 변경, 받는 사람이 아님, 답하지 않음(대기·대체됨·자동 닫힘), 답을 찾지 못함, 관계없다로 답함.
- 브라우저 입구(`@sil/notify/browser`)에서도 가져올 수 있어요.

### 터미널 화면 글 (`src/terminal/`)

list_pending 결과로 터미널 알림 글을 만들어요. 모양과 문구는 부건님 시안(SIL-68, `docs/sil-68-add-cli-design-notes` 브랜치의 `cli-design-notes/`)을 그대로 옮겼어요. 팀 MCP 서버의 `/hooks/<이벤트>`가 이 함수로 글을 만들고, 팀원 PC의 hooks가 그대로 띄워요 (`apps/mcp-server` README "터미널 알림 hooks").

| 함수                                                                                            | 화면                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sessionNotice(items)`                                                                          | ① 켤 때: 노란 막대 + `[app] 결정 사항이 1건 변경되었어요.` 답할 변경이 없으면 null                                     |
| `detailScreen(item, index, total)`                                                              | ② 작업 입력 때: 위아래 선으로 묶은 변경 상세 (머리표, 제목·종류 태그, 바꾼 사람·시각, 변경·상세, 이유, 이슈, 출처)     |
| `questionsFor(item)`                                                                            | 선택 화면 질문 3개 (관계, 알았나, 관계없는 이유 보기 3개)                                                              |
| `recordedLines(item, answer)`                                                                   | 답한 뒤: `✓ 기록했어요  #5 · 관계있다 · 몰랐다`                                                                        |
| `allAnsweredLine`, `skippedReminder`, `nothingLeft`, `autoClosedLine`, `connectionFailedNotice` | 마무리, 닫고 넘어간 뒤, 0건, 자동 닫힘, 연결 실패 한 줄                                                                |
| `reflectScreen`, `reflectQuestionsFor`, `reflectedLine`, `nothingToReflect`, `reflectReminder`  | 이슈 반영(SIL-93): 관계있다로 답한 변경 목록, 고를 질문(1건은 예/아니오, 5건부터 탭), 표시한 뒤 한 줄, 0건, 안내 한 줄 |

- 너비는 76칸이에요. Claude Code가 hooks 글 앞에 2칸을 들여 써요.
- 모양은 v2 시안(10/13)이에요: 상태 줄 앞 노란 막대, 상세 위아래 선과 머리표(`-- [1/3] 작업 전에 확인할 변경이 3건 있어요 ---`), 청록 굵은 제목, 종류 태그 `(변경)` `(신규)` `(되돌림)`, 지금 값 전체를 두 줄까지 보여 주는 `상세` 줄, 초록 `✓ 기록했어요`.
- 이전 버전에 "관계있다"로 답했으면 변경 줄 아래에 "지난번 변경(32자)을 반영하셨다면 다시 고쳐야 해요."를 넣어요 (SIL-77).
- 바꾼 시각은 한국 시각으로, 오늘이면 "오후 2:13", 아니면 "10월 13일 오후 2:13"이에요.

### 웹 앱에서 쓰기 (`@sil/notify/browser`, SIL-100)

웹 앱의 "나에게 온 변경" 목록이 터미널과 같은 규칙(7일, 자동 닫힘 숨기기, 지난번 답)으로 나오게, 웹도 같은 함수를 써요.

```ts
import * as data from '@sil/core/data';
import { buildPendingList, loadNotifyData } from '@sil/notify/browser';

const list = buildPendingList(await loadNotifyData(data, '민수'), {
  recipient: '민수',
  includeClosed: true, // 웹 목록은 답한 변경까지 한 번에 받아요 (notify.list.one-call)
});
```

- 패키지 전체 입구(`@sil/notify`)는 파일 저장소(`store.ts`, `node:fs`)를 함께 내보내서 브라우저 빌드가 실패해요. 웹은 `@sil/notify/browser`만 가져와요.
- `loadNotifyData(source, 이름)`은 DB 함수를 넘겨받아요. 웹은 `@sil/core/data`, MCP 서버는 `@sil/core/node`의 같은 함수를 넘겨요. 그래서 터미널과 웹 목록이 같아요.
- `browser.test.ts`가 브라우저 입구에 Node 전용 모듈이 섞이지 않았는지 검사해요.

## 실행

```bash
pnpm --filter @sil/notify typecheck
pnpm --filter @sil/notify test
pnpm --filter @sil/notify demo              # 데모 예시를 처음부터 끝까지
pnpm --filter @sil/notify demo ./demo.json  # 결과를 이 파일에 남겨요
```

테스트는 Node에 들어 있는 `node:test`를 써요. 따로 설치할 것은 없어요. 빌드하지 않고 Node 24.18이 `src`의 `.ts` 파일을 바로 실행해요. 저장소 루트의 `pnpm test`도 이 테스트를 함께 돌려요.

## 아직 없는 것

- 정민님 DB 연결과 새 버전 저장 신호
- 웹 앱 OS 알림
- 반영함 표시를 켜고 끄는 기능. 칸(`reflected`, `reflectedAt`)만 있어요
