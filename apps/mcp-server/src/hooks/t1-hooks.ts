/**
 * T1 결정 사항 확인 hooks (BDT-108). 민수님 터미널 알림 hooks(notify-hooks.ts)와 같은 길로 와요.
 *
 * 팀원 PC의 hooks-client/haribo-hook.mjs가 Claude Code 이벤트를 /hooks/<이벤트>로 보내면,
 * 여기서 @sil/t1으로 화면 글을 만들어 hooks가 바로 출력할 JSON을 돌려줘요.
 *
 *   PostToolUse:show_standard_check  → after-t1    ② 다른 결정 사항 / ③ 등록될 모습 / 예외 안내 + Claude에게 다음 할 일
 *   PreToolUse:save_standard         → before-save ③에서 보여 준 값과 다르면 막고, 같으면 사람에게 허락을 물어요
 *   PostToolUse(Failure):save_standard → after-save ④ 등록 완료, 그사이 바뀌었으면 예외 7
 *
 * 서버는 ③ 값을 기억하지 않아요. 무료 호스팅은 쉬었다 깨어나면 메모리가 비어서, ③ 값은 팀원 PC 파일에 둬요.
 * hook.mjs가 ③ 직후 그 파일을 남기고, 저장 직전·직후에 읽어 `t1_preview`로 붙여 보내요(10/23 결정).
 * `t1_preview`가 없으면 ③을 거치지 않은 저장이라 저장 직전에 막고 ③부터 다시 하게 해요(안내문 2·3·10번).
 * 서버에 못 붙어 hook이 실패하면 저장은 막지 않아요 (notify.error.no-block-retry, hook.mjs).
 */
import type { SaveStandardInput } from '@sil/core';
import { createLogger } from '@sil/core/node';
import {
  conflictsScreen,
  loadTargets,
  noticeScreen,
  previewScreen,
  savedScreen,
  T1_COPY,
  type T1ConflictsInput,
  type T1NoticeInput,
} from '@sil/t1';
import { readUser } from '../auth.ts';
import { SERVER_INFO } from '../server-info.ts';
import {
  previewInput,
  showStandardCheckInput,
  type T1PreviewInput,
} from '../tools/detect/show-standard-check.ts';

const log = createLogger('hooks');

export type T1HookEvent = 'after-t1' | 'before-save' | 'after-save';
export const T1_HOOK_EVENTS: readonly T1HookEvent[] = [
  'after-t1',
  'before-save',
  'after-save',
];

export function isT1HookEvent(value: string): value is T1HookEvent {
  return (T1_HOOK_EVENTS as readonly string[]).includes(value);
}

/** Claude Code가 hooks에 넘기는 이벤트 중 T1이 쓰는 칸 */
export interface T1HookInput {
  session_id?: string;
  /** 저장이 실패하면 Claude Code가 PostToolUseFailure로 불러요 */
  hook_event_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  /** PostToolUseFailure일 때 실패 내용 */
  error?: unknown;
  /** hook.mjs가 팀원 PC 파일에서 읽어 붙인 ③ 값. 없으면 ③을 거치지 않은 저장이에요 */
  t1_preview?: unknown;
}

/** Claude Code hooks가 표준 출력으로 내보내는 JSON. 비어 있으면 아무것도 하지 않아요 */
export interface T1HookOutput {
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure';
    additionalContext?: string;
    permissionDecision?: 'ask' | 'deny';
    permissionDecisionReason?: string;
  };
}

export interface T1HooksOptions {
  /** ③·④ 받는 이슈 읽기. 테스트에서 바꿔 끼워요 */
  loadTargets?: typeof loadTargets;
}

const toolName = (name: string) => `mcp__${SERVER_INFO.name}__${name}`;

/** 화면을 띄운 뒤 Claude에게만 전하는 말의 첫 줄. Claude는 hook 글이 사람 화면에 떴는지 몰라 설명을 덧붙여요 (10/15 시험) */
const SHOWN =
  'T1 화면을 hook이 사람에게 이미 보여 줬어요. 화면을 띄웠다거나 무엇을 보여 줬는지 설명하는 글을 쓰지 마세요.';

/** AskUserQuestion에 그대로 넣을 질문. 글자를 바꾸지 않게 JSON으로 넘겨요 */
function askJson(
  question: string,
  header: string,
  options: readonly { label: string; description: string }[],
): string {
  return JSON.stringify({
    question,
    header,
    multiSelect: false,
    options: options.map(({ label, description }) => ({ label, description })),
  });
}

const reasonStep = `예면 이유를 정해요. 사람이 대화에서 한 말로 알 수 있으면 한 문장으로 정리하고, 알 수 없으면 "${T1_COPY.reasonPrompt}"를 글로 물어요(지어내지 않아요). 그다음 ${toolName('show_standard_check')}(screen: "preview")로 ③을 보여 줘요.`;

