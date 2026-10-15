/**
 * 터미널 알림 hooks (SIL-67, 부건님 SIL-68 시안).
 *
 * 팀원 PC의 Claude Code hooks가 이벤트를 그대로 이 서버로 보내면(hooks-client/haribo-hook.mjs),
 * 여기서 화면 글을 만들어 hooks가 바로 출력할 JSON을 돌려줘요. 화면 글은 @sil/notify의 터미널 함수가 만들어요.
 *
 *   SessionStart       → 켤 때 알림 (systemMessage)
 *   UserPromptSubmit   → 첫 변경 상세 (systemMessage) + Claude에게 질문 순서 안내 (additionalContext)
 *   PostToolUse:respond → 기록 줄 + 다음 변경 상세 또는 마무리 한 줄 (systemMessage)
 *   PostToolUse:mark_reflected → "✓ 이슈에 반영했어요" 한 줄 (systemMessage)
 *
 * "이슈 반영"을 입력하면 관계있다로 답한 변경 목록을 띄우고 Claude에게 물을 질문을 알려 줘요 (SIL-93, 부건님 10/15 시안).
 * 이슈 반영할 변경이 남았으면 상세를 띄우지 않는 입력에서 안내 한 줄을 세션마다 한 번 띄워요.
 *
 * hooks 글은 Claude가 옮겨 쓰지 않고 Claude Code가 그대로 화면에 띄워요. Claude가 옮기면 줄이거나 건너뛰었어요 (시안 결정).
 * 불러오지 못하면 "변경 없음"으로 보이지 않게 실패를 알리고 작업은 막지 않아요 (notify.error.no-block-retry).
 */
import { isSilError } from '@sil/core';
import { createLogger } from '@sil/core/node';
import {
  allAnsweredLine,
  autoClosedLine,
  buildPendingList,
  connectionFailedNotice,
  detailScreen,
  isRecall,
  isReflectPrompt,
  nothingLeft,
  nothingToReflect,
  recordedLines,
  REFLECT_YES,
  reflectableItems,
  reflectedLine,
  reflectGroups,
  reflectQuestionsFor,
  reflectReminder,
  reflectScreen,
  sessionNotice,
  skippedReminder,
  type NotifyData,
  type PendingItem,
} from '@sil/notify';
import { SERVER_INFO } from '../server-info.ts';
import { loadNotifyData } from '../tools/notify/shared.ts';

const log = createLogger('hooks');

export type HookEvent =
  'session-start' | 'prompt-submit' | 'after-respond' | 'after-reflect';
export const HOOK_EVENTS: readonly HookEvent[] = [
  'session-start',
  'prompt-submit',
  'after-respond',
  'after-reflect',
];

/** Claude Code hooks가 표준 출력으로 내보내는 JSON. 비어 있으면 아무것도 띄우지 않아요 */
export interface HookOutput {
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
}

/** Claude Code가 hooks에 넘기는 이벤트 중 우리가 쓰는 칸 */
export interface HookInput {
  session_id?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: { pendingCheckId?: unknown; reflected?: unknown };
  tool_response?: unknown;
}

/** 이번 답하기에 대해 서버가 기억하는 것. 서버를 다시 켜면 처음처럼 물어요 (MVP) */
interface FlowState {
  /** 이번 세션에서 상세와 질문을 띄웠는지. 띄웠는데 대기가 남았으면 사용자가 닫고 넘어간 거예요 */
  asked: boolean;
  /** 질문을 시작할 때의 전체 건수. "2건 남았어요", "3건을 모두 답했어요"에 써요 */
  totalAtStart: number;
  /** "결정 사항 확인"으로 다시 부른 것인지. 끝나도 작업을 시작하지 않아요 */
  recall: boolean;
  updatedAt: number;
}

/** 오래된 세션 상태는 지워요 (하루) */
const STATE_TTL_MS = 24 * 60 * 60 * 1000;

const toolName = (name: string) => `mcp__${SERVER_INFO.name}__${name}`;

/**
 * Claude에게 주는 질문 순서 안내 (부건님 시안 prompt_submit.py의 GUIDE를 옮김).
 * 화면 글은 hooks가 이미 띄웠으니 Claude는 글을 쓰지 않고 질문과 기록만 해요.
 */
