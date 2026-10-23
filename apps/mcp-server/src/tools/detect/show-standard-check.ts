import { STANDARD_ID_PATTERN } from '@sil/core';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';

/**
 * T1 결정 사항 확인 화면을 띄우는 도구예요 (BDT-108).
 * 화면은 도구 직후 hook(`hooks/t1-hooks.ts`)이 이 입력으로 만들어요. 도구는 입력만 검사하고 `{ ok: true }`를 돌려줘요.
 * 저장하지 않고(저장은 save_standard만), 결정 사항을 읽어 돌려주지도 않아요 (wiki.mcp.five-tools v2).
 * 입력 검사는 `apps/detect/src/t1/conflicts.ts`·`notice.ts`·`preview.ts`의 손 검사를 zod로 옮겼어요.
 */

const filled = z.string().trim().min(1);
const standardId = z.string().regex(STANDARD_ID_PATTERN);
const trigger = z
  .enum(['agent', 'direct'])
  .describe(
    '작업 중에 알아챘으면 agent, 사람이 결정 사항을 바꿔 달라고 직접 요청했으면 direct',
  );

/** ② 다른 결정 사항. `@sil/t1`의 `T1ConflictsInput`과 같은 모양이에요 */
const conflictsInput = z
  .object({
    trigger,
    request: filled.describe('부탁받은 작업이나 요청을 한 줄로 정리한 것'),
    conflicts: z
      .array(
        z.object({
          id: standardId,
          title: filled,
          kind: z.enum(['change', 'mismatch']),
          why: filled.describe('어떻게 바뀌는지만 짧게 쓴 한 문장'),
          version: z.number().int().positive().optional(),
        }),
      )
      .describe('바꾸려는 결정 사항(change)이 맨 앞. 새 결정 사항이면 빈 목록'),
    revert: z
      .object({
        version: z.number().int().positive(),
        title: filled,
        reason: filled,
        changedBy: z.string().nullable(),
        createdAt: z.iso.datetime({ offset: true }),
      })
      .optional()
      .describe('되돌림이면 get_standard로 읽은 되돌아갈 버전 그대로'),
  })
  // 다른 결정 사항이 없는 건 새 결정 사항(직접 요청)뿐이에요. 에이전트는 다른 점을 알아채서 시작해요
  .refine((input) => input.conflicts.length > 0 || input.trigger === 'direct', {
    message: '빈 conflicts는 trigger가 direct일 때만 써요',
    path: ['conflicts'],
  });

/**
 * ③ 등록될 모습. 바꾸는 사람은 서버가 X-Sil-User로 알아서 받지 않아요.
 * 저장 직전 hook도 내 PC에 남긴 ③ 값을 이 모양으로 읽어요
 */
export const previewInput = z.object({
  id: standardId,
  title: filled,
  value: filled,
  reason: filled,
  alwaysOn: z.boolean(),
  isNew: z.boolean().optional().describe('기존 결정 사항이 없으면 true'),
});

const existing = z.object({ id: standardId, title: filled, value: filled });

/** 예외 안내. 저장하는 사이 바뀜(saveRace)은 저장 직후 hook이 띄워서 받지 않아요 */
const noticeInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('searchFailed'), trigger }),
  z.object({ kind: z.enum(['same', 'similar']), existing }),
  z.object({
    kind: z.literal('revertSame'),
    version: z.number().int().positive(),
    versionValue: filled,
    existing,
  }),
  z.object({ kind: z.literal('similarDeclined') }),
]);

/** hook도 같은 모양으로 tool_input을 읽어요 */
export const showStandardCheckInput = z
  .object({
    screen: z
      .enum(['conflicts', 'preview', 'notice'])
      .describe(
        'conflicts: ② 다른 결정 사항 / preview: ③ 등록될 모습 / notice: 예외 안내',
      ),
    conflicts: conflictsInput.optional(),
    preview: previewInput.optional(),
    notice: noticeInput.optional(),
  })
  // 고른 화면의 칸 하나만 채워요
  .refine(
    (input) =>
      (['conflicts', 'preview', 'notice'] as const).every(
        (screen) => (input[screen] !== undefined) === (input.screen === screen),
      ),
    { message: 'screen과 같은 이름의 칸 하나만 채워요' },
  );

