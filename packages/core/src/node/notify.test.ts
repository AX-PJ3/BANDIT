import { afterEach, describe, expect, it } from 'vitest';
import { dumpTables } from './backup.ts';
import { listChangelogEntries } from './changelog.ts';
import { setDbForTesting, toSilError } from '../data/client.ts';
import { createFakeDb, standardRows } from './fake-db.ts';
import {
  listIssues,
  listPendingChecks,
  saveAnswer,
  saveReflected,
} from '../data/notify.ts';
import { checkScopePaths } from './scope-check.ts';

afterEach(() => setDbForTesting(undefined));

const pending = (id: string, recipient: string | null, status: string) => ({
  id,
  standard_id: 'app.notify.title-length',
  version: 2,
  issue_key: '#5',
  recipient,
  status,
  last_seen_version: 1,
  created_at: `2026-10-13T0${id}:00:00+00:00`,
  closed_at: status === 'pending' ? null : '2026-10-13T09:00:00+00:00',
  reflected: false,
  reflected_at: null,
});

describe('확인할 변경과 답', () => {
  it('기본은 아직 답을 기다리는 것(대기)만, 오래된 것부터 돌려줘요', async () => {
    setDbForTesting(
      createFakeDb({
        pending_checks: [
          pending('3', '민수', 'pending'),
          pending('1', '민수', 'pending'),
          pending('2', '민수', 'answered'),
          pending('4', '신지', 'pending'),
        ],
      }).client,
    );
    const mine = await listPendingChecks({ recipient: '민수' });
    expect(mine.map((check) => [check.id, check.status])).toEqual([
      ['1', 'pending'],
      ['3', 'pending'],
    ]);
    expect(await listPendingChecks({ status: 'all' })).toHaveLength(4);
  });

  it('saveAnswer는 함수 인자로 바꾸고, 비운 칸은 null로 보내요', async () => {
    const fake = createFakeDb({}, () => ({
      data: {
        answerId: 'a-1',
        pendingCheckId: 'p-1',
        issueKey: '#5',
        issueStatus: 'in_progress',
        issueReopened: false,
      },
      error: null,
    }));
    setDbForTesting(fake.client);
    await saveAnswer({
      pendingCheckId: 'p-1',
      answeredBy: '민수',
      affected: true,
      known: false,
      channel: 'terminal',
    });
    expect(fake.rpcCalls[0]).toEqual({
      name: 'save_answer',
      args: {
        p_pending_check_id: 'p-1',
        p_answered_by: '민수',
        p_affected: true,
        p_known: false,
        p_unaffected_reason: null,
        p_rework_note: null,
        p_channel: 'terminal',
        p_elapsed_seconds: null,
        p_reopen_issue: false,
      },
    });
  });

  it('반영함은 함수 인자로 바꿔 보내고, 목록에도 반영함 칸이 와요 (data.pending.reflected)', async () => {
    const fake = createFakeDb(
      {
        pending_checks: [
          {
            ...pending('1', '민수', 'answered'),
            reflected: true,
            reflected_at: '2026-10-13T10:00:00+00:00',
          },
        ],
      },
      () => ({
        data: {
          pendingCheckId: '1',
          reflected: false,
          reflectedAt: null,
        },
        error: null,
      }),
    );
    setDbForTesting(fake.client);
    const [check] = await listPendingChecks({ status: 'all' });
    expect(check).toMatchObject({
      reflected: true,
      reflectedAt: '2026-10-13T10:00:00+00:00',
    });
    const result = await saveReflected({
      pendingCheckId: '1',
      markedBy: '민수',
      reflected: false,
    });
    expect(fake.rpcCalls[0]).toEqual({
      name: 'save_reflected',
      args: {
        p_pending_check_id: '1',
        p_marked_by: '민수',
        p_reflected: false,
      },
    });
    expect(result).toEqual({
      pendingCheckId: '1',
      reflected: false,
      reflectedAt: null,
    });
  });

  it('이미 다른 곳에서 답했으면 PENDING_CLOSED로 알려요 (notify.answer.one-place)', () => {
    expect(
      toSilError({
        code: 'P0001',
        hint: 'PENDING_CLOSED',
        message: '이미 앱에서 답한 확인할 변경이에요.',
      }),
    ).toMatchObject({
      code: 'PENDING_CLOSED',
    });
  });

  it('listIssues는 연결된 결정 사항을 붙이고, 연결이 없으면 빈 목록이에요 (notify.link.no-guess)', async () => {
    setDbForTesting(
      createFakeDb({
        issues: [
          {
            key: '#5',
            title: '알리기',
            assignee: '민수',
            status: 'in_progress',
          },
          { key: '#9', title: '연결 없음', assignee: null, status: 'done' },
        ],
        issue_standards: [
          { issue_key: '#5', standard_id: 'notify.answer.two-questions' },
          { issue_key: '#5', standard_id: 'app.notify.title-length' },
        ],
      }).client,
    );
    expect(await listIssues()).toEqual([
      {
        key: '#5',
        title: '알리기',
        assignee: '민수',
        status: 'in_progress',
        standardIds: ['app.notify.title-length', 'notify.answer.two-questions'],
      },
      {
        key: '#9',
        title: '연결 없음',
        assignee: null,
        status: 'done',
        standardIds: [],
      },
    ]);
  });
});

