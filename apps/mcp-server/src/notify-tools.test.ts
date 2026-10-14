/**
 * 알리기 도구(list_pending, respond)를 HTTP 서버부터 (가짜) DB까지 끝까지 돌려 봐요 (SIL-67).
 * 데이터는 착수 안내의 데모 예시예요: 부건님이 app.notify.title-length를 40자에서 32자로 바꿔서
 * 이슈 #5(민수)와 #7(신지)에 확인할 변경이 생긴 상태.
 * 확인할 변경을 만드는 규칙과 save_answer 규칙 자체는 supabase/tests/*.sql이 실제 Postgres에서 검사해요.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { setDbForTesting } from '@sil/core/node';
import { createFakeDb, type FakeDb } from '@sil/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTokens } from './auth.ts';
import { createHttpApp, type HttpApp } from './http.ts';
import { clearInstructionsCache } from './instructions.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const BASE = 'http://localhost:3333';
const STANDARD = 'app.notify.title-length';

function versionRow(version: number, value: string, changedBy: string) {
  return {
    standard_id: STANDARD,
    version,
    title: `앱 알림 제목은 ${value}로 쓴다`,
    value,
    reason: version === 1 ? '알림 창에서 잘린다' : 'Windows 알림 창에서 잘림',
    always_on: false,
    evidence: null,
    scope: null,
    changed_by: changedBy,
    changed_by_actor: 'ai',
    ai_detected: false,
    is_revert: false,
    reverted_to_version: null,
    source: 'ai_chat',
    created_at: `2026-10-13T0${version}:00:00+00:00`,
  };
}

function checkRow(
  id: string,
  recipient: string,
  issueKey: string,
  status = 'pending',
  version = 2,
  lastSeenVersion: number | null = 1,
) {
  return {
    id,
    standard_id: STANDARD,
    version,
    issue_key: issueKey,
    recipient,
    status,
    last_seen_version: lastSeenVersion,
    created_at: `2026-10-13T0${version}:00:00+00:00`,
    closed_at: status === 'pending' ? null : '2026-10-13T05:00:00+00:00',
    reflected: false,
    reflected_at: null,
  };
}

function demoTables() {
  return {
    standards: [
      {
        id: STANDARD,
        area: '앱 화면',
        title: '앱 알림 제목은 공백 포함 32자 이하로 쓴다',
        always_on: false,
        status: 'active',
        replaced_by: null,
        deprecated_reason: null,
        locked: false,
        current_version: 2,
      },
    ],
    standard_versions: [
      versionRow(1, '공백 포함 40자 이하', '호윤'),
      versionRow(2, '공백 포함 32자 이하', '부건'),
    ],
    issues: [
      {
        key: '#5',
        title: '담당자에게 알리고 답 기록하기',
        assignee: '민수',
        status: 'in_progress',
      },
      {
        key: '#7',
        title: '앱 알림과 나에게 온 변경 화면',
        assignee: '신지',
        status: 'in_progress',
      },
    ],
    issue_standards: [
      { issue_key: '#5', standard_id: STANDARD },
      { issue_key: '#7', standard_id: STANDARD },
    ],
    pending_checks: [
      checkRow('c-5', '민수', '#5'),
      checkRow('c-7', '신지', '#7'),
    ],
    answer_records: [] as Record<string, unknown>[],
  };
}

let app: HttpApp;
let clients: Client[] = [];
let fake: FakeDb;

/** save_answer를 흉내 내요. 대기가 아니면 DB처럼 PENDING_CLOSED로 거절해요 */
function installFakeDb(tables = demoTables()) {
  fake = createFakeDb(tables, (name, args) => {
    if (name !== 'save_answer') {
      return {
        data: null,
        error: { message: `${name} 없음`, code: 'PGRST202' },
      };
    }
    const row = tables.pending_checks.find(
      (c) => c.id === args.p_pending_check_id,
    );
    if (!row || row.status !== 'pending') {
      return {
        data: null,
        error: {
          message: '이미 답했거나 닫힌 변경이에요',
          hint: 'PENDING_CLOSED',
        },
      };
    }
    row.status = 'answered';
    return {
      data: {
        answerId: 'a-1',
        pendingCheckId: row.id,
        issueKey: row.issue_key,
        issueStatus: 'in_progress',
        issueReopened: false,
      },
      error: null,
    };
  });
  setDbForTesting(fake.client);
}

