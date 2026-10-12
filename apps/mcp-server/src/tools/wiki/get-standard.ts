import { SilError } from '@sil/core';
import { getStandardHistory } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { standardIdSchema } from './shared.ts';

export const getStandard = defineTool({
  name: 'get_standard',
  title: '결정 사항 보기',
  description:
    '결정 사항 하나의 최신 내용(값, 이유, 근거, 적용 범위)과 버전 기록을 봐요. ' +
    '결정 사항을 고치거나 되돌리기 전에 꼭 불러서 currentVersion을 확인하고, 그 값을 baseVersion으로 넣어요.',
  inputSchema: z.object({
    id: standardIdSchema,
    historyLimit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe('최신부터 몇 개 버전까지 볼지'),
  }),
  annotations: { readOnlyHint: true },
  handler: async ({ id, historyLimit }) => {
    const history = await getStandardHistory(id);
    if (!history) {
      throw new SilError(
        'NOT_FOUND',
        `결정 사항 ${id}이(가) 없어요. search_standards로 비슷한 결정 사항을 찾아보세요.`,
      );
    }
    return {
      standard: history.standard,
      currentVersion: history.currentVersion,
      versions: history.versions.slice(0, historyLimit),
      totalVersions: history.versions.length,
    };
  },
});
