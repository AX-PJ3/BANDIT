/**
 * 새 도구를 만들 때 복사해서 쓰는 본보기예요. 이 파일 자체는 서버에 올라가지 않아요.
 *
 * 1. 이 파일을 자기 묶음 폴더로 복사해요. 예: tools/notify/list-pending.ts
 * 2. 이름, 설명, 입력 모양, handler를 채워요.
 * 3. 같은 폴더 index.ts의 tools 배열에 넣어요.
 * 4. `pnpm mcp:check`로 목록에 보이는지 확인해요.
 *
 * 데이터가 필요하면 DB를 직접 부르지 말고 @sil/core/node의 함수를 써요 (SIL-17).
 * 필요한 함수가 없으면 core에 추가하는 PR을 정민님에게 요청해요.
 */
import { NotImplementedError } from '@sil/core';
import { z } from 'zod';
import { defineTool } from '../lib/define-tool.ts';

export const exampleTool = defineTool({
  name: 'example_tool',
  title: '예시 도구',
  description:
    '무엇을 하는지, 언제 쓰는지, 무엇을 돌려주는지 AI가 알 수 있게 한두 문장으로 적어요.',
  inputSchema: z.object({
    keyword: z
      .string()
      .describe('입력 칸마다 describe로 설명을 달면 AI가 더 정확히 채워요'),
  }),
  annotations: { readOnlyHint: true },
  handler: ({ keyword }) => {
    throw new NotImplementedError(`example_tool(${keyword})`, 'SIL-xx');
  },
});
