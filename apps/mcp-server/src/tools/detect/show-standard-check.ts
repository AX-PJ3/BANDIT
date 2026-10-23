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

export const showStandardCheck = defineTool({
  name: 'show_standard_check',
  title: '결정 사항 확인 화면',
  // 언제 부르는지와 넘길 값은 PR B에서 채워요. 그 전에는 CLAUDE.md T1(Bash)이 화면을 띄워서 부르지 않게 둬요
  description:
    '결정 사항 확인 화면을 띄우는 도구예요. 아직 준비 중이라 부르지 않아요.',
  inputSchema: showStandardCheckInput,
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: () => ({ ok: true }),
});
