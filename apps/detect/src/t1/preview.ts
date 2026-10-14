/**
 * T1 5단계: ③ 등록될 모습 값을 임시로 들고 있는 명령이에요. 화면은 이 명령 직후 hook(`hook-preview.ts`)이 띄워요.
 * 한글이 깨지지 않게 값은 표준 입력(JSON)으로 받아요.
 *   node apps/detect/src/t1/preview.ts <<'EOF'
 *   {"id":"app.notify.title-length","title":"…","value":"…","reason":"…","alwaysOn":false}
 *   EOF
 */
import { readFileSync } from 'node:fs';
import {
  PREVIEW_DONE,
  pendingPath,
  type T1Pending,
  writePending,
} from './pending.ts';

const pending = JSON.parse(readFileSync(0, 'utf8')) as T1Pending;

const missing = (['id', 'title', 'value', 'reason'] as const).filter(
  (key) => typeof pending[key] !== 'string' || pending[key].trim() === '',
);
if (missing.length > 0 || typeof pending.alwaysOn !== 'boolean') {
  console.error(
    `빠진 칸이 있어요: ${[...missing, ...(typeof pending.alwaysOn === 'boolean' ? [] : ['alwaysOn'])].join(', ')}`,
  );
  process.exit(1);
}

if (!pendingPath(pending.id)) {
  console.error(`결정 사항 ID 형식이 아니에요: ${pending.id}`);
  process.exit(1);
}

writePending(pending);
// hook-preview.ts가 이 줄의 결정 사항 ID로 파일을 찾아요
console.log(`${PREVIEW_DONE} ${pending.id}`);
