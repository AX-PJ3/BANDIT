/**
 * Supabase 주소·키 없이 열었을 때 쓰는 예시 데이터 버전의 api예요.
 *
 * SilApi(types.ts)에 함수를 추가하면 여기에도 같은 이름으로 추가해요 (타입이 빠진 걸 알려 줘요).
 * 예시 데이터는 직접 만들지 말고 @sil/core의 예시(inbox*, coupon*)를 써요.
 * 답과 반영함은 이 창의 메모리에만 저장해요. 새로 고치면 처음 예시로 돌아가요.
 */
import {
  INBOX_RECIPIENT,
  inboxAnswers,
  inboxIssues,
  inboxPendingChecks,
  inboxVersions,
  MAX_UNAFFECTED_REASON_LENGTH,
  SilError,
  type Answer,
} from '@sil/core';
import {
  buildPendingList,
  toNotifyCheck,
  toVersionRecord,
  type NotifyData,
  type PendingCheck as NotifyPendingCheck,
} from '@sil/notify/browser';
import { currentPlatform } from '../pwa.ts';
import type { SilApi } from './types.ts';

/** 예시로 열면 이 사람으로 열어요 (주소에 ?me=가 없을 때) */
export const MOCK_ME = INBOX_RECIPIENT;

/**
 * 예시의 "지금"이에요. 예시 날짜(10/12~10/15)가 7일 규칙(notify.list.closed-7-days)에 걸려
 * 날이 지나면서 사라지지 않게 고정해요. 이 창에서 새로 한 답은 이보다 늦어서 그대로 보여요.
 */
const MOCK_NOW = '2026-10-15T06:00:00.000Z';

const checks = structuredClone(inboxPendingChecks);
const answers: Answer[] = structuredClone(inboxAnswers);

/** 진짜 데이터와 같은 목록 만들기(buildPendingList)에 넘길 모양으로 바꿔요 */
function toNotifyData(): NotifyData {
  return {
    issues: inboxIssues,
    standardVersions: inboxVersions.map(toVersionRecord),
    pendingChecks: checks
      .map(toNotifyCheck)
      .filter((check): check is NotifyPendingCheck => check !== null),
    answers: answers.map((answer) => ({
      id: answer.id,
      pendingCheckId: answer.pendingCheckId,
      answeredBy: answer.answeredBy ?? INBOX_RECIPIENT,
      affected: answer.affected,
      known: answer.known,
      unaffectedReason: answer.unaffectedReason,
      channel: answer.channel,
      answeredAt: answer.answeredAt,
    })),
  };
}

function findMyCheck(me: string, pendingCheckId: string) {
  const check = checks.find((item) => item.id === pendingCheckId);
  if (!check) throw new SilError('NOT_FOUND', '확인할 변경을 찾지 못했어요.');
  if (check.recipient !== me) {
    throw new SilError('FORBIDDEN', '받은 사람만 답할 수 있어요.');
  }
  return check;
}

export const mockApi: SilApi = {
  getAppInfo: async () => ({
    version: __APP_VERSION__,
    platform: currentPlatform(),
    dataMode: 'mock',
    db: null,
  }),

  listMyChanges: async (me) =>
    buildPendingList(
      toNotifyData(),
      { recipient: me, includeClosed: true },
      { now: MOCK_NOW },
    ).items,

  // DB 함수 save_answer와 같은 규칙으로 거절해요
  answer: async (me, input) => {
    const check = findMyCheck(me, input.pendingCheckId);
    if (check.status !== 'pending') {
      throw new SilError('PENDING_CLOSED', '이미 답했거나 닫힌 변경이에요.');
    }
    const reason = input.unaffectedReason?.trim() ?? '';
    if (input.affected && typeof input.known !== 'boolean') {
      throw new SilError('VALIDATION_FAILED', '알았는지 몰랐는지 골라 주세요.');
    }
    if (!input.affected && reason === '') {
      throw new SilError('VALIDATION_FAILED', '관계없는 이유를 적어 주세요.');
    }
    if (!input.affected && reason.length > MAX_UNAFFECTED_REASON_LENGTH) {
      throw new SilError(
        'VALIDATION_FAILED',
        `관계없는 이유는 ${MAX_UNAFFECTED_REASON_LENGTH}자 이하로 적어 주세요.`,
      );
    }
    const answeredAt = new Date().toISOString();
    const answerId = `mock-answer-${answers.length + 1}`;
    answers.push({
      id: answerId,
      pendingCheckId: check.id,
      affected: input.affected,
      known: input.affected ? (input.known ?? null) : null,
      unaffectedReason: input.affected ? null : reason,
      reworkNote: null,
      channel: 'app',
      elapsedSeconds: input.elapsedSeconds ?? null,
      answeredBy: me,
      answeredAt,
    });
    check.status = 'answered';
    check.closedAt = answeredAt;
    const issue = inboxIssues.find((item) => item.key === check.issueKey);
    return {
      answerId,
      pendingCheckId: check.id,
      issueKey: check.issueKey,
      issueStatus: issue?.status ?? 'in_progress',
      issueReopened: false,
    };
  },

  // DB 함수 save_reflected와 같은 규칙이에요. 이미 켜져 있으면 처음 표시한 시각을 그대로 둬요
  markReflected: async (me, pendingCheckId, reflected) => {
    const check = findMyCheck(me, pendingCheckId);
    if (check.status !== 'answered') {
      throw new SilError(
        'VALIDATION_FAILED',
        '답한 변경에만 반영했다고 표시할 수 있어요.',
      );
    }
    check.reflectedAt = reflected
      ? (check.reflectedAt ?? new Date().toISOString())
      : null;
    check.reflected = reflected;
    return {
      pendingCheckId,
      reflected: check.reflected,
      reflectedAt: check.reflectedAt,
    };
  },

  // 예시 데이터에는 새로 생기는 변경이 없어서 알려 줄 것이 없어요
  watchMyChanges: () => () => undefined,
};
