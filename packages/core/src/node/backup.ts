/**
 * 위키 데이터 백업과 되살리기 (wiki.backup.daily). `sil backup`, `sil restore`, .github/workflows/backup.yml이 써요.
 *
 * 백업: 공용 키로 표 7개를 읽기만 해요. 공용 키에는 지우기 권한이 없어서, 백업이 데이터를 바꿀 일은 없어요.
 * - 표를 하나씩 읽는 사이에 누가 저장하면 표끼리 어긋날 수 있어요 (버전은 있는데 그 버전의 확인할 변경이 없는 식).
 *   공용 키로는 여러 표를 한 번에 읽을 수 없어서, 두 번 연달아 읽어 똑같을 때만 받아요.
 * - Supabase 무료 플랜에는 자동 백업이 없어요 (Pro 이상만). 그래서 우리가 직접 남겨요.
 *
 * 되살리기: 공용 키로는 표에 쓸 수 없어요. 빈 DB에 supabase/migrations를 올린 뒤,
 * buildRestoreSql이 만든 SQL을 DB 주인 계정(psql)으로 넣어요.
 * 저장 함수(save_standard 등)를 거치면 버전과 시각이 새로 생기고 확인할 변경도 다시 만들어져서 기록이 달라져요.
 * 그래서 되살리기만은 표에 그대로 넣어요 (CLAUDE.md "표에 직접 쓰지 않는다"의 예외, 빈 DB에만).
 */
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { SilError } from '../errors.ts';
import { readAllRows } from '../data/standards.ts';

/**
 * 백업할 표와 줄 순서를 정할 칸 (기본 키). 되살릴 때 이 순서로 넣어요.
 * 앞 표를 가리키는 칸(외래 키)이 있어서 순서를 바꾸면 되살리기가 실패해요.
 * 표를 더하면 여기에도 더해요. 빠뜨리면 backup.test.ts가 마이그레이션과 비교해서 알려 줘요.
 */
export const BACKUP_TABLES = [
  { name: 'standards', orderBy: ['id'] },
  { name: 'standard_versions', orderBy: ['standard_id', 'version'] },
  { name: 'issues', orderBy: ['key'] },
  { name: 'issue_standards', orderBy: ['issue_key', 'standard_id'] },
  { name: 'pending_checks', orderBy: ['id'] },
  { name: 'answers', orderBy: ['id'] },
  { name: 'conflicts', orderBy: ['id'] },
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]['name'];

type Row = Record<string, unknown>;

/** 표 하나의 백업. 칸 이름은 되살릴 DB의 표와 같은지 비교할 때 써요 (줄이 없으면 빈 목록) */
export interface BackupTable {
  columns: string[];
  rows: Row[];
}

/** 백업 파일 하나에 들어가는 모든 것. 암호화할 때는 이 모양 그대로 잠가요 */
export interface BackupBundle {
  format: 'sil-backup';
  version: 1;
  /** 다 읽은 시각 (ISO) */
  takenAt: string;
  /** 읽은 DB의 호스트. 예: abcd.supabase.co. 잠근 파일 안에만 들어가요 */
  source: string;
  /** 백업한 코드의 커밋. 모르면 null */
  commit: string | null;
  /** 똑같이 읽힐 때까지 표 전체를 읽은 횟수 (보통 2) */
  attempts: number;
  tables: Record<BackupTableName, BackupTable>;
}

export interface TakeBackupOptions {
  source: string;
  commit: string | null;
  /** 표 전체를 몇 번까지 읽어 볼지. 기본 5 */
  maxAttempts?: number;
  /** 읽은 결과가 다르면 다시 읽기 전에 기다릴 시간(ms). 기본 2000 */
  retryDelayMs?: number;
}