/**
 * 작업 중에 알아챘을 때 아니요 뒤 할 일. 요청 값이 이미 코드에 있으면 기존 값으로 되돌려요
 * (detect.ask.rollback-if-applied). 비교는 도구가 아니라 에이전트가 코드를 읽어 직접 해요 (SIL-86)
 */
const agentDeclinedStep = `아니요면 저장하지 않아요. 요청 값이 코드에 이미 들어갔는지 코드의 지금 값을 직접 읽어 확인해요. 요청 값과 같으면 그곳을 기존 결정 사항 값으로 되돌리고 "${T1_COPY.rolledBack}"를 {requested}·{current}만 채워 글자 그대로 보여 준 뒤 멈추고 기다려요. 아직 요청 값이 아니면 아무것도 고치지 않고 "${T1_COPY.notChanged}"를 보여 준 뒤 멈추고 기다려요. 되돌리는 것 말고는 지금 값대로도 코드를 쓰지 않아요.`;

/** ② 다른 결정 사항 뒤 할 일 (예전 CLAUDE.md T1 2~4, 8) */
function conflictsContext(input: T1ConflictsInput): string {
  const { ask, direct, notChanged } = T1_COPY;
  const isRevert = input.revert !== undefined;
  // 직접 요청은 이미 바꾸기로 한 사람이라 묻지 않아요. 되돌림이면 직접 요청이어도 먼저 물어요 (detect.ask.direct-request-skip-warn v2)
  if (input.trigger === 'direct' && !isRevert) {
    return `${SHOWN}\n묻지 않고 바로 이유로 가요. ${reasonStep}`;
  }
  const question = input.trigger === 'direct' ? direct.revertAsk : ask.question;
  return [
    SHOWN,
    `AskUserQuestion으로 이 질문을 글자 그대로 물어요(질문에 화면 내용을 다시 적지 않아요): ${askJson(question, ask.header, [ask.yes, ask.no])}`,
    `선택지 대신 글로 답하면 "${ask.typedReply}"를 쓰고 같은 질문을 다시 물어요.`,
    // 직접 요청(되돌림)의 아니요는 별도 이슈라 그대로 둬요 (BDT-95 하지 않는 것)
    input.trigger === 'agent'
      ? agentDeclinedStep
      : `아니요면 저장하지 않고 "${notChanged}"를 보여 준 뒤 멈추고 기다려요. 지금 값대로도 코드를 쓰지 않아요.`,
    reasonStep,
  ].join('\n');
}

/** ③ 등록될 모습 뒤 할 일 (예전 CLAUDE.md T1 5~6) */
function previewContext(hasTargets: boolean): string {
  const { preview, direct, editPrompt, cancelled } = T1_COPY;
  const register = hasTargets ? preview.registerWithIssues : preview.register;
  return [
    SHOWN,
    `AskUserQuestion으로 이 질문을 글자 그대로 물어요: ${askJson(preview.confirm, preview.header, [register, preview.edit, preview.cancel])}`,
    `직접 요청으로 기존 결정 사항을 바꾸는 중이면(되돌림이 아니면) 질문만 "${direct.confirm}"로 바꿔요.`,
    `${register.label}면 ${toolName('save_standard')}로 ③과 같은 값을 저장해요. 수정하기면 "${editPrompt}"를 글로 묻고 고친 뒤 ③을 다시 보여 줘요.`,
    `취소하기나 Esc면 저장하지 않고 "${cancelled.withTask}"(결정 사항을 바꿔 달라는 것 자체가 요청이었으면 "${cancelled.noTask}")를 보여 준 뒤 멈추고 기다려요.`,
  ].join('\n');
}

/** 예외 안내 뒤 할 일 (예전 CLAUDE.md T1 9) */
function noticeContext(input: T1NoticeInput): string {
  const { notices, similarAsk } = T1_COPY;
  switch (input.kind) {
    case 'searchFailed':
      return `${SHOWN}\n하던 작업이나 등록을 멈추고 사람의 말을 기다려요. "다른 결정 사항 없음"으로 넘어가지 않아요.`;
    case 'similar':
      return `${SHOWN}\nAskUserQuestion으로 이 질문을 글자 그대로 물어요: ${askJson(similarAsk.question, similarAsk.header, [similarAsk.yes, similarAsk.no])}\n예면 새 결정 사항으로 이유부터 해요(③에 isNew: true). 아니요면 ${toolName('show_standard_check')}(screen: "notice", notice: { kind: "similarDeclined" })로 끝내요.`;
    case 'revertSame':
      return `${SHOWN}\n저장하지 않아요. 화면 뒤에는 "${notices.revertSame.next}" 한 줄만 글자 그대로 쓰고 사람의 말을 기다려요.`;
    default:
      return `${SHOWN}\n저장하지 않고 끝내요.`;
  }
}

