/**
 * Node에서 데이터베이스에 붙는 방법이에요 (SIL-14).
 *
 * - 연결과 읽기·쓰기 함수는 브라우저와 함께 쓰는 '../data/'에 있어요 (D50). 여기서는 Node에서만 하는 일 두 가지를 해요.
 *   - 처음 getDb()를 부를 때 .env의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY로 연결해요. 없으면 DbNotConfiguredError예요.
 *   - DB 실패를 createLogger('db')로 남겨요 (호스팅 로그에서 같은 모양으로 찾게요).
 * - '@sil/core/node'를 가져오면 이 파일이 먼저 실행돼서, MCP 서버와 명령어는 연결을 따로 만들 필요가 없어요.
 */
import {
  connectDb,
  isDbConnected,
  setDbConnector,
  setDbErrorReporter,
} from '../data/client.ts';
import { DbNotConfiguredError } from '../errors.ts';
import type { DataMode } from '../types/index.ts';
import { loadEnv } from './env.ts';
import { createLogger } from './logger.ts';

const log = createLogger('db');

setDbErrorReporter((message, data) => log.error(message, data));
setDbConnector(() => {
  const env = loadEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
    throw new DbNotConfiguredError();
  return connectDb(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
});

export function getDataMode(): DataMode {
  if (isDbConnected()) return 'database';
  const env = loadEnv();
  return env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY ? 'database' : 'none';
}
