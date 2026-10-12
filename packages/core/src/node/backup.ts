/**
 * 위키 데이터 백업 (wiki.backup.daily). `sil backup`과 .github/workflows/backup.yml이 써요.
 *
 * 공용 키로 표를 읽기만 해서 JSON으로 남겨요. 공용 키에는 지우기 권한이 없어서, 백업이 데이터를 바꿀 일은 없어요.
 * 되살리기는 공용 키로 할 수 없어요 (표에 직접 쓸 수 없게 막혀 있어요). 필요하면 정민님이 SQL 편집기에서 해요.
 */
import { readAllRows } from '../data/standards.ts';

/** 백업할 표와, 줄 순서가 바뀌지 않게 정렬할 칸 (기본 키) */
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

export interface TableDump {
  /** 백업한 시각 */
  takenAt: string;
  tables: Record<BackupTableName, unknown[]>;
}

/** 표를 차례로 끝까지 읽어요. 하나라도 실패하면 반쪽 백업 대신 에러를 던져요. */
export async function dumpTables(): Promise<TableDump> {
  const tables = {} as Record<BackupTableName, unknown[]>;
  for (const table of BACKUP_TABLES) {
    tables[table.name] = await readAllRows(table.name, [...table.orderBy]);
  }
  return { takenAt: new Date().toISOString(), tables };
}
