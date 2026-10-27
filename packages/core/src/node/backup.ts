/**
 * 위키 데이터 백업 (wiki.backup.daily). `sil backup`과 .github/workflows/backup.yml이 써요.
 *
 * 백업: 공용 키로 표 7개를 읽기만 해요. 공용 키에는 지우기 권한이 없어서, 백업이 데이터를 바꿀 일은 없어요.
 * - 표를 하나씩 읽는 사이에 누가 저장하면 표끼리 어긋날 수 있어요 (버전은 있는데 그 버전의 확인할 변경이 없는 식).
 *   공용 키로는 여러 표를 한 번에 읽을 수 없어서, 두 번 연달아 읽어 똑같을 때만 받아요.
 * - Supabase 무료 플랜에는 자동 백업이 없어요 (Pro 이상만). 그래서 우리가 직접 남겨요.
 */
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
  takenAt: z.string(),
  source: z.string(),
  commit: z.string().nullable(),
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
