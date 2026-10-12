/**
 * DB 기록으로 team-wiki/CHANGELOG.md 줄을 만들어요 (work.wiki.changelog, data.changelog.format).
 *
 * MCP와 바뀐 기준 찾기는 저장할 때마다 한 줄(changelogLine)을 돌려줘요. 이 함수는 놓친 줄을 한꺼번에 채울 때 써요.
 * 출처가 wiki인 버전은 예전 위키 파일에서 가져온 것이라 CHANGELOG에 이미 있어서 빼요.
 */
import { formatChangelogLine } from '../changelog.ts';
import { listAllVersions } from '../data/standards.ts';

export interface ChangelogEntry {
  /** 저장한 시각 (ISO). 줄을 시간 순으로 놓을 때 써요 */
  at: string;
  standardId: string;
  version: number;
  line: string;
}

export async function listChangelogEntries(
  options: { since?: Date; includeWiki?: boolean } = {},
): Promise<ChangelogEntry[]> {
  const versions = await listAllVersions();
  const valueOf = new Map(
    versions.map((v) => [`${v.standardId}@${v.version}`, v.value]),
  );
  return versions
    .filter((v) => options.includeWiki || v.source !== 'wiki')
    .filter((v) => !options.since || new Date(v.createdAt) >= options.since)
    .map((v) => ({
      at: v.createdAt,
      standardId: v.standardId,
      version: v.version,
      line: formatChangelogLine({
        at: v.createdAt,
        by: v.changedBy,
        standardId: v.standardId,
        fromVersion: v.version === 1 ? null : v.version - 1,
        toVersion: v.version,
        before: valueOf.get(`${v.standardId}@${v.version - 1}`) ?? null,
        after: v.value,
        reason: v.reason,
        source: v.source,
        revertedToVersion: v.revertedToVersion,
      }),
    }))
    .sort(
      (a, b) =>
        a.at.localeCompare(b.at) || a.standardId.localeCompare(b.standardId),
    );
}
