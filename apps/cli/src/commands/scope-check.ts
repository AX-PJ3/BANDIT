/**
 * `sil scope-check` — 위키 적용 범위의 코드 경로가 저장소의 실제 파일과 맞는지 확인해요.
 *
 * 바뀐 기준 찾기는 PR에서 바뀐 파일과 적용 범위가 겹치는 기준만 AI에게 보내요 (detect.filter.scope-first).
 * 맞는 파일이 없는 경로는 그 기준이 영영 걸리지 않는다는 뜻이에요. 아직 만들지 않은 코드일 수도 있어요.
 * 목록을 보고 각 영역 DRI가 위키 기준의 적용 범위를 새 버전으로 고쳐요 (기준 작성 원칙 4).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  checkScopePaths,
  findRepoRoot,
  listRepoFiles,
  readTeamWiki,
} from '@sil/core/node';
import type { Command } from 'commander';

interface ScopeCheckOptions {
  wiki?: string;
  root?: string;
  strict?: boolean;
}

export function registerScopeCheck(program: Command): void {
  program
    .command('scope-check')
    .description('위키 적용 범위의 코드 경로가 실제 파일과 맞는지 확인해요')
    .option('--wiki <폴더>', 'team-wiki 폴더 (기본: 저장소의 team-wiki/)')
    .option('--root <폴더>', '파일을 찾을 저장소 폴더 (기본: 이 저장소)')
    .option('--strict', '맞지 않는 경로가 있으면 실패로 끝내요 (CI용)')
    .action((options: ScopeCheckOptions) => {
      process.exitCode = runScopeCheck(options);
    });
}

function runScopeCheck(options: ScopeCheckOptions): number {
  const root = resolve(options.root ?? findRepoRoot());
  const wikiDir = resolve(options.wiki ?? join(root, 'team-wiki'));
  if (!existsSync(wikiDir)) {
    console.log(
      `✖ 위키 폴더가 없어요: ${wikiDir}\n   → --wiki <폴더>로 알려 주세요`,
    );
    return 1;
  }
  const wiki = readTeamWiki(wikiDir);
  const reports = checkScopePaths(wiki.entries, listRepoFiles(root));
  const notPaths = reports.filter((report) => report.notAPath);
  const missing = reports.filter(
    (report) => report.matchedFiles === 0 && !report.notAPath,
  );

  console.log(`위키: ${wikiDir}\n저장소: ${root}`);
  console.log(
    `코드 경로 ${reports.length}개 중 ${reports.filter((report) => report.matchedFiles > 0).length}개가 실제 파일과 맞아요.`,
  );
  for (const report of notPaths) {
    console.log(
      `  ⚠ '${report.pattern}'는 파일 경로가 아니라서 바뀐 기준 찾기가 맞춰 볼 수 없어요 ← ${report.standardIds.join(', ')}`,
    );
  }
  if (missing.length === 0)
    return options.strict && notPaths.length > 0 ? 1 : 0;
  console.log(
    `\n맞는 파일이 없는 경로 ${missing.length}개 (이름이 바뀌었거나 아직 만들지 않은 코드):`,
  );
  for (const report of missing) {
    console.log(`  - ${report.pattern}  ← ${report.standardIds.join(', ')}`);
    if (report.candidates.length > 0)
      console.log(`      비슷한 파일: ${report.candidates.join(', ')}`);
  }
  return options.strict ? 1 : 0;
}
