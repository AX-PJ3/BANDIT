import type { Issue } from '@sil/core';

/** 이슈 담당자 이름을 겹치지 않게 가나다순으로 모아요. 담당자가 없는 이슈는 건너뛰어요 */
export function toPeople(issues: Pick<Issue, 'assignee'>[]): string[] {
  const names = new Set<string>();
  for (const issue of issues) {
    const name = issue.assignee?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}
