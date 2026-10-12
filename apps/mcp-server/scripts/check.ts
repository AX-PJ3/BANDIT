/**
 * `pnpm mcp:check` — Claude Code 없이 MCP 서버가 HTTP로 켜지고 답하는지 확인해요.
 *
 *   pnpm mcp:check                         임시 토큰으로 이 컴퓨터에서 서버를 잠깐 켜서 확인 (CI도 이걸로)
 *   pnpm mcp:check --url https://…/mcp     올린 서버를 확인. 토큰은 .env의 SIL_MCP_TOKEN (pnpm mcp:register와 같은 값)
 *
 * 토큰은 명령줄로 받지 않아요. pnpm이 실행하는 명령을 화면(과 CI 로그)에 그대로 찍어서 토큰이 보이거든요.
 *
 * 실제와 같은 길(Streamable HTTP + 토큰)로 확인해요.
 * - (올린 서버만) 주소가 https인지, /health가 답하는지
 * - 토큰 없이 부르면 거절되는지 (401). 올린 서버가 403이면 서버에 SIL_MCP_TOKENS를 안 넣은 거예요
 * - 도구 목록과 ping이 오는지
 * - 데이터베이스가 연결돼 있으면 목차(get_index)까지 읽어 봐요. 읽기만 하고 쓰지 않아요.
 *
 * 이 검사가 통과하면 서버는 정상이고, 남은 문제는 올린 곳(HTTPS)이나 등록(`pnpm mcp:register`) 쪽이에요.
 * CI에서도 같은 검사를 돌려서 "서버가 안 켜지는 PR"이 합쳐지지 않게 해요.
 */
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { parseArgs } from 'node:util';
import { serve } from '@hono/node-server';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { loadEnv } from '@sil/core/node';
import { parseTokens } from '../src/auth.ts';
import { createHttpApp, MCP_PATH } from '../src/http.ts';

/** 무료 호스팅은 쉬다가 첫 요청에 깨어나느라 1분 가까이 걸리기도 해요 */
const HEALTH_TIMEOUT_MS = 90_000;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
  },
  allowPositionals: true,
});
const deployed = values.url !== undefined;

const client = new Client({ name: 'sil-mcp-check', version: '0.0.0' });
let stopLocal: (() => Promise<void>) | undefined;
try {
  let url: URL;
  let token: string;
  if (deployed) {
    url = parseDeployedUrl(values.url ?? '');
    token = loadEnv().SIL_MCP_TOKEN ?? '';
    if (!token)
      throw new Error(
        '팀 토큰이 없어요. .env의 SIL_MCP_TOKEN에 넣어 주세요 (명령줄로는 받지 않아요. pnpm이 명령을 화면에 찍어서 토큰이 보여요).',
      );
    await checkHealth(url);
  } else {
    const local = await startLocalServer();
    ({ url, token } = local);
    stopLocal = local.stop;
  }
  await checkMcp(url, token);
  if (deployed) {
    console.log(
      `✔ 올린 서버가 정상이에요. 팀원은 pnpm mcp:register --url ${url.href} 로 등록해요.`,
    );
  }
} catch (error) {
  console.error('✖ MCP 서버 확인 실패');
  console.error(error instanceof Error ? error.message : error);
  console.error(
    deployed
      ? '도움말: 호스팅의 서버 로그(stderr)를 함께 봐 주세요. 설정은 apps/mcp-server/README.md의 "올리기" 절에 있어요.'
      : '도움말: 위 로그의 첫 오류를 보고, 해결이 안 되면 README의 "막히면" 절을 봐 주세요.',
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  await stopLocal?.();
}

/** 임시 토큰을 하나 만들어 이 컴퓨터에서 서버를 켜요. 끝나면 stop()으로 꺼요. */
async function startLocalServer(): Promise<{
  url: URL;
  token: string;
  stop: () => Promise<void>;
}> {
  const token = randomBytes(24).toString('base64url');
  const app = createHttpApp({ tokens: parseTokens(`check:${token}`) });
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  if (!server.listening) await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: new URL(`http://127.0.0.1:${port}${MCP_PATH}`),
    token,
    stop: async () => {
      await app.close();
      server.close();
    },
  };
}

function parseDeployedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `주소를 읽지 못했어요: '${raw}'. 예: --url https://sil.example.com${MCP_PATH}`,
    );
  }
  // http로 보내면 팀 토큰이 그대로 보여요. 내 컴퓨터에서 켠 서버만 http를 허락해요.
  if (url.protocol !== 'https:' && !LOCAL_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `올린 서버 주소는 https여야 해요 (${url.href}). http로 보내면 팀 토큰이 그대로 보여서, 토큰을 보내기 전에 멈췄어요.`,
    );
  }
  if (url.pathname !== MCP_PATH) {
    throw new Error(
      `MCP 주소는 ${MCP_PATH}로 끝나요 (${url.href}). 예: --url ${url.origin}${MCP_PATH}`,
    );
  }
  return url;
}

/** /health는 토큰 없이 답해요. 서버가 켜졌는지, 어느 버전인지, DB 설정이 들어갔는지 봐요. */
async function checkHealth(mcpUrl: URL): Promise<void> {
  const healthUrl = new URL('/health', mcpUrl);
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `${healthUrl.href}에 닿지 않아요 (${error instanceof Error ? error.message : String(error)}). 주소와 호스팅 상태를 확인해 주세요.`,
      { cause: error },
    );
  }
  const text = await response.text();
  let body: {
    ok?: unknown;
    server?: { name?: string; version?: string };
    dataMode?: string;
  } = {};
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    // 호스팅의 오류 화면(HTML)일 수 있어요. 아래에서 HTTP 상태와 함께 알려요.
  }
  if (!response.ok || body.ok !== true) {
    throw new Error(
      `/health가 정상이 아니에요 (HTTP ${response.status}). 서버가 켜지지 않았거나, 0.0.0.0이 아니라 127.0.0.1로 열렸을 수 있어요 (SIL_MCP_HOST).`,
    );
  }
  console.log(
    `✔ /health 응답 (${Date.now() - startedAt}ms): ${body.server?.name ?? '?'} ${body.server?.version ?? '?'}, 데이터베이스 설정 ${body.dataMode === 'database' ? '있음' : '없음'}`,
  );
}

async function checkMcp(url: URL, token: string): Promise<void> {
  const startedAt = Date.now();
  const anonymous = await postToolsList(url);
  if (anonymous.status === 403 && deployed) {
    throw new Error(
      '토큰 없는 요청이 401이 아니라 403으로 막혔어요. 서버 환경 변수 SIL_MCP_TOKENS가 비어 있으면 밖에서 온 요청을 모두 이렇게 막아요.',
    );
  }
  if (anonymous.status !== 401)
    throw new Error(
      `토큰 없는 요청이 거절되지 않았어요 (HTTP ${anonymous.status})`,
    );
  if ((await postToolsList(url, token)).status === 401) {
    throw new Error(
      '팀 토큰이 맞지 않아요 (401). 서버의 SIL_MCP_TOKENS에 있는 토큰인지 확인해 주세요.',
    );
  }

  await client.connect(
    new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Sil-User': 'mcp-check',
        },
      },
    }),
  );
  const { tools } = await client.listTools();
  const ping = await client.callTool({ name: 'ping', arguments: {} });
  if (ping.isError)
    throw new Error(`ping 도구가 실패했어요: ${JSON.stringify(ping.content)}`);
  const pingResult = JSON.parse(textOf(ping.content)) as {
    database: { connected: boolean; note?: string };
  };

  console.log(
    `✔ MCP 서버가 HTTP로 답해요 (${Date.now() - startedAt}ms, ${url.href})`,
  );
  console.log('✔ 토큰 없는 요청은 거절돼요 (401)');
  console.log(
    `✔ 도구 ${tools.length}개: ${tools.map((tool) => tool.name).join(', ')}`,
  );
  console.log('✔ ping 응답 받음');

  if (pingResult.database.connected) {
    const index = await client.callTool({ name: 'get_index', arguments: {} });
    if (index.isError)
      throw new Error(`get_index가 실패했어요: ${textOf(index.content)}`);
    const { total } = JSON.parse(textOf(index.content)) as { total: number };
    console.log(`✔ 데이터베이스 연결됨: 결정 사항 ${total}개`);
  } else {
    console.log(
      `– 데이터베이스는 확인하지 않았어요: ${pingResult.database.note ?? '연결 안 됨'}`,
    );
  }
}

/** MCP 클라이언트 없이 tools/list를 한 번 보내 HTTP 상태만 봐요 (토큰 확인용) */
async function postToolsList(url: URL, token?: string): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  await response.body?.cancel();
  return response;
}

function textOf(content: unknown): string {
  const first = Array.isArray(content)
    ? (content[0] as { text?: unknown } | undefined)
    : undefined;
  return typeof first?.text === 'string' ? first.text : '';
}
