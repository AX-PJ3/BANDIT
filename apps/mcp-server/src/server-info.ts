/**
 * Claude Code에 보이는 서버 이름이에요. `pnpm mcp:register`가 이 이름으로 등록하고, 도구는 `mcp__haribo__<도구 이름>`으로 보여요.
 * 바꾸면 `apps/cli/src/commands/doctor.ts`의 MCP_SERVER_NAME도 같이 바꿔요 (D55).
 */
export const SERVER_INFO = { name: 'haribo', version: '0.0.0' } as const;
