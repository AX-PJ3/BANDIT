import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { T1_COPY } from './copy.ts';
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
import { buildT1NewSaveInput, buildT1SaveInput } from './save-input.ts';
import {
  COLS,
  conflictsScreen,
  noticeScreen,
  previewScreen,
  savedScreen,
  type T1ConflictsInput,
  type T1NoticeInput,
} from './screens.ts';
import { textWidth, wrap } from './text.ts';
import { pickTargets } from './issues.ts';
import type { Issue } from '@sil/core';

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

describe('T1 문구', () => {
  it('경우 1 문구는 프로토타입에 적힌 말 그대로예요 (질문 한 줄, 예/아니요)', () => {
    expect(T1_COPY.ask.question).toBe(
      '기존 결정 사항과 다른 작업이에요. 그래도 진행할까요?',
    );
    expect([T1_COPY.ask.yes.label, T1_COPY.ask.no.label]).toEqual([
      '예',
      '아니요',
    ]);
    expect(T1_COPY.conflicts.head.agent).toBe(
      '부탁하신 작업이 기존 결정 사항과 달라요',
    );
  });

  it('직접 요청 문구는 SIL-94·프로토타입에 적힌 말 그대로예요', () => {
    expect(T1_COPY.conflicts.head.direct).toBe(
      '요청하신 변경이 기존 결정 사항과 달라요',
    );
    expect(T1_COPY.preview.heading).toBe('결정 사항을 이렇게 등록할까요');
    expect(T1_COPY.direct.confirm).toBe(
      '달라지게 되는 기존 결정 사항 내역을 확인했나요? 이대로 등록할까요?',
    );
    expect(T1_COPY.conflicts.none).toBe(
      '요청하신 변경과 다른 결정 사항이 없어요',
    );
    expect(T1_COPY.preview.newTag).toBe('새 결정 사항');
  });

  it('④ 등록 완료 문구는 프로토타입에 적힌 말 그대로예요', () => {
    expect(T1_COPY.saved.head).toBe('✓ 결정 사항을 등록했어요.');
    expect(T1_COPY.saved.next).toEqual({
      withTask: '하던 작업을 이어갈게요.',
      noTask: '등록을 마쳤어요.',
    });
  });

  it('AskUserQuestion 이름표는 12자 이하예요', () => {
    expect(T1_COPY.ask.header.length).toBeLessThanOrEqual(12);
    expect(T1_COPY.preview.header.length).toBeLessThanOrEqual(12);
  });

  it('선택지 설명은 마침표로 끝나지 않고, Claude 글은 마침표로 끝나요', () => {
    const { ask, preview } = T1_COPY;
    const descriptions = [
      ask.yes,
      ask.no,
      preview.register,
      preview.registerWithIssues,
      preview.edit,
      preview.cancel,
    ].map((option) => option.description);
    for (const description of descriptions) {
      expect(description).not.toMatch(/\.$/);
    }
    const messages = [
      T1_COPY.notChanged,
      T1_COPY.reasonPrompt,
      T1_COPY.cancelled.withTask,
      T1_COPY.cancelled.noTask,
      T1_COPY.preview.noTargets,
      T1_COPY.ask.typedReply,
    ];
    for (const message of messages) {
      expect(message).toMatch(/\.$/);
    }
    expect(T1_COPY.editPrompt).toMatch(/\?$/);
    expect(T1_COPY.direct.confirm).toMatch(/\?$/);
  });

  it('화면 문구에 "기준" 대신 "결정 사항"을 써요 (copy.term.standard)', () => {
    expect(JSON.stringify(T1_COPY)).not.toContain('기준');
  });
});

