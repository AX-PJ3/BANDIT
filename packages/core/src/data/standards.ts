/**
 * 위키(기준, 기준 버전) 읽기·쓰기, 이슈 저장, 충돌 보류예요. MCP 도구, 앱, 바뀐 기준 찾기가 모두 이 함수만 써요 (SIL-17).
 *
 * - 읽기는 표와 뷰(standards_latest)를 바로 읽어요. 공용 키로는 읽기만 허락돼 있어요.
 * - 쓰기는 데이터베이스 함수(save_standard 등)를 불러요. 형식 검사, 잠금, 버전 충돌은 함수 안에서 해요.
 *   그래서 여기서는 입력을 함수 인자 모양으로 바꾸고, 결과를 우리 타입으로 바꾸기만 해요.
 * - DB가 돌려준 모양은 zod로 한 번 더 확인해요. 스키마와 코드가 어긋나면 엉뚱한 값 대신 바로 알려 줘요.
 */
import { z } from 'zod';
import { formatChangelogLine } from '../changelog.ts';
import { isSilError, SilError } from '../errors.ts';
import type {
  Conflict,
  DeprecateStandardInput,
  DeprecateStandardResult,
  RevertStandardInput,
  SaveIssueInput,
  SaveIssueResult,
  SaveStandardInput,
  SaveStandardResult,
  Standard,
  StandardHistory,
  StandardId,
  StandardSource,
  StandardVersion,
  StandardWithLatest,
} from '../types/index.ts';
import { getDb, toSilError } from './client.ts';

/** 한 번에 읽는 줄 수. Supabase는 기본으로 1,000줄까지만 돌려줘요 */
const PAGE_SIZE = 1000;

// doc(문서)는 v2에서 더한 칸이라, 그 전에 저장된 줄에는 없어요. 없으면 빈 목록으로 읽어요.
const scopeSchema = z.object({
  code: z.array(z.string()),
  api: z.array(z.string()),
  screen: z.array(z.string()),
  doc: z.array(z.string()).default([]),
});

const standardColumns = {
  id: z.string(),
  area: z.string(),
  title: z.string(),
  always_on: z.boolean(),
  status: z.enum(['active', 'deprecated']),
  replaced_by: z.string().nullable(),
  deprecated_reason: z.string().nullable(),
  locked: z.boolean(),
  current_version: z.number().int(),
};

const versionColumns = {
  value: z.string(),
  reason: z.string(),
  evidence: z.string().nullable(),
  scope: scopeSchema.nullable(),
  changed_by: z.string().nullable(),
  changed_by_actor: z.enum(['ai', 'human']),
  ai_detected: z.boolean(),
  is_revert: z.boolean(),
  reverted_to_version: z.number().int().nullable(),
  source: z.enum(['code', 'ai_chat', 'figma', 'meeting', 'slack', 'wiki']),
};

const standardRowSchema = z.object(standardColumns);
const latestRowSchema = z.object({
  ...standardColumns,
  ...versionColumns,
  version_created_at: z.string(),
});
// 항상 적용은 버전 표에도 있어요 (20261009300000). 목록 뷰는 기준 표의 always_on(= 최신 버전 값)을 써요.
const versionRowSchema = z.object({
  standard_id: z.string(),
  version: z.number().int(),
  title: z.string(),
  always_on: z.boolean(),
  ...versionColumns,
  created_at: z.string(),
});
const sourceSchema = versionColumns.source;

type StandardRow = z.infer<typeof standardRowSchema>;

