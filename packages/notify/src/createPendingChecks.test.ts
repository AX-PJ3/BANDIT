import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPendingChecks } from './createPendingChecks.ts';
import type { Issue, PendingCheck, SavedVersion } from './types.ts';

/**
 * 착수 안내 "데모 예시: 알림 제목 길이"를 그대로 써요.
 * 부건님이 app.notify.title-length를 40자 이하(v1)에서 32자 이하(v2)로 바꾸면,
 * 연결된 이슈 #5(민수)와 #7(신지)에만 확인할 변경이 생겨요.
 */
const STANDARD_ID = 'app.notify.title-length';
const NOW = '2026-10-13T14:13:00+09:00';
const V1 = '공백 포함 40자 이하';
const V2 = '공백 포함 32자 이하';

const issue5: Issue = {
  key: '#5',
  title: '담당자에게 알리고 답 기록하기',
  assignee: '민수',
  status: 'in_progress',
  standardIds: [STANDARD_ID],
};
const issue7: Issue = {
  key: '#7',
  title: '앱 알림과 나에게 온 변경 화면',
  assignee: '신지',
  status: 'done',
  standardIds: [STANDARD_ID],
};
const issue9ByAuthor: Issue = {
  key: '#9',
  title: '터미널 알림 문구',
  assignee: '부건',
  status: 'in_progress',
  standardIds: [STANDARD_ID],
};
const issueNoAssignee: Issue = {
  key: '#11',
  title: '임시 서비스 이름 정하기',
  assignee: null,
  status: 'in_progress',
  standardIds: [STANDARD_ID],
};
const issueOtherStandard: Issue = {
  key: '#13',
  title: '지표 화면',
  assignee: '신지',
  status: 'in_progress',
  standardIds: ['goal.metric.primary'],
};

function savedV2(overrides: Partial<SavedVersion> = {}): SavedVersion {
  return {
    standardId: STANDARD_ID,
    version: 2,
    value: V2,
    changedBy: '부건',
    createdAt: NOW,
    ...overrides,
  };
}

function check(overrides: Partial<PendingCheck>): PendingCheck {
  return {
    id: 'check-1',
    standardId: STANDARD_ID,
    version: 2,
    issueKey: '#5',
    recipient: '민수',
    status: 'pending',
    lastSeenVersion: 1,
    createdAt: '2026-10-13T10:00:00+09:00',
    closedAt: null,
    reflected: false,
    reflectedAt: null,
    ...overrides,
  };
}

let idCounter = 0;
const makeId = () => `id-${++idCounter}`;

