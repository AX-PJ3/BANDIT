import { saveReflected } from '@sil/core/node';
import { checkReflect } from '@sil/notify';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { loadNotifyData, requireUser } from './shared.ts';

/**
 * 이슈 반영 표시 (SIL-93, notify.check.reflected, data.pending.reflected).
 * 담당자가 "작업에 반영했어요"라고 말하면 에이전트가 이 도구로 표시를 저장해요.
 * AI가 코드를 보고 반영했는지 판단하지 않아요. 사람이 말한 것만 저장해요.
 *
 * 관계있다로 답했는지는 @sil/notify의 checkReflect가 먼저 봐요. 받은 사람·답한 변경 규칙은 DB 함수 save_reflected도 한 번 더 봐요.
 * DB가 거절하면 defineTool이 거절 문장을 그대로 돌려줘요 (notify.error.not-empty).
 */
export const markReflectedTool = defineTool({
  name: 'mark_reflected',
  title: '이슈 반영 표시하기',
  description:
    '내가 관계있다로 답한 확인할 변경을 내 이슈 결과물(코드, 디자인 등)에 반영했다고 표시(이슈 반영)하거나, 그 표시를 풀어요. ' +
    '사람이 "이슈 반영"을 입력해 hooks가 띄운 질문에서 골랐을 때, 또는 "이슈에 반영했어요"처럼 직접 말했을 때만 불러요. 코드를 보고 반영했다고 짐작해서 부르지 않아요. ' +
    '어느 변경인지 모르면 list_pending(includeClosed: true)으로 답한 변경을 찾아 pendingCheckId를 넣어요. 여러 개면 사람에게 어느 것인지 물어요. ' +
    '표시를 풀어도 이슈는 다시 열리지 않아요. ok가 false거나 오류가 나면 message를 그대로 보여 줘요.',
  inputSchema: z.object({
    pendingCheckId: z
      .string()
      .trim()
      .min(1)
      .describe('list_pending 항목의 pendingCheckId'),
    reflected: z
      .boolean()
      .describe('작업에 반영했다면 true, 표시를 풀려면 false'),
  }),
  handler: async (input, context) => {
    const markedBy = requireUser(context);
    const data = await loadNotifyData(markedBy);
    const check = data.pendingChecks.find((c) => c.id === input.pendingCheckId);
    const answer = data.answers.find(
      (a) => a.pendingCheckId === input.pendingCheckId,
    );
    const checked = checkReflect(check, answer, { ...input, markedBy });
    if (!checked.ok) return checked;

    const saved = await saveReflected({ ...input, markedBy });
    return {
      ok: true,
      pendingCheckId: saved.pendingCheckId,
      issueKey: check?.issueKey ?? null,
      standardId: check?.standardId ?? null,
      reflected: saved.reflected,
      reflectedAt: saved.reflectedAt,
    };
  },
});