beforeEach(() => {
  clearInstructionsCache();
  app = createHttpApp({ tokens: parseTokens(`team-a:${TOKEN}`) });
  installFakeDb();
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  clients = [];
  await app.close();
  setDbForTesting(undefined);
});

async function connectAs(user?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
  if (user) headers['X-Sil-User'] = encodeURIComponent(user);
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

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as { type: string; text?: string }[])[0];
  const text = first?.text ?? '';
  return {
    isError: Boolean(result.isError),
    text,
    json: () => JSON.parse(text) as Record<string, unknown>,
  };
}

describe('list_pending', () => {
  it('데모 예시: 민수님에게 온 변경 하나를 화면에 필요한 칸과 함께 돌려줘요', async () => {
    const result = await call(await connectAs('민수'), 'list_pending');

    expect(result.json()).toMatchObject({
      recipient: '민수',
      pendingCount: 1,
      items: [
        {
          pendingCheckId: 'c-5',
          status: 'pending',
          standard: {
            id: STANDARD,
            title: '앱 알림 제목은 공백 포함 32자 이하로 쓴다',
            version: 2,
            value: '공백 포함 32자 이하',
            previousVersion: 1,
            previousValue: '공백 포함 40자 이하',
            changedBy: '부건',
            source: 'ai_chat',
          },
          issue: { key: '#5', title: '담당자에게 알리고 답 기록하기' },
          answer: null,
          previousAnswer: null,
        },
      ],
    });
  });

  it('대기 항목에는 AskUserQuestion으로 물을 질문 세 개가 붙어요 (notify.answer.two-questions)', async () => {
    const result = await call(await connectAs('민수'), 'list_pending');
    const [item] = result.json().items as {
      questions: Record<
        'relation' | 'known' | 'reason',
        { question: string; header: string; options: { label: string }[] }
      >;
    }[];
    const labels = (key: 'relation' | 'known' | 'reason') =>
      item!.questions[key].options.map((option) => option.label);

    expect(item!.questions.relation).toMatchObject({
      question: '이 변경이 내 이슈와 관계가 있나요?',
      header: '#5',
    });
    expect(labels('relation')).toEqual(['관계있다', '관계없다']);
    expect(labels('known')).toEqual(['알았다', '몰랐다']);
    expect(labels('reason')).toHaveLength(3);
  });

  it('답을 기다리는 변경이 있으면 안내문이 첫 요청보다 먼저 물으라고 알려요 (notify.terminal.session-start)', async () => {
    const minsu = await connectAs('민수');
    expect(minsu.getInstructions()).toContain(
      '지금 민수님에게 답을 기다리는 확인할 변경이 1개 있어요.',
    );
    expect(minsu.getInstructions()).toContain(
      '사람이 작업을 시작하면 그 일보다 먼저 list_pending을 불러요',
    );
    const bugeon = await connectAs('부건');
    expect(bugeon.getInstructions()).not.toContain(
      '답을 기다리는 확인할 변경이',
    );
  });

  it('바꾼 부건님에게는 아무것도 없어요 (notify.target.skip-author)', async () => {
    const result = await call(await connectAs('부건'), 'list_pending');
    expect(result.json()).toMatchObject({ pendingCount: 0, items: [] });
  });

  it('X-Sil-User가 없으면 누구 목록인지 몰라서 거절해요', async () => {
    const result = await call(await connectAs(), 'list_pending');
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/FORBIDDEN.*X-Sil-User/);
  });

  it('이전 버전에 관계있다고 답했으면 previousAnswer로 알려 줘요 (SIL-77)', async () => {
    const tables = demoTables();
    tables.standard_versions.push(versionRow(3, '공백 포함 30자 이하', '정민'));
    tables.pending_checks = [
      checkRow('c-5', '민수', '#5', 'answered'),
      checkRow('c-5-v3', '민수', '#5', 'pending', 3, 2),
    ];
    tables.answer_records = [
      {
        answer_id: 'a-0',
        answered_at: '2026-10-13T04:00:00+00:00',
        standard_id: STANDARD,
        version: 2,
        previous_value: '공백 포함 40자 이하',
        value: '공백 포함 32자 이하',
        changed_by: '부건',
        changed_by_actor: 'ai',
        ai_detected: false,
        evidence: null,
        issue_key: '#5',
        answered_by: '민수',
        affected: true,
        known: false,
        elapsed_seconds: null,
        unaffected_reason: null,
        rework_note: null,
        channel: 'terminal',
      },
    ];
    installFakeDb(tables);

    const result = await call(await connectAs('민수'), 'list_pending');
    const items = result.json().items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      pendingCheckId: 'c-5-v3',
      standard: { version: 3, previousValue: '공백 포함 32자 이하' },
      previousAnswer: { version: 2, affected: true, known: false },
    });
  });
});

