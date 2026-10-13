import type { NotifyStore } from './store.ts';
import type {
  Answer,
  AnswerChannel,
  IsoDateTime,
  PendingCheck,
  PendingCheckStatus,
  StandardId,
} from './types.ts';

/** 관계없는 이유의 최대 글자 수 (착수 안내 v2) */
export const MAX_UNAFFECTED_REASON_LENGTH = 100;

const ANSWER_CHANNELS: readonly AnswerChannel[] = ['terminal', 'app'];

/**
 * 답 하나. MCP 도구와 웹 앱이 그대로 넘기는 값이라 타입을 믿지 않고 하나씩 검사해요.
 */
export interface RespondInput {
  pendingCheckId: string;
  /** 답하는 사람 이름. 확인할 변경의 받는 사람이어야 해요 */
  answeredBy: string;
  /** 관계있다(true) / 관계없다(false) */
  affected: boolean;
  /** 관계있다면 꼭 넣어요. 알았다(true) / 몰랐다(false) */
  known?: boolean | null;
  /** 관계없다면 꼭 넣어요. 한 줄, 100자 이하 */
  unaffectedReason?: string | null;
  /** 터미널 / 앱 */
  channel: AnswerChannel;
}

export interface RespondOptions {
  /** 답한 시각. 안 주면 실제 시각 */
  now?: IsoDateTime;
  /** 답 ID를 만드는 함수. 안 주면 UUID */
  makeId?: () => string;
}

export type RespondErrorCode =
  | 'not_found'
  | 'not_recipient'
  | 'already_closed'
  | 'invalid_channel'
  | 'missing_fields'
  | 'reason_too_long';

export type RespondResult =
  | {
      ok: true;
      answer: Answer;
      /**
       * 관계있다로 답했으면 다시 읽을 기준 ID, 관계없다면 null.
       * 에이전트는 이 값이 있으면 get_standard로 바뀐 기준을 다시 읽어요 (notify.answer.next-run-context).
       */
      rereadStandardId: StandardId | null;
    }
  | RespondFailure;

export interface RespondFailure {
  ok: false;
  code: RespondErrorCode;
  /** 사람에게 그대로 보여 줄 수 있는 문장 */
  message: string;
  /** code가 missing_fields일 때 빠진 칸 */
  missingFields?: string[];
  /**
   * code가 already_closed일 때 그 변경이 지금 어떤 상태인지.
   * auto_closed면 화면이 "되돌려져서 답하지 않아도 돼요" 한 줄을 띄워요 (SIL-77 부건님 의견).
   */
  closedStatus?: Exclude<PendingCheckStatus, 'pending'>;
}

/** checkAnswer가 통과시킨 답. 맞지 않는 쪽 칸은 비워 둬요 */
export interface CheckedAnswer {
  ok: true;
  affected: boolean;
  known: boolean | null;
  unaffectedReason: string | null;
}

const CLOSED_MESSAGES: Record<
  Exclude<PendingCheckStatus, 'pending'>,
  string
> = {
  answered: '이미 답한 변경이에요.',
  superseded: '새 버전으로 대체된 변경이에요. 최신 변경에 답해 주세요.',
  auto_closed: '원래 값으로 돌아와서 답하지 않아도 되는 변경이에요.',
};

/**
 * 담당자의 답을 검사하고 저장해요. 저장하면 그 확인할 변경은 "답함"이 돼요.
 *
 * 터미널과 앱 중 한 곳에서 답하면 같은 확인할 변경은 더 이상 대기가 아니라서
 * 다른 곳에서는 목록에서 빠져요 (notify.answer.one-place).
 * 관계있다면 알았나를, 관계없다면 이유를 받고, 맞지 않는 쪽 칸은 비워서 저장해요.
 */
