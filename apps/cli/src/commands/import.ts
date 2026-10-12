/**
 * `sil import` — 레포의 team-wiki/ 파일에서 기준과 이슈를 읽어 DB에 넣어요 (SIL-65).
 *
 * 기준은 지울 수 없어서, 기본은 "무엇을 할지 보여 주기"만 해요. 실제로 저장하려면 --apply를 붙여요.
 * - DB에 없는 기준: 새로 저장 (출처 wiki, 고친 사람은 --by, 기본 '팀 위키')
 * - DB와 같은 기준: 건너뜀. 몇 번을 돌려도 같은 결과예요.
 * - DB와 다른 기준: 알려만 줘요. --update를 붙이면 새 버전으로 저장해요 (AI가 그사이 고친 버전을 덮지 않으려고요).
 * - 이슈: 이슈 번호마다 저장해요. 같은 번호가 있으면 제목·담당자·상태·연결을 파일과 같게 맞춰요.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type ImportProblem,
  type IssueEntry,
  isSilError,
  type WikiEntry,
} from '@sil/core';
import {
  deprecateStandard,
  findIssuesFile,
  findRepoRoot,
  getDataMode,
  listStandards,
  planWikiImport,
  readIssuesFile,
  readTeamWiki,
  saveIssue,
  saveStandard,
  type WikiImportPlan,
} from '@sil/core/node';
import type { Command } from 'commander';

interface ImportOptions {
  wiki?: string;
  issues?: string;
  apply?: boolean;
  update?: boolean;
  by: string;
}

export function registerImport(program: Command): void {
  program
    .command('import')
    .description(
      'team-wiki/ 파일의 결정 사항과 이슈를 DB에 넣어요 (기본은 미리 보기, --apply로 저장)',
    )
    .option('--wiki <폴더>', 'team-wiki 폴더 (기본: 저장소의 team-wiki/)')
    .option(
      '--issues <CSV 파일>',
      '이슈 파일 (기본: team-wiki/issues.csv가 있으면 그 파일)',
    )
    .option(
      '--apply',
      '실제로 저장해요. 결정 사항은 지울 수 없으니 미리 보기를 먼저 확인해요',
    )
    .option(
      '--update',
      'DB와 내용이 다른 결정 사항을 새 버전으로 저장해요 (--apply와 함께)',
    )
    .option('--by <이름>', '고친 사람으로 남길 이름 (10자 이하)', '팀 위키')
    .action(async (options: ImportOptions) => {
      process.exitCode = await runImport(options);
    });
}

async function runImport(options: ImportOptions): Promise<number> {
  const wikiDir = resolve(options.wiki ?? join(findRepoRoot(), 'team-wiki'));
  if (!existsSync(wikiDir)) {
    console.log(`✖ 위키 폴더가 없어요: ${wikiDir}`);
    console.log('   → --wiki <폴더>로 team-wiki 폴더를 알려 주세요');
    return 1;
  }

  const wiki = readTeamWiki(wikiDir);
  const issuesPath = options.issues
    ? resolve(options.issues)
    : findIssuesFile(wikiDir);
  const issues = issuesPath
    ? readIssuesFile(issuesPath)
    : { entries: [], problems: [] };
  const problems = [...wiki.problems, ...issues.problems];

  console.log(`위키: ${wikiDir}`);
  console.log(
    `  파일 ${wiki.files.length}개에서 결정 사항 ${wiki.entries.length}개를 읽었어요`,
  );
  console.log(
    issuesPath
      ? `이슈: ${issuesPath}\n  이슈 ${issues.entries.length}개를 읽었어요`
      : '이슈: 파일이 없어서 건너뛰어요 (--issues <CSV 파일>로 알려 주세요)',
  );
  printProblems(problems);
  const unknownLinks = findUnknownLinks(issues.entries, wiki.entries);
  if (unknownLinks.length > 0) {
    console.log(
      '  ⚠ 위키 파일에 없는 결정 사항에 연결된 이슈가 있어요 (DB에도 없으면 그 이슈는 저장이 거절돼요):',
    );
    for (const link of unknownLinks) console.log(`    - ${link}`);
  }

  if (getDataMode() === 'none') {
    console.log(
      '\nDB가 연결되지 않아 파일만 확인했어요. 저장하려면 .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 채워요.',
    );
    if (options.apply) return 1;
    return hasErrors(problems) ? 1 : 0;
  }

  const plan = planWikiImport(
    wiki.entries,
    await listStandards({ includeDeprecated: true }),
  );
  printPlan(plan, issues.entries.length, options);
  if (!options.apply) {
    console.log(
      '\n미리 보기만 했어요. 저장하려면 --apply를 붙여 다시 실행해요.',
    );
    return hasErrors(problems) ? 1 : 0;
  }

  const failures = await applyPlan(plan, issues.entries, options);
  console.log(
    failures === 0
      ? '\n✔ 저장을 마쳤어요.'
      : `\n✖ ${failures}개를 저장하지 못했어요. 위 → 표시를 확인해 주세요.`,
  );
  return failures > 0 || hasErrors(problems) ? 1 : 0;
}

async function applyPlan(
  plan: WikiImportPlan,
  issues: IssueEntry[],
  options: ImportOptions,
): Promise<number> {
  let failures = 0;
  const attempt = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
      console.log(`  ✔ ${label}`);
    } catch (error) {
      failures += 1;
      console.log(
        `  ✖ ${label}\n     → ${isSilError(error) ? `[${error.code}] ${error.message}` : String(error)}`,
      );
    }
  };
  const human = {
    changedByActor: 'human' as const,
    changedBy: options.by,
    source: 'wiki' as const,
  };

  console.log('\n저장해요');
  for (const entry of plan.create) {
    await attempt(`${entry.id} 새로 저장 (v1)`, () =>
      saveStandard({ ...toSaveInput(entry), baseVersion: 0, ...human }),
    );
  }
  if (options.update) {
    for (const { entry, current, changed } of plan.different) {
      const contentChanged = changed.some((field) => field !== '상태');
      if (contentChanged) {
        await attempt(`${entry.id} 새 버전 (${changed.join(', ')})`, () =>
          saveStandard({
            ...toSaveInput(entry),
            baseVersion: current.latest.version,
            ...human,
          }),
        );
      }
      if (
        entry.status === 'active' &&
        current.standard.status === 'deprecated'
      ) {
        failures += 1;
        console.log(
          `  ✖ ${entry.id}: 폐기된 결정 사항을 사용으로 되살리는 일은 하지 않아요. 새 ID로 저장해 주세요`,
        );
      }
    }
  }

  // 폐기는 대체 기준이 먼저 저장된 뒤에 해요.
  const toDeprecate = [
    ...plan.create.filter((entry) => entry.status === 'deprecated'),
    ...(options.update
      ? plan.different
          .filter(
            ({ entry, current }) =>
              entry.status === 'deprecated' &&
              current.standard.status === 'active',
          )
          .map(({ entry }) => entry)
      : []),
  ];
  if (toDeprecate.length > 0) {
    const versions = new Map(
      (await listStandards({ includeDeprecated: true })).map((item) => [
        item.standard.id,
        item.latest.version,
      ]),
    );
    for (const entry of toDeprecate) {
      await attempt(
        `${entry.id} 폐기${entry.replacedBy ? ` (대체: ${entry.replacedBy})` : ''}`,
        () =>
          deprecateStandard({
            id: entry.id,
            reason: '예전 위키에서 폐기로 표시된 결정 사항',
            baseVersion: versions.get(entry.id) ?? 1,
            replacedBy: entry.replacedBy,
            changedByActor: 'human',
            changedBy: options.by,
          }),
      );
    }
  }

  for (const issue of issues) {
    await attempt(
      `이슈 ${issue.key} (결정 사항 ${issue.standardIds.length}개 연결)`,
      () =>
        saveIssue({
          key: issue.key,
          title: issue.title,
          assignee: issue.assignee,
          status: issue.status,
          standardIds: issue.standardIds,
        }),
    );
  }
  return failures;
}

function toSaveInput(entry: WikiEntry) {
  return {
    id: entry.id,
    title: entry.title,
    value: entry.value,
    reason: entry.reason,
    alwaysOn: entry.alwaysOn,
    evidence: entry.evidence,
    scope: entry.scope,
    locked: entry.locked,
  };
}

function findUnknownLinks(
  issues: IssueEntry[],
  entries: WikiEntry[],
): string[] {
  const ids = new Set(entries.map((entry) => entry.id));
  return issues.flatMap((issue) =>
    issue.standardIds
      .filter((id) => !ids.has(id))
      .map((id) => `이슈 ${issue.key} → ${id}`),
  );
}

function printPlan(
  plan: WikiImportPlan,
  issueCount: number,
  options: ImportOptions,
) {
  console.log('\n할 일');
  console.log(`  새로 저장: 결정 사항 ${plan.create.length}개`);
  console.log(`  같아서 건너뜀: ${plan.same.length}개`);
  console.log(
    `  DB와 다름: ${plan.different.length}개${plan.different.length > 0 && !options.update ? ' (건너뜀. --update면 새 버전으로 저장)' : ''}`,
  );
  for (const { entry, changed } of plan.different)
    console.log(`    - ${entry.id}: ${changed.join(', ')}`);
  console.log(`  이슈 저장: ${issueCount}개`);
}

function printProblems(problems: ImportProblem[]) {
  const errors = problems.filter((problem) => problem.level === 'error');
  const warnings = problems.filter((problem) => problem.level === 'warning');
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  ✔ 형식 문제 없음');
    return;
  }
  for (const problem of [...errors, ...warnings]) {
    const icon = problem.level === 'error' ? '✖' : '⚠';
    console.log(`  ${icon} ${problem.file}:${problem.line} ${problem.message}`);
  }
  console.log(`  오류 ${errors.length}개(건너뜀), 경고 ${warnings.length}개`);
}

function hasErrors(problems: ImportProblem[]): boolean {
  return problems.some((problem) => problem.level === 'error');
}
