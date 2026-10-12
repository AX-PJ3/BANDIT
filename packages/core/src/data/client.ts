/**
 * 데이터베이스(Supabase) 연결이에요 (SIL-14). 브라우저(웹 앱)와 Node(MCP 서버, 명령어) 모두에서 돌아요 (D50).
 *
 * - 모든 패키지는 DB를 직접 부르지 않고 이 폴더의 함수(standards.ts 등)를 거쳐요 (SIL-17).
 * - 공용 키(publishable)로 연결해요. 이 키로는 읽기와 저장 함수 호출만 되고, 표에 직접 쓰거나 지울 수 없어요 (SIL-18).
 *   그래서 웹 앱 화면에 넣어도 돼요. 규칙은 supabase/migrations의 SQL에 있어요.
 * - 연결은 두 가지 길로 만들어요.
 *   - 웹 앱: 시작할 때 connectDb(주소, 공용 키)를 불러요.
 *   - Node: '@sil/core/node'가 .env를 읽어 처음 getDb()를 부를 때 연결해요 (node/db.ts).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DbNotConfiguredError,
  isSilErrorCode,
  SilError,
  type SilErrorCode,
} from '../errors.ts';

export type DbClient = SupabaseClient;

let client: DbClient | undefined;
let connector: (() => DbClient) | undefined;
let reportError: (message: string, data?: unknown) => void = (
  message,
  data,
) => {
  console.error(`[db] ${message}`, data ?? '');
};

/** 주소와 공용 키로 연결해요. 웹 앱은 시작할 때 한 번 불러요. */
export function connectDb(url: string, publishableKey: string): DbClient {
  client = createClient(url, publishableKey, {
    // 사람별 로그인은 MVP 범위 밖이에요 (SIL-18). 세션을 저장하거나 새로 고치지 않아요.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** 아직 연결이 없을 때 getDb()가 연결을 만드는 방법을 정해요. Node 입구(node/db.ts)가 .env로 연결하게 등록해요. */
export function setDbConnector(next: () => DbClient): void {
  connector = next;
}

/** DB 실패를 어디에 남길지 정해요. 기본은 console.error이고, Node에서는 createLogger('db')로 남겨요. */
export function setDbErrorReporter(
  next: (message: string, data?: unknown) => void,
): void {
  reportError = next;
}

/** 이미 연결했는지 알려 줘요. 연결하지 않고 확인만 해요. */
export function isDbConnected(): boolean {
  return client !== undefined;
}

/** DB 연결을 가져와요. 한 번 만들고 재사용해요. 연결할 방법이 없으면 DbNotConfiguredError를 던져요. */
export function getDb(): DbClient {
  if (client) return client;
  if (!connector) throw new DbNotConfiguredError();
  client = connector();
  return client;
}

/** 테스트에서 가짜 클라이언트를 끼울 때만 써요. undefined를 넣으면 원래대로 돌아가요. */
export function setDbForTesting(next: DbClient | undefined): void {
  client = next;
}

/** supabase-js가 돌려주는 에러 모양 (PostgrestError) */
export interface DbErrorLike {
  message: string;
  code?: string | null;
  hint?: string | null;
  details?: string | null;
}

/** 데이터베이스 함수가 hint로 보내는 코드. 이 코드면 message를 그대로 AI에게 넘겨요. */
const RAISED_BY_DB = new Set<SilErrorCode>([
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'STANDARD_LOCKED',
  'VERSION_CONFLICT',
  'ALWAYS_ON_LIMIT',
  'FORBIDDEN',
  'PENDING_CLOSED',
  'CHANGE_LIMIT',
]);

/**
 * DB 에러를 우리 에러로 바꿔요.
 * 데이터베이스 함수가 거절한 것(hint에 코드)은 문구 그대로, 나머지는 무엇을 확인하면 되는지 알려 줘요.
 */
export function toSilError(error: DbErrorLike): SilError {
  if (isSilErrorCode(error.hint) && RAISED_BY_DB.has(error.hint)) {
    return new SilError(error.hint, error.message);
  }
  if (error.code === '42501') {
    return new SilError(
      'FORBIDDEN',
      '이 키로는 할 수 없는 일이에요. 공용 키로는 읽기와 저장 함수(save_standard 등)만 쓸 수 있어요.',
    );
  }
  // PGRST202: 함수 없음, PGRST205·42P01: 표 없음 → 스키마를 아직 올리지 않았어요
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    error.code === '42P01'
  ) {
    reportError('DB에 위키 스키마가 없어요', {
      code: error.code,
      message: error.message,
    });
    return new SilError(
      'DB_ERROR',
      '데이터베이스에 위키 표나 함수가 없어요. supabase/migrations를 Supabase에 올렸는지 확인해 주세요.',
    );
  }
  if (
    /fetch failed|failed to fetch|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network/i.test(
      error.message,
    )
  ) {
    reportError('DB에 연결하지 못했어요', {
      message: error.message,
      details: error.details,
    });
    return new SilError(
      'DB_ERROR',
      '데이터베이스에 연결하지 못했어요 (주소, 키, 인터넷, Supabase 프로젝트가 멈춰 있지 않은지 확인). 바뀐 결정 사항이 없다고 여기지 마세요.',
    );
  }
  reportError('DB 요청 실패', error);
  return new SilError(
    'DB_ERROR',
    `데이터베이스 요청이 실패했어요: ${error.message}`,
  );
}

/** 서버가 켜질 때, ping, 웹 앱 첫 화면에서 DB에 닿는지 확인해요. 실패해도 던지지 않아요. */
export async function checkDbConnection(): Promise<
  { ok: true; standardCount: number } | { ok: false; message: string }
> {
  try {
    const { count, error } = await getDb()
      .from('standards')
      .select('id', { count: 'exact', head: true });
    if (error) return { ok: false, message: toSilError(error).message };
    return { ok: true, standardCount: count ?? 0 };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
