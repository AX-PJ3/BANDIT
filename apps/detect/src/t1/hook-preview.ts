/**
 * hook (PostToolUse, Bash): `preview.ts`를 실행한 직후 ③ 등록될 모습을 꾸며서 띄워요 (FigJam T1 ③).
 * 다른 명령이면 아무것도 하지 않아요. hook 글은 도구 직후에만 화면에 보여서 이 자리에 둬요 (10/13 시험).
 */
import { readFileSync } from 'node:fs';
import { findPreviewId, isPreviewCommand } from './preview-command.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: { command?: string };
  tool_response?: { stdout?: string };
};
if (!isPreviewCommand(String(event.tool_input?.command ?? ''))) {
  process.exit(0);
}

// ③ 명령일 때만 패키지(@sil/core)를 불러와요 (preview-command.ts 설명)
const { readPending } = await import('./pending.ts');
const { renderT1Preview } = await import('./copy.ts');
// preview.ts가 남긴 마지막 줄 "…들고 있어요: <결정 사항 ID>"에서 이번 ③의 결정 사항을 찾아요
const pending = readPending(
  findPreviewId(String(event.tool_response?.stdout ?? '')),
);
if (!pending) process.exit(0);

const ESC = '\u001b[';
const cyan = (text: string) => `${ESC}36m${text}${ESC}0m`;
const bold = (text: string) => `${ESC}1m${text}${ESC}0m`;

const lines = renderT1Preview({
  // 영역을 비우면 ID 앞부분이 영역이 돼요 (save_standard 설명)
  area: pending.area ?? pending.id.split('.')[0] ?? '',
  title: pending.title,
  value: pending.value,
  reason: pending.reason,
  alwaysOn: pending.alwaysOn,
}).split('\n');
// FigJam ③: 청록 제목, 항상 적용은 예일 때만 굵게
lines[1] = cyan(lines[1] ?? '');
if (pending.alwaysOn) {
  lines[lines.length - 1] = bold(lines[lines.length - 1] ?? '');
}

process.stdout.write(JSON.stringify({ systemMessage: lines.join('\n') }));
