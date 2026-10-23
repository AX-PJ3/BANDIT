import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { T1ConflictsInput } from '@sil/t1';
import { describe, expect, it } from 'vitest';
import {
  clearPending,
  conflictsPath,
  diffFromPending,
  pendingPath,
  takeConflicts,
  takeNotice,
  writeConflicts,
  writePending,
} from './pending.ts';
import {
  CONFLICTS_DONE,
  findConflictsToken,
  findNoticeToken,
  findPreviewId,
  isConflictsCommand,
  isNoticeCommand,
  isPreviewCommand,
  isSavedResponse,
  isVersionConflict,
  NOTICE_DONE,
  PREVIEW_DONE,
  SAVE_RACE_CONTEXT,
  SCREEN_SHOWN_CONTEXT,
} from './preview-command.ts';

/** 꾸밈 코드(ANSI)를 지워요 */
// eslint-disable-next-line no-control-regex -- 터미널 색 코드(ESC)를 지우려면 제어 문자가 필요해요
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

/** 프로토타입 경우 2의 다른 결정 사항 (10/14) */
const TITLE_CONFLICTS: T1ConflictsInput = {
  trigger: 'direct',
  request: '앱 알림 제목 길이를 32자 이하로 바꾸기',
  conflicts: [
    {
      id: 'app.notify.title-length',
      title: '앱 알림 제목은 40자 이하로 쓴다',
      kind: 'change',
      why: '40자 이하로 정한 길이를 32자 이하로 다시 정해요',
    },
    {
      id: 'notify.app-title.from-standard',
      title: '앱 알림 제목에는 결정 사항 제목을 그대로 쓴다',
      kind: 'mismatch',
      why: '결정 사항 제목(최대 40자)을 그대로 쓰면 32자에서 잘려요',
    },
  ],
};

describe('diffFromPending', () => {
  const pending = {
    id: 'app.notify.title-length',
    title: '앱 알림 제목은 32자 이하다',
    value: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
    reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘린다',
    alwaysOn: false,
  };

  it('③에서 보여 준 값과 같으면 빈 목록이에요', () => {
    expect(diffFromPending(pending, { ...pending, baseVersion: 1 })).toEqual(
      [],
    );
  });

  it('바뀐 칸 이름을 알려 줘요', () => {
    expect(
      diffFromPending(pending, {
        ...pending,
        reason: '다른 이유',
        alwaysOn: true,
      }),
    ).toEqual(['reason', 'alwaysOn']);
  });
});

describe('pendingPath', () => {
  it('결정 사항마다 파일을 따로 둬요', () => {
    expect(pendingPath('app.notify.title-length')).toMatch(
      /haribo-t1-pending-app\.notify\.title-length\.json$/,
    );
  });

  it('결정 사항 ID 형식이 아니면 파일을 만들지 않아요 (경로 문자 막기)', () => {
    expect(pendingPath('../../etc.passwd.x')).toBeNull();
    expect(pendingPath('App.Notify.Title')).toBeNull();
  });
});

describe('isPreviewCommand', () => {
  it('node로 시작하는 ③ 명령을 알아봐요', () => {
    expect(
      isPreviewCommand("node apps/detect/src/t1/preview.ts <<'EOF'\n{}\nEOF"),
    ).toBe(true);
    expect(isPreviewCommand('node ./apps/detect/src/t1/preview.ts')).toBe(true);
  });

  it('앞에 cd를 붙이거나 전체 경로로 불러도 알아봐요', () => {
    expect(
      isPreviewCommand(
        `cd "C:/Users/user/orca/workspaces/HARIBO/main-2" && node apps/detect/src/t1/preview.ts <<'EOF'`,
      ),
    ).toBe(true);
    expect(
      isPreviewCommand('cd /repo; node /repo/apps/detect/src/t1/preview.ts'),
    ).toBe(true);
    expect(
      isPreviewCommand(
        'node "C:/Users/my name/HARIBO/apps/detect/src/t1/preview.ts"',
      ),
    ).toBe(true);
    expect(
      isPreviewCommand('node C:\\repo\\apps\\detect\\src\\t1\\preview.ts'),
    ).toBe(true);
  });

  it('다른 명령은 알아보지 않아요', () => {
    expect(isPreviewCommand('cat apps/detect/src/t1/preview.ts')).toBe(false);
    expect(isPreviewCommand('node apps/detect/src/t1/preview.test.ts')).toBe(
      false,
    );
    expect(isPreviewCommand('node apps/detect/src/t1/hook-preview.ts')).toBe(
      false,
    );
    expect(isPreviewCommand('pnpm test')).toBe(false);
  });
});