/** ④ 뒤 할 일 */
const SAVED_CONTEXT = `${SHOWN}\n하던 작업이 있으면 "${T1_COPY.saved.next.withTask}"를 쓰고 바꾼 값으로 그 작업을 이어가요. 결정 사항을 바꿔 달라는 것 자체가 요청이었으면 "${T1_COPY.saved.next.noTask}"를 써요.`;

/** 예외 7 뒤 할 일 */
const SAVE_RACE_CONTEXT = `${SHOWN}\n저장하는 사이 다른 사람이 먼저 바꿔 거절됐어요. ${toolName('get_standard')}로 새 currentVersion을 읽어 ② 다른 결정 사항을 다시 보여 주고, 사람이 이미 고른 예와 정한 이유는 그대로 두고 ③부터 다시 물어요.`;

/** ③을 보여 주지 않고 저장하려 할 때 막는 이유. Claude와 사람 모두 봐요 */
const NO_PREVIEW_REASON = `③ 등록될 모습을 사람에게 보여 주지 않은 저장이에요. ${toolName('show_standard_check')}(screen: "preview")로 ③을 먼저 보여 주고 등록하기를 받은 뒤 저장해 주세요.`;

/** 화면을 띄우지 못했을 때 Claude에게만 전하는 말 */
const NOT_SHOWN =
  '결정 사항 확인 화면을 만들지 못해 사람에게 보이지 않았어요. 다음 단계로 가지 말고 멈춘 뒤, 화면을 띄우지 못했다고 사람에게 알려요.';

/** ③에서 보여 준 값과 저장하려는 값이 다른 칸 */
export function diffFromPreview(
  preview: T1PreviewInput,
  input: Partial<SaveStandardInput>,
): string[] {
  const keys = ['id', 'title', 'value', 'reason', 'alwaysOn'] as const;
  return keys.filter((key) => preview[key] !== input[key]);
}

/**
 * save_standard 결과가 저장에 성공했는지 봐요. Claude Code가 MCP 결과를 어떤 겉모양(배열·content·글)으로
 * 넘겨도 찾게, 안쪽 글이 JSON이면 풀어서 standardId와 version이 있는 결과를 찾아요. 오류(isError)면 false
 */
export function isSavedResponse(response: unknown): boolean {
  if (typeof response === 'string') {
    try {
      return isSavedResponse(JSON.parse(response));
    } catch (_error) {
      return false;
    }
  }
  if (Array.isArray(response)) return response.some(isSavedResponse);
  if (typeof response !== 'object' || response === null) return false;
  const record = response as Record<string, unknown>;
  if (record.isError === true) return false;
  if (
    typeof record.standardId === 'string' &&
    typeof record.version === 'number'
  ) {
    return true;
  }
  return Object.values(record).some(isSavedResponse);
}

/** save_standard가 그사이 바뀐 버전 때문에 거절됐는지 봐요 (서버 오류 코드 VERSION_CONFLICT) */
export function isVersionConflict(...responses: unknown[]): boolean {
  return responses.some((response) =>
    (typeof response === 'string'
      ? response
      : (JSON.stringify(response) ?? '')
    ).includes('VERSION_CONFLICT'),
  );
}

/** 영역을 비우면 ID 앞부분이 영역이 돼요 (save_standard 설명) */
const areaOf = (id: string) => id.split('.')[0] ?? '';

// 첫 줄을 비워 hook 머리글(`PostToolUse:mcp__haribo__show_standard_check says:`) 바로 다음 줄부터 시작해요
const screenMessage = (screen: string) => `\n${screen}`;

