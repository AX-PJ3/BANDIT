/**
 * DB(@sil/core)에서 읽은 값을 목록 만들기(buildPendingList)가 받는 모양(NotifyData)으로 바꿔요 (SIL-100).
 *
 * MCP 서버(터미널)와 웹 앱이 이 함수를 같이 써서, 두 곳의 "나에게 온 변경" 목록이 같은 규칙으로 나와요 (notify.list.one-call).
 * DB 함수는 직접 가져오지 않고 넘겨받아요. 서버는 @sil/core/node, 웹 앱은 @sil/core/data의 같은 함수를 넘기면 돼요.
 * 그래서 이 파일은 Node 전용 모듈 없이 브라우저에서도 돌아가요. core는 타입만 가져와요.
 */
import type {
  AnswerRecord,
  Issue as CoreIssue,
  PendingCheck as CorePendingCheck,
  StandardHistory,
  StandardVersion,
} from '@sil/core';
import type { PendingCheckQuery } from '@sil/core/data';
import type {
  Answer,
  NotifyData,
  PendingCheck,
  StandardVersionRecord,
} from './types.ts';

/** loadNotifyData가 부르는 DB 함수 네 개. @sil/core/data(웹)나 @sil/core/node(서버)의 같은 이름 함수를 넘겨요 */
export interface NotifyDataSource {
  listPendingChecks(query: PendingCheckQuery): Promise<CorePendingCheck[]>;
  listIssues(): Promise<CoreIssue[]>;
  listAnswerRecords(): Promise<AnswerRecord[]>;
  getStandardHistory(id: string): Promise<StandardHistory | null>;
}

/** core의 확인할 변경을 notify 모양으로. 받는 사람이 없는 줄은 알릴 사람이 없어서 빼요 (notify.pending.no-owner) */
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

/** core의 결정 사항 버전을 notify 모양으로. 저장한 시각(createdAt)이 바꾼 시각(changedAt)이에요 */
export function toVersionRecord(
  version: StandardVersion,
): StandardVersionRecord {
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
export function toAnswers(
  records: AnswerRecord[],
  checks: PendingCheck[],
): Answer[] {
  const answers: Answer[] = [];
  for (const record of records) {
    if (record.answeredBy === null) continue;
    const check = checks.find(
      (c) =>
        c.standardId === record.standardId &&
        c.version === record.version &&
        c.issueKey === record.issueKey &&
        c.recipient === record.answeredBy,
    );
    if (!check) continue;
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
 * 확인할 변경은 이 사람 것 전부(닫힌 것 포함), 결정 사항 버전은 그 변경들에 나오는 결정 사항 것만 읽어요.
 * 읽지 못하면 오류를 그대로 던져요. 빈 목록으로 바꾸지 않아요 (notify.error.not-empty).
 */
export async function loadNotifyData(
  source: NotifyDataSource,
  recipient: string,
): Promise<NotifyData> {
  const [coreChecks, issues, records] = await Promise.all([
    source.listPendingChecks({ recipient, status: 'all' }),
    source.listIssues(),
    source.listAnswerRecords(),
  ]);
  const pendingChecks = coreChecks
    .map(toNotifyCheck)
    .filter((check): check is PendingCheck => check !== null);

  const standardIds = [...new Set(pendingChecks.map((c) => c.standardId))];
  const histories = await Promise.all(
    standardIds.map((id) => source.getStandardHistory(id)),
  );
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
