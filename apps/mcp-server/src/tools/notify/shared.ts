/**
 * 알리기 도구들이 함께 쓰는 것: 부른 사람 확인, DB에서 알리기 데이터 모으기.
 *
 * 목록을 만들고 답을 검사하는 규칙은 @sil/notify의 순수 함수(buildPendingList, checkAnswer)에 있어요.
 * 여기서는 core의 DB 함수로 그 함수가 받는 모양(NotifyData)을 채우기만 해요 (SIL-17: DB를 직접 부르지 않아요).
 */
import {
  SilError,
  type AnswerRecord,
  type PendingCheck as CorePendingCheck,
  type StandardVersion,
} from '@sil/core';
import {
  getStandardHistory,
  listAnswerRecords,
  listIssues,
  listPendingChecks,
} from '@sil/core/node';
import type {
  Answer,
  NotifyData,
  PendingCheck,
  StandardVersionRecord,
} from '@sil/notify';
import type { ToolContext } from '../../lib/define-tool.ts';

/**
 * 부른 사람 이름. 알리기 도구는 "나에게 온 변경"만 다뤄서 이름이 꼭 있어야 해요.
 * 다른 사람 이름을 입력으로 받지 않아요. 남의 변경을 보거나 대신 답하지 못하게 하려고요.
 */
export function requireUser(context: ToolContext): string {
  if (!context.user) {
    throw new SilError(
      'FORBIDDEN',
      '누구인지 알 수 없어서 나에게 온 변경을 찾을 수 없어요. MCP 서버를 등록할 때 X-Sil-User에 이름을 넣어 주세요 (pnpm mcp:register).',
    );
  }
  return context.user;
}

/** core의 확인할 변경을 @sil/notify 모양으로. 받는 사람이 없는 줄은 알릴 사람이 없어서 빼요 (notify.pending.no-owner) */
export function toNotifyCheck(check: CorePendingCheck): PendingCheck | null {
  if (check.recipient === null) return null;
  return {
    id: check.id,
    standardId: check.standardId,
    version: check.version,
    issueKey: check.issueKey,
    recipient: check.recipient,
    status: check.status,
    lastSeenVersion: check.lastSeenVersion,
    createdAt: check.createdAt,
    closedAt: check.closedAt,
    reflected: check.reflected,
    reflectedAt: check.reflectedAt,
  };
}

function toVersionRecord(version: StandardVersion): StandardVersionRecord {
  return {
    standardId: version.standardId,
    version: version.version,
    title: version.title,
    value: version.value,
    reason: version.reason,
    changedBy: version.changedBy,
    changedAt: version.createdAt,
    source: version.source,
    aiDetected: version.aiDetected,
    isRevert: version.isRevert,
  };
}

/**
 * 응답 기록 보기(answer_records)에는 확인할 변경 ID가 없어요.
 * 결정 사항 ID, 버전, 이슈 번호, 답한 사람이 같으면 같은 확인할 변경이라 그걸로 이어 붙여요.
 * (확인할 변경은 결정 사항 버전 하나와 이슈 하나마다 한 줄이에요, notify.pending.one-per-issue)
 */
function toAnswers(records: AnswerRecord[], checks: PendingCheck[]): Answer[] {
  const answers: Answer[] = [];
  for (const record of records) {
    const check = checks.find(
      (c) =>
        c.standardId === record.standardId &&
        c.version === record.version &&
        c.issueKey === record.issueKey &&
        c.recipient === record.answeredBy,
    );
    if (!check || record.answeredBy === null) continue;
    answers.push({
      id: record.answerId,
      pendingCheckId: check.id,
      answeredBy: record.answeredBy,
      affected: record.affected,
      known: record.known,
      unaffectedReason: record.unaffectedReason,
      channel: record.channel,
      answeredAt: record.answeredAt,
    });
  }
  return answers;
}

/**
 * 한 사람의 목록을 만드는 데 필요한 데이터만 DB에서 모아요.
 * 확인할 변경은 이 사람 것 전부(닫힌 것 포함), 기준 버전은 그 변경들에 나오는 결정 사항 것만 읽어요.
 */
export async function loadNotifyData(recipient: string): Promise<NotifyData> {
  const [coreChecks, issues, records] = await Promise.all([
    listPendingChecks({ recipient, status: 'all' }),
    listIssues(),
    listAnswerRecords(),
  ]);
  const pendingChecks = coreChecks
    .map(toNotifyCheck)
    .filter((check): check is PendingCheck => check !== null);

  const standardIds = [...new Set(pendingChecks.map((c) => c.standardId))];
  const histories = await Promise.all(standardIds.map(getStandardHistory));
  const standardVersions = histories.flatMap((history) =>
    history ? history.versions.map(toVersionRecord) : [],
  );

  return {
    issues,
    standardVersions,
    pendingChecks,
    answers: toAnswers(records, pendingChecks),
  };
}