describe('findPreviewId', () => {
  it('preview.ts 마지막 줄에서 결정 사항 ID를 찾아요 (Windows 줄바꿈 포함)', () => {
    expect(findPreviewId(`${PREVIEW_DONE} app.notify.title-length\r\n`)).toBe(
      'app.notify.title-length',
    );
  });

  it('표시 줄이 없으면 undefined예요', () => {
    expect(findPreviewId('빠진 칸이 있어요: reason')).toBeUndefined();
  });
});

describe('hook-preview.ts', () => {
  const HOOK_PATH = fileURLToPath(
    new URL('./hook-preview.ts', import.meta.url),
  );
  const runHook = (command: string, stdout: string) =>
    execFileSync(process.execPath, [HOOK_PATH], {
      input: JSON.stringify({
        tool_input: { command },
        tool_response: { stdout },
      }),
      encoding: 'utf8',
    });

  it('앞에 cd가 붙은 ③ 명령에도 꾸민 ③을 띄워요', () => {
    const id = 'test.t1.hook-preview';
    writePending({
      id,
      title: '시험 제목',
      value: '시험 값',
      reason: '시험 이유',
      alwaysOn: false,
    });
    try {
      const output = runHook(
        `cd "C:/repo/main-2" && node apps/detect/src/t1/preview.ts <<'EOF'`,
        `${PREVIEW_DONE} ${id}\n`,
      );
      const { systemMessage } = JSON.parse(output) as { systemMessage: string };
      expect(systemMessage).toContain('\u001b[0;1;36m[test] 시험 제목');
      expect(stripAnsi(systemMessage)).toContain('    값    시험 값');
    } finally {
      clearPending(id);
    }
  });

  it('다른 명령이면 아무것도 내지 않아요', () => {
    expect(runHook('git status', '')).toBe('');
  });
});

describe('conflicts.ts와 hook-conflicts.ts (SIL-94)', () => {
  const runNode = (file: string, input: string) =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL(file, import.meta.url))],
      { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
  const runHook = (command: string, stdout: string) =>
    runNode(
      './hook-conflicts.ts',
      JSON.stringify({ tool_input: { command }, tool_response: { stdout } }),
    );

  it('명령이 값을 들고, 직후 hook이 화면을 띄우고 임시 값을 지워요', () => {
    const stdout = runNode('./conflicts.ts', JSON.stringify(TITLE_CONFLICTS));
    const token = findConflictsToken(stdout);
    expect(token).toBeDefined();
    const output = runHook(
      `cd "C:/repo/main-2" && node apps/detect/src/t1/conflicts.ts <<'EOF'`,
      stdout,
    );
    const { systemMessage } = JSON.parse(output) as { systemMessage: string };
    expect(stripAnsi(systemMessage)).toContain(
      '  어긋남  [notify] 앱 알림 제목에는 결정 사항 제목을 그대로 쓴다',
    );
    expect(takeConflicts(token)).toBeNull();
  });

  it('다른 결정 사항이 없는 화면은 직접 요청(새 결정 사항)에서만 받아요', () => {
    const stdout = runNode(
      './conflicts.ts',
      JSON.stringify({ ...TITLE_CONFLICTS, conflicts: [] }),
    );
    expect(takeConflicts(findConflictsToken(stdout))).toMatchObject({
      conflicts: [],
    });
  });

  it('trigger·구분이 정해진 값이 아니거나, 경우 1인데 다른 결정 사항이 없으면 거절해요', () => {
    const [first] = TITLE_CONFLICTS.conflicts;
    expect(() =>
      runNode(
        './conflicts.ts',
        JSON.stringify({ ...TITLE_CONFLICTS, trigger: 'x' }),
      ),
    ).toThrow();
    expect(() =>
      runNode(
        './conflicts.ts',
        JSON.stringify({
          ...TITLE_CONFLICTS,
          trigger: 'agent',
          conflicts: [],
        }),
      ),
    ).toThrow();
    expect(() =>
      runNode(
        './conflicts.ts',
        JSON.stringify({
          ...TITLE_CONFLICTS,
          conflicts: [{ ...first, kind: 'x' }],
        }),
      ),
    ).toThrow();
  });

  it('다른 명령이면 아무것도 내지 않아요', () => {
    expect(runHook('git status', '')).toBe('');
    expect(runHook('node apps/detect/src/t1/preview.ts', '')).toBe('');
  });

  it('표 형식이 아니면 파일을 찾지 않아요 (경로 문자 막기)', () => {
    expect(conflictsPath('../../etc')).toBeNull();
    const token = writeConflicts(TITLE_CONFLICTS);
    expect(conflictsPath(token)).toMatch(/haribo-t1-conflicts-/);
    expect(takeConflicts(token)).toEqual(TITLE_CONFLICTS);
  });

  it('명령 알아보기와 표 찾기', () => {
    expect(isConflictsCommand('node apps/detect/src/t1/conflicts.ts')).toBe(
      true,
    );
    expect(isConflictsCommand('cat apps/detect/src/t1/conflicts.ts')).toBe(
      false,
    );
    expect(isConflictsCommand('node apps/detect/src/t1/preview.ts')).toBe(
      false,
    );
    expect(findConflictsToken(`${CONFLICTS_DONE} abc\r\n`)).toBe('abc');
  });
});

