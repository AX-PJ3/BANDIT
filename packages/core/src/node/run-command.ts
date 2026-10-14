import { spawnSync } from 'node:child_process';

/**
 * 다른 프로그램(claude, gh 등)을 실행하고 종료 코드를 돌려줘요.
 *
 * 왜 따로 두나요: Windows에서는 npm으로 깐 명령이 `.cmd` 파일이라 셸을 거쳐야 실행돼요.
 * 이때 인자를 직접 따옴표로 감싸야 공백이 있는 경로가 깨지지 않아요. 이 처리를 한곳에만 둬요.
 */
export function runCommand(
  command: string,
  args: string[],
  options: { quiet?: boolean } = {},
): number | null {
  const stdio = options.quiet ? 'ignore' : 'inherit';
  if (process.platform !== 'win32')
    return spawnSync(command, args, { stdio }).status;
  return spawnSync(formatCommand(command, args), { stdio, shell: true }).status;
}

/** 사람이 복사해 실행할 수 있는 한 줄 명령으로 바꿔요. */
export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}
