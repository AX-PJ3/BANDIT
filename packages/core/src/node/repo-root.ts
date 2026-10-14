import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 이 저장소의 맨 위 폴더를 찾아요.
 *
 * 왜 필요한가요: MCP 서버는 Claude Code가 "팀원이 일하는 다른 저장소"에서 켜요.
 * 그래서 현재 폴더(cwd) 기준으로 .env를 찾으면 엉뚱한 곳을 봐요.
 * 이 파일 위치에서 위로 올라가며 pnpm-workspace.yaml이 있는 폴더를 찾아요.
 */
export function findRepoRoot(
  start: string = import.meta.dirname ?? process.cwd(),
): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}