describe('createPendingChecks', () => {
  it('데모 예시: 연결된 이슈의 담당자에게만 하나씩 만들고, 바꾼 본인은 건너뛴다', () => {
    const result = createPendingChecks({
      saved: savedV2(),
      issues: [issue5, issue7, issue9ByAuthor, issueOtherStandard],
      existing: [],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId,
    });

    assert.deepEqual(
      result.created.map((c) => [c.issueKey, c.recipient]),
      [
        ['#5', '민수'],
        ['#7', '신지'],
      ],
    );
    assert.deepEqual(result.skipped, [{ issueKey: '#9', reason: 'author' }]);
    assert.deepEqual(result.closed, []);
  });

  it('만든 확인할 변경은 대기 상태이고 마지막으로 본 버전은 바로 앞 버전이다', () => {
    const result = createPendingChecks({
      saved: savedV2(),
      issues: [issue5],
      existing: [],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId: () => 'new-id',
    });

    assert.deepEqual(result.created, [
      {
        id: 'new-id',
        standardId: STANDARD_ID,
        version: 2,
        issueKey: '#5',
        recipient: '민수',
        status: 'pending',
        lastSeenVersion: 1,
        createdAt: NOW,
        closedAt: null,
        reflected: false,
        reflectedAt: null,
      },
    ]);
  });

  it('완료된 이슈의 담당자에게도 만든다 (notify.target.include-done)', () => {
    const result = createPendingChecks({
      saved: savedV2(),
      issues: [issue7],
      existing: [],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId,
    });

    assert.equal(result.created.length, 1);
    assert.equal(result.created[0]?.recipient, '신지');
  });

  it('담당자가 없는 이슈는 건너뛴다 (notify.pending.no-owner)', () => {
    const result = createPendingChecks({
      saved: savedV2(),
      issues: [issueNoAssignee],
      existing: [],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.created, []);
    assert.deepEqual(result.skipped, [
      { issueKey: '#11', reason: 'no_assignee' },
    ]);
  });

  it('바꾼 사람을 모르면(null) 아무도 본인으로 건너뛰지 않는다', () => {
    const result = createPendingChecks({
      saved: savedV2({ changedBy: null }),
      issues: [issue9ByAuthor],
      existing: [],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId,
    });

    assert.equal(result.created.length, 1);
    assert.deepEqual(result.skipped, []);
  });

  it('새로 생긴 기준(v1)은 마지막으로 본 버전이 null이다', () => {
    const result = createPendingChecks({
      saved: savedV2({ version: 1, value: V1 }),
      issues: [issue5],
      existing: [],
      history: [],
      now: NOW,
      makeId,
    });

    assert.equal(result.created.length, 1);
    assert.equal(result.created[0]?.lastSeenVersion, null);
  });

  it('답하기 전에 또 바뀌면 이전 건을 대체됨으로 닫고, 새 건은 이전 건이 기억하는 마지막 본 버전을 잇는다', () => {
    const openV2 = check({ id: 'open-v2', version: 2, lastSeenVersion: 1 });
    const result = createPendingChecks({
      saved: savedV2({ version: 3, value: '공백 포함 30자 이하' }),
      issues: [issue5],
      existing: [openV2],
      history: [
        { version: 1, value: V1 },
        { version: 2, value: V2 },
      ],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.closed, [
      { id: 'open-v2', status: 'superseded', closedAt: NOW },
    ]);
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0]?.version, 3);
    assert.equal(result.created[0]?.lastSeenVersion, 1);
  });

  it('답한 건이 있으면 그 버전이 마지막으로 본 버전이다', () => {
    const answeredV2 = check({
      id: 'answered-v2',
      version: 2,
      status: 'answered',
      lastSeenVersion: 1,
      closedAt: '2026-10-13T11:00:00+09:00',
    });
    const result = createPendingChecks({
      saved: savedV2({ version: 3, value: '공백 포함 30자 이하' }),
      issues: [issue5],
      existing: [answeredV2],
      history: [
        { version: 1, value: V1 },
        { version: 2, value: V2 },
      ],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.closed, []);
    assert.equal(result.created[0]?.lastSeenVersion, 2);
  });

  it('되돌려서 마지막으로 본 값과 같아지면 열린 건을 자동 닫힘으로 닫고 새로 만들지 않는다', () => {
    const openV2 = check({ id: 'open-v2', version: 2, lastSeenVersion: 1 });
    const result = createPendingChecks({
      saved: savedV2({ version: 3, value: V1 }),
      issues: [issue5],
      existing: [openV2],
      history: [
        { version: 1, value: V1 },
        { version: 2, value: V2 },
      ],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.closed, [
      { id: 'open-v2', status: 'auto_closed', closedAt: NOW },
    ]);
    assert.deepEqual(result.created, []);
    assert.deepEqual(result.skipped, []);
  });

  it('되돌렸는데 열린 건이 없으면 아무것도 만들지 않고 이유만 남긴다', () => {
    const answeredV2 = check({
      id: 'answered-v2',
      version: 2,
      status: 'answered',
      closedAt: '2026-10-13T11:00:00+09:00',
    });
    const result = createPendingChecks({
      saved: savedV2({ version: 3, value: V2 }),
      issues: [issue5],
      existing: [answeredV2],
      history: [
        { version: 1, value: V1 },
        { version: 2, value: V2 },
      ],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.created, []);
    assert.deepEqual(result.closed, []);
    assert.deepEqual(result.skipped, [
      { issueKey: '#5', reason: 'same_as_last_seen' },
    ]);
  });

  it('값이 이전 버전과 같아도 마지막으로 본 값이 아니면 알린다', () => {
    // 민수가 v2를 봤고(답함), v3이 v2와 다른 값, v4가 v1 값으로 되돌아감.
    // v1은 민수가 마지막으로 본 값이 아니라서 v4는 알려야 해요.
    const answeredV2 = check({
      id: 'answered-v2',
      version: 2,
      status: 'answered',
      closedAt: '2026-10-13T11:00:00+09:00',
    });
    const openV3 = check({ id: 'open-v3', version: 3, lastSeenVersion: 2 });
    const result = createPendingChecks({
      saved: savedV2({ version: 4, value: V1 }),
      issues: [issue5],
      existing: [answeredV2, openV3],
      history: [
        { version: 1, value: V1 },
        { version: 2, value: V2 },
        { version: 3, value: '공백 포함 30자 이하' },
      ],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.closed, [
      { id: 'open-v3', status: 'superseded', closedAt: NOW },
    ]);
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0]?.lastSeenVersion, 2);
  });

  it('다른 기준이나 다른 이슈의 확인할 변경은 건드리지 않는다', () => {
    const otherStandard = check({
      id: 'other-standard',
      standardId: 'goal.metric.primary',
    });
    const otherIssue = check({ id: 'other-issue', issueKey: '#7' });
    const result = createPendingChecks({
      saved: savedV2(),
      issues: [issue5],
      existing: [otherStandard, otherIssue],
      history: [{ version: 1, value: V1 }],
      now: NOW,
      makeId,
    });

    assert.deepEqual(result.closed, []);
    assert.equal(result.created.length, 1);
  });
});
