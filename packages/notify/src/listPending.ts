import type { NotifyStore } from './store.js';
import type {
  AnswerChannel,
  IsoDateTime,
  IssueKey,
  IssueStatus,
  PendingCheck,
  PendingCheckStatus,
  StandardId,
  StandardSource,
} from './types.js';

export interface ListPendingInput {
  /** 받는 사람 이름 */
  recipient: string;
  /**
   * true면 답함과 대체됨도 함께 돌려줘요. 웹 앱 목록(A2)은 이 옵션으로 한 번 불러서 화면이 상태별로 나눠요 (notify.list.one-call).
   * 답하거나 대체된 지 7일이 지난 것은 돌려주지 않아요 (notify.list.closed-7-days). 기록은 지우지 않아요.
   * 자동 닫힘은 화면에 보이지 않아서 어느 경우에도 돌려주지 않아요 (notify.pending.hide-auto-closed).
   */
  includeClosed?: boolean;
}

/** 답한 변경(답함, 대체됨)을 목록에 보여 주는 기간 (notify.list.closed-7-days) */
export const CLOSED_VISIBLE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ListPendingOptions {
  /** 지금 시각. 7일 기간을 잴 때 써요. 안 주면 실제 시각 */
  now?: IsoDateTime;
}

export interface ListPendingResult {
  recipient: string;
  /** 대기 상태인 확인할 변경 수. 0이면 빈 화면이에요 */
  pendingCount: number;
  /** 최신 것이 먼저 와요 */
  items: PendingItem[];
}

/** 화면 한 칸을 채우는 데 필요한 것을 모두 담은 확인할 변경 하나 */
export interface PendingItem {
  pendingCheckId: string;
  status: Exclude<PendingCheckStatus, 'auto_closed'>;
  createdAt: IsoDateTime;
  /** 반영했다고 표시했는지 (notify.check.reflected) */
  reflected: boolean;
  reflectedAt: IsoDateTime | null;
  standard: PendingItemStandard;
  issue: PendingItemIssue;
  /** 대기면 null */
  answer: PendingItemAnswer | null;
}

export interface PendingItemStandard {
  id: StandardId;
  title: string;
  version: number;
  value: string;
  /** 받는 사람이 마지막으로 본 버전. 새로 생긴 기준이면 null */
  previousVersion: number | null;
  /** 받는 사람이 마지막으로 본 버전의 값. 바로 앞 버전 값이 아닐 수 있어요. 새로 생긴 기준이면 null */
  previousValue: string | null;
  reason: string;
  changedBy: string | null;
  changedAt: IsoDateTime;
  source: StandardSource;
  aiDetected: boolean;
  isRevert: boolean;
}

export interface PendingItemIssue {
  key: IssueKey;
  title: string;
  status: IssueStatus;
}

export interface PendingItemAnswer {
  affected: boolean;
  known: boolean | null;
  unaffectedReason: string | null;
  channel: AnswerChannel;
  answeredAt: IsoDateTime;
}

/**
 * 한 사람에게 온 확인할 변경 목록을 화면에 바로 쓸 수 있는 모양으로 돌려줘요.
 *
 * 제목, 값, 이유, 이슈 제목까지 붙여서 돌려줘서 화면이 get_standard를 다시 부르지 않아도 돼요.
 * 필요한 기준 버전이나 이슈를 찾지 못하면 빈 목록 대신 오류를 내요.
 * 연결 실패를 "변경 없음"으로 보여 주면 담당자가 바뀐 기준을 놓쳐요 (notify.error.not-empty).
 */
export async function listPending(
  store: NotifyStore,
  input: ListPendingInput,
  options: ListPendingOptions = {},
): Promise<ListPendingResult> {
  const data = await store.read();
  const now = Date.parse(options.now ?? new Date().toISOString());
  const closedCutoff = now - CLOSED_VISIBLE_DAYS * DAY_MS;

  const isVisible = (check: PendingCheck): boolean => {
    if (check.status === 'pending') return true;
    if (!input.includeClosed) return false;
    if (check.status === 'auto_closed') return false;
    // 닫힌 시각이 없으면 언제 닫혔는지 몰라서 보여 줘요
    return check.closedAt === null || Date.parse(check.closedAt) > closedCutoff;
  };

  const checks = data.pendingChecks
    .filter((check) => check.recipient === input.recipient && isVisible(check))
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        b.version - a.version,
    );

  const findVersion = (standardId: StandardId, version: number) =>
    data.standardVersions.find(
      (record) =>
        record.standardId === standardId && record.version === version,
    );

  const items = checks.map((check): PendingItem => {
    const current = findVersion(check.standardId, check.version);
    if (!current) {
      throw new Error(
        `확인할 변경 ${check.id}의 기준 버전(${check.standardId} v${check.version})을 찾지 못했어요.`,
      );
    }
    const issue = data.issues.find((i) => i.key === check.issueKey);
    if (!issue) {
      throw new Error(
        `확인할 변경 ${check.id}의 이슈(${check.issueKey})를 찾지 못했어요.`,
      );
    }
    const previous =
      check.lastSeenVersion === null
        ? undefined
        : findVersion(check.standardId, check.lastSeenVersion);
    const answer = data.answers.find((a) => a.pendingCheckId === check.id);

    return {
      pendingCheckId: check.id,
      status: check.status as PendingItem['status'],
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
        changedAt: current.changedAt,
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
    };
  });

  return {
    recipient: input.recipient,
    pendingCount: items.filter((item) => item.status === 'pending').length,
    items,
  };
}
