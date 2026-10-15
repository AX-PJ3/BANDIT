/**
 * T1 직접 요청(SIL-94): 다른 결정 사항 화면 값을 임시로 들고 있는 명령이에요. 화면은 이 명령 직후 hook(`hook-conflicts.ts`)이 띄워요.
 * 한글이 깨지지 않게 값은 표준 입력(JSON)으로 받아요. 변경을 맨 앞에 둬요.
 *   node apps/detect/src/t1/conflicts.ts <<'EOF'
 *   {"request":"앱 알림 제목 길이를 32자 이하로 바꾸기","conflicts":[
 *     {"id":"app.notify.title-length","title":"…","kind":"change","why":"…"},
 *     {"id":"notify.app-title.from-standard","title":"…","kind":"mismatch","why":"…"}]}
 *   EOF
 */
import { readFileSync } from 'node:fs';
import { STANDARD_ID_PATTERN } from '@sil/core';
import { T1_COPY } from './copy.ts';
import { writeConflicts } from './pending.ts';
import { CONFLICTS_DONE } from './preview-command.ts';
import type { T1Conflict, T1ConflictsInput } from './screens.ts';

const input = JSON.parse(readFileSync(0, 'utf8')) as T1ConflictsInput;

const isFilled = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '';
const isConflict = (conflict: T1Conflict) =>
  STANDARD_ID_PATTERN.test(String(conflict.id)) &&
  isFilled(conflict.title) &&
  isFilled(conflict.why) &&
  Object.hasOwn(T1_COPY.direct.conflicts.kinds, conflict.kind);

if (
  !isFilled(input.request) ||
  !Array.isArray(input.conflicts) ||
  input.conflicts.length === 0 ||
  !input.conflicts.every(isConflict)
) {
  console.error(
    'request와 conflicts(하나 이상, 각각 id·title·kind(change|mismatch)·why)가 있어야 해요',
  );
  process.exit(1);
}

// hook-conflicts.ts가 이 줄의 표로 파일을 찾아요
console.log(`${CONFLICTS_DONE} ${writeConflicts(input)}`);