describe('previewScreen (③)', () => {
  const values = {
    area: 'app',
    title: '앱 알림 제목은 32자 이하로 쓴다',
    value: '공백 포함 32자 이하',
    reason: 'Windows 알림 창에서는 40자 제목이 잘린다',
    alwaysOn: false,
  };

  it('프로토타입처럼 위 선 안 머리표, 제목, 6칸 이름 뒤 값·이유, 항상 적용, 아래 선이에요', () => {
    expect(stripAnsi(previewScreen(values)).split('\n')).toEqual([
      `-- 결정 사항을 이렇게 등록할까요 ${'-'.repeat(COLS - 33)}`,
      '  [app] 앱 알림 제목은 32자 이하로 쓴다',
      '    값    공백 포함 32자 이하',
      '    이유  Windows 알림 창에서는 40자 제목이 잘린다',
      '',
      '    항상 적용  아니오',
      '',
      '  ID   담당자  이슈',
      '-'.repeat(COLS),
    ]);
  });

  it('위아래 선은 화면 너비와 같아요', () => {
    const lines = stripAnsi(previewScreen(values)).split('\n');
    expect(textWidth(lines[0] ?? '')).toBe(COLS);
    expect(textWidth(lines.at(-1) ?? '')).toBe(COLS);
  });

  it('제목은 청록 굵게, 항상 적용은 예일 때만 굵게예요', () => {
    expect(previewScreen(values)).toContain('\u001b[0;1;36m[app] 앱 알림');
    expect(previewScreen(values)).not.toContain('\u001b[0;1m항상 적용');
    expect(previewScreen({ ...values, alwaysOn: true })).toContain(
      '\u001b[0;1m항상 적용',
    );
  });

  it('긴 이유는 값 칸에 맞춰 다음 줄로 넘겨요', () => {
    const lines = stripAnsi(
      previewScreen({ ...values, reason: '가나다 '.repeat(20).trim() }),
    ).split('\n');
    const reasonLines = lines.slice(3, lines.indexOf(''));
    expect(reasonLines.length).toBeGreaterThan(1);
    for (const line of reasonLines) {
      expect(textWidth(line)).toBeLessThanOrEqual(COLS);
    }
    expect(reasonLines[1]?.startsWith(' '.repeat(10))).toBe(true);
  });

  it('받는 이슈가 있으면 ID·담당자·이슈 줄을 채워요 (프로토타입 경우 2)', () => {
    const lines = stripAnsi(
      previewScreen(values, [
        { key: '#5', assignee: '민수', title: '담당자에게 알리고 답 기록하기' },
        { key: '#7', assignee: '신지', title: '앱 알림과 나에게 온 변경 화면' },
      ]),
    ).split('\n');
    expect(lines.slice(-4)).toEqual([
      '  ID   담당자  이슈',
      '  #5   민수    담당자에게 알리고 답 기록하기',
      '  #7   신지    앱 알림과 나에게 온 변경 화면',
      '-'.repeat(COLS),
    ]);
  });

  it('긴 이슈 제목은 화면 너비에서 잘라요', () => {
    const lines = stripAnsi(
      previewScreen(values, [
        { key: '#12', assignee: '경하', title: '가나다라마바사 '.repeat(10) },
      ]),
    ).split('\n');
    expect(textWidth(lines.at(-2) ?? '')).toBeLessThanOrEqual(COLS);
    expect(lines.at(-2)).toMatch(/…$/);
  });

  it('새 결정 사항이면 제목 줄 오른쪽 끝에 "새 결정 사항"을 붙여요 (프로토타입)', () => {
    const lines = stripAnsi(
      previewScreen(
        { ...values, title: '앱 알림 본문은 2줄 이하로 쓴다' },
        [],
        true,
      ),
    ).split('\n');
    expect(lines[1]).toMatch(
      /^ {2}\[app\] 앱 알림 본문은 2줄 이하로 쓴다 +새 결정 사항$/,
    );
    expect(textWidth(lines[1] ?? '')).toBe(COLS);
  });

  it('제목이 길면 "새 결정 사항"을 다음 줄 오른쪽 끝에 둬요', () => {
    const lines = stripAnsi(
      previewScreen({ ...values, title: '가'.repeat(30) }, [], true),
    ).split('\n');
    expect(lines[2]).toBe(`${' '.repeat(COLS - 12)}새 결정 사항`);
  });

  it('받는 이슈가 없으면 표 대신 받는 사람이 없다는 한 줄이에요', () => {
    const lines = stripAnsi(previewScreen(values, [])).split('\n');
    expect(lines.slice(-2)).toEqual([
      '  연결된 이슈가 없어서 알림을 받는 사람은 없어요.',
      '-'.repeat(COLS),
    ]);
  });
});

