/**
 * `sil backup` — 위키 데이터를 JSON 파일로 남겨요 (wiki.backup.daily).
 *
 * .github/workflows/backup.yml이 매일 이 명령을 돌리고, 결과를 암호화해서 보관해요.
 * 공용 키로 읽기만 해요. 하나라도 못 읽으면 반쪽 백업을 남기지 않고 실패로 끝나요.
 * Supabase 무료 플랜은 7일 동안 쓰지 않으면 멈추는데, 매일 읽으니 멈추는 것도 막아요.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isSilError } from '@sil/core';
import { BACKUP_TABLES, dumpTables, getDataMode } from '@sil/core/node';
import type { Command } from 'commander';

export function registerBackup(program: Command): void {
  program
    .command('backup')
    .description('위키 데이터(표 전체)를 JSON 파일로 남겨요')
    .option('--out <폴더>', '저장할 폴더 (기본: backup/)', 'backup')
    .action(async (options: { out: string }) => {
      process.exitCode = await runBackup(options.out);
    });
}

async function runBackup(outDir: string): Promise<number> {
  if (getDataMode() === 'none') {
    console.log(
      '✖ DB가 연결되지 않았어요. .env(또는 GitHub Secrets)에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.',
    );
    return 1;
  }
  try {
    const dump = await dumpTables();
    const folder = resolve(outDir, dump.takenAt.replace(/[:.]/g, '-'));
    mkdirSync(folder, { recursive: true });
    const counts: Record<string, number> = {};
    for (const { name } of BACKUP_TABLES) {
      counts[name] = dump.tables[name].length;
      writeFileSync(
        join(folder, `${name}.json`),
        `${JSON.stringify(dump.tables[name], null, 2)}\n`,
      );
    }
    writeFileSync(
      join(folder, 'manifest.json'),
      `${JSON.stringify({ takenAt: dump.takenAt, counts }, null, 2)}\n`,
    );
    console.log(`✔ 백업했어요: ${folder}`);
    for (const [name, count] of Object.entries(counts))
      console.log(`  ${name}: ${count}줄`);
    return 0;
  } catch (error) {
    console.log(
      `✖ 백업하지 못했어요: ${isSilError(error) ? error.message : String(error)}`,
    );
    return 1;
  }
}
