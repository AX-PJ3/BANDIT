import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyNewVersion } from './applyNewVersion.js';
import { MemoryStore } from './store.js';
import { DEMO_V1, DEMO_V2, createDemoData, createIdMaker } from './demoData.js';

const NOW = '2026-10-13T14:13:00+09:00';

describe('applyNewVersion', () => {
  it('데모 예시: v2를 기록하고 민수·신지에게 확인할 변경을 저장한다', async () => {
    const store = new MemoryStore(createDemoData());
    const result = await applyNewVersion(store, DEMO_V2, {
      now: NOW,
      makeId: createIdMaker('c'),
    });

    const data = await store.read();
    assert.deepEqual(
      data.standardVersions.map((v) => v.version),
      [1, 2],
    );
    assert.deepEqual(
      data.pendingChecks.map((c) => [c.id, c.issueKey, c.recipient, c.status]),
      [
        ['c-1', '#5', '민수', 'pending'],
        ['c-2', '#7', '신지', 'pending'],
      ],
    );
    assert.equal(result.created.length, 2);
  });

  it('답하기 전에 또 바뀌면 이전 건의 상태를 대체됨으로 바꿔 저장한다', async () => {
    const store = new MemoryStore(createDemoData());
    await applyNewVersion(store, DEMO_V2, {
      now: NOW,
      makeId: createIdMaker('v2'),
    });
    await applyNewVersion(
      store,
      { ...DEMO_V2, version: 3, value: '공백 포함 30자 이하' },
      { now: '2026-10-13T15:00:00+09:00', makeId: createIdMaker('v3') },
    );

    const data = await store.read();
    assert.deepEqual(
      data.pendingChecks.map((c) => [c.id, c.status, c.closedAt]),
      [
        ['v2-1', 'superseded', '2026-10-13T15:00:00+09:00'],
        ['v2-2', 'superseded', '2026-10-13T15:00:00+09:00'],
        ['v3-1', 'pending', null],
        ['v3-2', 'pending', null],
      ],
    );
  });

  it('되돌려서 마지막으로 본 값과 같아지면 자동 닫힘으로 바꿔 저장한다', async () => {
    const store = new MemoryStore(createDemoData());
    await applyNewVersion(store, DEMO_V2, {
      now: NOW,
      makeId: createIdMaker(),
    });
    await applyNewVersion(
      store,
      { ...DEMO_V1, version: 3, changedBy: '정민', isRevert: true },
      { now: '2026-10-13T15:00:00+09:00' },
    );

    const data = await store.read();
    assert.deepEqual(
      data.pendingChecks.map((c) => c.status),
      ['auto_closed', 'auto_closed'],
    );
  });

  it('버전 번호가 다음 번호가 아니면 저장하지 않고 오류를 낸다', async () => {
    const store = new MemoryStore(createDemoData());
    await assert.rejects(
      applyNewVersion(store, { ...DEMO_V2, version: 3 }, { now: NOW }),
      /다음 버전은 2이어야/,
    );
    assert.equal((await store.read()).standardVersions.length, 1);
  });
});