/** 표 7개를 두 번 연달아 똑같이 읽힐 때까지 읽어요. 계속 달라지면 반쪽 백업 대신 에러를 던져요. */
export async function takeBackup(
  options: TakeBackupOptions,
): Promise<BackupBundle> {
  const maxAttempts = options.maxAttempts ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  let previous = await readTablesOnce();
  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const current = await readTablesOnce();
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      return {
        format: 'sil-backup',
        version: 1,
        takenAt: new Date().toISOString(),
        source: options.source,
        commit: options.commit,
        attempts: attempt,
        tables: current,
      };
    }
    previous = current;
    if (attempt < maxAttempts) await sleep(retryDelayMs);
  }
  throw new SilError(
    'DB_ERROR',
    `백업하는 동안 데이터가 계속 바뀌어서 ${maxAttempts}번 읽어도 같은 모습을 받지 못했어요. 잠시 뒤 다시 실행해 주세요.`,
  );
}

async function readTablesOnce(): Promise<Record<BackupTableName, BackupTable>> {
  const tables = {} as Record<BackupTableName, BackupTable>;
  for (const table of BACKUP_TABLES) {
    const rows = (await readAllRows(table.name, [...table.orderBy])) as Row[];
    tables[table.name] = { columns: columnsOf(rows), rows };
  }
  return tables;
}

/** 줄마다 칸이 같지만, 혹시 다르면 처음 나온 순서대로 모두 모아요 */
function columnsOf(rows: Row[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

/** 표마다 줄 수 */
export function countBackupRows(
  bundle: BackupBundle,
): Record<BackupTableName, number> {
  const counts = {} as Record<BackupTableName, number>;
  for (const { name } of BACKUP_TABLES)
    counts[name] = bundle.tables[name].rows.length;
  return counts;
}

const COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;

const tableSchema = z.object({
  columns: z.array(z.string().regex(COLUMN_NAME)),
  rows: z.array(z.record(z.string(), z.unknown())),
});

const bundleSchema = z.object({
  format: z.literal('sil-backup'),
  version: z.literal(1),
  // 아래 세 칸은 되살리기 SQL의 주석에 들어가요. 공개 키는 누구나 가질 수 있어서 잠근 파일도 남이 만들 수 있으니,
  // 줄 바꿈 같은 글자가 끼어 SQL이 되지 않게 모양을 좁혀요
  takenAt: z.iso.datetime(),
  source: z.string().regex(/^[a-z0-9.-]+(:\d+)?$/i),
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,64}$/)
    .nullable(),
  attempts: z.number().int().positive(),
  tables: z.object({
    standards: tableSchema,
    standard_versions: tableSchema,
    issues: tableSchema,
    issue_standards: tableSchema,
    pending_checks: tableSchema,
    answers: tableSchema,
    conflicts: tableSchema,
  } satisfies Record<BackupTableName, typeof tableSchema>),
});

