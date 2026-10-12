# @sil/notify

담당자에게 알리기 (SIL-67). 새 버전이 저장되면 연결된 이슈의 담당자에게 확인할 변경을 만들고, 답을 기록해요.

## 지금 있는 것

### `createPendingChecks` — 확인할 변경 만들기

새 버전 하나를 받아 "만들 확인할 변경"과 "닫을 확인할 변경"을 돌려주는 순수 함수예요. 저장은 하지 않아요.

```ts
import { createPendingChecks } from '@sil/notify';

const result = createPendingChecks({
  saved: {
    standardId: 'app.notify.title-length',
    version: 2,
    value: '공백 포함 32자 이하',
    changedBy: '부건',
    createdAt: '2026-10-13T14:13:00+09:00',
  },
  issues, // 이슈 목록 (담당자, 연결된 기준 ID 포함)
  existing, // 지금까지 만든 확인할 변경
  history: [{ version: 1, value: '공백 포함 40자 이하' }], // 이 기준의 이전 버전 값
  now: '2026-10-13T14:13:00+09:00',
});

result.created; // 새로 만들 확인할 변경 (대기)
result.closed; // 닫을 기존 확인할 변경 (대체됨 / 자동 닫힘)
result.skipped; // 만들지 않은 이슈와 이유 (본인 / 담당자 없음 / 되돌려서 같아짐)
```

규칙은 착수 안내 "6. 개발자 3명"의 예외 처리 4가지를 따라요.

| 경우                               | 하는 일                                  | 위키 기준                      |
| ---------------------------------- | ---------------------------------------- | ------------------------------ |
| 연결된 이슈 (완료된 이슈 포함)     | 이슈마다 확인할 변경 1개                 | notify.pending.one-per-issue   |
| 기준을 바꾼 본인                   | 만들지 않음                              | notify.target.skip-author      |
| 담당자 없는 이슈                   | 만들지 않음                              | notify.pending.no-owner        |
| 답하기 전에 또 바뀜                | 이전 건을 대체됨으로 닫고 새 건 만듦     | notify.pending.merge-versions  |
| 되돌려서 마지막으로 본 값과 같아짐 | 열린 건을 자동 닫힘으로 닫고 만들지 않음 | notify.pending.close-on-revert |

### 새 버전 저장 신호 (정민님과 맞출 것)

`saved`가 저장 쪽에서 알리기 쪽으로 넘기는 값이에요. `save_standard`와 `revert`가 새 버전을 저장한 직후 이 모양으로 `createPendingChecks`를 부르고, 돌아온 `created`와 `closed`를 DB에 쓰면 돼요. 칸은 `src/types.ts`의 `SavedVersion`에 있어요.

## 실행

```bash
pnpm --filter @sil/notify typecheck
pnpm --filter @sil/notify test
```

테스트는 Node에 들어 있는 `node:test`를 써요. 따로 설치할 것은 없어요.

## 다음에 올 것

- `list_pending`, `respond` (PR 2)
- 터미널 T2~T5 카드 내용 (PR 3)
- DB 연결과 저장 신호 (PR 4), 웹 앱 OS 알림 (PR 5)
