/**
 * `sil backup` — 팀 DB의 표 7개를 백업 파일 하나로 남겨요 (wiki.backup.daily).
 *
 * .github/workflows/backup.yml이 매일 03:00(한국 시각)에 `--encrypt`로 돌리고, 잠근 파일만 Actions 아티팩트로 7일 보관해요.
 * 공용 키로 읽기만 해요. 하나라도 못 읽거나 읽는 동안 데이터가 계속 바뀌면 반쪽 백업을 남기지 않고 실패로 끝나요.
 * Supabase 무료 플랜은 7일 동안 쓰지 않으면 멈추는데, 매일 읽으니 멈추는 것도 막아요.
 * 되살리기는 `sil restore` (docs/백업과-되살리기.md).
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { isSilError } from '@sil/core';
import {
  BACKUP_TABLES,
  backupKeyId,
  checkBackupRecipients,
  countBackupRows,
  encryptBackup,
  findRepoRoot,
  getDataMode,
  loadEnv,
  takeBackup,
} from '@sil/core/node';
import type { Command } from 'commander';

/** 백업을 잠글 공개 키를 두는 폴더 (저장소 맨 위 기준). 개인 키는 여기에 두지 않아요 */
export const BACKUP_KEYS_DIR = join('apps', 'cli', 'backup-keys');

interface BackupOptions {
  out: string;
  encrypt?: boolean;
  keys?: string;
  plainCopy?: string;
}

export function registerBackup(program: Command): void {
  program
    .command('backup')
    .description('팀 DB의 표 7개를 백업 파일 하나로 남겨요 (공용 키로 읽기만)')
    .option('--out <폴더>', '저장할 폴더', 'backup')
    .option(
      '--encrypt',
      '공개 키로 잠근 파일(.json.enc)만 남겨요. 저장소 밖에 올릴 백업은 꼭 잠가요',
    )
    .option(
      '--keys <폴더>',
      `잠글 때 쓸 공개 키(.pub.pem) 폴더 (기본: ${BACKUP_KEYS_DIR})`,
    )
    .option(
      '--plain-copy <파일>',
      '같은 백업을 잠그지 않은 파일로도 남겨요 (되살리기 시험용, 올리지 마세요)',
    )
    .action(async (options: BackupOptions) => {
      process.exitCode = await runBackup(options);
    });
}

async function runBackup(options: BackupOptions): Promise<number> {
  if (getDataMode() === 'none') {
    console.log(
      '✖ DB가 연결되지 않았어요. .env(또는 GitHub Secrets)에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.',
    );
    return 1;
  }
  try {
    // 잠글 열쇠부터 확인해요. 다 읽은 뒤에 열쇠가 없어서 실패하면 DB를 괜히 읽은 셈이에요
    const keys = options.encrypt
      ? readPublicKeys(
          resolve(options.keys ?? join(findRepoRoot(), BACKUP_KEYS_DIR)),
        )
      : [];
    if (options.encrypt) checkBackupRecipients(keys.map((key) => key.pem));
    const bundle = await takeBackup({
      source: new URL(loadEnv().SUPABASE_URL!).host,
      commit: currentCommit(),
    });
    const plaintext = JSON.stringify(bundle, null, 2);
    const name = `sil-backup-${bundle.takenAt.replace(/[:.]/g, '-')}`;
    mkdirSync(resolve(options.out), { recursive: true });

    let file: string;
    if (options.encrypt) {
      const envelope = encryptBackup(
        plaintext,
        keys.map((key) => key.pem),
      );
      file = resolve(options.out, `${name}.json.enc`);
      writeFileSync(file, `${JSON.stringify(envelope)}\n`);
    } else {
      file = resolve(options.out, `${name}.json`);
      writeFileSync(file, `${plaintext}\n`);
    }
    if (options.plainCopy) {
      mkdirSync(dirname(resolve(options.plainCopy)), { recursive: true });
      writeFileSync(resolve(options.plainCopy), `${plaintext}\n`);
    }

    console.log(`✔ 백업했어요: ${file}`);
    if (options.encrypt) {
      console.log(
        `  잠근 공개 키: ${keys.map((key) => `${key.file}(${key.keyId})`).join(', ')}`,
      );
    } else {
      console.log(
        '  ⚠ 잠그지 않은 파일이에요. 저장소·채널에 올리지 마세요 (올릴 백업은 --encrypt).',
      );
    }
    console.log(
      `  같은 모습이 나올 때까지 ${bundle.attempts}번 읽었어요 (${bundle.takenAt})`,
    );
    const counts = countBackupRows(bundle);
    for (const { name: table } of BACKUP_TABLES)
      console.log(`  ${table}: ${counts[table]}줄`);
    return 0;
  } catch (error) {
    console.log(
      `✖ 백업하지 못했어요: ${isSilError(error) ? error.message : String(error)}`,
    );
    return 1;
  }
}

function readPublicKeys(
  dir: string,
): { file: string; pem: string; keyId: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.pub.pem'))
    .sort()
    .map((file) => {
      const pem = readFileSync(join(dir, file), 'utf8');
      let keyId = '?';
      try {
        keyId = backupKeyId(createPublicKey(pem));
      } catch {
        // 읽지 못하는 키는 encryptBackup이 이유와 함께 알려 줘요
      }
      return { file: basename(file), pem, keyId };
    });
}

/** GitHub Actions는 GITHUB_SHA를 넣어 줘요. 내 컴퓨터에서는 git으로 읽고, 못 읽으면 비워요 */
function currentCommit(): string | null {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: findRepoRoot(),
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}
