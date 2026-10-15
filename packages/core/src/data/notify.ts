/**
 * 이슈, 확인할 변경, 답 읽기·쓰기예요. 터미널 알림, 앱, MCP 알리기 도구가 모두 이 함수만 써요 (SIL-17).
 *
 * - 확인할 변경을 "만드는" 일은 기준을 저장할 때 DB 함수 on_standard_version_saved()가 해요.
 *   여기서는 읽기와 답 저장만 해요.
 * - 답 규칙(두 질문, 관계없다 이유, 한 곳에서 답하면 끝, 받은 사람만)은 DB 함수 save_answer가 지켜요.
 * - 불러오지 못하면 빈 목록 대신 에러를 던져요. 실패를 "변경 없음"으로 보여 주면 안 돼요 (notify.error.not-empty).
 */
import { z } from 'zod';
import { SilError } from '../errors.ts';
import { isOpenPendingCheck } from '../rules.ts';
import type {
  AffectedCheck,
  AnswerRecord,
  Issue,
  PendingCheck,
  PendingCheckStatus,
  SaveAnswerInput,
  SaveAnswerResult,
  SaveReflectedInput,
  SaveReflectedResult,
} from '../types/index.ts';
import { getDb, toSilError } from './client.ts';
import { readAllRows } from './standards.ts';

const pendingStatusSchema = z.enum([
  'pending',
  'answered',
  'superseded',
  'auto_closed',
]);
const issueStatusSchema = z.enum(['in_progress', 'done']);
const channelSchema = z.enum(['terminal', 'app']);

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

async function callFunction<T>(
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await getDb().rpc(name, args);
  if (error) throw toSilError(error);
  return parseRows(schema, data, `${name} 결과`);
}

// ---------------------------------------------------------------------------
// 이슈
// ---------------------------------------------------------------------------

const issueRowSchema = z.object({
  key: z.string(),
  title: z.string(),
  assignee: z.string().nullable(),
  status: issueStatusSchema,
});
const linkRowSchema = z.object({
  issue_key: z.string(),
  standard_id: z.string(),
});

