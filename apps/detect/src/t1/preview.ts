/**
 * T1 5단계: ③ 등록될 모습 값을 임시로 들고 있는 명령이에요. 화면은 이 명령 직후 hook(`hook-preview.ts`)이 띄워요.
 * 한글이 깨지지 않게 값은 표준 입력(JSON)으로 받아요.
 *   node apps/detect/src/t1/preview.ts <<'EOF'
 *   {"id":"app.notify.title-length","title":"…","value":"…","reason":"…","alwaysOn":false,"changedBy":"경하"}
 *   EOF
 * 기존 결정 사항이 없는 새 결정 사항이면 `"isNew":true`를 더해요 (SIL-94).
 * ③ 이슈 표에 넣을 받는 이슈도 여기서 팀 DB로 읽어 함께 들고 있어요 (SIL-94). 에이전트는 출력의
 * "알림 받는 이슈" 줄을 보고 등록하기 설명을 골라요.
 */
import { readFileSync } from 'node:fs';
import { loadTargets } from '@sil/t1';
import { pendingPath, type T1Pending, writePending } from './pending.ts';
import { PREVIEW_DONE } from './preview-command.ts';

/** 에이전트가 읽는 받는 이슈 수 줄. 1개 이상이면 `registerWithIssues`, 아니면 `register`를 골라요 (CLAUDE.md T1 5) */
const TARGETS_LINE = '알림 받는 이슈:';

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

if (pending.isNew !== undefined && typeof pending.isNew !== 'boolean') {
  console.error('isNew는 true나 false여야 해요');
  process.exit(1);
}

if (!pendingPath(pending.id)) {
  console.error(`결정 사항 ID 형식이 아니에요: ${pending.id}`);
  process.exit(1);
}

// 새 결정 사항에는 아직 연결된 이슈가 없어요 (프로토타입 10/14 "알림 받을 사람이 없어요")
const targets = pending.isNew
  ? []
  : await loadTargets(pending.id, pending.changedBy);
writePending({ ...pending, targets });
console.log(
  targets
    ? `${TARGETS_LINE} ${targets.length}개`
    : `${TARGETS_LINE} 알 수 없어요 (팀 DB를 읽지 못했어요)`,
);
// hook-preview.ts가 이 줄의 결정 사항 ID로 파일을 찾아요
console.log(`${PREVIEW_DONE} ${pending.id}`);
