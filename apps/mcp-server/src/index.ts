// MCP 서버 시작점이에요 (Node). Streamable HTTP로 http://<SIL_MCP_HOST>:<PORT>/mcp 를 열어요.
// HTTPS는 서버를 올린 곳(호스팅, 터널)이 붙여 줘요. 이 파일은 HTTP만 열어요.
import { serve } from '@hono/node-server';
import { createLogger, getDataMode, loadEnv } from '@sil/core/node';
import { createHttpApp, MCP_PATH } from './http.ts';
import { SERVER_INFO } from './server-info.ts';

const log = createLogger('mcp');
const env = loadEnv();
const app = createHttpApp();

const server = serve(
  { fetch: app.fetch, hostname: env.SIL_MCP_HOST, port: env.PORT },
  (info) => {
    const host =
      env.SIL_MCP_HOST === '0.0.0.0' ? 'localhost' : env.SIL_MCP_HOST;
    log.info(
      `${SERVER_INFO.name} MCP 서버를 켰어요: http://${host}:${info.port}${MCP_PATH}`,
      {
        dataMode: getDataMode(),
        tokens:
          app.tokenCount === 0
            ? '없음 (localhost에서 온 요청만 받아요)'
            : `${app.tokenCount}개`,
      },
    );
    // 밖에서 받도록 열었는데(호스팅) 빠진 설정이 있으면, 호스팅 로그에서 바로 보이게 알려요. 서버는 그대로 켜요.
    if (!['127.0.0.1', 'localhost', '::1'].includes(env.SIL_MCP_HOST)) {
      if (app.tokenCount === 0)
        log.warn(
          'SIL_MCP_TOKENS가 비어 있어요. 밖에서 온 요청은 모두 403으로 막아요. 팀 토큰을 넣어 주세요 (pnpm mcp:token).',
        );
      if (getDataMode() === 'none')
        log.warn(
          'SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY가 비어 있어요. 위키 도구는 "데이터베이스가 아직 연결되지 않았어요"라고 답해요 (DB_NOT_CONFIGURED).',
        );
    }
  },
);

function shutdown(): void {
  log.info('MCP 서버를 꺼요');
  void app.close().finally(() => server.close(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