function buildGuide(recall: boolean): string {
  const after = recall
    ? '모든 변경을 기록했거나 사용자가 질문을 닫았으면 글을 쓰지 않고 끝낸다. 사용자의 입력은 답하기를 다시 부른 것이라 따로 처리할 요청이 없다.'
    : '모든 변경을 기록했거나 사용자가 질문을 닫았으면 사용자의 원래 요청을 처리한다. 이때도 확인한 변경에 대해서는 따로 말하지 않는다.';
  return `[확인할 변경 규칙] 사용자의 요청을 처리하기 전에 아래 순서를 먼저 끝낸다.
변경 상세와 기록 결과는 hooks가 사용자 화면에 이미 직접 보여 준다. 그러니 상세 내용, 요약, 표, 인사말, 진행 설명을 직접 쓰지 않는다. 서버 안내문 8번의 "표로 보여 주기"도 하지 않는다. 글은 한 글자도 출력하지 말고 도구만 부른다.
1. ${toolName('list_pending')} 을 부른다.
2. items 의 변경마다 순서대로, 그 변경의 questions 를 쓴다:
   a. AskUserQuestion 으로 questions.relation 을 묻는다. question, header, 선택지 label 과 description 을 주어진 그대로 쓰고, multiSelect 는 false, 추천 표시는 붙이지 않는다.
   b. 관계있다를 고르면 questions.known 을, 관계없다를 고르면 questions.reason 을 같은 규칙으로 묻는다.
   c. relation 이나 known 질문에서 사용자가 보기를 고르지 않고 직접 글을 쓰거나 대화를 원하면, 그 글을 답으로 기록하지 않는다. 글이 질문이면 위에 보여 준 변경 상세에 있는 내용만으로 한두 문장으로 답하고, 같은 질문을 다시 묻는다.
   d. reason 질문에서 고른 보기의 label 이나 직접 쓴 글은 그대로 unaffectedReason 으로 기록한다.
   e. ${toolName('respond')} 로 답을 기록한다. pendingCheckId 는 그 변경의 것, affected 는 관계있다면 true, known 은 알았다면 true·몰랐다면 false 다.
   f. respond 결과의 ok 가 false 이고 code 가 reason_too_long 이면, 사용자가 쓴 이유를 뜻이 바뀌지 않게 100자 안으로 줄여 AskUserQuestion 으로 "이유가 100자를 넘어서 이렇게 줄였어요. 이대로 기록할까요?"를 묻는다. 보기는 "이대로 기록해요"(줄인 문장)와 "다시 쓸게요"(이유 질문으로 돌아감) 두 개다. 고른 뒤에 기록한다.
   g. respond 결과의 code 가 already_closed 이면 그 변경은 건너뛰고 다음 변경으로 간다. 그 밖의 오류는 안내대로 같은 질문을 다시 묻는다.
   h. 사용자가 질문을 거절하면(User declined) 질문을 닫은 것이다. 남은 변경은 묻지 않고, 거절에 대해 아무 말도 하지 않고 바로 3으로 간다.
3. ${after}`;
}

const SKIPPED_CONTEXT =
  '[확인할 변경 규칙] 답하지 않은 변경이 있다는 한 줄은 hooks가 이미 보여 줬다. 그 변경에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.';
const NOTHING_CONTEXT =
  '[확인할 변경 규칙] 답할 변경이 없다는 것을 hooks가 이미 화면에 보여 줬다. 글을 쓰지 않고 끝낸다.';
const REMINDER_CONTEXT =
  '[확인할 변경 규칙] 이슈 반영 안내 한 줄은 hooks가 이미 보여 줬다. 그 안내에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.';
const REFLECT_NONE_CONTEXT =
  '[이슈 반영 규칙] 이슈 반영할 변경이 없다는 것을 hooks가 이미 화면에 보여 줬다. 글을 쓰지 않고 끝낸다.';

/**
 * "이슈 반영"을 입력했을 때 Claude에게 주는 순서 (부건님 시안 web-prototype의 reflectFlow를 옮김).
 * 질문은 서버가 만든 그대로 묻게 하고, 고른 보기의 pendingCheckId로 mark_reflected를 불러요.
 */
