/**
 * HTTPS 주소는 누구나 부를 수 있어서, 팀 토큰이 있는 요청만 받아요.
 *
 * - 토큰은 팀마다 하나씩 (SIL_MCP_TOKENS='haribo:…,team-b:…'). 한 팀 토큰이 새면 그 팀 것만 바꾸면 돼요.
 * - 사람별 로그인은 MVP 범위 밖이에요 (SIL-18). 누가 불렀는지는 X-Sil-User 헤더(사람 이름)로만 받아서 "고친 사람"으로 남겨요.
 * - 토큰을 하나도 넣지 않으면 내 컴퓨터(localhost)에서 온 요청만 받아요. 실수로 토큰 없이 올려도 밖에서는 못 써요.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  localhostAllowedHostnames,
  validateHostHeader,
} from '@modelcontextprotocol/server';
import { SilError } from '@sil/core';

export interface TokenEntry {
  /** 팀 이름. 로그와 "고친 사람"(X-Sil-User가 없을 때)에 남아요 */
  name: string;
  digest: Buffer;
}

export type AuthResult =
  { ok: true; client: string } | { ok: false; response: Response };

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const MIN_TOKEN_LENGTH = 24;
const USER_MAX_LENGTH = 200;

export function parseTokens(raw: string | undefined): TokenEntry[] {
  if (!raw) return [];
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const colon = entry.indexOf(':');
      const name = colon > 0 ? entry.slice(0, colon).trim() : '';
      const token = colon > 0 ? entry.slice(colon + 1).trim() : '';
      if (!NAME_PATTERN.test(name)) {
        throw new SilError(
          'INVALID_ENV',
          "SIL_MCP_TOKENS는 '이름:토큰'을 쉼표로 이어요. 이름은 영어 소문자, 숫자, -만 써요. 예: haribo:토큰,team-b:토큰",
        );
      }
      if (token.length < MIN_TOKEN_LENGTH) {
        throw new SilError(
          'INVALID_ENV',
          `SIL_MCP_TOKENS의 '${name}' 토큰이 너무 짧아요 (${MIN_TOKEN_LENGTH}자 이상). 새로 만들기: pnpm mcp:token`,
        );
      }
      return { name, digest: sha256(token) };
    });
  const names = entries.map((entry) => entry.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) {
    throw new SilError(
      'INVALID_ENV',
      `SIL_MCP_TOKENS에 '${duplicate}' 이름이 두 번 있어요.`,
    );
  }
  return entries;
}

export function authenticate(
  request: Request,
  tokens: TokenEntry[],
): AuthResult {
  if (tokens.length === 0) {
    if (
      validateHostHeader(
        request.headers.get('host'),
        localhostAllowedHostnames(),
      ).ok
    ) {
      return { ok: true, client: 'local' };
    }
    return reject(
      403,
      'SIL_MCP_TOKENS가 비어 있어서 이 서버는 내 컴퓨터(localhost)에서 온 요청만 받아요. 서버 환경 변수에 팀 토큰을 넣어 주세요.',
    );
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(
    request.headers.get('authorization') ?? '',
  );
  if (match?.[1]) {
    const digest = sha256(match[1]);
    const found = tokens.find((entry) => timingSafeEqual(entry.digest, digest));
    if (found) return { ok: true, client: found.name };
  }
  return reject(
    401,
    '토큰이 없거나 맞지 않아요. Claude Code에 등록할 때 --header "Authorization: Bearer <팀 토큰>"을 넣었는지 확인해 주세요.',
    { 'WWW-Authenticate': 'Bearer realm="haribo"' },
  );
}

/**
 * 누가 불렀는지 (X-Sil-User). 이슈 담당자와 같은 사람 이름이에요 (예: 부건). 없거나 이상하면 null.
 * HTTP 헤더에는 한글을 그대로 넣을 수 없어서, 보내는 쪽(pnpm mcp:register)이 퍼센트 인코딩(%EB%B6%80…)해서 보내요.
 */
export function readUser(request: Request): string | null {
  const raw = request.headers.get('x-sil-user')?.trim();
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw).trim();
  } catch {
    // %가 잘못 들어간 값은 받은 그대로 써요
  }
  if (!value || value.length > USER_MAX_LENGTH || /\p{Cc}/u.test(value))
    return null;
  return value;
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text).digest();
}

function reject(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): AuthResult {
  return {
    ok: false,
    response: Response.json({ error: { message } }, { status, headers }),
  };
}
