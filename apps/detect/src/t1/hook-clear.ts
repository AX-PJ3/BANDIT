/**
 * hook: ③ 임시 값을 지워요 (SIL-66 T1).
 * - PostToolUse, save_standard: 저장했으면 쓴 값이라 지워요
 * - SessionStart: Claude Code를 새로 켜면 지난 세션의 값이라 지워요
 */
import { clearPending } from './pending.ts';

clearPending();
