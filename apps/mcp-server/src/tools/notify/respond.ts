import { isSilError } from '@sil/core';
import { listPendingChecks, saveAnswer } from '@sil/core/node';
import {
  checkAnswer,
  checkUnsure,
  closedFailure,
  type RespondInput,
} from '@sil/notify';
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
    '먼저 list_pending 항목의 questions를 AskUserQuestion으로 글자 그대로 물어요: questions.relation을 묻고, 관계있다면 questions.known을, 관계없다면 questions.reason을 물어요. ' +
    '잘 모르겠다를 고르면 더 묻지 않고 unsure: true로만 불러요(affected 없이). 답으로 기록하지 않고 대기로 남겨요. ' +
    '답을 지어내지 말고 사람이 고른 그대로 넣어요. 관계없다의 이유는 고른 보기의 label을, 직접 쓴 글이면 그 글을 unaffectedReason에 넣어요. ' +
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
      .optional()
      .describe(
        '관계있다면 true, 관계없다면 false. 사람이 고른 그대로. 잘 모르겠다면 넣지 않아요',
      ),
    unsure: z
      .boolean()
      .optional()
      .describe(
        '잘 모르겠다를 골랐으면 true. 답으로 기록하지 않고 대기로 남겨요 (notify.answer.unsure-later)',
      ),
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
    if (input.unsure) {
      // 잘 모르겠다: DB에 아무것도 쓰지 않아요. 이번 세션에 다시 묻지 않는 것은 hooks가 기억해요
      const check = await findCheck(input.pendingCheckId);
      const checked = checkUnsure(check, answeredBy);
      if (!checked.ok) return checked;
      return {
        ok: true,
        unsure: true,
        pendingCheckId: input.pendingCheckId,
        issueKey: check?.issueKey ?? null,
      };
    }
    const answer: RespondInput = {
      pendingCheckId: input.pendingCheckId,
      answeredBy,
      // 비어 있으면 checkAnswer가 빠진 칸으로 알려 줘요
      affected: input.affected as boolean,
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