function buildReflectGuide(
  questions: ReturnType<typeof reflectQuestionsFor>,
): string {
  return `[이슈 반영 규칙] 사용자가 "이슈 반영"을 입력했다. 관계있다로 답한 변경 목록은 hooks가 화면에 이미 보여 줬다. 목록, 요약, 인사말, 진행 설명을 직접 쓰지 않는다.
1. 아래 questions 를 AskUserQuestion 한 번에 그대로 묻는다. question, header, multiSelect, 선택지 label 과 description 을 주어진 그대로 쓰고(pendingCheckId 는 넣지 않는다), 추천 표시는 붙이지 않는다.
2. 고른 보기마다 그 보기의 pendingCheckId 로 ${toolName('mark_reflected')} 를 reflected: true 로 부른다. 한 건 질문에서는 "${REFLECT_YES}"를 골랐을 때만 부른다. 아무것도 고르지 않았거나 사용자가 질문을 거절하면(User declined) 부르지 않는다.
3. 사용자가 보기를 고르지 않고 직접 글을 쓰면 기록하지 않고 "보기 중 하나로 골라 주시면 등록할게요."라고만 말한 뒤 같은 질문을 다시 묻는다.
4. mark_reflected 결과의 ok 가 false 이거나 오류가 나면 message 를 그대로 한 줄로 보여 준다. 그 밖에는 글을 쓰지 않고 끝낸다. 이 입력은 이슈 반영을 부른 것이라 따로 처리할 요청이 없다.
questions: ${JSON.stringify(questions)}`;
}

const FAILED_CONTEXT =
  '[확인할 변경 규칙] 확인할 변경을 불러오지 못했다는 것을 hooks가 이미 화면에 보여 줬다. 그 일에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.';

function promptOutput(message: string, context: string): HookOutput {
  return {
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  };
}

export interface NotifyHooksOptions {
  /** 데이터 읽기. 테스트에서 바꿔 끼워요 */
  load?: (user: string) => Promise<NotifyData>;
  /** 지금 시각. 화면의 "오후 2:13"과 세션 정리에 써요 */
  now?: () => Date;
}