describe('respond', () => {
  it('관계있다·몰랐다를 터미널 답으로 저장하고, 다시 읽을 결정 사항을 알려 줘요', async () => {
    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
      known: false,
    });

    expect(result.json()).toEqual({
      ok: true,
      answerId: 'a-1',
      pendingCheckId: 'c-5',
      issueKey: '#5',
      rereadStandardId: STANDARD,
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'save_answer',
        args: expect.objectContaining({
          p_pending_check_id: 'c-5',
          p_answered_by: '민수',
          p_affected: true,
          p_known: false,
          p_unaffected_reason: null,
          p_channel: 'terminal',
        }),
      },
    ]);
  });

  it('관계없다는 이유를 저장하고, 알았나는 비워요', async () => {
    await call(await connectAs('신지'), 'respond', {
      pendingCheckId: 'c-7',
      affected: false,
      known: true,
      unaffectedReason: ' 화면 문구만 다루는 이슈라 관계없음 ',
    });
    expect(fake.rpcCalls[0]?.args).toMatchObject({
      p_affected: false,
      p_known: null,
      p_unaffected_reason: '화면 문구만 다루는 이슈라 관계없음',
    });
  });

  it('관계있다인데 알았나가 없으면 DB까지 가지 않고 빠진 칸을 알려 줘요', async () => {
    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
    });
    expect(result.json()).toMatchObject({
      ok: false,
      code: 'missing_fields',
      missingFields: ['known'],
    });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('다른 사람에게 온 변경에는 답할 수 없어요', async () => {
    const result = await call(await connectAs('부건'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
      known: true,
    });
    expect(result.json()).toMatchObject({ ok: false, code: 'not_recipient' });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('되돌려서 자동으로 닫힌 변경이면 closedStatus로 알려 줘요 (SIL-77)', async () => {
    const tables = demoTables();
    tables.pending_checks = [checkRow('c-5', '민수', '#5', 'auto_closed')];
    installFakeDb(tables);

    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
      known: true,
    });
    expect(result.json()).toMatchObject({
      ok: false,
      code: 'already_closed',
      closedStatus: 'auto_closed',
    });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('검사와 저장 사이에 앱에서 먼저 답했으면 이미 답했다고 알려 줘요 (notify.answer.one-place)', async () => {
    // 검사할 때는 대기였는데, 저장하는 순간 앱에서 먼저 답해서 DB가 거절하는 경우예요
    const tables = demoTables();
    fake = createFakeDb(tables, () => {
      tables.pending_checks[0]!.status = 'answered';
      return {
        data: null,
        error: {
          message: '이미 답했거나 닫힌 변경이에요',
          hint: 'PENDING_CLOSED',
        },
      };
    });
    setDbForTesting(fake.client);

    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
      known: true,
    });
    expect(result.json()).toMatchObject({
      ok: false,
      code: 'already_closed',
      closedStatus: 'answered',
    });
  });
});
