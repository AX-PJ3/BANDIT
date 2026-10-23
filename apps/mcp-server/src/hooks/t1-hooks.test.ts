/**
 * T1 결정 사항 확인 hooks를 서버 주소(/hooks/<이벤트>)부터 화면 글까지 확인해요 (BDT-108).
 * 받는 이슈 읽기는 바꿔 끼우고, 화면 모양 자체는 @sil/t1 테스트가 봐요.
 */
import { stripAnsi } from '@sil/notify';
import { T1_COPY, type T1Target } from '@sil/t1';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseTokens } from '../auth.ts';
import { createHttpApp, type HttpApp } from '../http.ts';
import { isSavedResponse } from './t1-hooks.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const BASE = 'http://localhost:3333';

const PREVIEW = {
  id: 'app.notify.title-length',
  title: '앱 알림 제목은 32자 이하로 쓴다',
  value: '공백 포함 32자 이하',
  reason: 'Windows 알림 창에서 잘림',
  alwaysOn: false,
};
const CHANGE = {
  id: 'app.notify.title-length',
  title: '앱 알림 제목은 40자 이하로 쓴다',
  kind: 'change',
  why: '40자 이하로 정한 길이를 32자 이하로 다시 정해요',
};
const TARGET: T1Target = {
  key: '#5',
  assignee: '민수',
  title: '앱 알림 붙이기',
};

let app: HttpApp;
let targets: T1Target[] | null;
let loadCalls: unknown[][];
let failLoad: boolean;

beforeEach(() => {
  targets = [TARGET];
  loadCalls = [];
  failLoad = false;
  app = createHttpApp({
    tokens: parseTokens(`team-a:${TOKEN}`),
    t1Hooks: {
      loadTargets: async (...args) => {
        loadCalls.push(args);
        if (failLoad) throw new Error('DB에 못 붙음');
        return targets;
      },
    },
  });
});

afterEach(async () => {
  await app.close();
});