describe('pickTargets (③ 받는 이슈)', () => {
  const issues: Issue[] = [
    {
      key: '#3',
      title: '터미널 알림과 답하기 화면',
      assignee: '부건',
      status: 'in_progress',
      standardIds: ['app.notify.title-length'],
    },
    {
      key: '#5',
      title: '담당자에게 알리고 답 기록하기',
      assignee: '민수',
      status: 'done',
      standardIds: ['app.notify.title-length', 'notify.terminal.one-change'],
    },
    {
      key: '#8',
      title: '담당자 없는 이슈',
      assignee: null,
      status: 'in_progress',
      standardIds: ['app.notify.title-length'],
    },
    {
      key: '#9',
      title: '다른 결정 사항만 연결된 이슈',
      assignee: '신지',
      status: 'in_progress',
      standardIds: ['copy.explain.plain-words'],
    },
  ];

  it('연결된 이슈 중 담당자가 있고 바꾼 본인이 아닌 이슈만 받아요 (알리기와 같은 규칙)', () => {
    expect(pickTargets(issues, 'app.notify.title-length', '부건')).toEqual([
      { key: '#5', assignee: '민수', title: '담당자에게 알리고 답 기록하기' },
    ]);
  });

  it('바꾼 사람을 모르면 본인을 빼지 않아요', () => {
    expect(
      pickTargets(issues, 'app.notify.title-length').map((t) => t.key),
    ).toEqual(['#3', '#5']);
  });
});

describe('conflictsScreen (다른 결정 사항)', () => {
  it('새 결정 사항이면 요청 줄 없이 초록 막대 한 줄만이에요 (프로토타입)', () => {
    const screen = conflictsScreen({ ...TITLE_CONFLICTS, conflicts: [] });
    expect(stripAnsi(screen)).toBe('  요청하신 변경과 다른 결정 사항이 없어요');
    // 막대는 초록 32에 반전 7을 더해 바탕색으로 (10/15 ANSI 토큰)
    expect(
      screen.startsWith('\u001b[0;7;32m \u001b[0;2m \u001b[0;32m요청하신'),
    ).toBe(true);
  });

  it('경우 1은 "부탁하신 작업이…" 머리표와 작업 한 줄이에요 (프로토타입)', () => {
    const lines = stripAnsi(
      conflictsScreen({
        ...TITLE_CONFLICTS,
        trigger: 'agent',
        request: '알림 제목을 32자에서 자르기',
      }),
    ).split('\n');
    expect(lines.slice(0, 2)).toEqual([
      '  부탁하신 작업이 기존 결정 사항과 달라요',
      '  작업  알림 제목을 32자에서 자르기',
    ]);
  });

  it('프로토타입 경우 2처럼 노란 막대, 요청, 구분 · [영역] 제목 · 판단 이유예요', () => {
    expect(stripAnsi(conflictsScreen(TITLE_CONFLICTS)).split('\n')).toEqual([
      '  요청하신 변경이 기존 결정 사항과 달라요',
      '  요청  앱 알림 제목 길이를 32자 이하로 바꾸기',
      '',
      '  변경    [app] 앱 알림 제목은 40자 이하로 쓴다',
      '          40자 이하로 정한 길이를 32자 이하로 다시 정해요',
      '  어긋남  [notify] 앱 알림 제목에는 결정 사항 제목을 그대로 쓴다',
      '          결정 사항 제목(최대 40자)을 그대로 쓰면 32자에서 잘려요',
    ]);
  });

  it('머리표는 노란 막대이고 결정 사항 제목은 굵게예요', () => {
    const screen = conflictsScreen(TITLE_CONFLICTS);
    // 막대는 노랑 33에 반전 7을 더해 바탕색으로 (10/15 ANSI 토큰)
    expect(
      screen.startsWith('\u001b[0;7;33m \u001b[0;2m \u001b[0;33m요청하신'),
    ).toBe(true);
    expect(screen).toContain('\u001b[0;1;39m[app] 앱 알림 제목은 40자');
  });
});

describe('wrap', () => {
  it('띄어쓰기에서 나누고, 한 낱말이 너무 길면 글자로 나눠요', () => {
    expect(wrap('가나 다라 마바', 5)).toEqual(['가나', '다라', '마바']);
    expect(wrap('가나다라마', 4)).toEqual(['가나', '다라', '마']);
  });
});

