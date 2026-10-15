import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderT1Question, renderT1Saved, T1_COPY } from './copy.ts';
import {
  clearPending,
  diffFromPending,
  pendingPath,
  writePending,
} from './pending.ts';
import {
  findPreviewId,
  isPreviewCommand,
  PREVIEW_DONE,
} from './preview-command.ts';
import { buildT1SaveInput } from './save-input.ts';
import { COLS, previewScreen } from './screens.ts';
import { textWidth, wrap } from './text.ts';

/** 꾸밈 코드(ANSI)를 지워요 */
// eslint-disable-next-line no-control-regex -- 터미널 색 코드(ESC)를 지우려면 제어 문자가 필요해요
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '');

describe('T1 문구', () => {
  it('질문에 제목, 지금 값, 바꿀 값을 넣어요', () => {
    const question = renderT1Question({
      title: '앱 알림 제목은 40자 이하다',
      currentValue: '운영체제 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
      newValue: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
    });
    expect(question).toContain('앱 알림 제목은 40자 이하다');
    expect(question).toContain(
      '지금 값: 운영체제 알림 창에 뜨는 제목은 공백 포함 40자',
    );
    expect(question).toContain(
      '바꿀 값: 운영체제 알림 창에 뜨는 제목은 공백 포함 32자',
    );
    expect(question).not.toMatch(/\{\w+\}/);
  });

  it('③ 머리표는 프로토타입에 적힌 말 그대로예요', () => {
    expect(T1_COPY.preview.heading).toBe('결정 사항을 이렇게 등록할까요');
  });

  it('④ 등록 완료에 버전과 항상 적용을 넣어요', () => {
    expect(renderT1Saved({ version: 2, alwaysOn: false })).toBe(
      '✓ 결정 사항을 등록했어요 (v2) · 항상 적용 아니오',
    );
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
    ];
    for (const message of messages) {
      expect(message).toMatch(/\.$/);
    }
    expect(T1_COPY.editPrompt).toMatch(/\?$/);
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
    expect(previewScreen(values)).toContain('\u001b[1;36m[app] 앱 알림');
    expect(previewScreen(values)).not.toContain('\u001b[1m항상 적용');
    expect(previewScreen({ ...values, alwaysOn: true })).toContain(
      '\u001b[1m항상 적용',
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
      expect(systemMessage).toContain('\u001b[1;36m[test] 시험 제목');
      expect(stripAnsi(systemMessage)).toContain('    값    시험 값');
    } finally {
      clearPending(id);
    }
  });

  it('다른 명령이면 아무것도 내지 않아요', () => {
    expect(runHook('git status', '')).toBe('');
  });
});

describe('hooks 첫 줄', () => {
  it('③ hook은 첫 줄을 비워 머리글 다음 줄부터 시작해요', () => {
    const id = 'test.t1.first-line';
    writePending({
      id,
      title: '제목',
      value: '값',
      reason: '이유',
      alwaysOn: false,
    });
    const run = (file: string, command: string, stdout: string) =>
      (
        JSON.parse(
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
        ) as { systemMessage: string }
      ).systemMessage;
    try {
      const preview = run(
        './hook-preview.ts',
        'node apps/detect/src/t1/preview.ts',
        `${PREVIEW_DONE} ${id}`,
      );
      expect(preview.startsWith('\n-- 결정 사항을 이렇게')).toBe(true);
    } finally {
      clearPending(id);
    }
  });
});
