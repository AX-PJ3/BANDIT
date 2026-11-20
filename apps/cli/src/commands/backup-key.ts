/**
 * `sil backup-key` — 백업을 잠그고 여는 열쇠 한 쌍을 만들어요 (wiki.backup.daily).
 *
 * 공개 키는 apps/cli/backup-keys/에 두고 PR로 올려요. 그다음 백업부터 이 키로도 잠겨요.
 * 개인 키는 내 컴퓨터(~/.haribo/backup/)에만 만들어요. 저장소·채널·Actions에 올리지 않아요.
 * 개인 키를 잃으면 그 공개 키로만 잠근 백업은 아무도 열 수 없어서, 비밀번호 관리자 같은 곳에 하나 더 보관해요.
 */
import { createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  backupKeyId,
  findRepoRoot,
  generateBackupKeyPair,
} from '@sil/core/node';
import type { Command } from 'commander';
import { BACKUP_KEYS_DIR } from './backup.ts';

const KEY_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function registerBackupKey(program: Command): void {
  program
    .command('backup-key')
    .description(
      '백업을 잠그고 여는 열쇠 한 쌍을 만들어요 (공개 키는 저장소, 개인 키는 내 컴퓨터)',
    )
    .argument('<이름>', '열쇠 이름. 영어 소문자·숫자·-만. 예: GitHub 아이디')
    .option(
      '--private <파일>',
      '개인 키를 둘 곳 (기본: ~/.haribo/backup/<이름>.key.pem)',
    )
    .action((name: string, options: { private?: string }) => {
      process.exitCode = runBackupKey(name, options.private);
    });
}

function runBackupKey(name: string, privateOption: string | undefined): number {
  if (!KEY_NAME.test(name)) {
    console.log('✖ 이름은 영어 소문자, 숫자, -만 써요. 예: mick243');
    return 1;
  }
  const publicFile = join(findRepoRoot(), BACKUP_KEYS_DIR, `${name}.pub.pem`);
  const privateFile = resolve(
    privateOption ?? join(homedir(), '.haribo', 'backup', `${name}.key.pem`),
  );
  for (const file of [publicFile, privateFile]) {
    if (existsSync(file)) {
      console.log(
        `✖ ${file}이(가) 이미 있어요. 덮어쓰면 그 키로 잠근 백업을 못 열 수 있어서 멈췄어요.`,
      );
      return 1;
    }
  }
  const { publicKeyPem, privateKeyPem } = generateBackupKeyPair();
  mkdirSync(dirname(privateFile), { recursive: true });
  writeFileSync(privateFile, privateKeyPem, { mode: 0o600, flag: 'wx' });
  mkdirSync(dirname(publicFile), { recursive: true });
  writeFileSync(publicFile, publicKeyPem, { flag: 'wx' });

  console.log(
    `✔ 백업 열쇠를 만들었어요 (지문 ${backupKeyId(createPublicKey(publicKeyPem))})`,
  );
  console.log(`  공개 키: ${publicFile}`);
  console.log('    → PR로 올려요. 그다음 매일 백업부터 이 키로도 잠겨요.');
  console.log(`  개인 키: ${privateFile}`);
  console.log(
    '    → 저장소·채널·Actions에 올리지 마세요. 잃으면 이 키로만 잠근 백업은 아무도 못 열어요.',
  );
  console.log('    → 비밀번호 관리자 같은 안전한 곳에 하나 더 보관해요.');
  return 0;
}
