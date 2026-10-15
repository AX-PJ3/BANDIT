/**
 * T1 예외 안내 값을 임시로 들고 있는 명령이에요 (10/14 확정 예외, SIL-66). 화면은 이 명령 직후 hook(`hook-notice.ts`)이 띄워요.
 * 한글이 깨지지 않게 값은 표준 입력(JSON)으로 받아요.
 *   node apps/detect/src/t1/notice.ts <<'EOF'
 *   {"kind":"searchFailed","trigger":"agent"}
 *   EOF
 * kind: searchFailed(trigger 필요) / same·similar(existing: id·title·value 필요) / similarDeclined / saveRace
 */
import { readFileSync } from 'node:fs';
import { STANDARD_ID_PATTERN } from '@sil/core';
import { T1_COPY } from './copy.ts';
import { writeNotice } from './pending.ts';
import { NOTICE_DONE } from './preview-command.ts';
import type { T1NoticeInput } from './screens.ts';

const input = JSON.parse(readFileSync(0, 'utf8')) as T1NoticeInput;

const isFilled = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '';

function isValid(notice: T1NoticeInput): boolean {
  switch (notice.kind) {
    case 'searchFailed':
      return Object.hasOwn(
        T1_COPY.notices.searchFailed.head,
        String(notice.trigger),
      );
    case 'same':
    case 'similar':
      return (
        STANDARD_ID_PATTERN.test(String(notice.existing?.id)) &&
        isFilled(notice.existing.title) &&
        isFilled(notice.existing.value)
      );
    case 'similarDeclined':
    case 'saveRace':
      return true;
    default:
      return false;
  }
}

if (!isValid(input)) {
  console.error(
    'kind(searchFailed|same|similar|similarDeclined|saveRace)와 그 kind에 필요한 칸(trigger 또는 existing의 id·title·value)이 있어야 해요',
  );
  process.exit(1);
}

// hook-notice.ts가 이 줄의 표로 파일을 찾아요
console.log(`${NOTICE_DONE} ${writeNotice(input)}`);