export async function respond(
  store: NotifyStore,
  input: RespondInput,
  options: RespondOptions = {},
): Promise<RespondResult> {
  const data = await store.read();
  const check = data.pendingChecks.find((c) => c.id === input.pendingCheckId);
  const checked = checkAnswer(check, input);
  if (!checked.ok) return checked;
  // checkAnswer가 통과했으면 check는 있어요
  const target = check as PendingCheck;

  const answeredAt = options.now ?? new Date().toISOString();
  const answer: Answer = {
    id: (options.makeId ?? (() => crypto.randomUUID()))(),
    pendingCheckId: target.id,
    answeredBy: input.answeredBy,
    affected: checked.affected,
    known: checked.known,
    unaffectedReason: checked.unaffectedReason,
    channel: input.channel,
    answeredAt,
  };

  await store.write({
    ...data,
    pendingChecks: data.pendingChecks.map((c) =>
      c.id === target.id
        ? { ...c, status: 'answered' as const, closedAt: answeredAt }
        : c,
    ),
    answers: [...data.answers, answer],
  });

  return {
    ok: true,
    answer,
    rereadStandardId: answer.affected ? target.standardId : null,
  };
}

/**
 * 답을 저장하기 전에 검사하는 순수 함수예요. 임시 저장소의 respond와 MCP 도구 respond(DB)가 같이 써요.
 * 없는 변경, 받는 사람이 아님, 이미 닫힘, 답한 곳이 틀림, 빠진 칸, 이유가 너무 김을 차례로 봐요.
 */
export function checkAnswer(
  check: PendingCheck | undefined,
  input: RespondInput,
): CheckedAnswer | RespondFailure {
  if (!check) {
    return fail('not_found', '답할 확인할 변경을 찾지 못했어요.');
  }
  if (check.recipient !== input.answeredBy) {
    return fail(
      'not_recipient',
      `${check.recipient}님에게 온 변경이라 ${input.answeredBy}님은 답할 수 없어요.`,
    );
  }
  if (check.status !== 'pending') {
    return closedFailure(check.status);
  }
  if (!ANSWER_CHANNELS.includes(input.channel)) {
    return fail('invalid_channel', '답한 곳은 터미널이나 앱이어야 해요.');
  }

  const missingFields: string[] = [];
  if (typeof input.affected !== 'boolean') {
    missingFields.push('affected');
  } else if (input.affected && typeof input.known !== 'boolean') {
    missingFields.push('known');
  }
  const reason = input.unaffectedReason?.trim() ?? '';
  if (input.affected === false && reason === '') {
    missingFields.push('unaffectedReason');
  }
  if (missingFields.length > 0) {
    return {
      ...fail('missing_fields', describeMissing(missingFields)),
      missingFields,
    };
  }
  if (
    input.affected === false &&
    Array.from(reason).length > MAX_UNAFFECTED_REASON_LENGTH
  ) {
    return fail(
      'reason_too_long',
      `관계없는 이유는 ${MAX_UNAFFECTED_REASON_LENGTH}자 이하로 적어 주세요.`,
    );
  }

  return {
    ok: true,
    affected: input.affected,
    known: input.affected ? (input.known as boolean) : null,
    unaffectedReason: input.affected ? null : reason,
  };
}

/** 이미 닫힌 변경에 답했을 때의 결과. 지금 상태를 함께 돌려줘요 */
export function closedFailure(
  status: Exclude<PendingCheckStatus, 'pending'>,
): RespondFailure {
  return {
    ...fail('already_closed', CLOSED_MESSAGES[status]),
    closedStatus: status,
  };
}

function fail(code: RespondErrorCode, message: string): RespondFailure {
  return { ok: false, code, message };
}

const FIELD_NAMES: Record<string, string> = {
  affected: '관계(관계있다 / 관계없다)',
  known: '알았나(알았다 / 몰랐다)',
  unaffectedReason: '관계없는 이유',
};

function describeMissing(fields: string[]): string {
  return `빠진 칸이 있어요: ${fields.map((f) => FIELD_NAMES[f] ?? f).join(', ')}`;
}
