/**
 * 테스트용 가짜 Supabase 클라이언트예요. 실제 DB 없이 core 함수와 MCP 도구를 끝까지 돌려 보려고 만들었어요.
 *
 * - 표는 메모리에 행(snake_case) 배열로 들고 있어요. 우리가 실제로 쓰는 조회만 흉내 내요 (select, eq, order, range, maybeSingle, head count).
 * - rpc(함수 호출)는 테스트가 넣어 준 함수로 답해요. SQL 규칙 자체는 supabase/tests/wiki.test.sql이 실제 Postgres에서 검사해요.
 *
 * 실제 코드에서는 쓰지 마세요. setDbForTesting(createFakeDb(...))으로만 끼워요.
 */
import type { DbClient, DbErrorLike } from '../data/client.ts';

type Row = Record<string, unknown>;
type Result = {
  data: unknown;
  error: DbErrorLike | null;
  count?: number | null;
};
export type FakeRpc = (
  name: string,
  args: Record<string, unknown>,
) => Result | Promise<Result>;

export interface FakeDb {
  client: DbClient;
  tables: Record<string, Row[]>;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
}

export function createFakeDb(
  tables: Record<string, Row[]>,
  rpc: FakeRpc = notImplementedRpc,
): FakeDb {
  const rpcCalls: FakeDb['rpcCalls'] = [];
  const client = {
    from: (table: string) => new FakeQuery(() => tables[table] ?? []),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpc(name, args);
    },
  };
  return { client: client as unknown as DbClient, tables, rpcCalls };
}

class FakeQuery implements PromiseLike<Result> {
  private filters: [string, unknown][] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private window?: { from: number; to: number };
  private single = false;
  private headCount = false;
  private readonly rows: () => Row[];

  // 생성자 매개변수 속성(`private readonly rows`)은 Node가 타입만 지우고 실행할 수 없어서 풀어 써요 (D48).
  constructor(rows: () => Row[]) {
    this.rows = rows;
  }

  select(_columns: string, options?: { count?: string; head?: boolean }): this {
    this.headCount = Boolean(options?.head);
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  /** from부터 to까지 (둘 다 포함, 0부터 세요) */
  range(from: number, to: number): this {
    this.window = { from, to };
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }

  private run(): Result {
    let rows = this.rows().filter((row) =>
      this.filters.every(([column, value]) => row[column] === value),
    );
    if (this.sorts.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.sorts) {
          const order = compare(a[column], b[column]) * (ascending ? 1 : -1);
          if (order !== 0) return order;
        }
        return 0;
      });
    }
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1);
    if (this.headCount) return { data: null, error: null, count: rows.length };
    if (this.single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function notImplementedRpc(name: string): Result {
  return {
    data: null,
    error: { message: `가짜 DB에 ${name} 함수가 없어요`, code: 'PGRST202' },
  };
}

/** 표 행 만들기 도우미: 기준 하나를 standards / standard_versions / standards_latest 행으로 */
export function standardRows(input: {
  id: string;
  area: string;
  versions: {
    title: string;
    value: string;
    /** 비우면 { code: ['src/**'] }, null이면 적용 범위 없음 */
    scope?: {
      code: string[];
      api: string[];
      screen: string[];
      doc?: string[];
    } | null;
    /** 비우면 기준의 alwaysOn과 같아요 */
    alwaysOn?: boolean;
  }[];
  alwaysOn?: boolean;
  locked?: boolean;
}): { standard: Row; versions: Row[]; latest: Row } {
  const versions = input.versions.map((version, index) => ({
    standard_id: input.id,
    version: index + 1,
    title: version.title,
    value: version.value,
    reason: '테스트 이유',
    always_on: version.alwaysOn ?? input.alwaysOn ?? false,
    evidence: '테스트 근거',
    scope:
      version.scope === null
        ? null
        : {
            doc: [],
            ...(version.scope ?? { code: ['src/**'], api: [], screen: [] }),
          },
    changed_by: 'tester',
    changed_by_actor: 'human',
    ai_detected: false,
    is_revert: false,
    reverted_to_version: null,
    source: 'meeting',
    created_at: `2026-10-0${index + 1}T00:00:00+00:00`,
  }));
  const current = versions.at(-1)!;
  const standard = {
    id: input.id,
    area: input.area,
    title: current.title,
    always_on: input.alwaysOn ?? false,
    status: 'active',
    replaced_by: null,
    deprecated_reason: null,
    locked: input.locked ?? false,
    current_version: versions.length,
  };
  const {
    standard_id: _standardId,
    version: _version,
    title: _title,
    created_at,
    ...latestVersion
  } = current;
  return {
    standard,
    versions,
    latest: { ...standard, ...latestVersion, version_created_at: created_at },
  };
}
