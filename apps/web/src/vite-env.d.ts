/// <reference types="vite/client" />

// vite.config.ts가 빌드할 때 넣는 값이에요. 이 두 값 말고 다른 환경 변수는 화면에 들어가지 않아요.
interface ImportMetaEnv {
  /** 저장소 .env의 SUPABASE_URL. 없으면 빈 문자열이고, 예시 데이터로 열려요 */
  readonly SIL_SUPABASE_URL: string;
  /** 저장소 .env의 SUPABASE_PUBLISHABLE_KEY (공용 키). 없으면 빈 문자열이에요 */
  readonly SIL_SUPABASE_PUBLISHABLE_KEY: string;
}

/** package.json의 version */
declare const __APP_VERSION__: string;
