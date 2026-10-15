import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AnswerRecord,
  Issue,
  PendingCheck,
  StandardHistory,
} from '@sil/core';
import { loadNotifyData, type NotifyDataSource } from './coreData.ts';
import { buildPendingList } from './listPending.ts';

/** DB(@sil/core)에서 온 모양 그대로의 데모 예시: 부건님이 app.notify.title-length를 v1 → v2로 바꿈 */
const STANDARD = 'app.notify.title-length';

function coreCheck(overrides: Partial<PendingCheck>): PendingCheck {
  return {
    id: 'c-5',
    standardId: STANDARD,
    version: 2,
    issueKey: '#5',
    recipient: '민수',
    status: 'pending',
    lastSeenVersion: 1,
    createdAt: '2026-10-14T05:13:00Z',
    closedAt: null,
    reflected: false,
    reflectedAt: null,
    ...overrides,
  };
}

const history: StandardHistory = {
  standard: {
    id: STANDARD,
    area: '앱 화면',
    title: '앱 알림 제목은 32자 이하로 쓴다',
    alwaysOn: false,
    status: 'active',
    replacedBy: null,
    deprecatedReason: null,
    locked: false,
  },
  currentVersion: 2,
  versions: [2, 1].map((version) => ({
    standardId: STANDARD,
    version,
    title: `앱 알림 제목은 ${version === 2 ? 32 : 40}자 이하로 쓴다`,
    value: `공백 포함 ${version === 2 ? 32 : 40}자 이하`,
    reason: version === 2 ? 'Windows 알림 창에서 잘림' : '알림 창에서 잘림',
    alwaysOn: false,
    evidence: null,
    scope: null,
    changedBy: version === 2 ? '부건' : '호윤',
    changedByActor: 'ai' as const,
    aiDetected: false,
    isRevert: false,
    revertedToVersion: null,
    source: 'ai_chat' as const,
    createdAt: `2026-10-1${version + 2}T05:13:00Z`,
  })),
};

const issues: Issue[] = [
  {
    key: '#5',
    title: '담당자에게 알리고 답 기록하기',
    assignee: '민수',
    status: 'in_progress',
    standardIds: [STANDARD],
  },
];

function answerRecord(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    answerId: 'a-1',
    answeredAt: '2026-10-14T05:20:00Z',
    standardId: STANDARD,
    version: 2,
    previousValue: '공백 포함 40자 이하',
    value: '공백 포함 32자 이하',
    changedBy: '부건',
    changedByActor: 'ai',
    aiDetected: false,
    evidence: null,
    issueKey: '#5',
    answeredBy: '민수',
    affected: true,
    known: false,
    elapsedSeconds: null,
    unaffectedReason: null,
    reworkNote: null,
    channel: 'terminal',
    ...overrides,
  };
}

function source(
  checks: PendingCheck[],
  records: AnswerRecord[] = [],
): NotifyDataSource & { queries: unknown[] } {
  const queries: unknown[] = [];
  return {
    queries,
    listPendingChecks: async (query) => {
      queries.push(query);
      return checks;
    },
    listIssues: async () => issues,
    listAnswerRecords: async () => records,
    getStandardHistory: async (id) => (id === STANDARD ? history : null),
  };
}

describe('loadNotifyData (SIL-100)', () => {
  it('DB 값을 목록 만들기 모양으로 바꿔서, 터미널과 같은 목록이 나온다', async () => {
    const fake = source([coreCheck({})]);
    const data = await loadNotifyData(fake, '민수');
    const list = buildPendingList(
      data,
      { recipient: '민수' },
      { now: '2026-10-14T06:00:00Z' },
    );

    // 이 사람 것만, 닫힌 것까지 읽어요 (7일 규칙과 지난번 답은 목록 만들기가 걸러요)
    assert.deepEqual(fake.queries, [{ recipient: '민수', status: 'all' }]);
    assert.equal(list.pendingCount, 1);
    assert.deepEqual(
      {
        title: list.items[0]?.standard.title,
        previousValue: list.items[0]?.standard.previousValue,
        value: list.items[0]?.standard.value,
        changedBy: list.items[0]?.standard.changedBy,
        changedAt: list.items[0]?.standard.changedAt,
        issue: list.items[0]?.issue.key,
      },
      {
        title: '앱 알림 제목은 32자 이하로 쓴다',
        previousValue: '공백 포함 40자 이하',
        value: '공백 포함 32자 이하',
        changedBy: '부건',
        changedAt: '2026-10-14T05:13:00Z',
        issue: '#5',
      },
    );
  });

  it('받는 사람이 없는 확인할 변경은 뺀다 (notify.pending.no-owner)', async () => {
    const data = await loadNotifyData(
      source([coreCheck({ recipient: null })]),
      '민수',
    );
    assert.deepEqual(data.pendingChecks, []);
  });

  it('응답 기록은 결정 사항·버전·이슈·답한 사람으로 확인할 변경에 이어 붙인다', async () => {
    const data = await loadNotifyData(
      source(
        [coreCheck({ status: 'answered', closedAt: '2026-10-14T05:20:00Z' })],
        [
          answerRecord({}),
          // 다른 사람의 답은 붙지 않아요
          answerRecord({ answerId: 'a-2', answeredBy: '신지' }),
        ],
      ),
      '민수',
    );
    assert.deepEqual(
      data.answers.map((a) => [a.id, a.pendingCheckId, a.affected, a.known]),
      [['a-1', 'c-5', true, false]],
    );
  });

  it('DB에서 읽지 못하면 빈 데이터 대신 오류를 그대로 던진다 (notify.error.not-empty)', async () => {
    const broken: NotifyDataSource = {
      ...source([]),
      listIssues: async () => {
        throw new Error('DB에 못 붙음');
      },
    };
    await assert.rejects(loadNotifyData(broken, '민수'), /DB에 못 붙음/);
  });
});
