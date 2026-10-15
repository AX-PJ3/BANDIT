import type { SaveReflectedInput } from '@sil/core';
import type { Answer, PendingCheck, PendingCheckStatus } from './types.ts';

/**
 * 이슈 반영 표시를 저장하기 전에 검사하는 순수 함수예요 (SIL-93).
 * "이슈 반영"은 담당자가 바뀐 결정 사항을 자기 이슈 결과물에 적용했다는 뜻이에요 (위키 app.card.three-steps v2).
 *
 * DB 함수 save_reflected는 받은 사람인지, 답한 변경인지만 봐요.
 * 위키 notify.check.reflected v2는 "관계있다로 답한 확인할 변경에만" 표시할 수 있다고 정해서, 그건 여기서 봐요.
 * 표시를 푸는 것은 관계없다로 답한 변경에도 허락해요. 잘못 켜진 표시를 지울 수 있게요.
 * 입력은 core의 SaveReflectedInput(DB 함수에 넘기는 값) 그대로예요.
 */

export type ReflectErrorCode =
  | 'not_found'
  | 'not_recipient'
  | 'not_answered'
  | 'answer_not_found'
  | 'not_affected';

export interface ReflectFailure {
  ok: false;
  code: ReflectErrorCode;
  /** 사람에게 그대로 보여 줄 수 있는 문장 */
  message: string;
}

const NOT_ANSWERED_MESSAGES: Record<
  Exclude<PendingCheckStatus, 'answered'>,
  string
> = {
  pending:
    '아직 답하지 않은 확인할 변경이에요. 먼저 관계있다/관계없다로 답해 주세요.',
  superseded:
    '새 버전으로 대체된 확인할 변경이에요. 최신 버전의 확인할 변경에 답한 뒤 표시해 주세요.',
  auto_closed:
    '원래 값으로 돌아와서 닫힌 확인할 변경이에요. 작업에 반영할 것이 없어요.',
};

/**
 * 없는 변경, 받는 사람이 아님, 답하지 않음(대기·대체됨·자동 닫힘), 답을 찾지 못함, 관계없다로 답함을 차례로 봐요.
 * answer는 이 확인할 변경에 한 답이에요. 답한 변경인데 답을 못 찾으면 관계있다였는지 알 수 없어서 거절해요.
 */
export function checkReflect(
  check: PendingCheck | undefined,
  answer: Answer | undefined,
  input: SaveReflectedInput,
): { ok: true } | ReflectFailure {
  if (!check) {
    return fail('not_found', '나에게 온 확인할 변경 중에 찾지 못했어요.');
  }
  if (check.recipient !== input.markedBy) {
    return fail(
      'not_recipient',
      `${check.recipient}님에게 온 확인할 변경이라 ${input.markedBy}님은 이슈 반영을 표시할 수 없어요.`,
    );
  }
  if (check.status !== 'answered') {
    return fail('not_answered', NOT_ANSWERED_MESSAGES[check.status]);
  }
  // 표시 풀기는 답 내용과 상관없이 받아요
  if (!input.reflected) return { ok: true };
  if (!answer) {
    return fail(
      'answer_not_found',
      '이 확인할 변경에 한 답을 찾지 못해서 이슈 반영을 표시하지 않았어요. 잠시 뒤 다시 해 주세요.',
    );
  }
  if (!answer.affected) {
    return fail(
      'not_affected',
      '관계없다로 답한 확인할 변경이라 이슈 반영을 표시하지 않아요. 관계있다로 답한 변경에만 표시할 수 있어요.',
    );
  }
  return { ok: true };
}

function fail(code: ReflectErrorCode, message: string): ReflectFailure {
  return { ok: false, code, message };
}
