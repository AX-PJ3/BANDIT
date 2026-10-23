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
import * as webData from '@sil/core/data';
import { setDbForTesting } from '@sil/core/node';
import { buildPendingList, loadNotifyData } from '@sil/notify/browser';
import { createFakeDb, type FakeDb } from '@sil/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTokens } from './auth.ts';
import { createHttpApp, type HttpApp } from './http.ts';
import { clearInstructionsCache } from './instructions.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const BASE = 'http://localhost:3333';
const STANDARD = 'app.notify.title-length';
/** 예시 데이터는 10/13에 답한 변경이라, 7일 안에 들도록 지금 시각을 10/16으로 고정해요 (notify.list.closed-7-days) */
const NOW = '2026-10-16T00:00:00+00:00';

function versionRow(version: number, value: string, changedBy: string) {
  return {
    standard_id: STANDARD,
    version,
    title: `앱 알림 제목은 ${value}로 쓴다`,
    value,
    reason: version === 1 ? '알림 창에서 잘린다' : 'Windows 알림 창에서 잘림',
    always_on: false,
    evidence: null,
    scope: null as Record<string, string[]> | null,
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

/** save_reflected를 흉내 내요. DB처럼 받은 사람·답한 변경만 받아요 (notify.check.reflected) */
function fakeSaveReflected(
  tables: ReturnType<typeof demoTables>,
  args: Record<string, unknown>,
) {
  const row = tables.pending_checks.find(
    (c) => c.id === args.p_pending_check_id,
  );
  if (!row || row.recipient !== args.p_marked_by) {
    return {
      data: null,
      error: {
        message: '받은 사람만 반영함을 표시할 수 있어요.',
        hint: 'FORBIDDEN',
      },
    };
  }
  if (row.status !== 'answered') {
    return {
      data: null,
      error: {
        message: '답한 확인할 변경에만 반영함을 표시할 수 있어요.',
        hint: 'VALIDATION_FAILED',
      },
    };
  }
  const reflected = args.p_reflected === true;
  Object.assign(row, {
    reflected,
    reflected_at: reflected
      ? (row.reflected_at ?? '2026-10-15T03:00:00+00:00')
      : null,
  });
  return {
    data: { pendingCheckId: row.id, reflected, reflectedAt: row.reflected_at },
    error: null,
  };
}

/** 민수님이 c-5에 답한 기록 (answer_records 보기의 한 줄) */
function answerRecordRow(affected: boolean) {
  return {
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
    affected,
    known: affected ? false : null,
    elapsed_seconds: null,
    unaffected_reason: affected ? null : '화면 문구만 다루는 이슈라 관계없음',
    rework_note: null,
    channel: 'terminal',
  };
}

let app: HttpApp;
let clients: Client[] = [];
let fake: FakeDb;

/** save_answer를 흉내 내요. 대기가 아니면 DB처럼 PENDING_CLOSED로 거절해요 */
function installFakeDb(tables = demoTables()) {
  fake = createFakeDb(tables, (name, args) => {
    if (name === 'save_reflected') return fakeSaveReflected(tables, args);
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
  // 날짜만 고정하고 기다리기 타이머는 실제로 둬요
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  clearInstructionsCache();
  app = createHttpApp({ tokens: parseTokens(`team-a:${TOKEN}`) });
  installFakeDb();
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  clients = [];
  await app.close();
  setDbForTesting(undefined);
  vi.useRealTimers();
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
    expect(labels('relation')).toEqual(['관계있다', '관계없다', '잘 모르겠다']);
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

describe('웹 앱과 같은 목록 (SIL-100)', () => {
  it('같은 DB 데이터로 웹 방식(@sil/core/data + @sil/notify/browser)과 list_pending이 같은 목록을 돌려줘요', async () => {
    const tables = demoTables();
    tables.pending_checks = [
      checkRow('c-5', '민수', '#5', 'answered'),
      checkRow('c-5-v3', '민수', '#5', 'pending', 3, 2),
    ];
    tables.standard_versions.push(versionRow(3, '공백 포함 30자 이하', '정민'));
    installFakeDb(tables);

    const terminal = (
      await call(await connectAs('민수'), 'list_pending', {
        includeClosed: true,
      })
    ).json() as { items: Record<string, unknown>[] };
    const web = buildPendingList(await loadNotifyData(webData, '민수'), {
      recipient: '민수',
      includeClosed: true,
    });

    // list_pending은 질문(questions)을 더 붙여요. 그것만 빼면 같아야 해요
    const withoutQuestions = terminal.items.map(
      ({ questions: _questions, ...rest }) => rest,
    );
    expect(withoutQuestions).toEqual(JSON.parse(JSON.stringify(web.items)));
    expect(web.items).toHaveLength(2);
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
      // 데모 예시에는 적용 범위가 없어서, 없다고 말한 뒤 제목과 값으로 찾게 해요 (SIL-98)
      scopeCheck: {
        standardId: STANDARD,
        version: 2,
        title: '앱 알림 제목은 공백 포함 32자 이하로 쓴다',
        value: '공백 포함 32자 이하',
        scope: null,
        guide: expect.stringContaining(
          '바뀐 결정 사항에 적용 범위가 적혀 있지 않아 다른 곳을 찾지 못했어요. 필요하신 경우 제목과 값으로 코드를 찾아볼게요.',
        ),
      },
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

  it('관계있다면 그 버전의 적용 범위를 단서로 함께 줘요 (SIL-98)', async () => {
    const tables = demoTables();
    const scope = {
      code: ['apps/web/src/notify/**'],
      api: [],
      screen: ['앱 알림'],
      doc: [],
    };
    tables.standard_versions = tables.standard_versions.map((row) =>
      row.version === 2 ? { ...row, scope } : row,
    );
    installFakeDb(tables);
    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      affected: true,
      known: false,
    });
    expect(result.json().scopeCheck).toMatchObject({ version: 2, scope });
    // 다른 곳을 알려 주는 표 모양과 없을 때 고정 문장 (부건님 SIL-98 의견 2, 3)
    const guide = (result.json().scopeCheck as { guide: string }).guide;
    expect(guide).toContain('"위치 | 코드 | 지금 값"');
    expect(guide).toContain('"고치려면 말씀해 주세요."');
    expect(guide).toContain('"외 N곳"');
    expect(guide).toContain(
      '"적용 범위 안에서 바뀐 변경사항과 다른 곳은 없어요."',
    );
    // 경로를 못 찾으면 말하고, 사람이 원할 때만 찾아봐요 (notify.answer.scope-missing v2)
    expect(guide).toContain('적힌 경로 <경로>를 찾지 못했어요. 필요하신 경우');
    expect(guide).toContain('사람이 찾아 달라고 할 때만');
    // list_pending에도 같은 적용 범위가 들어 있어요 (화면에는 그리지 않고 AI에게만). 방금 답해서 닫힌 것까지 봐요
    const list = await call(await connectAs('민수'), 'list_pending', {
      includeClosed: true,
    });
    expect(list.json().items).toMatchObject([{ standard: { scope } }]);
  });

  it('관계없다면 적용 범위 단서를 주지 않아요', async () => {
    const result = await call(await connectAs('신지'), 'respond', {
      pendingCheckId: 'c-7',
      affected: false,
      unaffectedReason: '내 작업 범위가 아니에요',
    });
    expect(result.json().scopeCheck).toBeUndefined();
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

  it('잘 모르겠다는 DB에 아무것도 쓰지 않고 대기로 남겨요 (notify.answer.unsure-later)', async () => {
    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
      unsure: true,
    });
    expect(result.json()).toEqual({
      ok: true,
      unsure: true,
      pendingCheckId: 'c-5',
      issueKey: '#5',
    });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('잘 모르겠다도 다른 사람의 변경에는 쓸 수 없어요', async () => {
    const result = await call(await connectAs('부건'), 'respond', {
      pendingCheckId: 'c-5',
      unsure: true,
    });
    expect(result.json()).toMatchObject({ ok: false, code: 'not_recipient' });
  });

  it('관계도 잘 모르겠다도 없으면 빠진 칸을 알려 줘요', async () => {
    const result = await call(await connectAs('민수'), 'respond', {
      pendingCheckId: 'c-5',
    });
    expect(result.json()).toMatchObject({
      ok: false,
      code: 'missing_fields',
      missingFields: ['affected'],
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

describe('mark_reflected (SIL-93)', () => {
  function answeredTables(affected: boolean) {
    const tables = demoTables();
    tables.pending_checks = [checkRow('c-5', '민수', '#5', 'answered')];
    tables.answer_records = [answerRecordRow(affected)];
    return tables;
  }

  it('관계있다로 답한 변경에 이슈 반영을 표시하고, list_pending에도 보여요', async () => {
    installFakeDb(answeredTables(true));
    const minsu = await connectAs('민수');

    const result = await call(minsu, 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: true,
    });
    expect(result.json()).toEqual({
      ok: true,
      pendingCheckId: 'c-5',
      issueKey: '#5',
      standardId: STANDARD,
      reflected: true,
      reflectedAt: '2026-10-15T03:00:00+00:00',
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'save_reflected',
        args: {
          p_pending_check_id: 'c-5',
          p_marked_by: '민수',
          p_reflected: true,
        },
      },
    ]);

    const list = await call(minsu, 'list_pending', { includeClosed: true });
    expect(list.json().items).toMatchObject([
      {
        pendingCheckId: 'c-5',
        reflected: true,
        reflectedAt: '2026-10-15T03:00:00+00:00',
      },
    ]);
  });

  it('서버 안내문이 사람이 말했을 때만 표시하라고 알려요', async () => {
    const minsu = await connectAs('민수');
    expect(minsu.getInstructions()).toContain(
      '"이슈에 반영했어요"라고 말하면 mark_reflected로 표시해요',
    );
  });

  it('표시를 풀 수 있어요', async () => {
    const tables = answeredTables(true);
    Object.assign(tables.pending_checks[0]!, {
      reflected: true,
      reflected_at: '2026-10-15T03:00:00+00:00',
    });
    installFakeDb(tables);

    const result = await call(await connectAs('민수'), 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: false,
    });
    expect(result.json()).toMatchObject({
      ok: true,
      reflected: false,
      reflectedAt: null,
    });
  });

  it('관계없다로 답한 변경이면 DB까지 가지 않고 이유를 알려 줘요 (notify.check.reflected v2)', async () => {
    installFakeDb(answeredTables(false));
    const result = await call(await connectAs('민수'), 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: true,
    });
    expect(result.json()).toMatchObject({ ok: false, code: 'not_affected' });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('아직 답하지 않은 변경이면 먼저 답하라고 알려 줘요', async () => {
    const result = await call(await connectAs('민수'), 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: true,
    });
    expect(result.json()).toMatchObject({ ok: false, code: 'not_answered' });
    expect(result.json().message).toContain('먼저 관계있다/관계없다로 답해');
    expect(fake.rpcCalls).toEqual([]);
  });

  it('다른 사람에게 온 변경은 내 목록에 없어서 표시할 수 없어요', async () => {
    installFakeDb(answeredTables(true));
    const result = await call(await connectAs('신지'), 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: true,
    });
    expect(result.json()).toMatchObject({ ok: false, code: 'not_found' });
    expect(fake.rpcCalls).toEqual([]);
  });

  it('검사 뒤 DB가 거절하면 거절 문장을 그대로 전해요 (notify.error.not-empty)', async () => {
    const tables = answeredTables(true);
    installFakeDb(tables);
    const minsu = await connectAs('민수');
    // 검사는 통과했는데 저장 순간 다른 곳에서 상태가 바뀐 경우를 흉내 내요
    fake = createFakeDb(tables, () => ({
      data: null,
      error: {
        message:
          '답한 확인할 변경에만 반영함을 표시할 수 있어요 (지금 상태: 대체됨).',
        hint: 'VALIDATION_FAILED',
      },
    }));
    setDbForTesting(fake.client);

    const result = await call(minsu, 'mark_reflected', {
      pendingCheckId: 'c-5',
      reflected: true,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      '[VALIDATION_FAILED] 답한 확인할 변경에만 반영함을 표시할 수 있어요 (지금 상태: 대체됨).',
    );
  });
});