/** 이슈와 연결된 기준 목록. 연결이 없는 이슈는 standardIds가 비어 있어요 (화면은 "근거 없음", notify.link.no-guess) */
export async function listIssues(): Promise<Issue[]> {
  const [issues, links] = await Promise.all([
    readAllRows('issues', ['key']),
    readAllRows('issue_standards', ['issue_key', 'standard_id']),
  ]);
  const byIssue = new Map<string, string[]>();
  for (const link of parseRows(
    linkRowSchema.array(),
    links,
    '이슈와 결정 사항 연결',
  )) {
    byIssue.set(link.issue_key, [
      ...(byIssue.get(link.issue_key) ?? []),
      link.standard_id,
    ]);
  }
  return parseRows(issueRowSchema.array(), issues, '이슈 목록').map((row) => ({
    key: row.key,
    title: row.title,
    assignee: row.assignee,
    status: row.status,
    standardIds: byIssue.get(row.key) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// 확인할 변경
// ---------------------------------------------------------------------------

const pendingRowSchema = z.object({
  id: z.string(),
  standard_id: z.string(),
  version: z.number().int(),
  issue_key: z.string(),
  recipient: z.string().nullable(),
  status: pendingStatusSchema,
  last_seen_version: z.number().int().nullable(),
  created_at: z.string(),
  closed_at: z.string().nullable(),
  reflected: z.boolean(),
  reflected_at: z.string().nullable(),
});

export interface PendingCheckQuery {
  /** 받는 사람 이름. 비우면 모두 */
  recipient?: string;
  /** 'open'이면 아직 답을 기다리는 것(대기)만. 기본 'open' */
  status?: 'open' | 'all' | PendingCheckStatus[];
}

/** 확인할 변경 목록 (오래된 것부터). 터미널은 이 순서로 하나씩 보여 줘요 (notify.terminal.one-change). */
export async function listPendingChecks(
  query: PendingCheckQuery = {},
): Promise<PendingCheck[]> {
  let request = getDb().from('pending_checks').select('*');
  if (query.recipient) request = request.eq('recipient', query.recipient);
  const { data, error } = await request.order('created_at');
  if (error) throw toSilError(error);
  const status = query.status ?? 'open';
  return parseRows(pendingRowSchema.array(), data, '확인할 변경 목록')
    .filter((row) =>
      status === 'all'
        ? true
        : status === 'open'
          ? isOpenPendingCheck(row.status)
          : status.includes(row.status),
    )
    .map((row) => ({
      id: row.id,
      standardId: row.standard_id,
      version: row.version,
      issueKey: row.issue_key,
      recipient: row.recipient,
      status: row.status,
      lastSeenVersion: row.last_seen_version,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      reflected: row.reflected,
      reflectedAt: row.reflected_at,
    }));
}

export interface WatchPendingChecksInput {
  /** 받는 사람 이름. 이 사람의 확인할 변경이 생기거나 바뀔 때만 알려 줘요 */
  recipient: string;
  /** 바뀌었을 때 불러요. 무엇이 바뀌었는지는 넘기지 않아요. 목록을 다시 읽어요 */
  onChange: () => void;
  /** 구독이 끊기거나 연결하지 못했을 때 불러요. 끊긴 것을 "변경 없음"처럼 숨기지 않아요 (notify.error.not-empty) */
  onError?: (message: string) => void;
}

/**
 * 확인할 변경(pending_checks)이 생기거나 바뀌면 알려 주는 구독이에요 (app.notify.realtime).
 * 웹 앱 창이 열려 있을 때 OS 알림을 띄우는 데 써요. 돌려준 함수를 부르면 구독을 끊어요.
 * DB 쪽 설정(Realtime 발행)은 20261009200000_wiki_compat.sql에 있어요.
 */
export function watchPendingChecks(input: WatchPendingChecksInput): () => void {
  const db = getDb();
  const channel = db
    .channel(`pending_checks:${input.recipient}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pending_checks',
        filter: `recipient=eq.${input.recipient}`,
      },
      () => input.onChange(),
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        input.onError?.(
          `새 확인할 변경을 바로 받지 못하고 있어요 (${error?.message ?? status}). 새로 고치면 다시 연결해요.`,
        );
      }
    });
  return () => {
    void db.removeChannel(channel);
  };
}

/**
 * 반영함을 켜거나 꺼요 (save_reflected, data.pending.reflected).
 * 받은 사람만, 답한 확인할 변경에만 돼요. 표시를 풀어도 이슈를 다시 열지 않아요 (notify.check.reflected).
 */
export function saveReflected(
  input: SaveReflectedInput,
): Promise<SaveReflectedResult> {
  return callFunction(
    'save_reflected',
    {
      p_pending_check_id: input.pendingCheckId,
      p_marked_by: input.markedBy,
      p_reflected: input.reflected,
    },
    z.object({
      pendingCheckId: z.string(),
      reflected: z.boolean(),
      reflectedAt: z.string().nullable(),
    }),
  );
}

// ---------------------------------------------------------------------------
// 답
// ---------------------------------------------------------------------------

/**
 * 답을 저장해요 (save_answer). 이미 다른 곳에서 답했으면 PENDING_CLOSED를 던져요.
 * 그때 화면은 에러 대신 알림만 조용히 닫으면 돼요 (notify.answer.one-place).
 */
export function saveAnswer(input: SaveAnswerInput): Promise<SaveAnswerResult> {
  return callFunction(
    'save_answer',
    {
      p_pending_check_id: input.pendingCheckId,
      p_answered_by: input.answeredBy,
      p_affected: input.affected,
      p_known: input.known ?? null,
      p_unaffected_reason: input.unaffectedReason ?? null,
      p_rework_note: input.reworkNote ?? null,
      p_channel: input.channel,
      p_elapsed_seconds: input.elapsedSeconds ?? null,
      p_reopen_issue: input.reopenIssue ?? false,
    },
    z.object({
      answerId: z.string(),
      pendingCheckId: z.string(),
      issueKey: z.string(),
      issueStatus: issueStatusSchema,
      issueReopened: z.boolean(),
    }),
  );
}

const answerRecordRowSchema = z.object({
  answer_id: z.string(),
  answered_at: z.string(),
  standard_id: z.string(),
  version: z.number().int(),
  previous_value: z.string().nullable(),
  value: z.string(),
  changed_by: z.string().nullable(),
  changed_by_actor: z.enum(['ai', 'human']),
  ai_detected: z.boolean(),
  evidence: z.string().nullable(),
  issue_key: z.string(),
  answered_by: z.string().nullable(),
  affected: z.boolean(),
  known: z.boolean().nullable(),
  elapsed_seconds: z.number().int().nullable(),
  unaffected_reason: z.string().nullable(),
  rework_note: z.string().nullable(),
  channel: channelSchema,
});

/** 응답 기록 전체 (답한 순). `sil export`가 14칸 표로 바꿔요 (data.response.columns). */
export async function listAnswerRecords(): Promise<AnswerRecord[]> {
  const rows = await readAllRows('answer_records', [
    'answered_at',
    'answer_id',
  ]);
  return parseRows(answerRecordRowSchema.array(), rows, '응답 기록').map(
    (row) => ({
      answerId: row.answer_id,
      answeredAt: row.answered_at,
      standardId: row.standard_id,
      version: row.version,
      previousValue: row.previous_value,
      value: row.value,
      changedBy: row.changed_by,
      changedByActor: row.changed_by_actor,
      aiDetected: row.ai_detected,
      evidence: row.evidence,
      issueKey: row.issue_key,
      answeredBy: row.answered_by,
      affected: row.affected,
      known: row.known,
      elapsedSeconds: row.elapsed_seconds,
      unaffectedReason: row.unaffected_reason,
      reworkNote: row.rework_note,
      channel: row.channel,
    }),
  );
}

const affectedRowSchema = z.object({
  answered_by: z.string().nullable(),
  standard_id: z.string(),
  version: z.number().int(),
  issue_key: z.string(),
  issue_status: issueStatusSchema,
  answered_at: z.string(),
});

/**
 * 이 사람이 "관계있다"고 답한 확인할 변경 (최근 것부터).
 * MCP가 다음 세션부터 이 기준을 작업 맥락에 넣어요 (notify.answer.next-run-context).
 */
export async function listAffectedChecks(
  answeredBy: string,
): Promise<AffectedCheck[]> {
  const { data, error } = await getDb()
    .from('affected_checks')
    .select('*')
    .eq('answered_by', answeredBy)
    .order('answered_at', { ascending: false });
  if (error) throw toSilError(error);
  return parseRows(affectedRowSchema.array(), data, '관계있다 답').map(
    (row) => ({
      answeredBy: row.answered_by,
      standardId: row.standard_id,
      version: row.version,
      issueKey: row.issue_key,
      issueStatus: row.issue_status,
      answeredAt: row.answered_at,
    }),
  );
}