function parseRows<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new SilError(
      'DB_ERROR',
      `${what}의 모양이 코드와 달라요. 최신 supabase/migrations를 올렸는지 확인해 주세요.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

function fromStandardRow(row: StandardRow): Standard {
  return {
    id: row.id,
    area: row.area,
    title: row.title,
    alwaysOn: row.always_on,
    status: row.status,
    replacedBy: row.replaced_by,
    deprecatedReason: row.deprecated_reason,
    locked: row.locked,
  };
}

function fromVersionRow(
  row: z.infer<typeof versionRowSchema>,
): StandardVersion {
  return {
    standardId: row.standard_id,
    version: row.version,
    title: row.title,
    value: row.value,
    reason: row.reason,
    alwaysOn: row.always_on,
    evidence: row.evidence,
    scope: row.scope,
    changedBy: row.changed_by,
    changedByActor: row.changed_by_actor,
    aiDetected: row.ai_detected,
    isRevert: row.is_revert,
    revertedToVersion: row.reverted_to_version,
    source: row.source,
    createdAt: row.created_at,
  };
}

function fromLatestRow(
  row: z.infer<typeof latestRowSchema>,
): StandardWithLatest {
  return {
    standard: fromStandardRow(row),
    latest: fromVersionRow({
      ...row,
      standard_id: row.id,
      version: row.current_version,
      created_at: row.version_created_at,
    }),
  };
}

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------

/** 기준마다 최신 버전을 붙여서 가져와요. 기본은 사용 중인 기준만이에요. */
export async function listStandards(
  options: { includeDeprecated?: boolean } = {},
): Promise<StandardWithLatest[]> {
  let query = getDb().from('standards_latest').select('*');
  if (!options.includeDeprecated) query = query.eq('status', 'active');
  const { data, error } = await query.order('id');
  if (error) throw toSilError(error);
  return parseRows(latestRowSchema.array(), data, '결정 사항 목록').map(
    fromLatestRow,
  );
}

/** 기준 하나와 버전 기록을 가져와요. 없으면 null이에요. */
export async function getStandardHistory(
  id: StandardId,
): Promise<StandardHistory | null> {
  const db = getDb();
  const [standardResult, versionsResult] = await Promise.all([
    db.from('standards').select('*').eq('id', id).maybeSingle(),
    db
      .from('standard_versions')
      .select('*')
      .eq('standard_id', id)
      .order('version', { ascending: false }),
  ]);
  if (standardResult.error) throw toSilError(standardResult.error);
  if (versionsResult.error) throw toSilError(versionsResult.error);
  if (!standardResult.data) return null;
  const row = parseRows(
    standardRowSchema,
    standardResult.data,
    `결정 사항 ${id}`,
  );
  return {
    standard: fromStandardRow(row),
    currentVersion: row.current_version,
    versions: parseRows(
      versionRowSchema.array(),
      versionsResult.data,
      `결정 사항 ${id}의 버전`,
    ).map(fromVersionRow),
  };
}

/** 기준 버전 전체 (기준 ID, 버전 순). 내보내기, CHANGELOG 만들기, 백업이 써요. */
export async function listAllVersions(): Promise<StandardVersion[]> {
  const rows = await readAllRows('standard_versions', [
    'standard_id',
    'version',
  ]);
  return parseRows(versionRowSchema.array(), rows, '결정 사항 버전 전체').map(
    fromVersionRow,
  );
}

/**
 * 표 하나를 끝까지 읽어요. Supabase는 한 번에 1,000줄까지만 주니까 나눠서 읽어요.
 * orderBy는 줄 순서가 바뀌지 않게 하는 칸이에요 (보통 기본 키).
 */
export async function readAllRows(
  table: string,
  orderBy: string[],
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = getDb().from(table).select('*');
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw toSilError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// ---------------------------------------------------------------------------
// 쓰기 (데이터베이스 함수)
// ---------------------------------------------------------------------------

async function callFunction<T>(
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await getDb().rpc(name, args);
  if (error) throw toSilError(error);
  return parseRows(schema, data, `${name} 결과`);
}

const saveResultSchema = z.object({
  standardId: z.string(),
  version: z.number().int(),
  isRevert: z.boolean(),
  revertedToVersion: z.number().int().nullable(),
  previousValue: z.string().nullable(),
  savedAt: z.string(),
});

type SavedRow = z.infer<typeof saveResultSchema>;

/**
 * 새 기준을 만들거나 새 버전을 저장해요. 거절되면 SilError(VALIDATION_FAILED, VERSION_CONFLICT 등)를 던져요.
 * 필수 칸(ID, 제목, 값, 이유, 항상 적용) 검사는 데이터베이스 함수가 해요. 빠진 칸을 한 번에 알려 줘요.
 *
 * 그사이 다른 사람이 고쳐서 VERSION_CONFLICT로 거절되면, 이 변경을 버리지 않고 충돌로 보류해 둬요 (detect.conflict.hold).
 * 결과에는 CHANGELOG에 붙일 한 줄(changelogLine)이 들어 있어요 (work.wiki.changelog).
 */
export async function saveStandard(
  input: SaveStandardInput,
): Promise<SaveStandardResult> {
  const source = input.source ?? 'ai_chat';
  const args = {
    p_id: input.id,
    p_title: input.title,
    p_value: input.value,
    p_reason: input.reason,
    p_always_on: input.alwaysOn,
    p_base_version: input.baseVersion,
    p_evidence: input.evidence ?? null,
    p_scope: input.scope ?? null,
    p_area: input.area ?? null,
    p_source: source,
    p_actor: input.changedByActor ?? 'ai',
    p_changed_by: input.changedBy ?? null,
    p_ai_detected: input.aiDetected ?? false,
    p_locked: input.locked ?? null,
  };
  let saved: SavedRow;
  try {
    saved = await callFunction('save_standard', args, saveResultSchema);
  } catch (error) {
    if (
      isSilError(error) &&
      error.code === 'VERSION_CONFLICT' &&
      input.baseVersion > 0
    ) {
      throw await holdConflict(args, error);
    }
    throw error;
  }
  return withChangelogLine(saved, {
    by: input.changedBy ?? null,
    value: input.value.trim(),
    reason: input.reason.trim(),
    source,
  });
}

/** 앞선 버전으로 되돌려요. 되돌림도 새 버전으로 쌓여요. */
export async function revertStandard(
  input: RevertStandardInput,
): Promise<SaveStandardResult> {
  const source = input.source ?? 'ai_chat';
  const saved = await callFunction(
    'revert_standard',
    {
      p_id: input.id,
      p_to_version: input.toVersion,
      p_reason: input.reason,
      p_base_version: input.baseVersion,
      p_evidence: input.evidence ?? null,
      p_source: source,
      p_actor: input.changedByActor ?? 'ai',
      p_changed_by: input.changedBy ?? null,
    },
    saveResultSchema,
  );
  const history = await getStandardHistory(input.id);
  const restored = history?.versions.find(
    (version) => version.version === input.toVersion,
  );
  return withChangelogLine(saved, {
    by: input.changedBy ?? null,
    value: restored?.value ?? `v${input.toVersion}의 값`,
    reason: input.reason.trim(),
    source,
  });
}

function withChangelogLine(
  saved: SavedRow,
  change: {
    by: string | null;
    value: string;
    reason: string;
    source: StandardSource;
  },
): SaveStandardResult {
  return {
    ...saved,
    changelogLine: formatChangelogLine({
      at: saved.savedAt,
      by: change.by,
      standardId: saved.standardId,
      fromVersion: saved.version === 1 ? null : saved.version - 1,
      toVersion: saved.version,
      before: saved.previousValue,
      after: change.value,
      reason: change.reason,
      source: change.source,
      revertedToVersion: saved.revertedToVersion,
    }),
  };
}

/**
 * 저장되지 못한 변경을 충돌로 보류해요. 보류 기록이 실패해도 원래 거절은 그대로 알려요.
 * 지금 버전과 내용이 같으면 충돌이 아니라서 보류하지 않아요.
 */
async function holdConflict(
  args: Record<string, unknown>,
  error: SilError,
): Promise<SilError> {
  const {
    p_always_on: _alwaysOn,
    p_area: _area,
    p_locked: _locked,
    ...holdArgs
  } = args;
  try {
    const held = await callFunction(
      'hold_conflict',
      holdArgs,
      z.object({
        held: z.boolean(),
        conflictId: z.string().nullable(),
        currentVersion: z.number().int(),
      }),
    );
    if (!held.held) return error;
    return new SilError(
      'VERSION_CONFLICT',
      `${error.message} 이 변경은 버리지 않고 충돌로 보류해 두었어요 (보류 번호 ${held.conflictId}). 사람이 정할 때까지 담당자에게 알리지 않아요.`,
    );
  } catch {
    return error;
  }
}

/**
 * 이슈와 기준 연결을 함께 저장해요 (save_issue). 같은 번호가 있으면 제목·담당자·상태를 바꾸고,
 * 연결은 standardIds와 똑같이 맞춰요. 위키에 없는 기준이 있으면 NOT_FOUND로 거절돼요.
 */
export function saveIssue(input: SaveIssueInput): Promise<SaveIssueResult> {
  return callFunction(
    'save_issue',
    {
      p_key: input.key,
      p_title: input.title,
      p_standard_ids: input.standardIds,
      p_assignee: input.assignee,
      p_status: input.status,
    },
    z.object({
      issueKey: z.string(),
      created: z.boolean(),
      standardIds: z.array(z.string()),
      movedChecks: z.number().int(),
    }),
  );
}

/** 기준을 폐기해요. 지우지 않고 상태만 바꿔요. */
export function deprecateStandard(
  input: DeprecateStandardInput,
): Promise<DeprecateStandardResult> {
  return callFunction(
    'deprecate_standard',
    {
      p_id: input.id,
      p_reason: input.reason,
      p_base_version: input.baseVersion,
      p_replaced_by: input.replacedBy ?? null,
      p_actor: input.changedByActor ?? 'ai',
      p_changed_by: input.changedBy ?? null,
    },
    z.object({
      standardId: z.string(),
      status: z.literal('deprecated'),
      replacedBy: z.string().nullable(),
    }),
  );
}

// ---------------------------------------------------------------------------
// 충돌 보류 (detect.conflict.hold)
// ---------------------------------------------------------------------------

const conflictRowSchema = z.object({
  id: z.string(),
  standard_id: z.string(),
  base_version: z.number().int(),
  current_version: z.number().int(),
  title: z.string(),
  value: z.string(),
  reason: z.string().nullable(),
  evidence: z.string().nullable(),
  proposed_by: z.string().nullable(),
  proposed_by_actor: z.enum(['ai', 'human']),
  source: sourceSchema,
  ai_detected: z.boolean(),
  status: z.enum(['held', 'resolved']),
  resolution: z.string().nullable(),
  resolved_by: z.string().nullable(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});

/** 보류된 충돌 목록. 기본은 아직 정리하지 않은 것만이에요 (요약 화면). */
export async function listConflicts(
  options: { includeResolved?: boolean } = {},
): Promise<Conflict[]> {
  let query = getDb().from('conflicts').select('*');
  if (!options.includeResolved) query = query.eq('status', 'held');
  const { data, error } = await query.order('created_at');
  if (error) throw toSilError(error);
  return parseRows(conflictRowSchema.array(), data, '충돌 목록').map((row) => ({
    id: row.id,
    standardId: row.standard_id,
    baseVersion: row.base_version,
    currentVersion: row.current_version,
    title: row.title,
    value: row.value,
    reason: row.reason,
    evidence: row.evidence,
    proposedBy: row.proposed_by,
    proposedByActor: row.proposed_by_actor,
    source: row.source,
    aiDetected: row.ai_detected,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  }));
}

/** 사람이 보류를 정리해요. 어떻게 정했는지(resolution)를 꼭 남겨요. */
export function resolveConflict(input: {
  conflictId: string;
  resolution: string;
  resolvedBy: string | null;
}): Promise<{ conflictId: string; status: 'resolved' }> {
  return callFunction(
    'resolve_conflict',
    {
      p_conflict_id: input.conflictId,
      p_resolution: input.resolution,
      p_resolved_by: input.resolvedBy,
    },
    z.object({ conflictId: z.string(), status: z.literal('resolved') }),
  );
}
