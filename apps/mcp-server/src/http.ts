/**
 * Streamable HTTP로 MCP를 받는 서버예요. 팀원은 HTTPS 주소 하나로 붙어요.
 *
 * 왜 웹 표준 fetch 함수 하나로 만들었나요:
 * Node(src/index.ts), Vercel, Cloudflare 같은 곳은 모두 `fetch(request) → response` 모양을 받아요.
 * 그래서 어디에 올리든 이 파일은 그대로 두고, 올리는 곳에 맞는 입구만 하나 더 만들면 돼요.
 *
 * 요청 하나가 거치는 순서:
 *   /health → 상태만 알려 줌 (토큰 필요 없음, 호스팅의 상태 확인용)
 *   /mcp    → Origin 확인 → 토큰 확인(auth.ts) → MCP 처리(SDK createMcpHandler, 요청마다 서버 새로 만듦)
 */
import {
  createMcpHandler,
  localhostAllowedOrigins,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import { createLogger, getDataMode, loadEnv } from '@sil/core/node';
import {
  authenticate,
  parseTokens,
  readUser,
  type TokenEntry,
} from './auth.ts';
import { assertUniqueToolNames, createServer } from './server.ts';
import { SERVER_INFO } from './server-info.ts';

const log = createLogger('mcp');

export const MCP_PATH = '/mcp';

export interface HttpAppOptions {
  /** 받아 줄 토큰. 비우면 .env의 SIL_MCP_TOKENS를 써요 (검사 스크립트가 임시 토큰을 넣을 때) */
  tokens?: TokenEntry[];
}

export interface HttpApp {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
  /** 받아 주는 토큰 수. 0이면 localhost에서 온 요청만 받아요 */
  tokenCount: number;
}

export function createHttpApp(options: HttpAppOptions = {}): HttpApp {
  assertUniqueToolNames();
  const env = loadEnv();
  const tokens = options.tokens ?? parseTokens(env.SIL_MCP_TOKENS);
  // Claude Code는 Origin을 보내지 않아요. Origin이 있으면 브라우저라서 허락한 곳만 받아요 (DNS rebinding 막기).
  const allowedOrigins = [
    ...localhostAllowedOrigins(),
    ...splitList(env.SIL_MCP_ALLOWED_ORIGINS),
  ];

  const mcp = createMcpHandler(
    ({ authInfo }) =>
      createServer({
        client: authInfo?.clientId ?? 'local',
        user:
          typeof authInfo?.extra?.user === 'string'
            ? authInfo.extra.user
            : null,
      }),
    {
      onerror: (error) =>
        log.error('MCP 요청 처리 오류', { message: error.message }),
    },
  );

  return {
    tokenCount: tokens.length,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/health' && request.method === 'GET') {
        return Response.json({
          ok: true,
          server: SERVER_INFO,
          dataMode: getDataMode(),
        });
      }
      if (pathname !== MCP_PATH) {
        return Response.json(
          { error: { message: `MCP 주소는 ${MCP_PATH}예요.` } },
          { status: 404 },
        );
      }
      const rejectedOrigin = originValidationResponse(request, allowedOrigins);
      if (rejectedOrigin) return rejectedOrigin;
      const auth = authenticate(request, tokens);
      if (!auth.ok) return auth.response;
      return mcp.fetch(request, {
        authInfo: {
          token: '',
          clientId: auth.client,
          scopes: [],
          extra: { user: readUser(request) },
        },
      });
    },
    close: () => mcp.close(),
  };
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
