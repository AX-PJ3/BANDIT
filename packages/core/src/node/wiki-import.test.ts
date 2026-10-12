import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { StandardWithLatest } from '../types/index.ts';
import {
  parseCsv,
  parseIssuesCsv,
  parseScope,
  parseWikiMarkdown,
  planWikiImport,
  readTeamWiki,
} from './wiki-import.ts';

// team-wiki/앱-화면.md에 실제로 있는 모양 그대로예요.
const APP_WIKI = `# 앱 화면 (app)

> **영역 요약:** 데스크톱 앱 화면, 앱 알림, 설치

### app.notify.title-length
- 제목: 앱 알림 제목은 40자 이하다
- 값: Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다
- 이유: 40자를 넘으면 Mac 알림 창에서 잘린다
- 적용 범위: 코드: packages/app/src/notify/** / 화면: 앱 알림
- 근거: Linear SIL-43
- 항상 적용: 아니오
- 상태: 사용
- 버전: 1

### wiki.read.index-first
- 제목: AI는 목차를 먼저 읽고 필요한 영역만 연다
- 값: AI는 작업 전에 INDEX.md를 읽는다
- 이유: 위키 전체를 넣으면 정확도가 떨어진다
- 적용 범위: 문서: INDEX.md / 코드: packages/mcp/src/tools/get_index*
- 근거: 스펙: 기준 모으기 원칙 1, 2
- 항상 적용: 예
- 상태: 사용
- 버전: 1

## 다른 절

### 헷갈릴 때 묻는 질문 3개

- 이건: 기준이 아니에요

\`\`\`
### app.fake.in-code-block
- 제목: 코드 블록 안은 읽지 않아요
\`\`\`
`;

describe('parseWikiMarkdown', () => {
  it('### 기준ID 아래 - 칸: 값 줄을 기준으로 읽어요', () => {
    const { entries, problems } = parseWikiMarkdown(APP_WIKI, '앱-화면.md');
    expect(problems).toEqual([]);
    expect(entries.map((entry) => entry.id)).toEqual([
      'app.notify.title-length',
      'wiki.read.index-first',
    ]);
    expect(entries[0]).toEqual({
      id: 'app.notify.title-length',
      title: '앱 알림 제목은 40자 이하다',
      value: 'Mac과 Windows 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
      reason: '40자를 넘으면 Mac 알림 창에서 잘린다',
      alwaysOn: false,
      evidence: 'Linear SIL-43',
      scope: {
        code: ['packages/app/src/notify/**'],
        api: [],
        screen: ['앱 알림'],
        doc: [],
      },
      status: 'active',
      replacedBy: null,
      locked: false,
      fileVersion: 1,
      file: '앱-화면.md',
      line: 5,
    });
    expect(entries[1]).toMatchObject({
      alwaysOn: true,
      scope: { doc: ['INDEX.md'], code: ['packages/mcp/src/tools/get_index*'] },
    });
  });

  it('필수 칸(제목, 값, 이유, 항상 적용)이 비면 그 기준만 건너뛰고 알려요', () => {
    const text = [
      '### app.a.ok',
      '- 제목: 제목',
      '- 값: 값',
      '- 이유: 이유',
      '- 항상 적용: 아니오',
      '### app.b.missing',
      '- 제목: 제목',
      '- 값: 값',
      '- 근거: 근거만 있음',
      '### app.c.bad',
      '- 제목: 제목',
      '- 값: 값',
      '- 이유: 이유',
      '- 항상 적용: 네',
    ].join('\n');
    const { entries, problems } = parseWikiMarkdown(text, 'a.md');
    expect(entries.map((entry) => entry.id)).toEqual(['app.a.ok']);
    expect(entries[0]).toMatchObject({
      evidence: null,
      scope: null,
      status: 'active',
    });
    expect(problems).toEqual([
      {
        level: 'error',
        file: 'a.md',
        line: 6,
        message: 'app.b.missing: 필수 칸이 비어 있어요: 이유, 항상 적용',
      },
      {
        level: 'error',
        file: 'a.md',
        line: 10,
        message: "app.c.bad: '항상 적용'은 예 또는 아니오예요",
      },
    ]);
  });

  it('폐기, 대체, 잠금, 모르는 칸을 읽어요', () => {
    const text = [
      '### notify.slack.dm',
      '- 제목: Slack DM으로 알린다',
      '- 값: 담당자에게 Slack DM을 보낸다',
      '- 이유: 이유',
      '- 항상 적용: 아니오',
      '- 상태: 폐기',
      '- 대체: notify.terminal.one-change, notify.app.toast',
      '- 잠금: 예',
      '- 담당: 민수',
    ].join('\n');
    const { entries, problems } = parseWikiMarkdown(text, '기능-알리기.md');
    expect(entries[0]).toMatchObject({
      status: 'deprecated',
      replacedBy: 'notify.terminal.one-change',
      locked: true,
    });
    expect(problems.map((problem) => problem.message)).toEqual([
      "notify.slack.dm: 모르는 칸 '담당'는 저장하지 않아요",
      'notify.slack.dm: 대체 결정 사항이 여러 개예요. 첫 번째(notify.terminal.one-change)만 저장해요',
    ]);
    expect(problems.every((problem) => problem.level === 'warning')).toBe(true);
  });
});

