import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { JsonFileStore, MemoryStore, createEmptyData } from './store.ts';
import { createDemoData } from './demoData.ts';

describe('JsonFileStore', () => {
  const dirs: string[] = [];
  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function newPath(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'notify-store-'));
    dirs.push(dir);
    return join(dir, 'nested', 'data.json');
  }

  it('파일이 없으면 빈 데이터로 시작한다', async () => {
    const store = new JsonFileStore(await newPath());
    assert.deepEqual(await store.read(), createEmptyData());
  });

  it('쓴 데이터를 그대로 다시 읽는다 (폴더가 없으면 만든다)', async () => {
    const path = await newPath();
    const store = new JsonFileStore(path);
    await store.write(createDemoData());

    assert.deepEqual(await new JsonFileStore(path).read(), createDemoData());
    assert.match(await readFile(path, 'utf8'), /"app.notify.title-length"/);
  });
});

describe('MemoryStore', () => {
  it('읽은 데이터를 고쳐도 저장된 데이터는 바뀌지 않는다', async () => {
    const store = new MemoryStore(createDemoData());
    const data = await store.read();
    data.issues.pop();

    assert.equal((await store.read()).issues.length, 2);
  });
});