/** 서버 하나에 하나씩 만들어요. 세션 상태를 이 안에 들고 있어요 */
export function createNotifyHooks(options: NotifyHooksOptions = {}) {
  const load = options.load ?? loadNotifyData;
  const now = options.now ?? (() => new Date());
  const flows = new Map<string, FlowState>();
  /** 이슈 반영 안내 한 줄을 띄웠거나 "이슈 반영"을 입력한 세션. 한 세션에 한 번만 띄워요 (10/15 부건) */
  const reflectHinted = new Map<string, number>();

  const key = (user: string, input: HookInput) =>
    `${user}\u0000${input.session_id ?? ''}`;

  function cleanUp() {
    const limit = now().getTime() - STATE_TTL_MS;
    for (const [k, state] of flows) {
      if (state.updatedAt < limit) flows.delete(k);
    }
    for (const [k, at] of reflectHinted) {
      if (at < limit) reflectHinted.delete(k);
    }
  }

  async function pending(user: string): Promise<{
    data: NotifyData;
    items: PendingItem[];
  }> {
    const data = await load(user);
    const { items } = buildPendingList(
      data,
      { recipient: user },
      { now: now().toISOString() },
    );
    return { data, items };
  }

  /** 이슈 반영할 수 있는 변경 (관계있다로 답했고 아직 표시하지 않은 것, 답한 지 7일 안) */
  function reflectable(data: NotifyData, user: string): PendingItem[] {
    return reflectableItems(
      buildPendingList(
        data,
        { recipient: user, includeClosed: true },
        { now: now().toISOString() },
      ).items,
    );
  }

  /**
   * 상세를 띄우지 않는 입력에 이슈 반영 안내 한 줄을 붙여요. 이슈 반영할 변경이 있고 이 세션에서 처음일 때만이에요.
   * base가 없으면 안내만 띄우고, Claude에게는 안내에 대해 말하지 말라고 해요.
   */
  function withReminder(
    data: NotifyData,
    user: string,
    flowKey: string,
    base: { message: string; context: string } | null,
  ): HookOutput {
    const isNew = !reflectHinted.has(flowKey);
    if (isNew && reflectable(data, user).length > 0) {
      reflectHinted.set(flowKey, now().getTime());
      return promptOutput(
        `${base?.message ?? ''}${reflectReminder()}`,
        base?.context ?? REMINDER_CONTEXT,
      );
    }
    return base ? promptOutput(base.message, base.context) : {};
  }

  /** "이슈 반영"을 입력했을 때: 목록 + 질문 순서, 없으면 없다는 한 줄 */
  function reflectStart(
    data: NotifyData,
    user: string,
    flowKey: string,
  ): HookOutput {
    // 이번 세션에 "이슈 반영"을 입력했으면 안내 한 줄은 아는 것으로 보고 다시 띄우지 않아요
    reflectHinted.set(flowKey, now().getTime());
    const items = reflectable(data, user);
    if (items.length === 0) {
      return promptOutput(nothingToReflect(), REFLECT_NONE_CONTEXT);
    }
    const questions = reflectQuestionsFor(items);
    // 질문은 16건까지라서, 목록도 질문으로 묻는 변경만 같은 순서로 보여 줘요
    const shown = items.slice(
      0,
      reflectGroups(items.length).reduce((a, b) => a + b, 0),
    );
    return promptOutput(reflectScreen(shown), buildReflectGuide(questions));
  }

  function detail(item: PendingItem, index: number, flow: FlowState) {
    return detailScreen(item, index, flow.totalAtStart, {
      now: now().toISOString(),
      recall: flow.recall,
    });
  }

  async function sessionStart(user: string): Promise<HookOutput> {
    try {
      const { items } = await pending(user);
      const notice = sessionNotice(items);
      return notice ? { systemMessage: notice } : {};
    } catch (error) {
      logFailure('session-start', user, error);
      return { systemMessage: connectionFailedNotice() };
    }
  }

  async function promptSubmit(
    user: string,
    input: HookInput,
  ): Promise<HookOutput> {
    cleanUp();
    const recall = isRecall(input.prompt);
    let data: NotifyData;
    let items: PendingItem[];
    try {
      ({ data, items } = await pending(user));
    } catch (error) {
      logFailure('prompt-submit', user, error);
      return promptOutput(connectionFailedNotice(), FAILED_CONTEXT);
    }

    const flowKey = key(user, input);
    if (isReflectPrompt(input.prompt)) return reflectStart(data, user, flowKey);

    if (items.length === 0) {
      return recall
        ? promptOutput(nothingLeft(), NOTHING_CONTEXT)
        : withReminder(data, user, flowKey, null);
    }

    const previous = flows.get(flowKey);
    // 이번 세션에서 이미 물었는데 대기가 남았으면 닫고 넘어간 거예요. 다 답한 뒤 새 변경이 와도 같아요 (SIL-80 B5)
    if (previous?.asked && !recall) {
      return withReminder(data, user, flowKey, {
        message: skippedReminder(items.length),
        context: SKIPPED_CONTEXT,
      });
    }

    const flow: FlowState = {
      asked: true,
      totalAtStart: items.length,
      recall,
      updatedAt: now().getTime(),
    };
    flows.set(flowKey, flow);
    const first = items[0] as PendingItem;
    return promptOutput(detail(first, 1, flow), buildGuide(recall));
  }

  async function afterRespond(
    user: string,
    input: HookInput,
  ): Promise<HookOutput> {
    const pendingCheckId =
      typeof input.tool_input?.pendingCheckId === 'string'
        ? input.tool_input.pendingCheckId
        : null;
    if (!pendingCheckId) return {};

    let data: NotifyData;
    let items: PendingItem[];
    try {
      ({ data, items } = await pending(user));
    } catch (error) {
      logFailure('after-respond', user, error);
      return { systemMessage: connectionFailedNotice() };
    }

    const result = readRespondResult(input.tool_response);
    const check = data.pendingChecks.find((c) => c.id === pendingCheckId);
    const lines: string[] = [''];

    if (check?.status === 'answered') {
      const answered = buildPendingList(
        data,
        { recipient: user, includeClosed: true },
        { now: now().toISOString() },
      ).items.find((item) => item.pendingCheckId === pendingCheckId);
      if (answered?.answer)
        lines.push(...recordedLines(answered, answered.answer));
    } else if (
      check?.status === 'auto_closed' ||
      result?.closedStatus === 'auto_closed'
    ) {
      // 상세를 보는 중에 되돌려져서 자동으로 닫혔어요 (notify.pending.closed-while-open-notice)
      lines.push(autoClosedLine(check?.issueKey ?? ''));
    } else {
      // 빠진 칸 같은 이유로 기록되지 않았으면 Claude가 다시 물어요. 화면에는 아무것도 띄우지 않아요
      return {};
    }

    const flowKey = key(user, input);
    const flow =
      flows.get(flowKey) ??
      ({
        asked: true,
        totalAtStart: items.length + 1,
        recall: false,
        updatedAt: now().getTime(),
      } satisfies FlowState);
    flow.updatedAt = now().getTime();
    flows.set(flowKey, flow);

    const next = items[0];
    if (!next) {
      lines.push('', allAnsweredLine(flow.totalAtStart, flow.recall));
    } else {
      const index = Math.max(1, flow.totalAtStart - items.length + 1);
      lines.push(detail(next, index, flow));
    }
    return { systemMessage: lines.join('\n') };
  }

  /** mark_reflected로 이슈 반영을 표시한 뒤: "✓ 이슈에 반영했어요" 한 줄. 풀었거나 실패했으면 아무것도 띄우지 않아요 */
  async function afterReflect(
    user: string,
    input: HookInput,
  ): Promise<HookOutput> {
    const pendingCheckId =
      typeof input.tool_input?.pendingCheckId === 'string'
        ? input.tool_input.pendingCheckId
        : null;
    if (!pendingCheckId || input.tool_input?.reflected !== true) return {};
    if (readRespondResult(input.tool_response)?.ok !== true) return {};
    try {
      const data = await load(user);
      const item = buildPendingList(
        data,
        { recipient: user, includeClosed: true },
        { now: now().toISOString() },
      ).items.find((i) => i.pendingCheckId === pendingCheckId);
      return item ? { systemMessage: `\n${reflectedLine(item)}` } : {};
    } catch (error) {
      // 저장은 이미 됐어요. 한 줄만 못 띄운 거라 조용히 끝내요
      logFailure('after-reflect', user, error);
      return {};
    }
  }

  return {
    handle(event: HookEvent, user: string, input: HookInput) {
      switch (event) {
        case 'session-start':
          return sessionStart(user);
        case 'prompt-submit':
          return promptSubmit(user, input);
        case 'after-respond':
          return afterRespond(user, input);
        case 'after-reflect':
          return afterReflect(user, input);
      }
    },
  };
}