describe('buildT1SaveInput', () => {
  it('get_standard의 currentVersion, alwaysOn, scope를 그대로 넣고 출처는 AI 대화, AI가 찾았나는 예예요', () => {
    const scope = {
      code: ['packages/app/src/notify/**'],
      api: [],
      screen: ['앱 알림'],
      doc: [],
    };
    const input = buildT1SaveInput(
      {
        id: 'app.notify.title-length',
        alwaysOn: false,
        scope,
        currentVersion: 1,
      },
      {
        title: '앱 알림 제목은 32자 이하다',
        value: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
        reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
      },
    );
    expect(input).toMatchObject({
      id: 'app.notify.title-length',
      baseVersion: 1,
      alwaysOn: false,
      scope,
      source: 'ai_chat',
      aiDetected: true,
    });
    // 근거는 넣지 않아요. 근거 필수는 PR 경로(출처 코드) 규칙이에요 (D61)
    expect('evidence' in input).toBe(false);
  });

  it('사람이 직접 요청했으면 AI가 찾았나는 아니오예요 (SIL-94, D61)', () => {
    const input = buildT1SaveInput(
      {
        id: 'app.notify.title-length',
        alwaysOn: false,
        scope: null,
        currentVersion: 1,
      },
      { title: '제목', value: '값', reason: '이유' },
      'direct',
    );
    expect(input).toMatchObject({
      baseVersion: 1,
      source: 'ai_chat',
      aiDetected: false,
    });
  });

  it('적용 범위가 없으면(null) scope 칸을 빼요 (save_standard 도구는 null을 받지 않아요)', () => {
    const input = buildT1SaveInput(
      {
        id: 'app.notify.title-length',
        alwaysOn: false,
        scope: null,
        currentVersion: 1,
      },
      { title: '제목', value: '값', reason: '이유' },
    );
    expect('scope' in input).toBe(false);
  });
});

describe('buildT1NewSaveInput', () => {
  it('기존 결정 사항이 없는 직접 요청은 새 결정 사항(baseVersion 0)으로, AI가 찾았나는 아니오로 저장해요 (SIL-94)', () => {
    const input = buildT1NewSaveInput({
      id: 'app.notify.title-ellipsis',
      title: '잘린 알림 제목 끝에는 말줄임표를 붙인다',
      value: '운영체제 알림 제목을 자르면 끝에 말줄임표(…)를 붙인다',
      reason: '잘렸다는 걸 알 수 있어야 한다',
      alwaysOn: false,
    });
    expect(input).toEqual({
      id: 'app.notify.title-ellipsis',
      title: '잘린 알림 제목 끝에는 말줄임표를 붙인다',
      value: '운영체제 알림 제목을 자르면 끝에 말줄임표(…)를 붙인다',
      reason: '잘렸다는 걸 알 수 있어야 한다',
      alwaysOn: false,
      baseVersion: 0,
      source: 'ai_chat',
      aiDetected: false,
    });
  });
});

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

