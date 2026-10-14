/**
 * `sil changelog` — DB 기록으로 team-wiki/CHANGELOG.md 줄을 만들어요 (work.wiki.changelog, data.changelog.format).
 *
 * MCP로 저장하면 결과에 한 줄(changelogLine)이 오지만, 그 줄을 붙이지 못한 경우를 한꺼번에 채울 때 써요.
 * --append를 붙이면 파일에 없는 줄만 맨 아래에 더해요 (같은 "기준 ID 이전→새 버전"이 있으면 건너뛰어요).
 * 출처가 wiki인 버전은 예전 위키에서 옮긴 것이라 이미 CHANGELOG에 있어서 빼요.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDataMode, listChangelogEntries } from '@sil/core/node';
import type { Command } from 'commander';

interface ChangelogOptions {
  since?: string;
  append?: string;
}

export function registerChangelog(program: Command): void {
  program
    .command('changelog')
    .description(
      'DB 기록으로 CHANGELOG 줄을 만들어요 (--append로 파일에 없는 줄만 더하기)',
    )
    .option('--since <날짜>', '이 날짜부터 (예: 2026-10-12)')
    .option(
      '--append <파일>',
      'team-wiki/CHANGELOG.md 맨 아래에 없는 줄만 더해요',
    )
    .action(async (options: ChangelogOptions) => {
      process.exitCode = await runChangelog(options);
    });
}

async function runChangelog(options: ChangelogOptions): Promise<number> {
  if (getDataMode() === 'none') {
    console.log(
      '✖ DB가 연결되지 않았어요. .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.',
    );
    return 1;
  }
  const since = options.since
    ? new Date(`${options.since}T00:00:00+09:00`)
    : undefined;
  if (since && Number.isNaN(since.getTime())) {
    console.log('✖ --since는 2026-10-12 같은 날짜예요.');
    return 1;
  }
  const entries = await listChangelogEntries({ since });
  if (!options.append) {
    for (const entry of entries) console.log(entry.line);
    if (entries.length === 0) console.log('새로 남길 줄이 없어요.');
    return 0;
  }

  const path = resolve(options.append);
  if (!existsSync(path)) {
    console.log(`✖ 파일이 없어요: ${path}`);
    return 1;
  }
  const existing = readFileSync(path, 'utf8');
  const missing = entries.filter(
    (entry) => !existing.includes(entry.line.split(' | ')[2]!),
  );
  if (missing.length > 0) {
    appendFileSync(
      path,
      `${existing.endsWith('\n') ? '' : '\n'}${missing.map((entry) => entry.line).join('\n')}\n`,
    );
  }
  console.log(
    `✔ ${missing.length}줄을 더했어요 (이미 있던 ${entries.length - missing.length}줄은 건너뜀): ${path}`,
  );
  return 0;
}
