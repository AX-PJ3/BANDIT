import { buildWikiIndex, listStandards } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';

/** 목차 보기 (위키 관리 원칙 1: 목차부터 보여 줘요) */
export const getIndex = defineTool({
  name: 'get_index',
  title: '위키 목차 보기',
  description:
    '팀 위키의 목차를 봐요. 항상 적용되는 결정 사항 목록, 사용 중인 결정 사항 전체 목록(ID, 영역, 제목), 영역마다 결정 사항 수와 한 줄 요약을 돌려줘요. ' +
    '작업을 시작할 때 먼저 부르고, 관련 있는 영역은 search_standards로 찾아 들어가요.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async () => ({
    ...buildWikiIndex(await listStandards()),
    next: '관련 결정 사항은 search_standards(keyword, area, codePath)로 찾고, 자세한 내용은 get_standard로 봐요.',
  }),
});