/** 서버 하나에 하나씩 만들어요. 상태는 들고 있지 않아요 */
export function createT1Hooks(options: T1HooksOptions = {}) {
  const readTargets = options.loadTargets ?? loadTargets;

  async function afterT1(
    user: string | null,
    input: T1HookInput,
  ): Promise<T1HookOutput> {
    const parsed = showStandardCheckInput.safeParse(input.tool_input);
    // 도구가 입력을 거절했으면 Claude가 오류를 이미 받아요
    if (!parsed.success) return {};
    const shown = (systemMessage: string, additionalContext: string) => ({
      systemMessage: screenMessage(systemMessage),
      hookSpecificOutput: {
        hookEventName: 'PostToolUse' as const,
        additionalContext,
      },
    });
    const { conflicts, preview, notice } = parsed.data;
    if (conflicts) {
      return shown(conflictsScreen(conflicts), conflictsContext(conflicts));
    }
    if (preview) {
      // 새 결정 사항에는 아직 연결된 이슈가 없어요 (프로토타입 10/14). 바꾸는 사람은 X-Sil-User예요
      const targets = preview.isNew ? [] : await readTargets(preview.id, user);
      return shown(
        previewScreen(
          { ...preview, area: areaOf(preview.id) },
          targets,
          preview.isNew ?? false,
        ),
        previewContext((targets?.length ?? 0) > 0),
      );
    }
    if (notice) return shown(noticeScreen(notice), noticeContext(notice));
    return {};
  }

  function beforeSave(input: T1HookInput): T1HookOutput {
    const preview = previewInput.safeParse(input.t1_preview);
    // ③을 거치지 않은 저장은 막아요. ③과 다른 ID로 저장할 때도 파일이 없어 여기서 막혀요
    if (!preview.success) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: NO_PREVIEW_REASON,
        },
      };
    }
    const changed = diffFromPreview(
      preview.data,
      (input.tool_input ?? {}) as Partial<SaveStandardInput>,
    );
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        ...(changed.length > 0
          ? {
              permissionDecision: 'deny' as const,
              permissionDecisionReason: `③에서 보여 준 값과 저장하려는 값이 달라요 (${changed.join(', ')}). ③을 다시 보여 주고 확인받아 주세요.`,
            }
          : {
              permissionDecision: 'ask' as const,
              permissionDecisionReason: '③에서 보여 드린 값 그대로 저장해요.',
            }),
      },
    };
  }

  async function afterSave(
    user: string | null,
    input: T1HookInput,
  ): Promise<T1HookOutput> {
    const preview = previewInput.safeParse(input.t1_preview);
    // ③ 파일이 있을 때만 띄워요. ③ 없는 저장은 저장 직전에 막혀서 여기까지 오지 않아요
    if (!preview.success) return {};
    const hookEventName =
      input.hook_event_name === 'PostToolUseFailure'
        ? 'PostToolUseFailure'
        : 'PostToolUse';
    const { id, title, alwaysOn, isNew = false } = preview.data;
    if (isSavedResponse(input.tool_response)) {
      // ④의 보낸 수는 저장한 뒤 다시 읽어요. 서버는 ③에서 읽은 이슈를 기억하지 않아요
      const targets = isNew ? [] : await readTargets(id, user);
      return {
        systemMessage: screenMessage(
          savedScreen({ area: areaOf(id), title, alwaysOn }, targets, isNew),
        ),
        hookSpecificOutput: { hookEventName, additionalContext: SAVED_CONTEXT },
      };
    }
    if (isVersionConflict(input.tool_response, input.error)) {
      return {
        systemMessage: screenMessage(noticeScreen({ kind: 'saveRace' })),
        hookSpecificOutput: {
          hookEventName,
          additionalContext: SAVE_RACE_CONTEXT,
        },
      };
    }
    return {};
  }

  async function handle(
    event: T1HookEvent,
    user: string | null,
    input: T1HookInput,
  ): Promise<T1HookOutput> {
    try {
      switch (event) {
        case 'after-t1':
          return await afterT1(user, input);
        case 'before-save':
          return beforeSave(input);
        case 'after-save':
          return await afterSave(user, input);
      }
    } catch (error) {
      log.warn(`hooks ${event} 실패`, {
        user,
        message: error instanceof Error ? error.message : String(error),
      });
      // 화면을 못 띄웠으면 Claude가 다음 단계로 가지 않게 알려요. 저장 전후는 저장을 막지 않아요
      return event === 'after-t1'
        ? {
            hookSpecificOutput: {
              hookEventName: 'PostToolUse',
              additionalContext: NOT_SHOWN,
            },
          }
        : {};
    }
  }

  return {
    handle,
    /** http.ts가 /hooks/<T1 이벤트> 요청을 그대로 넘겨요. 이름은 받는 이슈에서 바꾼 본인을 뺄 때만 써요 */
    async respond(request: Request, event: T1HookEvent): Promise<Response> {
      if (request.method !== 'POST') {
        return Response.json(
          { error: { message: `hooks 주소는 POST로 불러요.` } },
          { status: 404 },
        );
      }
      let input: T1HookInput;
      try {
        const text = await request.text();
        input = text ? (JSON.parse(text) as T1HookInput) : {};
      } catch {
        return Response.json(
          { error: { message: 'hooks 이벤트(JSON)를 읽지 못했어요.' } },
          { status: 400 },
        );
      }
      return Response.json(await handle(event, readUser(request), input));
    },
  };
}

export type T1Hooks = ReturnType<typeof createT1Hooks>;