describe('백업과 CHANGELOG', () => {
  it('dumpTables는 1,000줄이 넘는 표도 나눠서 끝까지 읽어요', async () => {
    const many = Array.from({ length: 1001 }, (_, index) => ({
      key: `#${String(index).padStart(4, '0')}`,
    }));
    setDbForTesting(createFakeDb({ issues: many }).client);
    const dump = await dumpTables();
    expect(dump.tables.issues).toHaveLength(1001);
    expect(dump.tables.standards).toEqual([]);
  });

  it('listChangelogEntries는 예전 위키에서 옮긴 버전(wiki)을 빼고, 이전 값을 앞 버전에서 찾아요', async () => {
    const coupon = standardRows({
      id: 'order.coupon.nullable',
      area: 'order',
      versions: [
        { title: '쿠폰 값은 항상 있다', value: '항상 있다' },
        { title: '쿠폰 값은 비어 있을 수 있다', value: '비어 있을 수 있다' },
      ],
    });
    const versions = coupon.versions.map((row, index) => ({
      ...row,
      source: index === 0 ? 'wiki' : 'code',
      changed_by: index === 0 ? '팀 위키' : '경하',
      created_at: `2026-10-1${index}T00:00:00.000Z`,
    }));
    setDbForTesting(createFakeDb({ standard_versions: versions }).client);
    const entries = await listChangelogEntries();
    expect(entries.map((entry) => entry.line)).toEqual([
      '2026-10-11 09:00 | 경하 | order.coupon.nullable 1→2 | 항상 있다 → 비어 있을 수 있다 | 테스트 이유 | 코드',
    ]);
  });
});

describe('checkScopePaths', () => {
  it('맞는 파일 수를 세고, 없으면 _와 -를 구분하지 않고 비슷한 파일을 찾아요. 옛 경로는 옮긴 폴더(apps/)에서 찾아요', () => {
    const files = [
      'apps/mcp-server/src/tools/wiki/save-standard.ts',
      'apps/mcp-server/src/tools/wiki/get-index.ts',
      'apps/web/src/main/index.ts',
    ];
    const reports = checkScopePaths(
      [
        {
          id: 'wiki.standard.required-fields',
          scope: {
            code: ['packages/mcp/src/tools/save_standard*'],
            api: [],
            screen: [],
            doc: [],
          },
        },
        {
          id: 'app.notify.windows-id',
          scope: {
            code: ['packages/app/src/main/**'],
            api: [],
            screen: [],
            doc: [],
          },
        },
        {
          id: 'app.startup.auto-launch',
          scope: {
            code: ['apps/web/src/main/**'],
            api: [],
            screen: [],
            doc: [],
          },
        },
        {
          id: 'wiki.lock.human-first',
          scope: {
            code: [
              'packages/mcp/src/tools/save_standard*',
              'packages/detect/src/judge/**',
            ],
            api: [],
            screen: [],
            doc: [],
          },
        },
        { id: 'goal.problem.rework', scope: null },
        {
          id: 'work.git.branch-issue',
          scope: { code: ['전체 저장소'], api: [], screen: [], doc: [] },
        },
        {
          id: 'wiki.revert.new-version',
          scope: {
            code: ['packages/cli/src/revert/**'],
            api: [],
            screen: [],
            doc: [],
          },
        },
      ],
      [...files, 'apps/mcp-server/src/tools/wiki/revert.ts'],
    );
    expect(reports).toEqual([
      {
        pattern: 'apps/web/src/main/**',
        standardIds: ['app.startup.auto-launch'],
        matchedFiles: 1,
        candidates: [],
        notAPath: false,
      },
      {
        // 위키에 남은 옛 경로예요. packages/app/은 apps/web/으로 옮겼으니 그 안에서 찾아요 (D49)
        pattern: 'packages/app/src/main/**',
        standardIds: ['app.notify.windows-id'],
        matchedFiles: 0,
        candidates: ['apps/web/src/main/index.ts'],
        notAPath: false,
      },
      {
        pattern: 'packages/cli/src/revert/**',
        standardIds: ['wiki.revert.new-version'],
        matchedFiles: 0,
        // 다른 패키지(mcp)의 revert.ts는 다른 코드라서 후보로 보여 주지 않아요
        candidates: [],
        notAPath: false,
      },
      {
        pattern: 'packages/detect/src/judge/**',
        standardIds: ['wiki.lock.human-first'],
        matchedFiles: 0,
        candidates: [],
        notAPath: false,
      },
      {
        pattern: 'packages/mcp/src/tools/save_standard*',
        standardIds: ['wiki.standard.required-fields', 'wiki.lock.human-first'],
        matchedFiles: 0,
        candidates: ['apps/mcp-server/src/tools/wiki/save-standard.ts'],
        notAPath: false,
      },
      {
        pattern: '전체 저장소',
        standardIds: ['work.git.branch-issue'],
        matchedFiles: 0,
        candidates: [],
        notAPath: true,
      },
    ]);
  });
});
