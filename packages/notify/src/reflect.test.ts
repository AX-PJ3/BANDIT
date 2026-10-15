import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SaveReflectedInput } from '@sil/core';
import { checkReflect } from './reflect.ts';
import type { Answer, PendingCheck } from './types.ts';

function check(overrides: Partial<PendingCheck> = {}): PendingCheck {
  return {
    id: 'c-5',
    standardId: 'app.notify.title-length',
    version: 2,
    issueKey: '#5',
    recipient: '민수',
    status: 'answered',
    lastSeenVersion: 1,
    createdAt: '2026-10-14T05:13:00Z',
    closedAt: '2026-10-14T05:20:00Z',
    reflected: false,
    reflectedAt: null,
    ...overrides,
  };
}

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    id: 'a-1',
    pendingCheckId: 'c-5',
    answeredBy: '민수',
    affected: true,
    known: false,
    unaffectedReason: null,
    channel: 'terminal',
    answeredAt: '2026-10-14T05:20:00Z',
    ...overrides,
  };
}

const markOn: SaveReflectedInput = {
  pendingCheckId: 'c-5',
  markedBy: '민수',
  reflected: true,
};
const markOff: SaveReflectedInput = { ...markOn, reflected: false };

describe('checkReflect (SIL-93)', () => {
  it('관계있다로 답한 변경은 이슈 반영을 표시할 수 있다', () => {
    assert.deepEqual(checkReflect(check(), answer(), markOn), { ok: true });
  });

  it('관계없다로 답한 변경은 표시하지 않는다 (notify.check.reflected v2)', () => {
    const result = checkReflect(
      check(),
      answer({ affected: false, known: null, unaffectedReason: '화면만 다룸' }),
      markOn,
    );
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, 'not_affected');
  });

  it('표시 풀기는 관계없다로 답한 변경에도 받는다', () => {
    const result = checkReflect(
      check({ reflected: true, reflectedAt: '2026-10-14T06:00:00Z' }),
      answer({ affected: false }),
      markOff,
    );
    assert.deepEqual(result, { ok: true });
  });

  it('답하지 않은 변경은 상태에 맞는 말로 거절한다', () => {
    for (const status of ['pending', 'superseded', 'auto_closed'] as const) {
      const result = checkReflect(check({ status }), undefined, markOn);
      assert.equal(!result.ok && result.code, 'not_answered', status);
    }
    const pending = checkReflect(
      check({ status: 'pending' }),
      undefined,
      markOn,
    );
    assert.match(
      !pending.ok ? pending.message : '',
      /먼저 관계있다\/관계없다로 답해/,
    );
  });

  it('없는 변경, 다른 사람의 변경은 거절한다', () => {
    const missing = checkReflect(undefined, undefined, markOn);
    assert.equal(!missing.ok && missing.code, 'not_found');
    const other = checkReflect(check({ recipient: '신지' }), answer(), markOn);
    assert.equal(!other.ok && other.code, 'not_recipient');
  });

  it('답한 변경인데 답을 찾지 못하면 관계있다였는지 몰라서 거절한다', () => {
    const result = checkReflect(check(), undefined, markOn);
    assert.equal(!result.ok && result.code, 'answer_not_found');
  });
});