export type NotifyHooks = ReturnType<typeof createNotifyHooks>;

/**
 * PostToolUse로 받은 respond 결과에서 ok와 closedStatus만 꺼내요.
 * Claude Code가 MCP 결과를 넘기는 모양이 버전마다 조금씩 달라서, 글(JSON)을 찾을 때까지 안으로 들어가 봐요.
 */
function readRespondResult(
  response: unknown,
): { ok?: boolean; closedStatus?: string } | null {
  if (typeof response === 'string') {
    try {
      return readRespondResult(JSON.parse(response));
    } catch {
      return null;
    }
  }
  if (Array.isArray(response)) {
    for (const part of response) {
      const found = readRespondResult(part);
      if (found) return found;
    }
    return null;
  }
  if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>;
    if (typeof record.ok === 'boolean') {
      return {
        ok: record.ok,
        ...(typeof record.closedStatus === 'string'
          ? { closedStatus: record.closedStatus }
          : {}),
      };
    }
    if (typeof record.text === 'string') return readRespondResult(record.text);
    if ('content' in record) return readRespondResult(record.content);
  }
  return null;
}

function logFailure(event: HookEvent, user: string, error: unknown) {
  log.warn(`hooks ${event} 실패`, {
    user,
    code: isSilError(error) ? error.code : undefined,
    message: error instanceof Error ? error.message : String(error),
  });
}
