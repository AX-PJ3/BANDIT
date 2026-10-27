import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BACKUP_TABLES,
  buildRestoreSql,
  countBackupRows,
  parseBackupBundle,
  takeBackup,
  type BackupBundle,
} from './backup.ts';
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

function bundleWith(
  tables: Partial<Record<string, Record<string, unknown>[]>>,
): BackupBundle {
  return parseBackupBundle({
    format: 'sil-backup',
    version: 1,
    takenAt: '2026-10-27T03:00:00.000Z',
    source: 'test.supabase.co',
    commit: null,
    attempts: 2,
    tables: Object.fromEntries(
      BACKUP_TABLES.map(({ name }) => {
        const rows = tables[name] ?? [];
        return [name, { columns: Object.keys(rows[0] ?? {}), rows }];
      }),
    ),
  });
}

describe('buildRestoreSql', () => {
  it('앞 표를 가리키는 순서대로 넣고, 줄이 없는 표는 건너뛰어요', () => {
    const sql = buildRestoreSql(
      bundleWith({
        standards: [{ id: 'app.notify.title-length' }],
        standard_versions: [{ standard_id: 'app.notify.title-length' }],
        answers: [{ id: 'a1' }],
      }),
    );
    const inserted = [...sql.matchAll(/^insert into public\.(\w+)/gm)].map(
      (match) => match[1],
    );
    expect(inserted).toEqual(['standards', 'standard_versions', 'answers']);
    expect(sql.startsWith("set client_encoding = 'UTF8';")).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql).toContain('commit;');
    expect(sql).toContain('if v_count <> 1 then');
  });

  it('값에 어떤 글자가 들어 있어도 SQL 따옴표가 깨지지 않아요', () => {
    const tricky = `'; drop table public.standards; -- $sil_$ $$ \\ 한글`;
    const sql = buildRestoreSql(bundleWith({ issues: [{ title: tricky }] }));
    const insert = sql.split('\n').find((line) => line.startsWith('insert'))!;
    const tag = /(\$sil_[0-9a-f]+\$)/.exec(insert)![1]!;
    // 따옴표가 정확히 한 쌍이고, 데이터 안에는 그 따옴표가 없어요
    expect(insert.split(tag)).toHaveLength(3);
    expect(insert.split(tag)[1]).toBe(JSON.stringify([{ title: tricky }]));
  });

  it('칸 이름이 이상한 백업 파일은 받지 않아요', () => {
    expect(() => bundleWith({ issues: [{ 'title; drop': '값' }] })).toThrow(
      /모양이 맞지 않아요/,
    );
  });

  it('주석에 들어가는 칸에 줄 바꿈을 끼운 파일은 받지 않고, 받더라도 주석 밖으로 나가지 않아요', () => {
    const crafted = {
      ...bundleWith({}),
      source: 'x.supabase.co\ndrop table public.standards;',
    };
    expect(() => parseBackupBundle(crafted)).toThrow(/모양이 맞지 않아요/);
    const sql = buildRestoreSql(crafted);
    expect(sql.split('\n').some((line) => line.startsWith('drop table'))).toBe(
      false,
    );
  });

  it('countBackupRows는 표마다 줄 수를 세요', () => {
    expect(
      countBackupRows(bundleWith({ issues: [{ key: '#1' }, { key: '#2' }] })),
    ).toMatchObject({ issues: 2, standards: 0 });
  });
});
