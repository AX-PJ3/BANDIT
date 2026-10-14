import { buildPendingList, questionsFor } from '@sil/notify';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { loadNotifyData, requireUser } from './shared.ts';

export const listPendingTool = defineTool({
  name: 'list_pending',
  title: '나에게 온 변경 보기',
  description:
    '나(X-Sil-User)에게 온 확인할 변경 목록을 봐요. 사람이 작업을 시작할 때 그 일보다 먼저, 그리고 사람이 "나에게 온 변경"을 물을 때 불러요. ' +
    '항목마다 결정 사항 제목, 이전 값과 지금 값, 이유, 바꾼 사람과 시각, 내 이슈가 들어 있어서 get_standard를 다시 부르지 않아도 돼요. ' +
    '대기 중인 것이 최신순으로 오고, pendingCount가 답할 개수예요. 한 번에 하나씩 보여 주고 답을 받은 뒤 다음으로 넘어가요. ' +
    '대기 항목에는 questions가 있어요. 변경 내용을 보여 준 바로 뒤에 AskUserQuestion으로 questions.relation을 묻고, ' +
    '고른 답에 따라 questions.known 또는 questions.reason을 이어서 물어요. question, header, options의 글자는 바꾸지 않고 그대로 써요. ' +
    '고른 답으로 respond를 불러요 (관계없다의 이유는 고른 보기의 label, 직접 쓴 글이면 그 글). ' +
    'previousAnswer.affected가 true면 "지난번 변경을 반영하셨다면 다시 고쳐야 해요"를 함께 알려 줘요.',
  inputSchema: z.object({
    includeClosed: z
      .boolean()
      .default(false)
      .describe(
        'true면 이미 답한 변경과 새 버전으로 대체된 변경도 함께 돌려줘요 (닫힌 지 7일 이내). 보통은 false',
      ),
  }),
  annotations: { readOnlyHint: true },
  handler: async ({ includeClosed }, context) => {
    const recipient = requireUser(context);
    const data = await loadNotifyData(recipient);
    const list = buildPendingList(data, { recipient, includeClosed });
    // 대기 항목에만 물을 질문을 붙여요. 문구는 @sil/notify 한곳에 있어요 (notify.answer.two-questions)
    return {
      ...list,
      items: list.items.map((item) =>
        item.status === 'pending'
          ? { ...item, questions: questionsFor(item) }
          : item,
      ),
    };
  },
});