async function hook(
  event: string,
  body: Record<string, unknown> = {},
  token: string | null = TOKEN,
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-sil-user': encodeURIComponent('경하'),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await app.fetch(
    new Request(`${BASE}/hooks/${event}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
  const json = (await response.json()) as {
    systemMessage?: string;
    hookSpecificOutput?: {
      hookEventName: string;
      additionalContext?: string;
      permissionDecision?: string;
      permissionDecisionReason?: string;
    };
  };
  return {
    status: response.status,
    json,
    screen: stripAnsi(json.systemMessage ?? ''),
    context: json.hookSpecificOutput?.additionalContext ?? '',
  };
}

const afterT1 = (toolInput: Record<string, unknown>) =>
  hook('after-t1', { session_id: 's1', tool_input: toolInput });

describe('들어오는 길', () => {
  it('토큰이 없으면 401이에요', async () => {
    expect((await hook('after-t1', {}, null)).status).toBe(401);
  });

  it('알리기 이벤트는 그대로 알리기 hooks로 가요', async () => {
    const result = await hook('after-work');
    expect(result.status).toBe(200);
  });
});

describe('after-t1: ② 다른 결정 사항', () => {
  it('작업 중에 알아챘으면 화면을 띄우고 묻기 질문을 글자 그대로 넘겨요', async () => {
    const result = await afterT1({
      screen: 'conflicts',
      conflicts: {
        trigger: 'agent',
        request: '앱 알림 제목을 32자로 자르기',
        conflicts: [CHANGE],
      },
    });
    // 첫 줄을 비워 hook 머리글 다음 줄부터 시작해요
    expect(result.json.systemMessage?.startsWith('\n')).toBe(true);
    expect(result.screen).toContain(T1_COPY.conflicts.head.agent);
    expect(result.json.hookSpecificOutput?.hookEventName).toBe('PostToolUse');
    expect(result.context).toContain(`"question":"${T1_COPY.ask.question}"`);
    expect(result.context).toContain(T1_COPY.notChanged);
    expect(result.context).toContain('설명하는 글을 쓰지 마세요');
  });

  it('직접 요청이면 묻지 않고 이유로 가요. 되돌림이면 직접 요청이어도 먼저 물어요', async () => {
    const conflicts = {
      trigger: 'direct',
      request: '결정 사항을 32자로 바꿔 줘',
      conflicts: [{ ...CHANGE, version: 3 }],
    };
    const direct = await afterT1({ screen: 'conflicts', conflicts });
    expect(direct.screen).toContain(T1_COPY.conflicts.head.direct);
    expect(direct.context).not.toContain(T1_COPY.ask.question);
    expect(direct.context).toContain('묻지 않고');

    const revert = await afterT1({
      screen: 'conflicts',
      conflicts: {
        ...conflicts,
        revert: {
          version: 2,
          title: PREVIEW.title,
          reason: PREVIEW.reason,
          changedBy: '부건',
          createdAt: '2026-10-08T05:13:00+00:00',
        },
      },
    });
    expect(revert.screen).toContain(T1_COPY.conflicts.revert.head.direct);
    expect(revert.context).toContain(
      `"question":"${T1_COPY.direct.revertAsk}"`,
    );
  });

  it('입력이 도구 모양과 다르면 아무것도 하지 않아요 (도구가 이미 거절해요)', async () => {
    const result = await afterT1({ screen: 'conflicts', preview: PREVIEW });
    expect(result.json).toEqual({});
  });
});

describe('after-t1: ③ 등록될 모습', () => {
  it('받는 이슈를 바꾸는 사람(X-Sil-User)을 빼고 읽어 표를 채우고, 이슈가 있으면 registerWithIssues를 넘겨요', async () => {
    const result = await afterT1({ screen: 'preview', preview: PREVIEW });
    expect(loadCalls).toEqual([[PREVIEW.id, '경하']]);
    expect(result.screen).toContain(T1_COPY.preview.heading);
    expect(result.screen).toContain(`[app] ${PREVIEW.title}`);
    expect(result.screen).toContain('#5');
    expect(result.context).toContain(
      T1_COPY.preview.registerWithIssues.description,
    );
    expect(result.context).toContain(`"question":"${T1_COPY.preview.confirm}"`);
  });

  it('새 결정 사항이면 이슈를 읽지 않고 register를 넘겨요', async () => {
    const result = await afterT1({
      screen: 'preview',
      preview: { ...PREVIEW, isNew: true },
    });
    expect(loadCalls).toEqual([]);
    expect(result.screen).toContain(T1_COPY.preview.newTag);
    expect(result.context).toContain(T1_COPY.preview.register.description);
    expect(result.context).not.toContain(
      T1_COPY.preview.registerWithIssues.description,
    );
  });

  it('화면을 만들다 실패하면 Claude에게 다음 단계로 가지 말라고 알려요', async () => {
    failLoad = true;
    const result = await afterT1({ screen: 'preview', preview: PREVIEW });
    expect(result.json.systemMessage).toBeUndefined();
    expect(result.context).toContain('다음 단계로 가지 말고');
  });
});

describe('after-t1: 예외 안내', () => {
  it('되돌릴 값이 지금과 같으면 next 한 줄만 쓰라고 넘겨요', async () => {
    const result = await afterT1({
      screen: 'notice',
      notice: {
        kind: 'revertSame',
        version: 2,
        versionValue: PREVIEW.value,
        existing: {
          id: PREVIEW.id,
          title: PREVIEW.title,
          value: PREVIEW.value,
        },
      },
    });
    expect(result.screen).toContain(T1_COPY.notices.revertSame.head);
    expect(result.context).toContain(T1_COPY.notices.revertSame.next);
  });

  it('조사 실패면 멈추라고 넘겨요', async () => {
    const result = await afterT1({
      screen: 'notice',
      notice: { kind: 'searchFailed', trigger: 'agent' },
    });
    expect(result.screen).toContain(T1_COPY.notices.searchFailed.head.agent);
    expect(result.context).toContain('멈추고');
  });
});

describe('before-save: 저장 직전', () => {
  const save = { ...PREVIEW, baseVersion: 2, source: 'ai_chat' };

  it('③ 값이 없으면(③을 거치지 않은 저장) 아무것도 하지 않아요 (PR A)', async () => {
    const result = await hook('before-save', { tool_input: save });
    expect(result.json).toEqual({});
  });

  it('③과 같으면 사람에게 허락을 물어요', async () => {
    const result = await hook('before-save', {
      tool_input: save,
      t1_preview: PREVIEW,
    });
    expect(result.json.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
    });
  });

  it('③과 다르면 다른 칸을 알려 주고 막아요', async () => {
    const result = await hook('before-save', {
      tool_input: { ...save, value: '공백 포함 30자 이하', alwaysOn: true },
      t1_preview: PREVIEW,
    });
    expect(result.json.hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
    });
    expect(result.json.hookSpecificOutput?.permissionDecisionReason).toContain(
      'value, alwaysOn',
    );
  });
});

describe('after-save: 저장 직후', () => {
  const saved = {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ standardId: PREVIEW.id, version: 3 }),
      },
    ],
  };

  it('③ 값이 없으면 ④를 띄우지 않아요. 지금 T1 hook과 두 번 뜨지 않게요', async () => {
    const result = await hook('after-save', { tool_response: saved });
    expect(result.json).toEqual({});
  });

  it('③을 거쳐 저장했으면 ④ 등록 완료를 띄우고, 보낸 이슈 수를 저장 뒤에 다시 읽어요', async () => {
    const result = await hook('after-save', {
      tool_response: saved,
      t1_preview: PREVIEW,
    });
    expect(result.screen).toContain(T1_COPY.saved.head);
    expect(result.screen).toContain(T1_COPY.saved.sent.replace('{count}', '1'));
    expect(loadCalls).toEqual([[PREVIEW.id, '경하']]);
    expect(result.context).toContain(T1_COPY.saved.next.withTask);
  });

  it('그사이 바뀌어 거절됐으면 예외 7을 실패 이벤트 이름으로 띄워요', async () => {
    const result = await hook('after-save', {
      hook_event_name: 'PostToolUseFailure',
      error: '[VERSION_CONFLICT] 그사이 다른 사람이 먼저 바꿨어요',
      t1_preview: PREVIEW,
    });
    expect(result.screen).toContain(T1_COPY.notices.saveRace.head);
    expect(result.json.hookSpecificOutput?.hookEventName).toBe(
      'PostToolUseFailure',
    );
    expect(result.context).toContain('get_standard');
  });

  it('다른 실패면 아무것도 띄우지 않아요', async () => {
    const result = await hook('after-save', {
      hook_event_name: 'PostToolUseFailure',
      error: '[LOCKED] 잠긴 결정 사항이에요',
      t1_preview: PREVIEW,
    });
    expect(result.json).toEqual({});
  });
});

describe('isSavedResponse', () => {
  it('MCP 결과 겉모양이 달라도 저장 결과를 찾고, 오류면 false예요', () => {
    const inner = JSON.stringify({ standardId: PREVIEW.id, version: 3 });
    expect(isSavedResponse([{ type: 'text', text: inner }])).toBe(true);
    expect(isSavedResponse(inner)).toBe(true);
    expect(
      isSavedResponse({
        isError: true,
        content: [{ type: 'text', text: inner }],
      }),
    ).toBe(false);
    expect(isSavedResponse('저장했어요')).toBe(false);
  });
});