describe('parseScope', () => {
  it('종류마다 나누고, 종류 없는 조각은 앞 종류에 붙이고, 모르는 종류는 알려요', () => {
    expect(
      parseScope('코드: a/** / b/** / 화면: 앱 알림 / API: GET /x').scope,
    ).toEqual({
      code: ['a/**', 'b/**'],
      api: ['GET /x'],
      screen: ['앱 알림'],
      doc: [],
    });
    expect(parseScope('')).toEqual({ scope: null, problems: [] });
    expect(parseScope('Figma: 링크').problems).toEqual([
      "적용 범위 'Figma: 링크'의 종류(코드:, API:, 화면:, 문서:)를 몰라서 저장하지 않아요",
    ]);
  });
});

describe('parseIssuesCsv', () => {
  // samples/data/issue-links.csv와 같은 칸 이름이에요.
  const CSV = [
    // 엑셀에서 저장하면 맨 앞에 BOM(U+FEFF)이 붙어요
    `${String.fromCharCode(0xfeff)}이슈 번호,이슈 제목,담당자,이슈 상태,기준 ID,연결한 방법`,
    '#5,담당자에게 알리고 답 기록하기,민수,진행 중,app.notify.title-length,사람 확인',
    '#5,담당자에게 알리고 답 기록하기,민수,진행 중,notify.answer.two-questions,사람 확인',
    '#7,"앱 알림과 나에게 온 변경 화면, 4개",신지,완료,app.notify.title-length,사람 확인',
    '#9,담당자 없는 이슈,,진행 중,"app.a.one, app.b.two",사람 확인',
    '#10,상태가 이상한 이슈,민수,보류,app.a.one,사람 확인',
    '',
  ].join('\r\n');

  it('이슈 번호로 묶고, 따옴표 안 쉼표, 빈 담당자, 완료 상태를 읽어요', () => {
    const { entries, problems } = parseIssuesCsv(CSV, 'issue-links.csv');
    expect(
      entries.map(({ file: _file, line: _line, ...issue }) => issue),
    ).toEqual([
      {
        key: '#5',
        title: '담당자에게 알리고 답 기록하기',
        assignee: '민수',
        status: 'in_progress',
        standardIds: ['app.notify.title-length', 'notify.answer.two-questions'],
      },
      {
        key: '#7',
        title: '앱 알림과 나에게 온 변경 화면, 4개',
        assignee: '신지',
        status: 'done',
        standardIds: ['app.notify.title-length'],
      },
      {
        key: '#9',
        title: '담당자 없는 이슈',
        assignee: null,
        status: 'in_progress',
        standardIds: ['app.a.one', 'app.b.two'],
      },
    ]);
    expect(problems).toEqual([
      {
        level: 'error',
        file: 'issue-links.csv',
        line: 6,
        message: '이슈 #10: 이슈 상태는 진행 중 또는 완료예요 (받은 값: 보류)',
      },
    ]);
  });

  it("예전 샘플의 '할 일' 상태는 진행 중으로 읽고 알려요", () => {
    const { entries, problems } = parseIssuesCsv(
      '이슈 번호,이슈 제목,담당자,이슈 상태,기준 ID\nSIL-32,기다리는 이슈,민수,할 일,app.a.one',
      'old.csv',
    );
    expect(entries[0]?.status).toBe('in_progress');
    expect(problems).toEqual([
      {
        level: 'warning',
        file: 'old.csv',
        line: 2,
        message:
          "이슈 SIL-32: v2에는 '할 일' 상태가 없어서 진행 중으로 저장해요",
      },
    ]);
  });

  it('꼭 있어야 하는 칸 이름이 없으면 알려요', () => {
    expect(
      parseIssuesCsv('번호,제목\n#5,제목', 'x.csv').problems[0]?.message,
    ).toBe('첫 줄에 꼭 있어야 하는 칸이 없어요: 이슈 번호, 이슈 제목, 기준 ID');
  });

  it('parseCsv는 따옴표 안의 "" 와 줄바꿈을 읽어요', () => {
    expect(parseCsv('a,"b ""c""\nd"\n1,2')).toEqual([
      ['a', 'b "c"\nd'],
      ['1', '2'],
    ]);
  });
});

