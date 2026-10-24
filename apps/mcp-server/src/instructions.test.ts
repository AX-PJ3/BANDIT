/**
 * 서버 안내문 길이를 확인해요 (BDT-108).
 * Claude Code는 서버 안내문을 4,096자에서 잘라요. 안내문 뒤쪽이 잘려도 사용법(1~10번)과 항상 적용 결정 사항은 남아야 해요.
 */
import { setDbForTesting } from '@sil/core/node';
import { createFakeDb, standardRows } from '@sil/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { clearInstructionsCache, getInstructions } from './instructions.ts';

/** Claude Code가 서버 안내문을 자르는 길이 (code.claude.com/docs/en/mcp "Scale with MCP tool search") */
const INSTRUCTIONS_LIMIT = 4096;
/** 사람 이름이 있으면 맨 앞에 붙는 "답을 기다리는 확인할 변경" 줄의 넉넉한 길이 */
const PENDING_LINE = 200;

afterEach(() => {
  clearInstructionsCache();
  setDbForTesting(undefined);
});

describe('서버 안내문', () => {
  it('항상 적용 결정 사항이 10개(최대)이고 값이 길어도 4,096자 안에 들어요', async () => {
    // ID는 길게, 값은 안내문이 자르는 160자보다 길게 넣어요
    const rows = Array.from({ length: 10 }, (_, i) =>
      standardRows({
        id: `notify.terminal.new-after-answered-${i}`,
        area: '알리기',
        alwaysOn: true,
        versions: [{ title: '제목', value: '긴 값 '.repeat(100) }],
      }),
    );
    setDbForTesting(
      createFakeDb({
        standards: rows.map((row) => row.standard),
        standard_versions: rows.flatMap((row) => row.versions),
        standards_latest: rows.map((row) => row.latest),
      }).client,
    );
    const text = await getInstructions(null);
    expect(text).toContain('10. 작업이 결정 사항과 다르게 되면');
    expect(text).toContain('notify.terminal.new-after-answered-9');
    expect(text.length + PENDING_LINE).toBeLessThanOrEqual(INSTRUCTIONS_LIMIT);
  });
});
