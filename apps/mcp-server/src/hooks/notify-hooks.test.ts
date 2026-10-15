/**
 * 터미널 알림 hooks를 서버 주소(/hooks/<이벤트>)부터 화면 글까지 확인해요 (SIL-67).
 * 데이터는 착수 안내 데모 예시예요: 부건님이 app.notify.title-length를 40자에서 32자로 바꿔 #5(민수), #7(신지)에 알림이 생긴 상태.
 * 데이터는 @sil/notify의 메모리 저장소로 만들고, 실제 저장 규칙(DB 함수)은 supabase/tests가 검사해요.
 */
import {
  MemoryStore,
  applyNewVersion,
  respond,
  stripAnsi,
  type NotifyData,
  type StandardVersionRecord,
} from '@sil/notify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTokens } from '../auth.ts';
import { createHttpApp, type HttpApp } from '../http.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const BASE = 'http://localhost:3333';
const STANDARD = 'app.notify.title-length';
const NOW = new Date('2026-10-14T06:00:00Z');

const v1: StandardVersionRecord = {
  standardId: STANDARD,
  version: 1,
  title: '앱 알림 제목은 40자 이하로 쓴다',
  value: '공백 포함 40자 이하',
  reason: '40자를 넘으면 잘린다',
  changedBy: '호윤',
  changedAt: '2026-10-08T09:00:00Z',
  source: 'wiki',
  aiDetected: false,
  isRevert: false,
};
const v2: StandardVersionRecord = {
  ...v1,
  version: 2,
  title: '앱 알림 제목은 32자 이하로 쓴다',
  value: '공백 포함 32자 이하',
  reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
  changedBy: '부건',
  changedAt: '2026-10-14T05:13:00Z',
  source: 'ai_chat',
};

let store: MemoryStore;
let app: HttpApp;
let failLoad = false;

async function demoStore(): Promise<MemoryStore> {
  const memory = new MemoryStore({
    issues: [
      {
        key: '#5',
        title: '담당자에게 알리고 답 기록하기',
        assignee: '민수',
        status: 'in_progress',
        standardIds: [STANDARD],
      },
      {
        key: '#7',
        title: '앱 알림과 나에게 온 변경 화면',
        assignee: '신지',
        status: 'in_progress',
        standardIds: [STANDARD],
      },
    ],
    standardVersions: [v1],
    pendingChecks: [],
    answers: [],
  });
  let n = 0;
  await applyNewVersion(memory, v2, {
    now: v2.changedAt,
    makeId: () => `c-${++n}`,
  });
  return memory;
}

beforeEach(async () => {
  store = await demoStore();
  failLoad = false;
  app = createHttpApp({
    tokens: parseTokens(`team-a:${TOKEN}`),
    hooks: {
      load: async (): Promise<NotifyData> => {
        if (failLoad) throw new Error('DB에 못 붙음');
        return store.read();
      },
      now: () => NOW,
    },
  });
});

afterEach(async () => {
  await app.close();
});

