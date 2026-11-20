/**
 * `sil restore` — 백업 파일을 빈 DB에 되살리는 SQL로 바꿔요 (wiki.backup.daily).
 *
 * DB에 직접 붙지 않아요. 만든 SQL은 사람이 psql로 DB 주인 계정에서 넣어요.
 * DB 비밀번호를 이 명령에 넘기지 않으려고 이렇게 나눴어요.
 * 잠근 백업(.json.enc)은 --key의 개인 키로 열어요. 절차는 docs/백업과-되살리기.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { isSilError, SilError } from '@sil/core';
import {
  BACKUP_TABLES,
  buildRestoreSql,
  countBackupRows,
  decryptBackup,
  isEncryptedBackup,
  parseBackupBundle,
  type BackupBundle,
} from '@sil/core/node';
import type { Command } from 'commander';

interface RestoreOptions {
  key?: string;
  sql: string;
  check?: boolean;
}

export function registerRestore(program: Command): void {
  program
    .command('restore')
    .description(
      '백업 파일을 빈 DB에 되살리는 SQL로 바꿔요 (DB에는 붙지 않아요)',
    )
    .argument('<파일>', 'sil backup이 만든 파일 (.json 또는 잠근 .json.enc)')
    .option('--key <파일>', '잠근 백업을 열 개인 키 (.key.pem)')
    .option('--sql <파일>', '만들 SQL 파일', 'backup/restore.sql')
    .option('--check', 'SQL은 만들지 않고 열어서 줄 수만 확인해요')
    .action((file: string, options: RestoreOptions) => {
      process.exitCode = runRestore(file, options);
    });
}

function runRestore(file: string, options: RestoreOptions): number {
  try {
    const bundle = readBundle(resolve(file), options.key);
    console.log(`✔ 백업을 열었어요: ${resolve(file)}`);
    console.log(
      `  백업 시각 ${bundle.takenAt} · 원본 ${bundle.source} · 코드 ${bundle.commit?.slice(0, 7) ?? '모름'}`,
    );
    const counts = countBackupRows(bundle);
    for (const { name } of BACKUP_TABLES)
      console.log(`  ${name}: ${counts[name]}줄`);
    if (options.check) return 0;

    const sqlFile = resolve(options.sql);
    mkdirSync(dirname(sqlFile), { recursive: true });
    writeFileSync(sqlFile, buildRestoreSql(bundle));
    console.log('');
    console.log(`✔ 되살리기 SQL을 만들었어요: ${sqlFile}`);
    console.log('  다음 순서로 넣어요 (docs/백업과-되살리기.md):');
    console.log(
      '  1. 빈 DB에 supabase/migrations를 올려요 (Supabase 새 프로젝트면 pnpm db:push)',
    );
    console.log(`  2. psql "<DB 주소>" -v ON_ERROR_STOP=1 -f "${sqlFile}"`);
    console.log(
      '  표가 비어 있지 않거나 칸이 다르면 아무것도 넣지 않고 멈춰요. 이 SQL에는 DB 내용이 그대로 있으니 다 쓰면 지워요.',
    );
    return 0;
  } catch (error) {
    console.log(
      `✖ 되살리지 못했어요: ${isSilError(error) ? error.message : String(error)}`,
    );
    return 1;
  }
}

function readBundle(file: string, keyFile: string | undefined): BackupBundle {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SilError(
      'VALIDATION_FAILED',
      `백업 파일을 읽지 못했어요 (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  if (isEncryptedBackup(value)) {
    if (!keyFile) {
      throw new SilError(
        'VALIDATION_FAILED',
        '잠근 백업이에요. --key로 개인 키 파일(.key.pem)을 알려 주세요.',
      );
    }
    value = JSON.parse(
      decryptBackup(value, readFileSync(resolve(keyFile), 'utf8')),
    );
  }
  return parseBackupBundle(value);
}
