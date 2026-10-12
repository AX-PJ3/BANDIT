/**
 * `pnpm onboard` (= `pnpm sil doctor`) — 처음 받은 사람이 "내 컴퓨터에서 돌아갈 준비가 됐나"를 한 번에 확인해요.
 *
 * 왜: 10분 안에 실행(SIL-16 꼭 챙길 점)을 막는 건 대부분 코드가 아니라 환경(Node 버전, .env, 등록)이에요.
 * 막히는 지점마다 "무엇을 하면 되는지"를 한 줄로 알려 줘요.
 * .env가 없으면 .env.example을 복사해 만들어 줘요 (.env는 저장소에 올라가지 않아요).
 */
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isSilError } from '@sil/core';
import { findRepoRoot, getDataMode, loadEnv, runCommand } from '@sil/core/node';
import type { Command } from 'commander';

/** Claude Code에 등록되는 MCP 서버 이름. `apps/mcp-server/src/server-info.ts`의 SERVER_INFO.name과 같아야 해요 (D55) */
const MCP_SERVER_NAME = 'haribo';

type Status = 'ok' | 'warn' | 'fail';
interface CheckResult {
  status: Status;
  label: string;
  hint?: string;
}

// Node는 24.18로 고정해요 (.nvmrc, package.json engines). 빌드 없이 .ts를 바로 실행하는 동작이 버전마다 다르지 않게요 (D48).
const PINNED_NODE = '24.18';
const icon: Record<Status, string> = { ok: '✔', warn: '⚠', fail: '✖' };

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('개발 환경이 준비됐는지 확인해요')
    .action(() => {
      const results = [
        checkNode(),
        checkEnvFile(),
        checkEnvValues(),
        checkData(),
        ...checkClaude(),
      ];
      for (const result of results) {
        console.log(`${icon[result.status]} ${result.label}`);
        if (result.hint) console.log(`   → ${result.hint}`);
      }
      const failed = results.some((result) => result.status === 'fail');
      console.log(
        failed
          ? '\n고칠 것이 있어요. 위 → 표시를 따라 해 주세요.'
          : '\n준비됐어요.',
      );
      process.exitCode = failed ? 1 : 0;
    });
}

function checkNode(): CheckResult {
  const ok = process.versions.node.startsWith(`${PINNED_NODE}.`);
  return ok
    ? { status: 'ok', label: `Node ${process.versions.node}` }
    : {
        status: 'fail',
        label: `Node ${process.versions.node} (${PINNED_NODE}로 고정)`,
        hint: `Node ${PINNED_NODE}을 설치해 주세요. nvm을 쓰면 저장소 폴더에서 \`nvm install\` 다음 \`nvm use\``,
      };
}

function checkEnvFile(): CheckResult {
  const root = findRepoRoot();
  const envPath = join(root, '.env');
  if (existsSync(envPath)) return { status: 'ok', label: '.env 있음' };
  copyFileSync(join(root, '.env.example'), envPath);
  return {
    status: 'ok',
    label: '.env가 없어서 .env.example을 복사해 만들었어요',
  };
}

function checkEnvValues(): CheckResult {
  try {
    loadEnv();
    return { status: 'ok', label: '.env 값 형식 정상' };
  } catch (error) {
    return {
      status: 'fail',
      label: '.env 값 형식 오류',
      hint: isSilError(error) ? error.message : String(error),
    };
  }
}

function checkData(): CheckResult {
  try {
    const env = loadEnv();
    if (getDataMode() === 'database') {
      return {
        status: 'ok',
        label: 'Supabase 주소·키 있음 (연결 확인: pnpm mcp:check)',
      };
    }
    if (env.SIL_MCP_URL) {
      return {
        status: 'ok',
        label: `팀 MCP 서버 주소 있음 (${env.SIL_MCP_URL}). DB 키는 서버에만 있으면 돼요`,
      };
    }
    return {
      status: 'warn',
      label: '팀 MCP 서버 주소(SIL_MCP_URL)가 아직 없어요',
      hint: '정민님에게 주소와 토큰을 받아 .env에 넣고 `pnpm mcp:register`. 서버를 직접 켜는 사람만 SUPABASE_* 를 채워요',
    };
  } catch {
    return { status: 'warn', label: '데이터베이스: .env를 먼저 고쳐 주세요' };
  }
}

function checkClaude(): CheckResult[] {
  if (runCommand('claude', ['--version'], { quiet: true }) !== 0) {
    return [
      {
        status: 'warn',
        label: 'Claude Code를 찾지 못했어요',
        hint: 'MCP 서버만 확인하려면 `pnpm mcp:check`. Claude Code에 붙이려면 설치 후 `pnpm mcp:register`',
      },
    ];
  }
  const registered =
    runCommand('claude', ['mcp', 'get', MCP_SERVER_NAME], { quiet: true }) ===
    0;
  return [
    { status: 'ok', label: 'Claude Code 있음' },
    registered
      ? {
          status: 'ok',
          label: `Claude Code에 ${MCP_SERVER_NAME} MCP 서버 등록됨`,
        }
      : {
          status: 'warn',
          label: `${MCP_SERVER_NAME} MCP 서버가 아직 등록되지 않았어요`,
          hint: '`pnpm mcp:register`',
        },
  ];
}
