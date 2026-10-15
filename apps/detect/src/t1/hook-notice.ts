/**
 * hook (PostToolUse, Bash): `notice.ts`를 실행한 직후 T1 예외 안내를 띄워요 (10/14 확정 예외, SIL-66).
 * 다른 명령이면 아무것도 하지 않아요. hook 글은 도구 직후에만 화면에 보여서 이 자리에 둬요 (10/13 시험).
 */
import { readFileSync } from 'node:fs';
import {
  findNoticeToken,
  isNoticeCommand,
  screenHookOutput,
} from './preview-command.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: { command?: string };
  tool_response?: { stdout?: string };
};
if (!isNoticeCommand(String(event.tool_input?.command ?? ''))) {
  process.exit(0);
}

// 이 명령일 때만 패키지(@sil/core)를 불러와요 (preview-command.ts 설명)
const { takeNotice } = await import('./pending.ts');
const { noticeScreen } = await import('./screens.ts');
const input = takeNotice(
  findNoticeToken(String(event.tool_response?.stdout ?? '')),
);
if (!input) process.exit(0);

process.stdout.write(screenHookOutput(noticeScreen(input)));
