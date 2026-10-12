import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyNewVersion } from './applyNewVersion.js';
import { listPending } from './listPending.js';
import { respond } from './respond.js';
import { MemoryStore } from './store.js';
import {
  DEMO_STANDARD_ID,
  DEMO_V2,
  createDemoData,
  createIdMaker,
} from './demoData.js';

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
          },
          issue: {
            key: '#5',
            title: '담당자에게 알리고 답 기록하기',
            status: 'in_progress',
          },
          answer: null,
        },
      ],
    });
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

    const withClosed = await listPending(store, {
      recipient: '민수',
      includeClosed: true,
    });
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

    const result = await listPending(store, {
      recipient: '민수',
      includeClosed: true,
    });
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
});
