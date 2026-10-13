import { buildPendingList } from '@sil/notify';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { loadNotifyData, requireUser } from './shared.ts';

export const listPendingTool = defineTool({
  name: 'list_pending',
  title: '나에게 온 변경 보기',
  description:
    '나(X-Sil-User)에게 온 확인할 변경 목록을 봐요. 세션을 시작했을 때와 사람이 "나에게 온 변경"을 물을 때 불러요. ' +
    '항목마다 결정 사항 제목, 이전 값과 지금 값, 이유, 바꾼 사람과 시각, 내 이슈가 들어 있어서 get_standard를 다시 부르지 않아도 돼요. ' +
    '대기 중인 것이 최신순으로 오고, pendingCount가 답할 개수예요. 한 번에 하나씩 보여 주고 respond로 답을 받아요. ' +
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
    return buildPendingList(data, { recipient, includeClosed });
  },
});