describe('savedScreen (④ 등록 완료)', () => {
  const values = {
    area: 'app',
    title: '앱 알림 제목은 32자 이하로 쓴다',
    alwaysOn: false,
  };
  const targets = [
    { key: '#5', assignee: '민수', title: '담당자에게 알리고 답 기록하기' },
    { key: '#7', assignee: '신지', title: '앱 알림과 나에게 온 변경 화면' },
  ];

  it('프로토타입 경우 1·2처럼 초록 첫 줄, 제목과 항상 적용, 보낸 이슈 수예요', () => {
    expect(stripAnsi(savedScreen(values, targets)).split('\n')).toEqual([
      '✓ 결정 사항을 등록했어요.',
      '  [app] 앱 알림 제목은 32자 이하로 쓴다  항상 적용 아니오',
      '  연결된 이슈 2개의 담당자에게 확인할 변경을 보냈어요.',
    ]);
    // 첫 줄 전체 초록 (10/15 ANSI 토큰 32)
    expect(savedScreen(values, targets).startsWith('\u001b[0;32m✓')).toBe(true);
  });

  it('새 결정 사항이면 "새 결정 사항 · 항상 적용"이고 받는 사람이 없다는 줄이에요', () => {
    expect(stripAnsi(savedScreen(values, [], true)).split('\n')).toEqual([
      '✓ 결정 사항을 등록했어요.',
      '  [app] 앱 알림 제목은 32자 이하로 쓴다  새 결정 사항 · 항상 적용 아니오',
      '  연결된 이슈가 없어서 알림을 받는 사람은 없어요.',
    ]);
  });

  it('받는 이슈를 읽지 못했으면(null) 이슈 줄을 빼요', () => {
    expect(stripAnsi(savedScreen(values, null)).split('\n')).toHaveLength(2);
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

describe('noticeScreen (예외 안내, 10/14 확정)', () => {
  const existing = {
    id: 'app.notify.title-length',
    title: '앱 알림 제목은 32자 이하로 쓴다',
    value: '공백 포함 32자 이하',
  };
  const lines = (input: T1NoticeInput) =>
    stripAnsi(noticeScreen(input)).split('\n');

  it('예외 3 조사 실패: 경우 1은 작업을, 경우 2는 등록을 멈췄다고 빨간 막대로 알려요', () => {
    expect(lines({ kind: 'searchFailed', trigger: 'agent' })).toEqual([
      '  다른 결정 사항을 조회하지 못해 하던 작업을 멈췄어요.',
      '  잠시 뒤 다시 시도해 보시고 반복된다면 담당자에게 알려 주세요.',
    ]);
    expect(lines({ kind: 'searchFailed', trigger: 'direct' })[0]).toBe(
      '  다른 결정 사항을 조회하지 못해 등록을 멈췄어요.',
    );
    expect(
      noticeScreen({ kind: 'searchFailed', trigger: 'agent' }).startsWith(
        '\u001b[0;7;31m',
      ),
    ).toBe(true);
  });

  it('충돌 3 완전히 같음은 빨간 막대, 뜻이 같음은 노란 막대와 기존 결정 사항 줄이에요', () => {
    expect(lines({ kind: 'same', existing })).toEqual([
      '  같은 결정 사항이 있어서 등록하지 않았어요.',
      '  [app] 앱 알림 제목은 32자 이하로 쓴다 · 공백 포함 32자 이하',
    ]);
    expect(lines({ kind: 'similar', existing })[0]).toBe(
      '  같은 뜻의 결정 사항이 이미 있어요.',
    );
    expect(
      noticeScreen({ kind: 'similar', existing }).startsWith('\u001b[0;7;33m'),
    ).toBe(true);
  });

  it('뜻이 같음 → 아니요는 기본 글자색 막대, 예외 7은 노란 막대와 노란 줄이에요', () => {
    expect(noticeScreen({ kind: 'similarDeclined' })).toContain(
      '\u001b[0;7;39m',
    );
    expect(lines({ kind: 'saveRace' })).toEqual([
      '  저장하는 사이 다른 사람이 먼저 이 결정 사항을 바꿨어요.',
      '  바뀐 내용을 다시 확인할게요.',
    ]);
  });

  it('뜻이 같음 질문은 예/아니요예요 (제안 문구)', () => {
    expect(T1_COPY.similarAsk.question).toBe(
      '그래도 새 결정 사항으로 등록할까요?',
    );
    expect([T1_COPY.similarAsk.yes.label, T1_COPY.similarAsk.no.label]).toEqual(
      ['예', '아니요'],
    );
  });

  it('되돌림이면 묻기와 ③ 선택 창 질문만 되돌림 문구로 바뀌어요 (SIL-104 초안, detect.change.revert-mark)', () => {
    expect(T1_COPY.revert).toEqual({
      ask: 'v{version}의 값으로 되돌리는 작업이에요. 그래도 진행할까요?',
      confirm: 'v{version}의 값으로 되돌려 등록할까요?',
      directConfirm:
        '달라지게 되는 기존 결정 사항 내역을 확인했나요? v{version}의 값으로 되돌려 등록할까요?',
    });
    // 질문만 바뀌고 같은 선택 창이라 끝은 기존 질문과 같은 모양이에요
    for (const question of Object.values(T1_COPY.revert)) {
      expect(question).toMatch(/v\{version\}.*\?$/);
    }
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
