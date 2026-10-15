/**
 * 확인할 변경, 결정 사항 버전, 이슈, 답을 카드 한 장(MyChange)으로 묶어요. database.ts와 mock.ts가 같이 써요.
 *
 * 여기서는 묶기만 해요. 목록 규칙(답함·대체됨 7일 뒤 숨기기, 지난번 답 찾기)은 @sil/notify의
 * buildPendingList가 하고, SIL-100으로 웹에서 그 함수를 쓸 수 있게 되면 이 파일을 그 함수로 바꿔요 (10/15 호윤).
 * 자동 닫힘은 카드 모양(MyChange.status)에 없어서 여기서 빼요 (notify.pending.hide-auto-closed).
 */
import { SilError } from '@sil/core';
import type { Answer, Issue, PendingCheck, StandardVersion } from '@sil/core';
import type { MyChange } from './types.ts';

export type MyChangeAnswerRow = Pick<
  Answer,
  | 'pendingCheckId'
  | 'affected'
  | 'known'
  | 'unaffectedReason'
  | 'channel'
  | 'answeredAt'
>;

export interface MyChangeSource {
  checks: PendingCheck[];
  versions: StandardVersion[];
  issues: Issue[];
  answers: MyChangeAnswerRow[];
}

export function toMyChanges(source: MyChangeSource): MyChange[] {
  const findVersion = (standardId: string, version: number) =>
    source.versions.find(
      (item) => item.standardId === standardId && item.version === version,
    );

  return source.checks
    .flatMap((check): MyChange[] => {
      if (check.status === 'auto_closed') return [];
      const current = findVersion(check.standardId, check.version);
      const issue = source.issues.find((item) => item.key === check.issueKey);
      // 못 찾으면 빈 목록 대신 에러를 내요 (notify.error.not-empty)
      if (!current) {
        throw new SilError(
          'DB_ERROR',
          `확인할 변경의 결정 사항 버전(${check.standardId} v${check.version})을 찾지 못했어요.`,
        );
      }
      if (!issue) {
        throw new SilError(
          'DB_ERROR',
          `확인할 변경의 이슈(${check.issueKey})를 찾지 못했어요.`,
        );
      }
      const previous =
        check.lastSeenVersion === null
          ? undefined
          : findVersion(check.standardId, check.lastSeenVersion);
      const answer = source.answers.find(
        (item) => item.pendingCheckId === check.id,
      );
      return [
        {
          pendingCheckId: check.id,
          status: check.status,
          createdAt: check.createdAt,
          reflected: check.reflected,
          reflectedAt: check.reflectedAt,
          standard: {
            id: current.standardId,
            title: current.title,
            version: current.version,
            value: current.value,
            previousVersion: previous ? previous.version : null,
            previousValue: previous ? previous.value : null,
            reason: current.reason,
            changedBy: current.changedBy,
            changedAt: current.createdAt,
            source: current.source,
            aiDetected: current.aiDetected,
            isRevert: current.isRevert,
          },
          issue: { key: issue.key, title: issue.title, status: issue.status },
          answer: answer
            ? {
                affected: answer.affected,
                known: answer.known,
                unaffectedReason: answer.unaffectedReason,
                channel: answer.channel,
                answeredAt: answer.answeredAt,
              }
            : null,
          previousAnswer: null,
        },
      ];
    })
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        b.standard.version - a.standard.version,
    );
}
