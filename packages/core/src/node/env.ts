import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SilError } from '../errors.ts';
import { findRepoRoot } from './repo-root.ts';

/**
 * 환경 변수 목록이에요. 새 키가 필요하면:
 * 1. 아래 스키마에 한 줄 추가 (설명 주석과 담당 이슈 번호 포함)
 * 2. 저장소 맨 위 .env.example에 같은 이름 추가
 *
 * 왜 한곳에서 검사하나요: 키가 빠졌을 때 "어디선가 undefined"로 터지지 않고,
 * 켜는 순간 "어떤 키가 왜 필요한지" 한국어로 알려 주려고요.
 *
 * 누가 무엇을 채우나요:
 * - 서버를 켜는 곳(호스팅 또는 정민님 컴퓨터): SUPABASE_*, SIL_MCP_TOKENS, SIL_MCP_HOST, PORT
 * - 팀원: SIL_MCP_URL, SIL_MCP_TOKEN (pnpm mcp:register가 Claude Code에 등록할 때만 써요)
 */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalText = z.preprocess(
  blankToUndefined,
  z.string().trim().optional(),
);
const optionalUrl = z.preprocess(
  blankToUndefined,
  z.url({ protocol: /^https?$/ }).optional(),
);

const EnvSchema = z
  .object({
    /** Supabase 프로젝트 주소. 예: https://abcd.supabase.co (SIL-14). 비면 DB 없이 켜져요 */
    SUPABASE_URL: optionalUrl,
    /** Supabase 공용 키(sb_publishable_…). 읽기와 저장 함수만 부를 수 있고, 지우기는 막혀 있어요 (SIL-18) */
    SUPABASE_PUBLISHABLE_KEY: optionalText,
    /**
     * MCP 서버가 받아 줄 토큰. '이름:토큰'을 쉼표로 이어요. 예: haribo:abc…,team-b:def…
     * 비어 있으면 내 컴퓨터(localhost)에서 온 요청만 받아요.
     */
    SIL_MCP_TOKENS: optionalText,
    /** 브라우저에서 MCP 서버를 부를 때 허락할 주소의 호스트 이름(쉼표). 예: MCP Inspector. 보통 비워 둬요 */
    SIL_MCP_ALLOWED_ORIGINS: optionalText,
    /** MCP 서버가 열릴 주소. 내 컴퓨터는 127.0.0.1, 호스팅은 0.0.0.0 */
    SIL_MCP_HOST: z.preprocess(
      blankToUndefined,
      z.string().trim().default('127.0.0.1'),
    ),
    /** MCP 서버 포트. 호스팅이 정해 주면 그 값을 써요 */
    PORT: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(0).max(65535).default(3333),
    ),
    /** (팀원) 팀 MCP 서버 주소. 예: https://sil.example.com/mcp */
    SIL_MCP_URL: optionalUrl,
    /** (팀원) 팀 MCP 서버 토큰 (정민님에게 받아요) */
    SIL_MCP_TOKEN: optionalText,
    LOG_LEVEL: z.preprocess(
      blankToUndefined,
      z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    ),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_PUBLISHABLE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: [env.SUPABASE_URL ? 'SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_URL'],
        message:
          'SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY는 둘 다 채우거나 둘 다 비워 주세요.',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** 테스트하기 쉽게 "읽기"와 "검사"를 나눠 두었어요. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new SilError(
      'INVALID_ENV',
      `.env 값이 올바르지 않아요.\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * 저장소 맨 위의 .env를 읽고 검사해요. 한 번 읽으면 기억해 둬요.
 * 이미 들어 있는 환경 변수(호스팅 설정 등)가 .env보다 앞서요.
 */
export function loadEnv(): Env {
  if (cached) return cached;
  const envPath = join(findRepoRoot(), '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  cached = parseEnv(process.env);
  return cached;
}
