import { revertStandard } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { CHANGELOG_HINT } from './save-standard.ts';
import {
  baseVersionSchema,
  requiredText,
  sourceSchema,
  standardIdSchema,
  whenMissing,
} from './shared.ts';

export const revert = defineTool({
  name: 'revert',
  title: '결정 사항 되돌리기',
  description:
    '결정 사항을 앞선 버전의 내용으로 되돌려요. 되돌림도 지우지 않고 새 버전으로 쌓여요. ' +
    'get_standard로 버전 기록을 보고, 되돌릴 버전(toVersion)과 지금 버전(baseVersion), 되돌리는 이유를 넣어요.',
  inputSchema: z.object({
    id: standardIdSchema,
    toVersion: z
      .number(
        whenMissing(
          '되돌아갈 버전(toVersion)이 비어 있어요. get_standard의 버전 기록에서 되돌아갈 버전 번호를 골라 넣어요',
        ),
      )
      .int()
      .min(1)
      .describe('되돌아갈 버전'),
    reason: requiredText('되돌리는 이유(reason)'),
    baseVersion: baseVersionSchema,
    evidence: z
      .string()
      .trim()
      .optional()
      .describe('근거. 비우면 "vN로 되돌림"으로 남아요'),
    source: sourceSchema,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  handler: async (input, context) => {
    const result = await revertStandard({
      ...input,
      changedByActor: 'ai',
      changedBy: context.user ?? context.client,
    });
    return {
      ...result,
      message: `v${result.revertedToVersion}의 내용으로 되돌렸어요 (v${result.version}).`,
      changelog: CHANGELOG_HINT,
    };
  },
});
