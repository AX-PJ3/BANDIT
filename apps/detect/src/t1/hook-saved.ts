/**
 * hook (PostToolUse, save_standard): 저장 직후 ④ 등록 완료를 띄우고 저장한 결정 사항의 ③ 임시 값을 지워요 (SIL-66 T1).
 * - ③을 거친 저장(임시 값이 있음)이 성공했을 때만 ④를 띄워요. T1이 아닌 저장에는 아무것도 띄우지 않아요.
 * - 다른 결정 사항의 임시 값은 건드리지 않아요 (다른 Claude Code 창이 쓰는 중일 수 있어요).
 */
import { readFileSync } from 'node:fs';
import { clearPending, readPending } from './pending.ts';
import { isSavedResponse, screenHookOutput } from './preview-command.ts';
import { savedScreen } from './screens.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  tool_input?: { id?: string };
  tool_response?: unknown;
};
const id = event.tool_input?.id;
const pending = readPending(id);
clearPending(id);

if (pending && isSavedResponse(event.tool_response)) {
  process.stdout.write(
    screenHookOutput(
      savedScreen(
        {
          // 영역을 비우면 ID 앞부분이 영역이 돼요 (save_standard 설명)
          area: pending.area ?? pending.id.split('.')[0] ?? '',
          title: pending.title,
          alwaysOn: pending.alwaysOn,
        },
        pending.targets ?? null,
        pending.isNew ?? false,
      ),
    ),
  );
}