export type ShowStandardCheckInput = z.output<typeof showStandardCheckInput>;
export type T1PreviewInput = z.output<typeof previewInput>;

/**
 * 도구 설명. 예전 CLAUDE.md T1 1~9번 중 Claude가 이 도구를 부르기 전에 할 일을 옮겼어요.
 * 부른 뒤 단계(묻기, 이유, ③ 질문, 저장 뒤 한 줄)는 hook(`hooks/t1-hooks.ts`)이 그때그때 넘겨요.
 * 미뤄 불러오는 도구라 16,384자까지 보여요. 검색에 걸리게 앞부분에 언제 쓰는지 둬요 (code.claude.com/docs/en/mcp)
 */
const DESCRIPTION = `팀 결정 사항(위키)과 다른 결과물을 만들게 될 때, 만들기 전에 사람에게 "결정 사항을 바꾸는지" 묻는 T1 확인 화면을 띄워요 (work.wiki.ask-before-change). 결정 사항을 저장(save_standard)하기 전에도 늘 이 도구로 ③ 등록될 모습을 먼저 보여 줘요. ③ 없이 저장하면 막혀요.
화면은 hook이 사람에게 바로 보여 주고, 이 도구는 { ok: true }만 돌려줘요. 저장하지 않고 결정 사항을 읽어 오지도 않아요. 조회용으로 쓰지 않아요.
화면을 띄운 뒤에는 화면을 띄웠다거나 무엇을 보여 줬는지 설명하는 글을 쓰지 않아요. 다음 할 일과 물을 질문은 hook이 글자 그대로 알려 줘요.

언제 부르나요
- 작업 중에 알아챘을 때(trigger "agent"): search_standards·get_standard로 읽은 결정 사항과 다르게 만들게 되면, 코드를 쓰기 전에 불러요. 낱말만 겹치는 결정 사항은 다른 게 아니에요.
- 직접 요청(trigger "direct"): 사람이 "결정 사항"이나 "위키"를 바꿔 달라고 분명히 말했을 때만이에요(detect.ask.direct-request-skip-warn). "32자로 자르는 함수를 만들어 줘"처럼 코드만 말하면 agent예요. vN(또는 이전 버전 = currentVersion - 1)으로 되돌려 달라는 요청도 직접 요청이에요.

순서
1. get_standard(historyLimit: 50)로 지금 제목·값·alwaysOn·currentVersion·적용 범위(versions[0].scope)를 읽어요. search_standards나 get_standard가 실패하면 "다른 결정 사항 없음"으로 넘어가지 말고 screen "notice"에 { kind: "searchFailed", trigger }를 넘겨요.
2. 되돌림 확인(detect.change.revert-mark): 바꿀 값을 지금 버전이 아닌 예전 버전들과 비교해요. 띄어쓰기·끝 마침표·전각 글자만 다르거나, 글자는 달라도 뜻이 같으면(숫자·범위·조건·대상이 모두 같을 때만) 되돌림이에요. 되돌림이면 바꿀 값을 그 버전의 값으로 글자 그대로 바꾸고, 아래 conflicts에 revert를 더해요. 저장은 그대로 save_standard예요(revert 도구를 쓰지 않아요).
3. screen "conflicts"(② 다른 결정 사항)를 불러요.
   - trigger, request(부탁받은 작업이나 요청을 한 줄로), conflicts(바꾸려는 결정 사항 kind "change"가 맨 앞, 바꾸면 함께 어긋나는 다른 결정 사항은 kind "mismatch").
   - 항목마다 id·title·kind·why. why는 어떻게 바뀌는지만 짧게 쓴 한 문장이에요. change는 지금 값과 바꿀 값만 써서 "40자 이하로 정한 길이를 32자 이하로 다시 정해요"처럼, mismatch는 무엇이 어긋나는지만 써서 "결정 사항 제목(최대 40자)을 그대로 쓰면 32자에서 잘려요"처럼 써요. 작업을 다시 설명하지 않아요.
   - 되돌림이면 change 항목에 version(currentVersion)을 넣고, get_standard로 읽은 되돌아갈 버전의 version·title·reason·changedBy·createdAt을 revert로 글자 그대로 넣어요.
   - 직접 요청인데 기존 결정 사항이 없으면(search_standards로 찾아도 없음) conflicts를 빈 목록으로 넘겨요.
4. 그다음은 hook이 알려 줘요: 묻기(예/아니요) → 이유 → screen "preview"(③ 등록될 모습) → 등록하기면 save_standard.
   - preview에는 id·title·value·reason·alwaysOn을 넣어요. 바꾸는 사람은 서버가 알아서 넣지 않아요. 새 결정 사항이면 isNew: true, ID는 data.standard.id-format대로, alwaysOn은 사람이 말하지 않았으면 false예요.
   - 이유는 사람이 대화에서 한 말로 알 수 있으면 한 문장으로 정리하고, 알 수 없으면 사람에게 물어요. 근거 없이 지어내지 않아요.

저장(save_standard) 값
- ③에서 보여 준 id·title·value·reason·alwaysOn을 그대로 넣어요. 다르면 저장 직전 hook이 막아요. 수정하기로 값이 바뀌면 ③을 다시 보여 줘요.
- 고칠 때: baseVersion은 1에서 읽은 currentVersion, alwaysOn과 scope는 지금 값 그대로(scope를 비우면 적용 범위가 지워져요. 지금 값이 null이면 칸을 빼요).
- 새 결정 사항: baseVersion 0, scope는 빼요.
- source는 "ai_chat", aiDetected는 trigger가 agent면 true, direct면 false예요 (D61).
- 결과의 changelogLine은 작업 중인 저장소에 team-wiki/CHANGELOG.md가 있으면 맨 아래에 그대로 붙여요. 위키 파일의 값·버전은 고치지 않아요.

예외 (screen "notice")
- 완전히 같음: 직접 요청한 값이 그 결정 사항의 지금 값과 같으면 { kind: "same", existing: { id, title, value } }를 넘기고 끝내요. 저장하지 않아요.
- 되돌릴 값이 지금과 같음: vN으로 되돌려 달라는데 지금 값이 이미 vN의 값과 같으면(N이 지금 버전일 때도) { kind: "revertSame", version: N, versionValue: vN의 값, existing: 지금 버전 }을 넘겨요.
- 뜻이 같음: 새 결정 사항을 만들어 달라는데 다른 ID의 결정 사항이 같은 뜻이면 { kind: "similar", existing }을 넘겨요. 사람이 아니요를 고르면 { kind: "similarDeclined" }를 넘겨요.
- 저장하는 사이 바뀜(VERSION_CONFLICT)은 저장 직후 hook이 바로 띄워요. 이 도구로 넘기지 않아요.

지킬 것
- 아니요·취소하기·선택 창 Esc는 그 프롬프트로 시작한 작업 하나에만 적용돼요. 새 프롬프트에서 다시 결정 사항과 다르게 만들게 되면 1부터 다시 해요.
- 사람이 "40자로 작업해 줘"처럼 어떻게 할지 다시 말할 때만 그대로 진행해요. "계속해 줘"처럼 분명하지 않으면 작업하지 않고 기다려요.
- 저장하지 않았으면 결정 사항과 다른 값으로 코드를 쓰지 않아요.
- 잠긴 결정 사항은 고치지 않고 사람에게 알려요.`;

export const showStandardCheck = defineTool({
  name: 'show_standard_check',
  title: '결정 사항 확인 화면',
  description: DESCRIPTION,
  inputSchema: showStandardCheckInput,
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: () => ({ ok: true }),
});