/** 파일에서 읽은 값이 백업 모양인지 확인해요. 아니면 무엇이 틀렸는지 알려 줘요. */
export function parseBackupBundle(value: unknown): BackupBundle {
  const result = bundleSchema.safeParse(value);
  if (!result.success) {
    throw new SilError(
      'VALIDATION_FAILED',
      `백업 파일 모양이 맞지 않아요 (sil backup이 만든 파일인지 확인해 주세요).\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * 빈 DB에 백업을 되살리는 SQL을 만들어요. psql로 DB 주인 계정에서 실행해요.
 *
 * 한 트랜잭션 안에서 아래 순서로 해요. 하나라도 틀리면 아무것도 넣지 않고 멈춰요.
 * 1. 표 7개가 있고 모두 비어 있는지, 칸이 백업과 같은지 확인 (칸이 다르면 마이그레이션이 다른 DB예요)
 * 2. BACKUP_TABLES 순서대로 넣기. 값의 모양 변환(시각, jsonb 등)은 Postgres의 jsonb_populate_recordset이 해요
 * 3. 표마다 줄 수가 백업과 같은지 확인하고, 마지막에 줄 수 표를 보여 줘요
 */
export function buildRestoreSql(bundle: BackupBundle): string {
  const data = JSON.stringify(bundle.tables);
  const tag = pickDollarTag(data);
  const counts = countBackupRows(bundle);
  const lines: string[] = [
    // 한국어가 들어 있어서 맨 먼저 글자 인코딩을 정해요 (Windows psql 기본값이 UTF8이 아니에요)
    "set client_encoding = 'UTF8';",
    '-- sil restore가 만든 되살리기 SQL이에요. 빈 DB에만 넣을 수 있어요 (docs/백업과-되살리기.md).',
    '-- 실행: psql "<DB 주소>" -v ON_ERROR_STOP=1 -f <이 파일>',
    `-- 백업 시각: ${oneLine(bundle.takenAt)} / 원본: ${oneLine(bundle.source)} / 코드: ${oneLine(bundle.commit ?? '모름')}`,
    `-- 줄 수: ${BACKUP_TABLES.map(({ name }) => `${name} ${counts[name]}`).join(', ')}`,
    'begin;',
    checkTargetSql(bundle),
  ];
  for (const { name } of BACKUP_TABLES) {
    if (counts[name] === 0) continue;
    const rows = JSON.stringify(bundle.tables[name].rows);
    lines.push(
      `insert into public.${name} select * from jsonb_populate_recordset(null::public.${name}, ${tag}${rows}${tag}::jsonb);`,
    );
  }
  lines.push(checkCountsSql(counts), 'commit;', reportSql());
  return `${lines.join('\n')}\n`;
}

function checkTargetSql(bundle: BackupBundle): string {
  const expected = BACKUP_TABLES.map(({ name }) => {
    const columns = bundle.tables[name].columns.map((column) => {
      if (!COLUMN_NAME.test(column))
        throw new SilError(
          'VALIDATION_FAILED',
          `백업의 ${name} 표에 이상한 칸 이름(${column})이 있어요.`,
        );
      return `'${column}'`;
    });
    return `('${name}', array[${columns.join(', ')}]::text[])`;
  });
  return `do $check$
declare
  v_table text;
  v_expected text[];
  v_actual text[];
  v_has_rows boolean;
begin
  for v_table, v_expected in select * from (values
    ${expected.join(',\n    ')}
  ) as t (name, columns) loop
    if to_regclass('public.' || v_table) is null then
      raise exception '표 public.%이(가) 없어요. 빈 DB에 supabase/migrations를 먼저 올려 주세요.', v_table;
    end if;
    execute format('select exists (select 1 from public.%I)', v_table) into v_has_rows;
    if v_has_rows then
      raise exception '표 public.%에 이미 데이터가 있어요. 되살리기는 빈 DB에만 해요.', v_table;
    end if;
    -- 줄이 없는 표는 넣을 것이 없어서 칸을 비교하지 않아요
    if cardinality(v_expected) > 0 then
      select array_agg(column_name::text order by column_name::text) into v_actual
      from information_schema.columns
      where table_schema = 'public' and table_name = v_table;
      if v_actual is distinct from (select array_agg(c order by c) from unnest(v_expected) as c) then
        raise exception '표 public.%의 칸이 백업과 달라요. 백업: %, 이 DB: %. 백업한 때와 같은 마이그레이션을 올렸는지 확인해 주세요.',
          v_table, (select array_agg(c order by c) from unnest(v_expected) as c), v_actual;
      end if;
    end if;
  end loop;
end
$check$;`;
}

function checkCountsSql(counts: Record<BackupTableName, number>): string {
  const checks = BACKUP_TABLES.map(
    ({ name }) => `  select count(*) into v_count from public.${name};
  if v_count <> ${counts[name]} then
    raise exception '표 public.${name}의 줄 수가 백업과 달라요. 백업 ${counts[name]}, 넣은 뒤 %', v_count;
  end if;`,
  );
  return `do $count$
declare
  v_count bigint;
begin
${checks.join('\n')}
end
$count$;`;
}

function reportSql(): string {
  return `${BACKUP_TABLES.map(
    ({ name }) =>
      `select '${name}' as table_name, count(*) as row_count from public.${name}`,
  ).join('\nunion all ')};`;
}

/** SQL 주석 한 줄 안에 머물게, 줄 바꿈 같은 제어 글자를 지워요 */
function oneLine(text: string): string {
  return text.replace(/\p{Cc}/gu, ' ');
}

/** 데이터 안에 나오지 않는 $…$ 따옴표를 골라요. 그래야 어떤 글자가 들어 있어도 SQL이 깨지지 않아요 */
function pickDollarTag(text: string): string {
  for (;;) {
    const tag = `$sil_${randomBytes(6).toString('hex')}$`;
    if (!text.includes(tag)) return tag;
  }
}
