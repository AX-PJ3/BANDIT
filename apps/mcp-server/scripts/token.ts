/**
 * `pnpm mcp:token [팀 이름]` — 팀 토큰을 새로 만들어 보여 줘요. 저장하지 않아요.
 *
 * 쓰는 법: 찍힌 '이름:토큰'을 서버 환경 변수 SIL_MCP_TOKENS에 쉼표로 이어 붙이고,
 * 토큰 부분만 그 팀에게 따로 전해요 (Slack DM 등. 저장소나 채널에는 올리지 않아요).
 */
import { randomBytes } from 'node:crypto';

const name = (process.argv[2] ?? 'haribo').toLowerCase();
if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error(
    '✖ 팀 이름은 영어 소문자, 숫자, -만 써요. 예: pnpm mcp:token team-b',
  );
  process.exit(1);
}

console.log(`${name}:${randomBytes(24).toString('base64url')}`);
