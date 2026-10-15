/**
 * ③ 이슈 표: 이 결정 사항이 바뀌면 확인할 변경을 받는 이슈를 팀 DB에서 읽어요 (SIL-94).
 * 받는 이슈는 알리기(`createPendingChecks`)와 같은 규칙으로 골라요: 연결된 이슈 중 담당자가 있고
 * (notify.pending.no-owner) 바꾼 본인이 아닌(notify.target.skip-author) 이슈예요.
 * DB 주소·키가 없거나 읽지 못하면 null이에요. 이때 ③은 표 칸 이름만 보여 주고 등록은 막지 않아요.
 */
import type { Issue, PersonRef, StandardId } from '@sil/core';

/** ③ 표의 한 줄. 모양은 core 타입에서 골라 써요 */
export type T1Target = Pick<Issue, 'key' | 'assignee' | 'title'>;

/** DB를 오래 기다리지 않아요. ③이 늦게 뜨면 안 돼서요 */
const LOAD_TIMEOUT_MS = 5000;

export function pickTargets(
  issues: Issue[],
  standardId: StandardId,
  changedBy?: PersonRef | null,
): T1Target[] {
  return issues
    .filter(
      (issue) =>
        issue.standardIds.includes(standardId) &&
        issue.assignee !== null &&
        issue.assignee !== changedBy,
    )
    .map(({ key, assignee, title }) => ({ key, assignee, title }));
}

/** core의 `listIssues()`로 읽어요(팀원 .env의 Supabase 주소·공용 키). 읽지 못하면 null */
export async function loadTargets(
  standardId: StandardId,
  changedBy?: PersonRef | null,
): Promise<T1Target[] | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const { listIssues } = await import('@sil/core/node');
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('이슈를 읽는 데 너무 오래 걸려요')),
        LOAD_TIMEOUT_MS,
      );
    });
    const issues = await Promise.race([listIssues(), timeout]);
    return pickTargets(issues, standardId, changedBy);
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
