/**
 * hook (PreToolUse, save_standard): 저장하려는 값이 ③에서 사람에게 보여 준 값과 다르면 저장을 막아요.
 * - ③을 보여 준 같은 결정 사항일 때만 비교해요. 임시 값이 없거나 다른 결정 사항이면 아무것도 정하지 않아요
 *   ("결정 사항 새로 만들어 줘" 같은 다른 저장은 막지 않음).
 * - 막지 않으면 원래대로 .claude/settings.json의 묻기 규칙이 허락 창을 띄워요.
 */
import { readFileSync } from 'node:fs';
import type { SaveStandardInput } from '@sil/core';
import { diffFromPending, readPending } from './pending.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: Partial<SaveStandardInput>;
};
const input = event.tool_input ?? {};
// 임시 값은 결정 사항마다 따로 있어서, 저장하려는 결정 사항의 것만 읽어요
const pending = readPending(input.id);
if (!pending) process.exit(0);

const changed = diffFromPending(pending, input);
if (changed.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `③에서 보여 준 값과 저장하려는 값이 달라요 (${changed.join(', ')}). ③을 다시 보여 주고 확인받아 주세요.`,
      },
    }),
  );
}
