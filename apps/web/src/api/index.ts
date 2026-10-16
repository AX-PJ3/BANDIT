/**
 * 화면은 데이터를 이 `api`로만 가져와요.
 *
 * - 저장소 .env(또는 배포한 곳의 환경 변수)에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY가 있으면: 진짜 데이터 (database.ts)
 * - 없으면: 예시 데이터 (mock.ts)
 *
 * 그래서 화면 담당은 DB 없이도 화면을 만들 수 있고, 나중에 진짜 데이터가 붙어도 화면 코드는 바꾸지 않아요.
 * 두 값은 vite.config.ts가 빌드할 때 넣어요. 다른 환경 변수는 화면에 들어가지 않아요.
 *
 * `initialMe`는 처음 열 때 화면을 보는 사람 이름이에요 (me.ts). 예시 데이터로 열면 고른 이름이 없어도 예시를 받는 사람으로 열려요.
 * 열린 뒤에는 메뉴 아래 프로필에서 바꿔요 (App.tsx).
 */
import { readMe } from '../me.ts';
import { createDatabaseApi } from './database.ts';
import { MOCK_ME, mockApi } from './mock.ts';
import type { SilApi } from './types.ts';

const url = import.meta.env.SIL_SUPABASE_URL;
const publishableKey = import.meta.env.SIL_SUPABASE_PUBLISHABLE_KEY;

export const isMock = !url || !publishableKey;
export const api: SilApi = isMock
  ? mockApi
  : createDatabaseApi(url, publishableKey);

export const initialMe: string | null = readMe(isMock ? MOCK_ME : null);
