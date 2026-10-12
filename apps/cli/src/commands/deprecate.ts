/**
 * `sil deprecate` — 사람이 기준을 폐기해요. 지우지 않고 상태만 바꾸고, 대체한 기준을 남겨요 (wiki.standard.no-delete).
 *
 * 위키 MCP 도구는 다섯 개로 정해져 있어서(wiki.mcp.five-tools) AI용 폐기 도구는 두지 않아요.
 * 폐기가 필요하면 AI가 사람에게 알리고, 사람이 이 명령으로 해요.
 * 끝나면 CHANGELOG에 붙일 줄을 보여 줘요 (data.changelog.format: 새 값은 "폐기(대체: ID)").
 */
import { spawnSync } from 'node:child_process';
import {
  formatChangelogLine,
  isSilError,
  type StandardSource,
} from '@sil/core';
import {
  deprecateStandard,
  getDataMode,
  getStandardHistory,
} from '@sil/core/node';
import type { Command } from 'commander';

interface DeprecateOptions {
  reason: string;
  replacedBy?: string;
  by?: string;
  source: StandardSource;
}

export function registerDeprecate(program: Command): void {
  program
    .command('deprecate <ID>')
    .description('결정 사항을 폐기해요 (지우지 않고 상태만 바꿔요)')
    .requiredOption('--reason <이유>', '폐기하는 이유 한 문장')
    .option('--replaced-by <ID>', '이 결정 사항을 대신하는 결정 사항')
    .option('--by <이름>', '폐기한 사람 (기본: git user.name)')
    .option(
      '--source <출처>',
      'CHANGELOG 출처: code, ai_chat, figma, meeting, slack',
      'meeting',
    )
    .action(async (id: string, options: DeprecateOptions) => {
      process.exitCode = await runDeprecate(id, options);
    });
}

async function runDeprecate(
  id: string,
  options: DeprecateOptions,
): Promise<number> {
  if (getDataMode() === 'none') {
    console.log(
      '✖ DB가 연결되지 않았어요. .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.',
    );
    return 1;
  }
  const by = options.by?.trim() || gitUserName();
  try {
    const history = await getStandardHistory(id);
    if (!history) {
      console.log(`✖ 결정 사항 ${id}이(가) 없어요.`);
      return 1;
    }
    const result = await deprecateStandard({
      id,
      reason: options.reason,
      baseVersion: history.currentVersion,
      replacedBy: options.replacedBy ?? null,
      changedByActor: 'human',
      changedBy: by ?? null,
    });
    console.log(
      `✔ ${id}을(를) 폐기했어요${result.replacedBy ? ` (대체: ${result.replacedBy})` : ''}.`,
    );
    console.log('  CHANGELOG에 붙일 줄:');
    console.log(
      `  ${formatChangelogLine({
        at: new Date(),
        by: by ?? null,
        standardId: id,
        fromVersion: history.currentVersion,
        toVersion: history.currentVersion,
        before: history.versions[0]?.value ?? null,
        after: `폐기(대체: ${result.replacedBy ?? '없음'})`,
        reason: options.reason,
        source: options.source,
      })}`,
    );
    return 0;
  } catch (error) {
    console.log(
      `✖ ${isSilError(error) ? `[${error.code}] ${error.message}` : String(error)}`,
    );
    return 1;
  }
}

function gitUserName(): string | undefined {
  const result = spawnSync('git', ['config', '--get', 'user.name'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}
