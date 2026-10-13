import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyNewVersion } from './applyNewVersion.ts';
import { respond, type RespondInput } from './respond.ts';
import { MemoryStore } from './store.ts';
import {
  DEMO_STANDARD_ID,
  DEMO_V1,
  DEMO_V2,
  createDemoData,
  createIdMaker,
} from './demoData.ts';

const ANSWERED_AT = '2026-10-13T14:20:00+09:00';

async function storeAfterV2(): Promise<MemoryStore> {
  const store = new MemoryStore(createDemoData());
  await applyNewVersion(store, DEMO_V2, {
    now: '2026-10-13T14:13:00+09:00',
    makeId: createIdMaker('c'),
  });
  return store;
}

const minsuAffected: RespondInput = {
  pendingCheckId: 'c-1',
  answeredBy: '민수',
  affected: true,
  known: false,
  channel: 'terminal',
};

const options = { now: ANSWERED_AT, makeId: () => 'a-1' };

describe('respond', () => {
  it('관계있다·몰랐다를 저장하고, 확인할 변경을 답함으로 바꾸고, 다시 읽을 기준을 알려 준다', async () => {
    const store = await storeAfterV2();
    const result = await respond(store, minsuAffected, options);

    assert.deepEqual(result, {
      ok: true,
      answer: {
        id: 'a-1',
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected: true,
        known: false,
        unaffectedReason: null,
        channel: 'terminal',
        answeredAt: ANSWERED_AT,
      },
      rereadStandardId: DEMO_STANDARD_ID,
    });
    const data = await store.read();
    assert.equal(data.pendingChecks[0]?.status, 'answered');
    assert.equal(data.pendingChecks[0]?.closedAt, ANSWERED_AT);
    assert.equal(data.answers.length, 1);
  });

  it('관계없다는 이유를 저장하고 다시 읽을 기준은 없다', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      {
        pendingCheckId: 'c-2',
        answeredBy: '신지',
        affected: false,
        known: true,
        unaffectedReason: '  화면 문구만 다루는 이슈라 관계없음  ',
        channel: 'app',
      },
      options,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rereadStandardId, null);
    // 관계없다면 알았나는 저장하지 않고, 이유는 앞뒤 공백을 지워요
    assert.equal(result.answer.known, null);
    assert.equal(
      result.answer.unaffectedReason,
      '화면 문구만 다루는 이슈라 관계없음',
    );
  });

  it('없는 확인할 변경에는 답할 수 없다', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      { ...minsuAffected, pendingCheckId: 'nope' },
      options,
    );
    assert.equal(result.ok ? null : result.code, 'not_found');
  });

  it('받는 사람이 아니면 답할 수 없다', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      { ...minsuAffected, answeredBy: '부건' },
      options,
    );
    assert.equal(result.ok ? null : result.code, 'not_recipient');
    assert.equal((await store.read()).answers.length, 0);
  });

  it('이미 답한 변경에 다시 답할 수 없다 (한 곳에서 답하면 다른 곳은 닫힘)', async () => {
    const store = await storeAfterV2();
    await respond(store, minsuAffected, options);
    const second = await respond(
      store,
      { ...minsuAffected, channel: 'app' },
      options,
    );

    assert.deepEqual(second, {
      ok: false,
      code: 'already_closed',
      message: '이미 답한 확인할 변경이에요.',
      closedStatus: 'answered',
    });
    assert.equal((await store.read()).answers.length, 1);
  });

  it('대체된 변경에는 최신 변경에 답하라고 알려 준다', async () => {
    const store = await storeAfterV2();
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 3, value: '공백 포함 30자 이하' },
      { now: '2026-10-13T15:00:00+09:00' },
    );
    const result = await respond(store, minsuAffected, options);

    assert.equal(result.ok ? null : result.code, 'already_closed');
    assert.match(
      result.ok ? '' : result.message,
      /최신 버전의 확인할 변경에 답해 주세요/,
    );
  });

  it('되돌려서 자동으로 닫힌 변경이면 그 상태를 함께 알려 준다 (SIL-77 부건님 의견)', async () => {
    const store = await storeAfterV2();
    await applyNewVersion(
      store,
      { ...DEMO_V1, version: 3, changedBy: '정민', isRevert: true },
      { now: '2026-10-13T15:00:00+09:00' },
    );
    const result = await respond(store, minsuAffected, options);

    assert.equal(result.ok ? null : result.code, 'already_closed');
    assert.equal(result.ok ? null : result.closedStatus, 'auto_closed');
  });

  it('관계있다인데 알았나가 없으면 빠진 칸을 알려 준다', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      { ...minsuAffected, known: null },
      options,
    );

    assert.deepEqual(result, {
      ok: false,
      code: 'missing_fields',
      message: '빠진 칸이 있어요: 알았나(알았다 / 몰랐다)',
      missingFields: ['known'],
    });
  });

  it('관계없다인데 이유가 비어 있으면 빠진 칸을 알려 준다', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      { ...minsuAffected, affected: false, unaffectedReason: '   ' },
      options,
    );

    assert.equal(result.ok ? null : result.code, 'missing_fields');
    assert.deepEqual(result.ok ? [] : result.missingFields, [
      'unaffectedReason',
    ]);
  });

  it('관계없는 이유는 100자까지 받고 101자는 거절한다', async () => {
    const reasonOf = (n: number) => '가'.repeat(n);

    const okStore = await storeAfterV2();
    const ok = await respond(
      okStore,
      { ...minsuAffected, affected: false, unaffectedReason: reasonOf(100) },
      options,
    );
    assert.equal(ok.ok, true);

    const longStore = await storeAfterV2();
    const tooLong = await respond(
      longStore,
      { ...minsuAffected, affected: false, unaffectedReason: reasonOf(101) },
      options,
    );
    assert.equal(tooLong.ok ? null : tooLong.code, 'reason_too_long');
  });

  it('답한 곳이 터미널이나 앱이 아니면 거절한다 (Slack은 만들지 않아요)', async () => {
    const store = await storeAfterV2();
    const result = await respond(
      store,
      { ...minsuAffected, channel: 'slack' as unknown as 'app' },
      options,
    );
    assert.equal(result.ok ? null : result.code, 'invalid_channel');
  });
});
