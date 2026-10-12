import { SilError } from '@sil/core';
import { listStandards, searchStandardList } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { toSummary } from './shared.ts';

export const searchStandards = defineTool({
  name: 'search_standards',
  title: '결정 사항 찾기',
  description:
    '키워드, 영역, 코드 경로로 팀 결정 사항을 찾아요. 코드나 화면을 바꾸기 전에, 그리고 사람에게 묻기 전에 먼저 불러요. ' +
    '고치려는 파일 경로를 codePath로 넣으면 그 파일에 걸린 결정 사항을 찾아요. 결과는 결정 사항마다 ID, 제목, 값, 버전이에요.',
  inputSchema: z.object({
    keyword: z
      .string()
      .trim()
      .optional()
      .describe(
        '찾을 낱말. 띄어쓰기로 나누면 모두 들어 있는 결정 사항만 찾아요. 예: 쿠폰 null',
      ),
    area: z
      .string()
      .trim()
      .optional()
      .describe('영역 이름(get_index의 area) 또는 ID 앞부분. 예: 주문, order'),
    codePath: z
      .string()
      .trim()
      .optional()
      .describe('고치려는 파일 경로. 예: src/order/api.ts'),
    includeDeprecated: z
      .boolean()
      .default(false)
      .describe('폐기된 결정 사항도 볼지'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  annotations: { readOnlyHint: true },
  handler: async ({ includeDeprecated, ...query }) => {
    if (!query.keyword && !query.area && !query.codePath) {
      throw new SilError(
        'VALIDATION_FAILED',
        'keyword, area, codePath 중 하나는 넣어 주세요. 무엇이 있는지 모르면 get_index로 목차부터 봐요.',
      );
    }
    const hits = searchStandardList(
      await listStandards({ includeDeprecated }),
      query,
    );
    return {
      count: hits.length,
      standards: hits.map((hit) => ({
        ...toSummary(hit),
        ...(hit.matchedCode.length > 0 ? { matchedCode: hit.matchedCode } : {}),
      })),
      ...(hits.length === 0
        ? {
            next: '맞는 결정 사항이 없어요. 팀이 정해야 하는 일이면 사람에게 묻고, 답을 save_standard로 새 결정 사항(baseVersion 0)으로 저장해요.',
          }
        : {}),
    };
  },
});
