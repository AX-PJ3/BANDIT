import { checkDbConnection, getDataMode } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import { SERVER_INFO } from '../../server-info.ts';

/**
 * 설치 확인용 도구예요. 기능이 아니라 "서버에 닿았고, 데이터베이스까지 연결됐다"를 확인하는 용도예요.
 * Claude Code에서 "haribo 서버 ping 해 줘"라고 하면 불려요.
 */
export const ping = defineTool({
  name: 'ping',
  title: '서버 상태 확인',
  description:
    'haribo MCP 서버에 닿는지, 데이터베이스가 연결됐는지, 내가 누구로 들어왔는지 확인해요. 설치를 확인할 때만 써요.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (_input, context) => {
    const dataMode = getDataMode();
    const database =
      dataMode === 'none'
        ? {
            connected: false,
            note: '서버에 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY가 없어요.',
          }
        : await checkDbConnection().then((result) =>
            result.ok
              ? { connected: true, standardCount: result.standardCount }
              : { connected: false, note: result.message },
          );
    return {
      ok: true,
      server: SERVER_INFO,
      client: context.client,
      user:
        context.user ??
        '(X-Sil-User 헤더 없음: 결정 사항을 고친 사람이 팀 이름으로 남아요)',
      database,
    };
  },
});
