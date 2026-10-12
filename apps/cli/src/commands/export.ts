/**
 * `sil export` — 응답 기록을 14칸 표(CSV)로 내보내고, Metric Review 숫자를 보여 줘요.
 *
 * - 도구가 남긴 답(DB)과 사람이 적은 답(team-wiki/answers.csv)을 한 표로 합쳐요 (data.response.columns, data.response.method).
 * - 숫자는 "N건 중 M건"으로 보여 줘요 (goal.report.as-is). 취소한 답은 표에는 남기고 숫자에서는 빼요.
 * - DB가 연결되지 않았으면 사람이 적은 답만 내보내요.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StandardVersion } from '@sil/core';
import {
  findRepoRoot,
  getDataMode,
  listAllVersions,
  listAnswerRecords,
  listPendingChecks,
} from '@sil/core/node';
import type { Command } from 'commander';
import { formatMetrics, summarizeMetrics } from '../export/metrics.ts';
import {
  fromAnswerRecord,
  parseManualAnswers,
  type ResponseRow,
  toResponseCsv,
} from '../export/records.ts';

interface ExportOptions {
  out?: string;
  answers?: string;
  manual: boolean;
}

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('응답 기록을 14칸 표(CSV)로 내보내고 지표를 보여 줘요')
    .option('--out <파일>', 'CSV를 저장할 곳 (기본: sil-export-날짜.csv)')
    .option(
      '--answers <CSV 파일>',
      '사람이 적은 답 (기본: team-wiki/answers.csv)',
    )
    .option('--no-manual', '사람이 적은 답은 빼고 도구가 남긴 답만')
    .action(async (options: ExportOptions) => {
      process.exitCode = await runExport(options);
    });
}

async function runExport(options: ExportOptions): Promise<number> {
  const connected = getDataMode() === 'database';
  const [records, versions, pendingChecks] = connected
    ? await Promise.all([
        listAnswerRecords(),
        listAllVersions(),
        listPendingChecks({ status: 'all' }),
      ])
    : [[], [] as StandardVersion[], []];

  const rows: ResponseRow[] = records.map(fromAnswerRecord);
  if (options.manual) {
    const path = options.answers
      ? resolve(options.answers)
      : join(findRepoRoot(), 'team-wiki', 'answers.csv');
    if (existsSync(path)) {
      const manual = parseManualAnswers(readFileSync(path, 'utf8'), versions);
      rows.push(...manual.rows);
      console.log(`사람이 적은 답: ${path} (${manual.rows.length}건)`);
      for (const problem of manual.problems) console.log(`  ⚠ ${problem}`);
    } else if (options.answers) {
      console.log(`✖ 파일이 없어요: ${path}`);
      return 1;
    }
  }
  if (!connected) {
    console.log(
      'DB가 연결되지 않아 사람이 적은 답만 내보내요. (.env의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)',
    );
  }

  rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const out = resolve(
    options.out ?? `sil-export-${new Date().toISOString().slice(0, 10)}.csv`,
  );
  writeFileSync(out, toResponseCsv(rows));
  console.log(`✔ 응답 기록 ${rows.length}건을 저장했어요: ${out}`);

  console.log('');
  for (const line of formatMetrics(
    summarizeMetrics({
      rows,
      versions,
      pendingCheckCount: pendingChecks.length,
    }),
  )) {
    console.log(line);
  }
  return 0;
}
