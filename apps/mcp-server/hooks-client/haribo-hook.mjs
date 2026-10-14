#!/usr/bin/env node
/**
 * haribo 터미널 알림 hooks (SIL-67). `pnpm mcp:register`가 ~/.claude/haribo/에 복사해 두는 파일이에요.
 *
 *   node ~/.claude/haribo/hook.mjs session-start | prompt-submit | after-respond
 *
 * Claude Code가 hooks 이벤트(JSON)를 표준 입력으로 주면, 그대로 팀 MCP 서버의 /hooks/<이벤트>로 보내고
 * 서버가 돌려준 JSON(systemMessage 등)을 그대로 출력해요. 화면 글은 서버가 만들어요.
 *
 * - 저장소나 패키지 없이 Node만 있으면 돌아요 (Node 18 이상의 fetch). Windows와 Mac에서 같은 명령이에요.
 * - 서버 주소·토큰·이름은 같은 폴더의 config.json에서 읽어요.
 * - 서버에 못 붙어도 작업은 막지 않아요. 실패를 한 줄로 알리고 끝나요 (notify.error.no-block-retry).
 *   이 문구는 @sil/notify의 connectionFailedNotice와 같게 둬요.
 */
import { readFileSync } from 'node:fs';

const EVENTS = ['session-start', 'prompt-submit', 'after-respond'];
/** 무료 호스팅은 쉬다가 깨어나느라 느릴 수 있어서 넉넉히 기다려요. Claude Code hooks 시간 제한(설정 20초)보다 짧게 둬요 */
const TIMEOUT_MS = 15_000;

const esc = (codes) => `\u001b[${codes}m`;
const FAILED_NOTICE = [
  '',
  `${esc('39;49')}● 서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.${esc('39')}`,
  `  ${esc('1')}"결정 사항 확인"${esc('22')}을 입력하면 다시 시작해요.`,
].join('\n');
const FAILED_CONTEXT =
  '[확인할 변경 규칙] 확인할 변경을 불러오지 못했다는 것을 hooks가 이미 화면에 보여 줬다. 그 일에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.';

const event = process.argv[2];

/** 실패를 알리는 출력. 답한 뒤(after-respond)에는 Claude가 respond 결과를 이미 받아서 조용히 끝내요 */
function failed(detail) {
  if (event === 'after-respond') return '';
  const message = detail ? `${FAILED_NOTICE}\n  (${detail})` : FAILED_NOTICE;
  if (event === 'prompt-submit') {
    return JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: FAILED_CONTEXT,
      },
    });
  }
  return JSON.stringify({ systemMessage: message });
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  if (!EVENTS.includes(event)) return '';
  const input = await readStdin();
  let config;
  try {
    config = JSON.parse(
      readFileSync(new URL('./config.json', import.meta.url), 'utf8'),
    );
  } catch {
    return failed(
      'config.json이 없어요. pnpm mcp:register를 다시 실행해 주세요',
    );
  }
  const headers = { 'content-type': 'application/json' };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  // HTTP 헤더에는 한글을 그대로 못 넣어서 퍼센트 인코딩해요. 서버(auth.ts readUser)가 풀어서 읽어요
  if (config.user) headers['x-sil-user'] = encodeURIComponent(config.user);
  try {
    const response = await fetch(`${config.hooksUrl}/${event}`, {
      method: 'POST',
      headers,
      body: input || '{}',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      let detail = `서버 응답 ${response.status}`;
      try {
        detail = JSON.parse(body).error?.message ?? detail;
      } catch {
        // 서버가 JSON이 아닌 글을 돌려주면 상태 번호만 알려요
      }
      return failed(detail);
    }
    return body === '{}' ? '' : body;
  } catch {
    return failed();
  }
}

// 어떤 경우에도 0으로 끝나요. hooks가 실패 코드로 끝나면 Claude Code가 작업을 멈출 수 있어요
main()
  .then((output) => {
    if (output) process.stdout.write(output);
  })
  .catch(() => {})
  .finally(() => process.exit(0));
