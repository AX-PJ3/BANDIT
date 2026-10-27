import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_TABLES, takeBackup } from './backup.ts';
import { setDbForTesting } from '../data/client.ts';
import { createFakeDb } from './fake-db.ts';

afterEach(() => setDbForTesting(undefined));

const OPTIONS = {
  source: 'test.supabase.co',
  commit: 'abc1234',
  retryDelayMs: 0,
};

describe('takeBackup', () => {
  it('1,000줄이 넘는 표도 나눠서 끝까지 읽고, 표마다 칸 이름을 남겨요', async () => {
    const many = Array.from({ length: 2345 }, (_, index) => ({
      key: `#${String(index).padStart(4, '0')}`,
      title: '이슈',
    }));
    setDbForTesting(createFakeDb({ issues: many }).client);
    const bundle = await takeBackup(OPTIONS);
    expect(bundle.tables.issues.rows).toHaveLength(2345);
    expect(bundle.tables.issues.columns).toEqual(['key', 'title']);
    expect(bundle.tables.standards).toEqual({ columns: [], rows: [] });
    expect(bundle).toMatchObject({
      format: 'sil-backup',
      version: 1,
      source: 'test.supabase.co',
      commit: 'abc1234',
      attempts: 2,
    });
  });

  it('읽는 동안 데이터가 바뀌면 같은 모습이 두 번 나올 때까지 다시 읽어요', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {};
    let reads = 0;
    // answers를 읽을 때마다 첫 번째 읽기에서만 다른 값을 돌려줘요 (그사이 누가 답한 것처럼)
    Object.defineProperty(tables, 'answers', {
      enumerable: true,
      get: () => (reads++ === 0 ? [] : [{ id: 'a1' }]),
    });
    setDbForTesting(createFakeDb(tables).client);
    const bundle = await takeBackup(OPTIONS);
    expect(bundle.attempts).toBe(3);
    expect(bundle.tables.answers.rows).toEqual([{ id: 'a1' }]);
  });

  it('계속 바뀌면 반쪽 백업 대신 에러를 던져요', async () => {
    const tables: Record<string, Record<string, unknown>[]> = {};
    let reads = 0;
    Object.defineProperty(tables, 'answers', {
      enumerable: true,
      get: () => [{ id: `a${reads++}` }],
    });
    setDbForTesting(createFakeDb(tables).client);
    await expect(takeBackup({ ...OPTIONS, maxAttempts: 3 })).rejects.toThrow(
      /3번 읽어도/,
    );
  });
});

describe('BACKUP_TABLES', () => {
  it('마이그레이션이 만든 표를 하나도 빠뜨리지 않아요 (표를 더하면 여기에도 더해요)', () => {
    const dir = new URL('../../../../supabase/migrations/', import.meta.url);
    const tables = new Set<string>();
    for (const file of readdirSync(dir).sort()) {
      const sql = readFileSync(new URL(file, dir), 'utf8');
      for (const match of sql.matchAll(/^create table public\.(\w+)/gm))
        tables.add(match[1]!);
      for (const match of sql.matchAll(
        /^alter table public\.(\w+) rename to (\w+);/gm,
      )) {
        tables.delete(match[1]!);
        tables.add(match[2]!);
      }
    }
    expect([...tables].sort()).toEqual(
      BACKUP_TABLES.map(({ name }) => name).sort(),
    );
  });
});