describe('hooks 첫 줄', () => {
  it('두 hook 모두 첫 줄을 비워 머리글 다음 줄부터 시작해요', () => {
    const id = 'test.t1.first-line';
    writePending({
      id,
      title: '제목',
      value: '값',
      reason: '이유',
      alwaysOn: false,
    });
    const run = (file: string, command: string, stdout: string) => {
      const output = JSON.parse(
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL(file, import.meta.url))],
          {
            input: JSON.stringify({
              tool_input: { command },
              tool_response: { stdout },
            }),
            encoding: 'utf8',
          },
        ),
      ) as {
        systemMessage: string;
        hookSpecificOutput: { additionalContext: string };
      };
      // 에이전트에게는 화면을 이미 보여 줬으니 설명하지 말라고만 전해요 (10/15)
      expect(output.hookSpecificOutput.additionalContext).toBe(
        SCREEN_SHOWN_CONTEXT,
      );
      return output.systemMessage;
    };
    try {
      const preview = run(
        './hook-preview.ts',
        'node apps/detect/src/t1/preview.ts',
        `${PREVIEW_DONE} ${id}`,
      );
      expect(preview.startsWith('\n-- 결정 사항을 이렇게')).toBe(true);
      const conflicts = run(
        './hook-conflicts.ts',
        'node apps/detect/src/t1/conflicts.ts',
        `${CONFLICTS_DONE} ${writeConflicts(TITLE_CONFLICTS)}`,
      );
      expect(conflicts.startsWith('\n\u001b[0;7;33m')).toBe(true);
    } finally {
      clearPending(id);
    }
  });
});

describe('isSavedResponse', () => {
  const result = { standardId: 'app.notify.title-length', version: 2 };

  it('MCP 결과가 어떤 겉모양이든 저장 결과를 찾아요', () => {
    const text = JSON.stringify(result);
    expect(isSavedResponse({ content: [{ type: 'text', text }] })).toBe(true);
    expect(isSavedResponse([{ type: 'text', text }])).toBe(true);
    expect(isSavedResponse(text)).toBe(true);
  });

  it('오류이거나 저장 결과가 없으면 false예요', () => {
    expect(
      isSavedResponse({
        isError: true,
        content: [{ type: 'text', text: '[CONFLICT] 그사이 바뀌었어요' }],
      }),
    ).toBe(false);
    expect(isSavedResponse([{ type: 'text', text: '저장하지 못했어요' }])).toBe(
      false,
    );
    expect(isSavedResponse(undefined)).toBe(false);
  });
});

describe('isVersionConflict', () => {
  it('저장 결과나 실패 내용에 VERSION_CONFLICT가 있으면 true예요', () => {
    expect(isVersionConflict(undefined, '[VERSION_CONFLICT] 바뀌었어요')).toBe(
      true,
    );
    expect(
      isVersionConflict({ content: [{ text: '[VERSION_CONFLICT] …' }] }),
    ).toBe(true);
    expect(isVersionConflict({ content: [{ text: '[FORBIDDEN] …' }] })).toBe(
      false,
    );
  });
});