async function hook(
  event: string,
  body: Record<string, unknown> = {},
  user: string | null = '민수',
  token: string | null = TOKEN,
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (user) headers['x-sil-user'] = encodeURIComponent(user);
  const response = await app.fetch(
    new Request(`${BASE}/hooks/${event}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as {
    systemMessage?: string;
    hookSpecificOutput?: { additionalContext: string };
    error?: { message: string };
  };
  return {
    status: response.status,
    json,
    screen: stripAnsi(json.systemMessage ?? ''),
    context: json.hookSpecificOutput?.additionalContext ?? '',
  };
}

describe('들어오는 길', () => {
  it('토큰이 없으면 401', async () => {
    expect((await hook('session-start', {}, '민수', null)).status).toBe(401);
  });

  it('이름(X-Sil-User)이 없으면 400으로 다시 설치하라고 알려 줘요', async () => {
    const result = await hook('session-start', {}, null);
    expect(result.status).toBe(400);
    expect(result.json.error?.message).toMatch(/pnpm mcp:register --user/);
  });

  it('없는 이벤트는 404', async () => {
    expect((await hook('unknown')).status).toBe(404);
  });
});

describe('① 켤 때 (session-start)', () => {
  it('답할 변경이 있으면 켤 때 알림을 돌려줘요', async () => {
    const result = await hook('session-start', { session_id: 's1' });
    expect(result.status).toBe(200);
    expect(result.screen).toContain('  [app] 결정 사항이 1건 변경되었어요.');
  });

  it('바꾼 부건님에게는 아무것도 띄우지 않아요', async () => {
    expect((await hook('session-start', {}, '부건')).json).toEqual({});
  });

  it('불러오지 못하면 "변경 없음" 대신 실패를 알려요 (notify.error.no-block-retry)', async () => {
    failLoad = true;
    const result = await hook('session-start');
    expect(result.screen).toContain(
      '서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.',
    );
  });
});

describe('② 작업을 입력할 때 (prompt-submit)', () => {
  it('첫 변경 상세를 띄우고, Claude에게 질문 순서를 알려 줘요', async () => {
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '로그인 화면 문구 고쳐 줘',
    });
    expect(result.screen).toContain('작업 전에 확인할 변경이 1건 있어요 ');
    expect(result.screen).toContain('  변경  40자 ⭢ 32자');
    expect(result.context).toContain('mcp__haribo__list_pending');
    expect(result.context).toContain('mcp__haribo__respond');
    // 서버 안내문 8번의 표와 겹치지 않게 표를 다시 그리지 말라고 해요
    expect(result.context).toContain('표로 보여 주기');
  });

  it('같은 세션에서 이미 물었는데 남아 있으면 입력 때는 아무것도 안 띄우고, 작업을 마친 뒤 한 줄을 띄워요 (SIL-80 B5, notify.terminal.new-after-answered v2)', async () => {
    await hook('prompt-submit', { session_id: 's1', prompt: '작업 1' });
    const second = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '작업 2',
    });
    expect(second.json.systemMessage).toBeUndefined();
    expect(second.context).toContain('사용자가 질문을 닫았다');
    expect(second.context).toContain('사용자의 요청을 그대로 처리한다');
    const done = await hook('after-work', { session_id: 's1' });
    expect(done.screen).toBe(
      '\n  확인할 변경 1건 · "결정 사항 확인"을 입력하면 변경 내역을 볼 수 있어요.',
    );
  });

  it('작업을 마친 뒤 한 줄은 이번 세션에서 물은 적이 있고 대기가 남았을 때만 띄워요', async () => {
    // 아직 묻지 않은 세션: 다음 입력 때 상세를 띄우니 조용히 있어요
    expect((await hook('after-work', { session_id: 's9' })).json).toEqual({});
    // 다 답한 세션: 남은 게 없어요
    await hook('prompt-submit', { session_id: 's1', prompt: '작업' });
    await respond(
      store,
      {
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected: true,
        known: true,
        channel: 'terminal',
      },
      { now: '2026-10-14T05:20:00Z' },
    );
    expect((await hook('after-work', { session_id: 's1' })).json).toEqual({});
    // 다 답한 뒤 새 변경이 오면 작업을 마친 뒤 한 줄로 알려요 (B5)
    await applyNewVersion(
      store,
      {
        ...v2,
        version: 3,
        value: '공백 포함 30자 이하',
        changedAt: '2026-10-14T05:40:00Z',
      },
      { now: '2026-10-14T05:40:00Z', makeId: () => 'c-9' },
    );
    expect((await hook('after-work', { session_id: 's1' })).screen).toContain(
      '확인할 변경 1건 · "결정 사항 확인"',
    );
  });

  it('"결정 사항 확인"을 입력하면 다시 상세와 질문을 띄우고, 끝나도 작업을 시작하지 않게 해요', async () => {
    await hook('prompt-submit', { session_id: 's1', prompt: '작업 1' });
    const recall = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '결정 사항 확인',
    });
    expect(recall.screen).toContain('확인할 변경이 1건 있어요 ');
    expect(recall.screen).not.toContain('작업 전에');
    expect(recall.context).toContain('따로 처리할 요청이 없다');
  });

  it('새 세션이면 처음처럼 다시 물어요', async () => {
    await hook('prompt-submit', { session_id: 's1', prompt: '작업 1' });
    const other = await hook('prompt-submit', {
      session_id: 's2',
      prompt: '작업 1',
    });
    expect(other.screen).toContain('작업 전에 확인할 변경이 1건 있어요 ');
  });

  it('답할 변경이 없으면 아무것도 띄우지 않고, "결정 사항 확인"이면 없다고 알려요', async () => {
    expect(
      (
        await hook(
          'prompt-submit',
          { session_id: 's1', prompt: '작업' },
          '부건',
        )
      ).json,
    ).toEqual({});
    const recall = await hook(
      'prompt-submit',
      { session_id: 's1', prompt: '결정 사항 확인' },
      '부건',
    );
    expect(recall.screen).toContain('✓ 확인할 변경이 없어요.');
  });

  it('불러오지 못하면 실패를 알리고 요청은 그대로 처리하게 해요', async () => {
    failLoad = true;
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '작업',
    });
    expect(result.screen).toContain(
      '"결정 사항 확인"을 입력하면 다시 시작해요.',
    );
    expect(result.context).toContain('사용자의 요청을 그대로 처리한다');
  });
});

describe('답한 뒤 (after-respond)', () => {
  it('기록 줄과 마무리 한 줄을 띄워요', async () => {
    await hook('prompt-submit', { session_id: 's1', prompt: '작업' });
    await respond(
      store,
      {
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected: true,
        known: false,
        channel: 'terminal',
      },
      { now: '2026-10-14T05:20:00Z' },
    );
    const result = await hook('after-respond', {
      session_id: 's1',
      tool_name: 'mcp__haribo__respond',
      tool_input: { pendingCheckId: 'c-1', affected: true, known: false },
      tool_response: [
        { type: 'text', text: JSON.stringify({ ok: true, answerId: 'a-1' }) },
      ],
    });
    expect(result.screen).toContain('✓ 기록했어요  #5 · 관계있다 · 몰랐다');
    expect(result.screen).toContain('다음 작업부터 바뀐 결정 사항을 따라요.');
    expect(result.screen).toContain(
      '확인할 변경을 모두 답했어요. 이제 작업을 시작할게요.',
    );
  });

  it('남은 변경이 있으면 다음 변경 상세를 이어서 띄워요', async () => {
    // 민수님에게 다른 결정 사항 변경이 하나 더 온 상태를 만들어요
    const data = await store.read();
    data.issues[0]!.standardIds.push('notify.terminal.one-change');
    data.standardVersions.push({
      ...v1,
      standardId: 'notify.terminal.one-change',
      title: '터미널 알림은 변경을 하나씩 보여 준다',
      value: '한 화면에 하나만 보여 준다',
    });
    await store.write(data);
    await applyNewVersion(
      store,
      {
        ...v2,
        standardId: 'notify.terminal.one-change',
        title: '터미널 알림은 변경을 하나씩 보여 준다',
        value: '한 화면에 둘까지 보여 준다',
        changedAt: '2026-10-14T05:30:00Z',
      },
      { now: '2026-10-14T05:30:00Z', makeId: () => 'c-9' },
    );

    const first = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '작업',
    });
    expect(first.screen).toContain('작업 전에 확인할 변경이 2건 있어요 ');
    // 최신 것(c-9)이 먼저 와요
    await respond(store, {
      pendingCheckId: 'c-9',
      answeredBy: '민수',
      affected: false,
      unaffectedReason: '내 작업 범위가 아니에요',
      channel: 'terminal',
    });
    const after = await hook('after-respond', {
      session_id: 's1',
      tool_input: { pendingCheckId: 'c-9' },
    });
    expect(after.screen).toContain(
      '✓ 기록했어요  #5 · 관계없다 · 내 작업 범위가 아니에요',
    );
    expect(after.screen).toContain('확인할 변경이 1건 남았어요 ');
    expect(after.screen).toContain(' 2/2 ');
  });

  it('되돌려서 자동으로 닫혔으면 그 한 줄을 띄워요 (notify.pending.closed-while-open-notice)', async () => {
    await applyNewVersion(
      store,
      { ...v1, version: 3, changedBy: '정민', isRevert: true },
      { now: '2026-10-14T05:40:00Z' },
    );
    const result = await hook('after-respond', {
      session_id: 's1',
      tool_input: { pendingCheckId: 'c-1' },
      tool_response: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              code: 'already_closed',
              closedStatus: 'auto_closed',
            }),
          },
        ],
      },
    });
    expect(result.screen).toContain(
      '✓ #5 변경이 되돌려졌어요. 하려던 작업을 계속 진행하시면 돼요.',
    );
  });

  it('빠진 칸 때문에 기록되지 않았으면 아무것도 띄우지 않아요 (Claude가 다시 물어요)', async () => {
    const result = await hook('after-respond', {
      session_id: 's1',
      tool_input: { pendingCheckId: 'c-1' },
      tool_response: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, code: 'missing_fields' }),
        },
      ],
    });
    expect(result.json).toEqual({});
  });
});

describe('이슈 반영 (SIL-93, 부건님 10/15 시안)', () => {
  /** 민수님이 c-1(#5)에 관계있다·몰랐다로 답한 상태 */
  async function answerAffected(affected = true) {
    await respond(
      store,
      {
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected,
        known: affected ? false : null,
        unaffectedReason: affected ? null : '내 작업 범위가 아니에요',
        channel: 'terminal',
      },
      { now: '2026-10-14T05:20:00Z' },
    );
  }

  it('"이슈 반영"을 입력했는데 관계있다로 답한 변경이 없으면 없다는 한 줄을 띄워요', async () => {
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '이슈 반영',
    });
    expect(result.screen).toContain('✓ 이슈 반영할 변경이 없어요.');
    expect(result.screen).toContain(
      '관계있다로 답한 변경만 이슈 반영으로 등록할 수 있어요.',
    );
    expect(result.context).toContain('글을 쓰지 않고 끝낸다');
  });

  it('관계없다로 답한 변경은 이슈 반영 목록에 나오지 않아요 (notify.check.reflected v2)', async () => {
    await answerAffected(false);
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '이슈 반영',
    });
    expect(result.screen).toContain('✓ 이슈 반영할 변경이 없어요.');
  });

  it('1건이면 목록을 띄우고, 바로 저장하지 않고 예/아니오로 묻게 해요', async () => {
    await answerAffected();
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '이슈 반영',
    });
    expect(result.screen).toContain('-- 관계있다로 답한 변경이 1건 있어요 ');
    expect(result.screen).toContain('[app] 앱 알림 제목은 32자 이하로 쓴다');
    expect(result.screen).toContain('  변경  40자 ⭢ 32자');
    expect(result.screen).toContain('  이슈  #5 담당자에게 알리고 답 기록하기');
    expect(result.context).toContain('mcp__haribo__mark_reflected');
    const questions = JSON.parse(
      result.context.slice(result.context.indexOf('questions: ') + 11),
    ) as {
      header: string;
      multiSelect: boolean;
      options: { label: string; pendingCheckId: string }[];
    }[];
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      question: '이 변경을 이슈에 반영했나요?',
      header: '#5',
      multiSelect: false,
    });
    expect(questions[0]?.options.map((o) => o.label)).toEqual([
      '이슈에 반영했어요',
      '아직 안 했어요',
    ]);
    expect(questions[0]?.options[0]?.pendingCheckId).toBe('c-1');
  });

  it('이미 이슈 반영으로 표시한 변경은 다시 나오지 않아요', async () => {
    await answerAffected();
    const data = await store.read();
    await store.write({
      ...data,
      pendingChecks: data.pendingChecks.map((c) =>
        c.id === 'c-1'
          ? { ...c, reflected: true, reflectedAt: '2026-10-14T05:30:00Z' }
          : c,
      ),
    });
    const result = await hook('prompt-submit', {
      session_id: 's1',
      prompt: '이슈 반영',
    });
    expect(result.screen).toContain('✓ 이슈 반영할 변경이 없어요.');
  });

  it('이슈 반영할 변경이 남았으면 작업을 입력할 때 안내 한 줄을 세션마다 한 번만 띄워요', async () => {
    await answerAffected();
    const first = await hook('prompt-submit', {
      session_id: 's2',
      prompt: '로그인 화면 고쳐 줘',
    });
    expect(first.screen).toContain(
      '확인한 결정 사항을 이슈에도 반영했다면, "이슈 반영"을 입력해 주세요.',
    );
    expect(first.context).toContain(
      '이슈 반영 안내 한 줄은 hooks가 이미 보여 줬다',
    );
    const second = await hook('prompt-submit', {
      session_id: 's2',
      prompt: '버튼 색도 바꿔 줘',
    });
    expect(second.json).toEqual({});
    // 새 세션이면 다시 한 번
    const other = await hook('prompt-submit', {
      session_id: 's3',
      prompt: '작업',
    });
    expect(other.screen).toContain('"이슈 반영"을 입력해 주세요.');
  });

  it('이번 세션에 "이슈 반영"을 이미 입력했으면 안내 한 줄을 띄우지 않아요', async () => {
    await answerAffected();
    await hook('prompt-submit', { session_id: 's2', prompt: '이슈 반영' });
    const next = await hook('prompt-submit', {
      session_id: 's2',
      prompt: '작업',
    });
    expect(next.json).toEqual({});
  });

  it('닫고 넘어간 뒤 입력하면 이슈 반영 안내 한 줄만 띄워요', async () => {
    // #5에 관계있다로 답한 뒤 같은 결정 사항이 다시 바뀌어 새 확인할 변경이 생긴 경우
    await answerAffected();
    await applyNewVersion(
      store,
      {
        ...v2,
        version: 3,
        value: '공백 포함 30자 이하',
        changedAt: '2026-10-14T05:40:00Z',
      },
      { now: '2026-10-14T05:40:00Z', makeId: () => 'c-9' },
    );
    const detail = await hook('prompt-submit', {
      session_id: 's4',
      prompt: '작업 1',
    });
    // 상세를 띄우는 차례에는 안내 한 줄을 띄우지 않아요 (방금 답할 변경은 아직 반영 전이라서)
    expect(detail.screen).toContain('작업 전에 확인할 변경이 1건 있어요');
    expect(detail.screen).not.toContain('"이슈 반영"을 입력해 주세요.');
    const skipped = await hook('prompt-submit', {
      session_id: 's4',
      prompt: '작업 2',
    });
    // 닫고 넘어간 한 줄은 작업을 마친 뒤 띄우니, 입력 때는 이슈 반영 안내 한 줄만 나와요
    expect(skipped.screen).not.toContain('"결정 사항 확인"');
    expect(skipped.screen).toContain('"이슈 반영"을 입력해 주세요.');
    expect(skipped.context).toContain('사용자의 요청을 그대로 처리한다');
  });

  it('mark_reflected 뒤에는 "✓ 이슈에 반영했어요" 한 줄을 띄우고, 표시를 풀면 아무것도 띄우지 않아요', async () => {
    await answerAffected();
    const marked = await hook('after-reflect', {
      session_id: 's1',
      tool_name: 'mcp__haribo__mark_reflected',
      tool_input: { pendingCheckId: 'c-1', reflected: true },
      tool_response: [
        { type: 'text', text: JSON.stringify({ ok: true, reflected: true }) },
      ],
    });
    expect(marked.screen).toBe(
      '\n✓ 이슈에 반영했어요  #5 · 앱 알림 제목은 32자 이하로 쓴다',
    );
    const unmarked = await hook('after-reflect', {
      session_id: 's1',
      tool_input: { pendingCheckId: 'c-1', reflected: false },
      tool_response: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
    });
    expect(unmarked.json).toEqual({});
    const refused = await hook('after-reflect', {
      session_id: 's1',
      tool_input: { pendingCheckId: 'c-1', reflected: true },
      tool_response: [
        {
          type: 'text',
          text: JSON.stringify({ ok: false, code: 'not_affected' }),
        },
      ],
    });
    expect(refused.json).toEqual({});
  });
});