describe('readTeamWiki', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('기준 파일만 읽고(INDEX.md 등 제외), 같은 ID가 두 번 나오면 뒤의 것을 건너뛰어요', () => {
    dir = mkdtempSync(join(tmpdir(), 'sil-wiki-'));
    writeFileSync(join(dir, '앱-화면.md'), APP_WIKI);
    writeFileSync(
      join(dir, '기능-기준모으기.md'),
      APP_WIKI.split('## 다른 절')[0]!,
    );
    writeFileSync(
      join(dir, 'INDEX.md'),
      '### app.index.not-standard\n- 제목: 목차',
    );
    const { entries, problems, files } = readTeamWiki(dir);
    expect(files).toEqual(['기능-기준모으기.md', '앱-화면.md']);
    expect(entries.map((entry) => `${entry.file}:${entry.id}`)).toEqual([
      '기능-기준모으기.md:app.notify.title-length',
      '기능-기준모으기.md:wiki.read.index-first',
    ]);
    expect(problems.map((problem) => problem.message)).toEqual([
      'app.notify.title-length: 같은 ID가 기능-기준모으기.md:5에도 있어요. 이건 건너뛰어요',
      'wiki.read.index-first: 같은 ID가 기능-기준모으기.md:15에도 있어요. 이건 건너뛰어요',
    ]);
  });
});

describe('planWikiImport', () => {
  const [entry] = parseWikiMarkdown(APP_WIKI, '앱-화면.md').entries;
  const inDb = (
    overrides: Partial<StandardWithLatest['latest']> = {},
  ): StandardWithLatest => ({
    standard: {
      id: entry!.id,
      area: 'app',
      title: entry!.title,
      alwaysOn: false,
      status: 'active',
      replacedBy: null,
      deprecatedReason: null,
      locked: false,
    },
    latest: {
      standardId: entry!.id,
      version: 2,
      title: entry!.title,
      value: entry!.value,
      reason: entry!.reason,
      alwaysOn: false,
      evidence: entry!.evidence,
      scope: entry!.scope,
      changedBy: '팀 위키',
      changedByActor: 'human',
      aiDetected: false,
      isRevert: false,
      revertedToVersion: null,
      source: 'wiki',
      createdAt: '2026-10-09T00:00:00.000Z',
      ...overrides,
    },
  });

  it('DB에 없으면 새로, 같으면 건너뛰고, 다르면 다른 칸을 알려요', () => {
    expect(planWikiImport([entry!], []).create).toHaveLength(1);
    expect(planWikiImport([entry!], [inDb()]).same).toHaveLength(1);
    const plan = planWikiImport(
      [entry!],
      [inDb({ value: '공백 포함 32자 이하', evidence: null })],
    );
    expect(plan.different.map(({ changed }) => changed)).toEqual([
      ['값', '근거'],
    ]);
  });
});
