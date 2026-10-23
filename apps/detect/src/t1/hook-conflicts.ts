/**
 * hook (PostToolUse, Bash): `conflicts.ts`를 실행한 직후 다른 결정 사항 화면을 띄워요 (SIL-94 직접 요청).
 * 다른 명령이면 아무것도 하지 않아요. hook 글은 도구 직후에만 화면에 보여서 이 자리에 둬요 (10/13 시험).
 */
import { readFileSync } from 'node:fs';
import {
  findConflictsToken,
  isConflictsCommand,
  screenHookOutput,
} from './preview-command.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: { command?: string };
  tool_response?: { stdout?: string };
};
if (!isConflictsCommand(String(event.tool_input?.command ?? ''))) {
  process.exit(0);
}

// 이 명령일 때만 패키지(@sil/core)를 불러와요 (preview-command.ts 설명)
const { takeConflicts } = await import('./pending.ts');
const { conflictsScreen } = await import('@sil/t1');
const input = takeConflicts(
  findConflictsToken(String(event.tool_response?.stdout ?? '')),
);
if (!input) process.exit(0);

process.stdout.write(screenHookOutput(conflictsScreen(input)));
