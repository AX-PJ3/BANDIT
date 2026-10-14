/**
 * `pnpm mcp:status` — 내 Claude Code에 등록된 haribo를 보여 줘요. 팀 토큰은 가려요.
 *
 * `claude mcp get haribo`를 대신 실행하고, 결과의 `Authorization: Bearer <팀 토큰>`을 가려서 찍어요.
 * `claude mcp get`을 직접 실행하면 토큰이 그대로 보여서, 화면 공유·녹화·채널에 붙인 결과로 토큰이 샐 수 있어요.
 * 이름 헤더(X-Sil-User)는 퍼센트 인코딩을 풀어서 누구로 등록됐는지 함께 보여 줘요.
 */
import { spawnSync } from 'node:child_process';
import { formatCommand } from '@sil/core/node';
import { maskSecrets } from '../src/mask-secrets.ts';
import { SERVER_INFO } from '../src/server-info.ts';

const args = ['mcp', 'get', SERVER_INFO.name];
// Windows에서는 claude가 .cmd일 수 있어서 셸로 실행해요 (@sil/core/node runCommand와 같은 방법)
const result =
  process.platform === 'win32'
    ? spawnSync(formatCommand('claude', args), {
        shell: true,
        encoding: 'utf8',
      })
    : spawnSync('claude', args, { encoding: 'utf8' });

if (result.error || result.status === null) {
  console.error(
    '✖ Claude Code(claude 명령)를 실행하지 못했어요. 설치됐는지 확인해 주세요.',
  );
  process.exit(1);
}

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
const { text, masked, placeholders } = maskSecrets(output);
console.log(text);

if (result.status !== 0) {
  console.log(
    `\n'${SERVER_INFO.name}'가 등록돼 있지 않아요. pnpm mcp:register --user <내 이름>으로 등록해요.`,
  );
  process.exit(result.status);
}
if (placeholders.length > 0) {
  console.log(
    `\n✖ ${placeholders.join(', ')}에 "<팀 토큰>" 같은 자리 표시 글자가 그대로 들어가 있어요. claude mcp remove ${SERVER_INFO.name} --scope user로 지우고 다시 등록해요.`,
  );
}
if (masked > 0) {
  console.log(
    `\n※ 토큰은 가렸어요. claude mcp get ${SERVER_INFO.name} 명령을 직접 실행하면 토큰이 그대로 보이니, 화면을 공유할 때는 이 명령을 써요.`,
  );
}