describe('hook-saved.ts', () => {
  const runHook = (id: string, response: unknown) =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('./hook-saved.ts', import.meta.url))],
      {
        input: JSON.stringify({
          tool_input: { id },
          tool_response: response,
        }),
        encoding: 'utf8',
      },
    );
  const saved = (id: string) => [
    { type: 'text', text: JSON.stringify({ standardId: id, version: 2 }) },
  ];

  it('③을 거친 저장이 성공하면 ④를 띄우고 임시 값을 지워요', () => {
    const id = 'test.t1.hook-saved';
    writePending({
      id,
      title: '시험 제목',
      value: '시험 값',
      reason: '시험 이유',
      alwaysOn: false,
      targets: [],
    });
    const output = JSON.parse(runHook(id, saved(id))) as {
      systemMessage: string;
      hookSpecificOutput: { additionalContext: string };
    };
    expect(stripAnsi(output.systemMessage)).toContain(
      '✓ 결정 사항을 등록했어요.',
    );
    expect(output.hookSpecificOutput.additionalContext).toBe(
      SCREEN_SHOWN_CONTEXT,
    );
    expect(existsSync(pendingPath(id) ?? '')).toBe(false);
  });

  it('저장이 실패하면 ④를 띄우지 않아요', () => {
    const id = 'test.t1.hook-saved-fail';
    writePending({
      id,
      title: '시험 제목',
      value: '시험 값',
      reason: '시험 이유',
      alwaysOn: false,
    });
    expect(runHook(id, { isError: true, content: [] })).toBe('');
    clearPending(id);
  });

  it('그사이 바뀌어 거절되면(VERSION_CONFLICT) 그 자리에서 예외 7 안내를 띄워요 (PostToolUse·PostToolUseFailure)', () => {
    const id = 'test.t1.hook-saved-race';
    const pending = {
      id,
      title: '시험 제목',
      value: '시험 값',
      reason: '시험 이유',
      alwaysOn: false,
    };
    const rejected = {
      isError: true,
      content: [
        { type: 'text', text: '[VERSION_CONFLICT] 그사이 v2로 바뀌었어요' },
      ],
    };
    for (const [eventName, extra] of [
      ['PostToolUse', { tool_response: rejected }],
      [
        'PostToolUseFailure',
        { error: '[VERSION_CONFLICT] 그사이 v2로 바뀌었어요' },
      ],
    ] as const) {
      writePending(pending);
      const output = JSON.parse(
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL('./hook-saved.ts', import.meta.url))],
          {
            input: JSON.stringify({
              hook_event_name: eventName,
              tool_input: { id },
              ...extra,
            }),
            encoding: 'utf8',
          },
        ),
      ) as {
        systemMessage: string;
        hookSpecificOutput: {
          hookEventName: string;
          additionalContext: string;
        };
      };
      expect(stripAnsi(output.systemMessage).split('\n')).toEqual([
        '',
        '  저장하는 사이 다른 사람이 먼저 이 결정 사항을 바꿨어요.',
        '  바뀐 내용을 다시 확인할게요.',
      ]);
      expect(output.hookSpecificOutput).toEqual({
        hookEventName: eventName,
        additionalContext: SAVE_RACE_CONTEXT,
      });
    }
  });

  it('③을 거치지 않은 저장에는 아무것도 띄우지 않아요', () => {
    expect(runHook('test.t1.no-pending', saved('test.t1.no-pending'))).toBe('');
  });
});

describe('notice.ts와 hook-notice.ts', () => {
  const runNode = (file: string, input: string) =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL(file, import.meta.url))],
      { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );

  it('명령이 값을 들고, 직후 hook이 안내를 띄우고 임시 값을 지워요', () => {
    const stdout = runNode(
      './notice.ts',
      JSON.stringify({ kind: 'similarDeclined' }),
    );
    const token = findNoticeToken(stdout);
    const output = JSON.parse(
      runNode(
        './hook-notice.ts',
        JSON.stringify({
          tool_input: { command: 'node apps/detect/src/t1/notice.ts' },
          tool_response: { stdout },
        }),
      ),
    ) as { systemMessage: string };
    expect(stripAnsi(output.systemMessage)).toContain(
      '등록하지 않았어요. 기존 결정 사항을 그대로 둘게요.',
    );
    expect(takeNotice(token)).toBeNull();
  });

  it('kind나 필요한 칸이 없으면 거절해요', () => {
    for (const bad of [
      { kind: 'x' },
      // 예외 7은 저장 도구 hook이 띄워요
      { kind: 'saveRace' },
      { kind: 'searchFailed' },
      { kind: 'same', existing: { id: 'app.notify.title-length' } },
      // 되돌림이 같음은 몇 버전인지와 그 버전 값이 있어야 해요
      {
        kind: 'revertSame',
        versionValue: '값',
        existing: { id: 'app.notify.title-length', title: '제목', value: '값' },
      },
      {
        kind: 'revertSame',
        version: 2,
        existing: { id: 'app.notify.title-length', title: '제목', value: '값' },
      },
    ]) {
      expect(() => runNode('./notice.ts', JSON.stringify(bad))).toThrow();
    }
  });

  it('다른 명령은 알아보지 않아요', () => {
    expect(isNoticeCommand('node apps/detect/src/t1/notice.ts')).toBe(true);
    expect(isNoticeCommand('node apps/detect/src/t1/conflicts.ts')).toBe(false);
    expect(findNoticeToken(`${NOTICE_DONE} abc\r\n`)).toBe('abc');
  });
});
