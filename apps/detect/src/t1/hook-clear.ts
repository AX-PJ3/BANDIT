/**
 * hook (PostToolUse, save_standard): 저장한 결정 사항의 ③ 임시 값을 지워요 (SIL-66 T1).
 * 다른 결정 사항의 임시 값은 건드리지 않아요 (다른 Claude Code 창이 쓰는 중일 수 있어요).
 */
import { readFileSync } from 'node:fs';
import { clearPending } from './pending.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: { id?: string };
};
clearPending(event.tool_input?.id);
