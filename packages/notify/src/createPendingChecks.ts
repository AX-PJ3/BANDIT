import type {
  IsoDateTime,
  Issue,
  IssueKey,
  PendingCheck,
  SavedVersion,
  VersionValue,
} from './types.ts';

export interface CreatePendingChecksInput {
  /** 방금 저장된 새 버전 */
  saved: SavedVersion;
  /** 이슈 목록. 이 기준과 연결되지 않은 이슈가 섞여 있어도 돼요 */
  issues: Issue[];
  /** 지금까지 만든 확인할 변경. 다른 기준 것이 섞여 있어도 돼요 */
  existing: PendingCheck[];
  /** 이 기준의 이전 버전 값들. 되돌림 자동 닫힘을 판단할 때 써요 */
  history: VersionValue[];
  /** 지금 시각. 만든 시각과 닫은 시각에 써요 */
  now: IsoDateTime;
  /** 새 확인할 변경의 ID를 만드는 함수. 안 주면 UUID */
  makeId?: () => string;
}

/** 확인할 변경을 만들지 않은 이슈와 그 이유 */
export interface SkippedIssue {
  issueKey: IssueKey;
  reason: SkipReason;
}

export type SkipReason =
  /** 기준을 바꾼 본인 (notify.target.skip-author) */
  | 'author'
  /** 담당자 없음 (notify.pending.no-owner) */
  | 'no_assignee'
  /** 되돌려서 마지막으로 본 값과 같아짐. 열린 확인할 변경이 없어서 닫을 것도 없음 */
  | 'same_as_last_seen';

/** 닫을 확인할 변경. 대체됨 또는 자동 닫힘 */
export interface ClosedCheck {
  id: string;
  status: 'superseded' | 'auto_closed';
  closedAt: IsoDateTime;
}

export interface CreatePendingChecksResult {
  /** 새로 만들 확인할 변경 (상태는 모두 대기) */
  created: PendingCheck[];
  /** 상태를 바꿔 닫을 기존 확인할 변경 */
  closed: ClosedCheck[];
  /** 만들지 않은 이슈와 이유. 로그와 테스트에 써요 */
  skipped: SkippedIssue[];
}

/**
 * 새 버전이 저장됐을 때 누구에게 확인할 변경을 만들지 정해요.
 *
 * 저장하지 않고 "만들 것"과 "닫을 것"만 돌려주는 순수 함수예요. 저장은 부르는 쪽이 해요.
 * 규칙은 착수 안내 "6. 개발자 3명"의 예외 처리 4가지와 팀 위키 notify.* 기준을 따라요.
 *
 * 1. 연결된 이슈마다 확인할 변경을 하나씩 만들어요. 완료된 이슈도 포함해요.
 * 2. 기준을 바꾼 본인과 담당자가 없는 이슈는 건너뛰어요.
 * 3. 같은 이슈에 답하지 않은 이전 건이 있으면 "대체됨"으로 닫아요.
 * 4. 새 값이 담당자가 마지막으로 본 값과 같으면(되돌림) 새로 만들지 않고, 열린 건은 "자동 닫힘"으로 닫아요.
 */
export function createPendingChecks(
  input: CreatePendingChecksInput,
): CreatePendingChecksResult {
  const { saved, now } = input;
  const makeId = input.makeId ?? (() => crypto.randomUUID());
  const valueByVersion = new Map(
    input.history.map((h) => [h.version, h.value]),
  );

  const created: PendingCheck[] = [];
  const closed: ClosedCheck[] = [];
  const skipped: SkippedIssue[] = [];

  const linkedIssues = input.issues.filter((issue) =>
    issue.standardIds.includes(saved.standardId),
  );

  for (const issue of linkedIssues) {
    if (issue.assignee === null) {
      skipped.push({ issueKey: issue.key, reason: 'no_assignee' });
      continue;
    }
    if (saved.changedBy !== null && issue.assignee === saved.changedBy) {
      skipped.push({ issueKey: issue.key, reason: 'author' });
      continue;
    }

    const checksForIssue = input.existing.filter(
      (check) =>
        check.standardId === saved.standardId && check.issueKey === issue.key,
    );
    const openCheck = checksForIssue.find(
      (check) => check.status === 'pending',
    );
    const lastSeenVersion = findLastSeenVersion(checksForIssue, saved.version);

    const lastSeenValue =
      lastSeenVersion === null
        ? undefined
        : valueByVersion.get(lastSeenVersion);
    const isBackToLastSeen =
      lastSeenValue !== undefined && lastSeenValue === saved.value;

    if (isBackToLastSeen) {
      if (openCheck) {
        closed.push({ id: openCheck.id, status: 'auto_closed', closedAt: now });
      } else {
        skipped.push({ issueKey: issue.key, reason: 'same_as_last_seen' });
      }
      continue;
    }

    if (openCheck) {
      closed.push({ id: openCheck.id, status: 'superseded', closedAt: now });
    }

    created.push({
      id: makeId(),
      standardId: saved.standardId,
      version: saved.version,
      issueKey: issue.key,
      recipient: issue.assignee,
      status: 'pending',
      lastSeenVersion,
      createdAt: now,
      closedAt: null,
      reflected: false,
      reflectedAt: null,
    });
  }

  return { created, closed, skipped };
}

/**
 * 담당자가 마지막으로 본 버전을 찾아요.
 *
 * - 답한 건이 있으면 그중 가장 높은 버전
 * - 없고 열린 건이 있으면 그 건이 기억하는 마지막으로 본 버전 (notify.pending.merge-versions)
 * - 둘 다 없으면 바로 앞 버전. 새로 생긴 기준(v1)이면 null
 */
function findLastSeenVersion(
  checksForIssue: PendingCheck[],
  savedVersion: number,
): number | null {
  const answeredVersions = checksForIssue
    .filter((check) => check.status === 'answered')
    .map((check) => check.version);
  if (answeredVersions.length > 0) {
    return Math.max(...answeredVersions);
  }

  const openCheck = checksForIssue.find((check) => check.status === 'pending');
  if (openCheck) {
    return openCheck.lastSeenVersion;
  }

  return savedVersion > 1 ? savedVersion - 1 : null;
}
