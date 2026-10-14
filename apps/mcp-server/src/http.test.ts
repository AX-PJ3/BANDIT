/**
 * HTTP 서버를 네트워크 없이 끝까지 돌려 봐요: 토큰 확인 → MCP 클라이언트 연결 → 도구 호출 → core → (가짜) DB.
 * SQL 규칙(형식 검사, 잠금, 버전 충돌, 삭제 막기)은 supabase/tests/wiki.test.sql이 실제 Postgres에서 검사해요.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { getDataMode, setDbForTesting } from '@sil/core/node';
import { createFakeDb, standardRows } from '@sil/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTokens } from './auth.ts';
import { createHttpApp, type HttpApp } from './http.ts';
import { clearInstructionsCache } from './instructions.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const BASE = 'http://localhost:3333';

const coupon = standardRows({
  id: 'order.coupon.nullable',
  area: '주문',
  versions: [
    { title: '쿠폰 값은 항상 있다', value: 'coupon 칸은 항상 값이 있다' },
    {
      title: '쿠폰 값은 비어 있을 수 있다',
      value: 'coupon 칸은 null일 수 있다',
      scope: {
        code: ['src/order/**'],
        api: ['GET /orders/:id'],
        screen: ['주문 상세'],
      },
    },
  ],
});
const alwaysOn = standardRows({
  id: 'wiki.save.required-fields',
  area: '위키',
  alwaysOn: true,
  versions: [
    {
      title: '이유 없는 결정 사항은 저장하지 않는다',
      value: '이유, 근거, 적용 범위가 없으면 저장을 거절한다',
      scope: { code: ['supabase/migrations/**'], api: [], screen: [] },
    },
  ],
});

let app: HttpApp;
let clients: Client[] = [];

beforeEach(() => {
  clearInstructionsCache();
  app = createHttpApp({ tokens: parseTokens(`team-a:${TOKEN}`) });
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  clients = [];
  await app.close();
  setDbForTesting(undefined);
});

function post(headers: Record<string, string> = {}, path = '/mcp') {
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }),
  );
}

async function connect(
  headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` },
) {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers },
      fetch: (url, init) => app.fetch(new Request(url, init)),
    }),
  );
  clients.push(client);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const first = (result.content as { type: string; text?: string }[])[0];
  return first?.text ?? '';
}

describe('들어오는 길 막기', () => {
  it('/health는 토큰 없이 상태만 알려 줘요', async () => {
    const response = await app.fetch(new Request(`${BASE}/health`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      server: { name: 'haribo' },
    });
  });

  it('토큰이 없거나 틀리면 401', async () => {
    expect((await post()).status).toBe(401);
    expect(
      (await post({ Authorization: 'Bearer wrong-token-0123456789abcdef' }))
        .status,
    ).toBe(401);
  });

  it('브라우저(Origin)에서 온 낯선 요청은 403', async () => {
    expect(
      (
        await post({
          Authorization: `Bearer ${TOKEN}`,
          Origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
  });

  it('토큰을 하나도 안 넣은 서버는 localhost에서 온 요청만 받아요', async () => {
    const local = createHttpApp({ tokens: [] });
    const remote = await local.fetch(
      new Request('https://sil.example.com/mcp', {
        method: 'POST',
        body: '{}',
        headers: { host: 'sil.example.com' },
      }),
    );
    expect(remote.status).toBe(403);
    await local.close();
  });

  it('토큰 형식이 틀리면 켜지기 전에 알려 줘요', () => {
    expect(() => parseTokens('team-a:short')).toThrow(/너무 짧아요/);
    expect(() => parseTokens(`Team A:${TOKEN}`)).toThrow(/이름은/);
    expect(() => parseTokens(`a:${TOKEN},a:${TOKEN}x`)).toThrow(/두 번/);
  });
});

describe('MCP 도구 (가짜 DB)', () => {
  beforeEach(() => {
    const fake = createFakeDb(
      {
        standards: [coupon.standard, alwaysOn.standard],
        standard_versions: [...coupon.versions, ...alwaysOn.versions],
        standards_latest: [coupon.latest, alwaysOn.latest],
      },
      (name, args) => ({
        data: {
          standardId: args.p_id,
          version: 3,
          isRevert: false,
          revertedToVersion: null,
          previousValue: 'coupon 칸은 null일 수 있다',
          savedAt: '2026-10-09T07:48:40.698Z',
          called: name,
        },
        error: null,
      }),
    );
    setDbForTesting(fake.client);
    rpcCalls = fake.rpcCalls;
  });
  let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  it('위키 도구 5개, 알리기 도구 2개, ping이 보이고, 안내문에 항상 적용되는 결정 사항이 들어가요 (wiki.mcp.five-tools)', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [
        'get_index',
        'get_standard',
        'ping',
        'revert',
        'save_standard',
        'search_standards',
        'list_pending',
        'respond',
      ].sort(),
    );
    expect(client.getInstructions()).toContain(
      'wiki.save.required-fields (v1)',
    );
  });

  it('search_standards: 고치려는 파일 경로로 결정 사항을 찾아요', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'search_standards',
      arguments: { codePath: 'src/order/api.ts' },
    });
    expect(JSON.parse(text(result))).toMatchObject({
      count: 1,
      standards: [
        {
          id: 'order.coupon.nullable',
          version: 2,
          matchedCode: ['src/order/**'],
        },
      ],
    });
  });

  it('get_standard: 없는 결정 사항은 찾아보라고 알려 줘요', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'get_standard',
      arguments: { id: 'order.coupon.missing' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/NOT_FOUND.*search_standards/);
  });

  it('save_standard: 이유가 비면 DB까지 가지 않고 거절해요 (SIL-19 확인 방법)', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: 'coupon 칸은 빈 문자열일 수 있다',
        reason: ' ',
        alwaysOn: false,
        evidence: 'PR #13',
        scope: { code: ['src/order/**'] },
        baseVersion: 2,
      },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/이유/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('save_standard: 저장하면 X-Sil-User를 고친 사람으로, AI가 고친 것으로 남겨요', async () => {
    const client = await connect({
      Authorization: `Bearer ${TOKEN}`,
      'X-Sil-User': 'jm@example.com',
    });
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: 'coupon 칸은 빈 문자열일 수 있다',
        reason: '앱이 빈 문자열을 보냄',
        alwaysOn: false,
        evidence: 'PR #13',
        scope: { code: ['src/order/**'] },
        baseVersion: 2,
      },
    });
    expect(result.isError).toBeFalsy();
    const saved = JSON.parse(text(result));
    expect(saved.changelogLine).toBe(
      '2026-10-09 16:48 | jm@example.com | order.coupon.nullable 2→3 | coupon 칸은 null일 수 있다 → coupon 칸은 빈 문자열일 수 있다 | 앱이 빈 문자열을 보냄 | AI 대화',
    );
    expect(saved.changelog).toMatch(/team-wiki\/CHANGELOG\.md/);
    expect(saved).not.toHaveProperty('warnings');
    expect(rpcCalls[0]).toMatchObject({
      name: 'save_standard',
      args: {
        p_changed_by: 'jm@example.com',
        p_actor: 'ai',
        p_source: 'ai_chat',
        p_always_on: false,
        p_scope: { code: ['src/order/**'], api: [], screen: [], doc: [] },
        p_ai_detected: false,
      },
    });
  });

  it('save_standard: AI가 찾았나(aiDetected)를 DB 함수까지 넘겨요 (SIL-66 에이전트 경로 T1)', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: 'coupon 칸은 빈 문자열일 수 있다',
        reason: '앱이 빈 문자열을 보냄',
        alwaysOn: false,
        baseVersion: 2,
        source: 'ai_chat',
        aiDetected: true,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(rpcCalls[0]?.args).toMatchObject({
      p_source: 'ai_chat',
      p_ai_detected: true,
      p_evidence: null,
    });
  });

  it('save_standard: 항상 적용이 비면 DB까지 가지 않고 거절해요 (SIL-65 필수 5개)', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: 'coupon 칸은 빈 문자열일 수 있다',
        reason: '앱이 빈 문자열을 보냄',
        baseVersion: 2,
      },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/항상 적용/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('save_standard: 칸을 아예 빼도 빠진 칸을 한국어로 한 번에 알려 줘요 (SIL-65 조건 6)', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: { value: 'coupon 칸은 빈 문자열일 수 있다', alwaysOn: false },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/결정 사항 ID\(id\)가 비어 있어요/);
    expect(text(result)).toMatch(/제목\(title\)이\(가\) 비어 있어요/);
    expect(text(result)).toMatch(/이유\(reason\)이\(가\) 비어 있어요/);
    expect(text(result)).toMatch(/결정 사항 버전\(baseVersion\)이 비어 있어요/);
    expect(text(result)).not.toMatch(/expected/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('revert: 되돌아갈 버전과 이유를 빼면 한국어로 알려 주고 되돌리지 않아요', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'revert',
      arguments: { id: 'order.coupon.nullable', baseVersion: 2 },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/되돌아갈 버전\(toVersion\)이 비어 있어요/);
    expect(text(result)).toMatch(/되돌리는 이유\(reason\)이\(가\) 비어 있어요/);
    expect(text(result)).not.toMatch(/expected/);
    expect(rpcCalls).toHaveLength(0);
  });

  it('save_standard: 근거와 적용 범위가 없어도 저장해요 (SIL-65)', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: 'coupon 칸은 빈 문자열일 수 있다',
        reason: '앱이 빈 문자열을 보냄',
        alwaysOn: false,
        baseVersion: 2,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(rpcCalls[0]?.args).toMatchObject({
      p_evidence: null,
      p_scope: null,
    });
  });

  it('save_standard: check_wiki.py와 같은 문장 경고를 돌려주지만 저장은 막지 않아요', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'save_standard',
      arguments: {
        id: 'order.coupon.nullable',
        title: '쿠폰 값은 비어 있을 수 있다',
        value: '쿠폰 값은 비어 있을 수 있고, 그리고 비면 쿠폰 없음을 보여 준다',
        reason: '앱이 빈 값을 보냄',
        alwaysOn: false,
        baseVersion: 2,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result)).warnings).toEqual([
      "값에 '그리고'가 있어요. 규칙이 두 개라면 결정 사항을 나눠요 (wiki.standard.one-rule)",
    ]);
  });

  it('get_index: 항상 적용 목록과 전체 목록을 돌려줘요 (SIL-65)', async () => {
    const client = await connect();
    const index = JSON.parse(
      text(await client.callTool({ name: 'get_index', arguments: {} })),
    );
    expect(index.alwaysOn).toEqual([
      {
        id: 'wiki.save.required-fields',
        title: '이유 없는 결정 사항은 저장하지 않는다',
      },
    ]);
    expect(index.standards).toEqual([
      {
        id: 'order.coupon.nullable',
        area: '주문',
        title: '쿠폰 값은 비어 있을 수 있다',
      },
      {
        id: 'wiki.save.required-fields',
        area: '위키',
        title: '이유 없는 결정 사항은 저장하지 않는다',
      },
    ]);
  });

  it('X-Sil-User가 없으면 팀 이름(토큰 이름)을 고친 사람으로 남겨요', async () => {
    const client = await connect();
    await client.callTool({
      name: 'revert',
      arguments: {
        id: 'order.coupon.nullable',
        toVersion: 1,
        reason: '되돌리기로 함',
        baseVersion: 2,
      },
    });
    expect(rpcCalls[0]).toMatchObject({
      name: 'revert_standard',
      args: { p_changed_by: 'team-a', p_to_version: 1 },
    });
  });

  it('데모: 알림 제목 v1 읽기 → v2 저장 → v1로 되돌리기를 도구로 차례로 해요 (SIL-65 조건 10)', async () => {
    const titleLength = standardRows({
      id: 'app.notify.title-length',
      area: 'app',
      versions: [
        {
          title: '앱 알림 제목은 40자 이하다',
          value:
            'Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
        },
      ],
    });
    const fake = createFakeDb(
      {
        standards: [titleLength.standard],
        standard_versions: titleLength.versions,
        standards_latest: [titleLength.latest],
      },
      (name, args) => ({
        data: {
          standardId: args.p_id,
          version: name === 'save_standard' ? 2 : 3,
          isRevert: name === 'revert_standard',
          revertedToVersion: name === 'revert_standard' ? 1 : null,
          previousValue:
            name === 'save_standard'
              ? 'Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다'
              : '공백 포함 32자 이하',
          savedAt: '2026-10-09T07:48:40.698Z',
        },
        error: null,
      }),
    );
    setDbForTesting(fake.client);
    // 한글 이름은 헤더에 그대로 못 넣어서 퍼센트 인코딩해서 보내요 (pnpm mcp:register와 같게)
    const client = await connect({
      Authorization: `Bearer ${TOKEN}`,
      'X-Sil-User': encodeURIComponent('부건'),
    });

    const v1 = JSON.parse(
      text(
        await client.callTool({
          name: 'get_standard',
          arguments: { id: 'app.notify.title-length' },
        }),
      ),
    );
    expect(v1).toMatchObject({
      currentVersion: 1,
      standard: { alwaysOn: false },
    });
    expect(v1.versions[0].value).toBe(
      'Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
    );

    const saved = JSON.parse(
      text(
        await client.callTool({
          name: 'save_standard',
          arguments: {
            id: 'app.notify.title-length',
            title: '앱 알림 제목은 32자 이하로 쓴다',
            value: '공백 포함 32자 이하',
            reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
            alwaysOn: v1.standard.alwaysOn,
            baseVersion: v1.currentVersion,
          },
        }),
      ),
    );
    expect(saved).toMatchObject({ version: 2, message: '저장했어요 (v2).' });
    expect(saved.changelogLine).toBe(
      '2026-10-09 16:48 | 부건 | app.notify.title-length 1→2 | Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다 → 공백 포함 32자 이하 | Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림 | AI 대화',
    );

    const reverted = JSON.parse(
      text(
        await client.callTool({
          name: 'revert',
          arguments: {
            id: 'app.notify.title-length',
            toVersion: 1,
            reason: '데모 되돌리기',
            baseVersion: 2,
          },
        }),
      ),
    );
    expect(reverted).toMatchObject({
      version: 3,
      isRevert: true,
      revertedToVersion: 1,
    });

    expect(
      fake.rpcCalls.map(({ name, args }) => [
        name,
        args.p_base_version,
        args.p_changed_by,
      ]),
    ).toEqual([
      ['save_standard', 1, '부건'],
      ['revert_standard', 2, '부건'],
    ]);
  });

  it('관계있다고 답한 결정 사항을 그 사람의 안내문에만 넣어요 (notify.answer.next-run-context)', async () => {
    const answered = (who: string, issueKey: string, status: string) => ({
      answered_by: who,
      standard_id: 'order.coupon.nullable',
      version: 2,
      issue_key: issueKey,
      issue_status: status,
      answered_at: '2026-10-13T06:00:00+00:00',
    });
    setDbForTesting(
      createFakeDb({
        standards_latest: [coupon.latest, alwaysOn.latest],
        affected_checks: [
          answered('민수', '#5', 'in_progress'),
          answered('신지', '#7', 'done'),
        ],
      }).client,
    );
    const minsu = await connect({
      Authorization: `Bearer ${TOKEN}`,
      'X-Sil-User': encodeURIComponent('민수'),
    });
    expect(minsu.getInstructions()).toContain(
      '내가 "관계있다"고 답한 바뀐 결정 사항',
    );
    expect(minsu.getInstructions()).toContain(
      '- order.coupon.nullable (v2): coupon 칸은 null일 수 있다 (이슈 #5)',
    );
    // 완료된 이슈는 다음 작업이 없어서 넣지 않아요
    const sinji = await connect({
      Authorization: `Bearer ${TOKEN}`,
      'X-Sil-User': encodeURIComponent('신지'),
    });
    expect(sinji.getInstructions()).not.toContain('관계있다');
    const anonymous = await connect();
    expect(anonymous.getInstructions()).not.toContain('관계있다');
    expect(anonymous.getInstructions()).toContain(
      'wiki.save.required-fields (v1)',
    );
  });

  it('ping: 누구로 들어왔는지와 DB 연결을 알려 줘요', async () => {
    const client = await connect({
      Authorization: `Bearer ${TOKEN}`,
      'X-Sil-User': 'jm@example.com',
    });
    const result = JSON.parse(
      text(await client.callTool({ name: 'ping', arguments: {} })),
    );
    expect(result).toMatchObject({
      client: 'team-a',
      user: 'jm@example.com',
      database: { connected: true, standardCount: 2 },
    });
  });
});

describe('DB 없이 켰을 때', () => {
  it.skipIf(getDataMode() !== 'none')(
    '위키 도구는 DB를 연결하라고 알려 주고, 서버는 그대로 켜져 있어요',
    async () => {
      const client = await connect();
      expect(client.getInstructions()).toContain(
        '데이터베이스가 아직 연결되지 않아',
      );
      const result = await client.callTool({
        name: 'get_index',
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/DB_NOT_CONFIGURED.*SUPABASE_URL/);
    },
  );
});
