import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyNewVersion } from './applyNewVersion.ts';
import { listPending } from './listPending.ts';
import { respond } from './respond.ts';
import { MemoryStore } from './store.ts';
import {
  DEMO_STANDARD_ID,
  DEMO_V2,
  createDemoData,
  createIdMaker,
} from './demoData.ts';

const NOW = '2026-10-13T14:13:00+09:00';
const LATER = '2026-10-13T15:00:00+09:00';

async function storeAfterV2(): Promise<MemoryStore> {
  const store = new MemoryStore(createDemoData());
  await applyNewVersion(store, DEMO_V2, {
    now: NOW,
    makeId: createIdMaker('c'),
  });
  return store;
}

describe('listPending', () => {
  it('데모 예시: 민수에게 온 변경 하나를 화면에 필요한 칸을 모두 채워 돌려준다', async () => {
    const store = await storeAfterV2();
    const result = await listPending(store, { recipient: '민수' });

    assert.deepEqual(result, {
      recipient: '민수',
      pendingCount: 1,
      items: [
        {
          pendingCheckId: 'c-1',
          status: 'pending',
          createdAt: NOW,
          reflected: false,
          reflectedAt: null,
          standard: {
            id: DEMO_STANDARD_ID,
            title: '앱 알림 제목은 32자 이하로 쓴다',
            version: 2,
            value: '공백 포함 32자 이하',
            previousVersion: 1,
            previousValue: '공백 포함 40자 이하',
            reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
            changedBy: '부건',
            changedAt: NOW,
            source: 'ai_chat',
            aiDetected: false,
            isRevert: false,
            scope: null,
          },
          issue: {
            key: '#5',
            title: '담당자에게 알리고 답 기록하기',
            status: 'in_progress',
          },
          answer: null,
          previousAnswer: null,
        },
      ],
    });
  });

  it('이전 버전에 관계있다고 답했으면 그 답을 함께 돌려준다 (SIL-77 부건님 의견)', async () => {
    const store = await storeAfterV2();
    await respond(
      store,
      {
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected: true,
        known: false,
        channel: 'terminal',
      },
      { now: '2026-10-13T14:20:00+09:00' },
    );
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 3, value: '공백 포함 30자 이하' },
      { now: LATER, makeId: createIdMaker('v3') },
    );

    const [minsu] = (await listPending(store, { recipient: '민수' })).items;
    assert.deepEqual(minsu?.previousAnswer, {
      version: 2,
      affected: true,
      known: false,
      answeredAt: '2026-10-13T14:20:00+09:00',
    });
    // 신지님은 v2에 답하지 않아서 대체됐고, 이전 답이 없어요
    const [sinji] = (await listPending(store, { recipient: '신지' })).items;
    assert.equal(sinji?.previousAnswer, null);
  });

  it('기준을 바꾼 본인과 연결된 이슈가 없는 사람은 빈 목록이다', async () => {
    const store = await storeAfterV2();
    const result = await listPending(store, { recipient: '부건' });

    assert.equal(result.pendingCount, 0);
    assert.deepEqual(result.items, []);
  });

  it('새로 생긴 기준은 이전 값과 이전 버전이 비어 있다', async () => {
    const data = createDemoData();
    data.standardVersions = [];
    const store = new MemoryStore(data);
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 1 },
      { now: NOW, makeId: createIdMaker() },
    );

    const [item] = (await listPending(store, { recipient: '민수' })).items;
    assert.equal(item?.standard.previousValue, null);
    assert.equal(item?.standard.previousVersion, null);
  });

  it('이전 값은 바로 앞 버전이 아니라 마지막으로 본 버전의 값이다', async () => {
    const store = await storeAfterV2();
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 3, value: '공백 포함 30자 이하' },
      { now: LATER, makeId: createIdMaker('v3') },
    );

    const [item] = (await listPending(store, { recipient: '민수' })).items;
    assert.equal(item?.standard.version, 3);
    assert.equal(item?.standard.previousVersion, 1);
    assert.equal(item?.standard.previousValue, '공백 포함 40자 이하');
  });

  it('기본은 대기만 돌려주고, includeClosed면 답함과 대체됨도 답과 함께 돌려준다', async () => {
    const store = await storeAfterV2();
    await respond(
      store,
      {
        pendingCheckId: 'c-1',
        answeredBy: '민수',
        affected: true,
        known: false,
        channel: 'terminal',
      },
      { now: '2026-10-13T14:20:00+09:00', makeId: () => 'a-1' },
    );

    assert.equal(
      (await listPending(store, { recipient: '민수' })).items.length,
      0,
    );

    const withClosed = await listPending(
      store,
      { recipient: '민수', includeClosed: true },
      { now: LATER },
    );
    assert.equal(withClosed.pendingCount, 0);
    assert.deepEqual(withClosed.items[0]?.answer, {
      affected: true,
      known: false,
      unaffectedReason: null,
      channel: 'terminal',
      answeredAt: '2026-10-13T14:20:00+09:00',
    });
  });

  it('자동 닫힘은 includeClosed여도 돌려주지 않는다 (notify.pending.hide-auto-closed)', async () => {
    const store = await storeAfterV2();
    const data = await store.read();
    data.pendingChecks = data.pendingChecks.map((c) => ({
      ...c,
      status: 'auto_closed' as const,
    }));
    await store.write(data);

    const result = await listPending(store, {
      recipient: '민수',
      includeClosed: true,
    });
    assert.deepEqual(result.items, []);
  });

  it('최신 것이 먼저 온다', async () => {
    const store = await storeAfterV2();
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 3, value: '공백 포함 30자 이하' },
      { now: LATER, makeId: createIdMaker('v3') },
    );

    const result = await listPending(
      store,
      { recipient: '민수', includeClosed: true },
      { now: LATER },
    );
    assert.deepEqual(
      result.items.map((i) => [i.standard.version, i.status]),
      [
        [3, 'pending'],
        [2, 'superseded'],
      ],
    );
  });

  it('기준 버전을 찾지 못하면 빈 목록 대신 오류를 낸다 (notify.error.not-empty)', async () => {
    const store = await storeAfterV2();
    const data = await store.read();
    data.standardVersions = data.standardVersions.filter(
      (v) => v.version !== 2,
    );
    await store.write(data);

    await assert.rejects(
      listPending(store, { recipient: '민수' }),
      /기준 버전\(app.notify.title-length v2\)을 찾지 못했어요/,
    );
  });

  describe('답한 변경은 닫힌 지 7일이 지나면 내린다 (notify.list.closed-7-days)', () => {
    async function storeWithAnswerAt(answeredAt: string): Promise<MemoryStore> {
      const store = await storeAfterV2();
      await respond(
        store,
        {
          pendingCheckId: 'c-1',
          answeredBy: '민수',
          affected: true,
          known: true,
          channel: 'app',
        },
        { now: answeredAt },
      );
      return store;
    }
    const ANSWERED = '2026-10-13T14:20:00+09:00';

    it('답한 지 7일이 안 됐으면 보여 준다', async () => {
      const store = await storeWithAnswerAt(ANSWERED);
      const result = await listPending(
        store,
        { recipient: '민수', includeClosed: true },
        { now: '2026-10-20T14:19:00+09:00' },
      );
      assert.equal(result.items.length, 1);
    });

    it('답한 지 7일이 지나면 목록에서 빠지지만 기록은 남는다 (data.answer.keep-records)', async () => {
      const store = await storeWithAnswerAt(ANSWERED);
      const result = await listPending(
        store,
        { recipient: '민수', includeClosed: true },
        { now: '2026-10-20T14:21:00+09:00' },
      );
      assert.deepEqual(result.items, []);

      const data = await store.read();
      assert.equal(data.pendingChecks.length, 2);
      assert.equal(data.answers.length, 1);
    });

    it('대기는 오래돼도 계속 보여 준다', async () => {
      const store = await storeAfterV2();
      const result = await listPending(
        store,
        { recipient: '민수' },
        { now: '2026-12-31T00:00:00+09:00' },
      );
      assert.equal(result.pendingCount, 1);
    });
  });
});
