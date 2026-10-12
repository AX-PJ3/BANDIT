/**
 * `pnpm mcp:register` — 내 Claude Code에 팀 MCP 서버(Streamable HTTP)를 등록해요.
 *
 *   pnpm mcp:register                                  .env의 SIL_MCP_URL, SIL_MCP_TOKEN으로 등록
 *   pnpm mcp:register --url https://…/mcp --token …    주소와 토큰을 직접 넣어 등록
 *   pnpm mcp:register --local                          내 컴퓨터에서 켠 서버(pnpm mcp:serve)로 등록
 *   (--user 부건 으로 "고친 사람"에 남을 이름을 정해요. 이슈 담당자 이름과 같게 써야 "바꾼 본인 제외"가 맞아요.
 *    기본은 git config user.name. 한글 이름은 퍼센트 인코딩해서 헤더에 넣어요)
 *
 * 왜 사용자 범위(--scope user)로 등록하나요:
 * 팀원은 이 저장소가 아니라 각자 일하는 저장소에서 Claude Code를 켜요. 사용자 범위면 어느 저장소에서든 haribo 도구가 보여요.
 *
 * 저장소가 없는 다른 팀은 이 스크립트 대신, 아래에 찍히는 `claude mcp add` 한 줄만 실행하면 돼요.
 */
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { formatCommand, loadEnv, runCommand } from '@sil/core/node';
import { SERVER_INFO } from '../src/server-info.ts';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    token: { type: 'string' },
    user: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const env = loadEnv();
const name = SERVER_INFO.name;
const url = values.local
  ? `http://127.0.0.1:${env.PORT}/mcp`
  : (values.url ?? env.SIL_MCP_URL);
const token = values.token ?? (values.local ? undefined : env.SIL_MCP_TOKEN);
const user = values.user?.trim() || gitUserName();

if (!url) {
  console.error(
    '✖ 서버 주소가 없어요. .env에 SIL_MCP_URL을 넣거나 --url로 알려 주세요. (내 컴퓨터 서버는 --local)',
  );
  process.exit(1);
}
if (!token && !values.local) {
  console.error(
    '✖ 팀 토큰이 없어요. 정민님에게 받아 .env의 SIL_MCP_TOKEN에 넣거나 --token으로 알려 주세요.',
  );
  process.exit(1);
}

const headerArgs = (shownToken: string | undefined) => [
  ...(shownToken ? ['--header', `Authorization: Bearer ${shownToken}`] : []),
  // HTTP 헤더에는 한글을 그대로 넣을 수 없어요. 서버(auth.ts readUser)가 다시 풀어서 읽어요.
  ...(user ? ['--header', `X-Sil-User: ${encodeURIComponent(user)}`] : []),
];
const addArgs = [
  'mcp',
  'add',
  '--transport',
  'http',
  '--scope',
  'user',
  name,
  url,
  ...headerArgs(token),
];
const manual = formatCommand('claude', [
  ...addArgs.slice(0, 8),
  ...headerArgs(token ? '<팀 토큰>' : undefined),
]);

if (runCommand('claude', ['--version'], { quiet: true }) !== 0) {
  console.error(
    '✖ Claude Code(claude 명령)를 찾지 못했어요. 설치 후 다시 실행하거나, 아래 명령을 직접 실행해 주세요.',
  );
  console.error(`  ${manual}`);
  process.exit(1);
}

if (runCommand('claude', ['mcp', 'get', name], { quiet: true }) === 0) {
  console.log(
    `이미 '${name}' 서버가 등록돼 있어요. 다시 등록하려면 아래를 실행한 뒤 이 명령을 다시 실행해 주세요.`,
  );
  console.log(`  claude mcp remove ${name} --scope user`);
  process.exit(0);
}

if (runCommand('claude', addArgs) !== 0) {
  console.error('✖ 등록에 실패했어요. 아래 명령을 직접 실행해 주세요.');
  console.error(`  ${manual}`);
  process.exit(1);
}

console.log(`✔ 등록했어요 (${url}${user ? `, 고친 사람: ${user}` : ''}).`);
console.log(
  `  아무 저장소에서 Claude Code를 새로 켜고 /mcp 에서 '${name}'가 connected인지 확인해 주세요.`,
);

function gitUserName(): string | undefined {
  const result = spawnSync('git', ['config', '--get', 'user.name'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}
