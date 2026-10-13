import { isSilError } from '@sil/core';
import { listPendingChecks, saveAnswer } from '@sil/core/node';
import { checkAnswer, closedFailure, type RespondInput } from '@sil/notify';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { requireUser, toNotifyCheck } from './shared.ts';

/** 확인할 변경 하나를 지금 상태로 다시 읽어요 */
async function findCheck(pendingCheckId: string) {
  const checks = await listPendingChecks({ status: 'all' });
  const found = checks.find((check) => check.id === pendingCheckId);
  return found ? (toNotifyCheck(found) ?? undefined) : undefined;
}

export const respondTool = defineTool({
  name: 'respond',
  title: '변경에 답하기',
  description:
    'list_pending으로 본 확인할 변경 하나에 담당자의 답을 저장해요. ' +
    '먼저 사람에게 "이 변경이 내 이슈와 관계가 있나요?"를 묻고, 관계있다면 "이 변경을 미리 알고 있었나요?"를, 관계없다면 이유 한 줄을 받아요. ' +
    '답을 지어내지 말고 사람이 고른 그대로 넣어요. ' +
    'ok가 true이고 rereadStandardId가 있으면 그 결정 사항을 get_standard로 다시 읽고 이후 작업에 따라요. ' +
    'ok가 false면 message를 그대로 보여 줘요. closedStatus가 auto_closed면 "원래대로 돌아와서 답하지 않아도 돼요"라고 알리고 다음 변경으로 넘어가요.',
  inputSchema: z.object({
    pendingCheckId: z
      .string()
      .trim()
      .min(1)
      .describe('list_pending 항목의 pendingCheckId'),
    affected: z
      .boolean()
      .describe('관계있다면 true, 관계없다면 false. 사람이 고른 그대로'),
    known: z
      .boolean()
      .optional()
      .describe(
        '관계있다일 때만: 미리 알았으면 true, 몰랐으면 false. 관계없다면 넣지 않아요',
      ),
    unaffectedReason: z
      .string()
      .optional()
      .describe('관계없다일 때만: 왜 관계없는지 사람이 쓴 한 줄 (100자 이하)'),
    elapsedSeconds: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        '변경을 보여 준 순간부터 답할 때까지 걸린 초. 모르면 넣지 않아요',
      ),
  }),
  handler: async (input, context) => {
    const answeredBy = requireUser(context);
    const answer: RespondInput = {
      pendingCheckId: input.pendingCheckId,
      answeredBy,
      affected: input.affected,
      known: input.known ?? null,
      unaffectedReason: input.unaffectedReason ?? null,
      // MCP 도구는 Claude Code 터미널에서만 불러요. 앱은 core의 saveAnswer를 바로 써요
      channel: 'terminal',
    };

    const check = await findCheck(input.pendingCheckId);
    const checked = checkAnswer(check, answer);
    if (!checked.ok) return checked;

    try {
      const saved = await saveAnswer({
        pendingCheckId: input.pendingCheckId,
        answeredBy,
        affected: checked.affected,
        known: checked.known,
        unaffectedReason: checked.unaffectedReason,
        channel: 'terminal',
        elapsedSeconds: input.elapsedSeconds ?? null,
      });
      return {
        ok: true,
        answerId: saved.answerId,
        pendingCheckId: saved.pendingCheckId,
        issueKey: saved.issueKey,
        // 관계있다면 에이전트가 바뀐 결정 사항을 다시 읽어요 (notify.answer.next-run-context)
        rereadStandardId: checked.affected ? (check?.standardId ?? null) : null,
      };
    } catch (error) {
      // 검사와 저장 사이에 다른 곳(앱)에서 먼저 답했거나 닫혔으면, 지금 상태로 알려 줘요 (notify.answer.one-place)
      if (isSilError(error) && error.code === 'PENDING_CLOSED') {
        const latest = await findCheck(input.pendingCheckId);
        if (latest && latest.status !== 'pending') {
          return closedFailure(latest.status);
        }
      }
      throw error;
    }
  },
});
