/**
 * hook (PostToolUse·PostToolUseFailure, save_standard): 저장 직후 ④ 등록 완료를 띄우고 저장한 결정 사항의 ③ 임시 값을 지워요 (SIL-66 T1).
 * - ③을 거친 저장(임시 값이 있음)이 성공했을 때만 ④를 띄워요. T1이 아닌 저장에는 아무것도 띄우지 않아요.
 * - 그사이 다른 사람이 먼저 바꿔 거절됐으면(VERSION_CONFLICT) 예외 7 안내를 바로 이 자리에서 띄워요 (프로토타입 race, 10/14).
 * - 다른 결정 사항의 임시 값은 건드리지 않아요 (다른 Claude Code 창이 쓰는 중일 수 있어요).
 */
import { readFileSync } from 'node:fs';
import { clearPending, readPending } from './pending.ts';
import {
  isSavedResponse,
  isVersionConflict,
  SAVE_RACE_CONTEXT,
  screenHookOutput,
} from './preview-command.ts';
import { noticeScreen, savedScreen } from './screens.ts';

const event = JSON.parse(readFileSync(0, 'utf8')) as {
  hook_event_name?: string;
  tool_input?: { id?: string };
  tool_response?: unknown;
  /** PostToolUseFailure일 때 실패 내용 */
  error?: unknown;
};
const eventName = event.hook_event_name ?? 'PostToolUse';
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
} else if (pending && isVersionConflict(event.tool_response, event.error)) {
  process.stdout.write(
    screenHookOutput(
      noticeScreen({ kind: 'saveRace' }),
      SAVE_RACE_CONTEXT,
      eventName,
    ),
  );
}
