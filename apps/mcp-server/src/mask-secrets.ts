/**
 * `claude mcp get` 결과처럼 사람이 볼 글에서 토큰을 가려요 (`pnpm mcp:status`가 써요).
 *
 * 왜 따로 두나요: `claude mcp get haribo`는 등록할 때 넣은 `Authorization: Bearer <팀 토큰>`을 그대로 찍어요.
 * 화면 공유나 채널에 붙인 결과로 토큰이 새지 않게, 보여 주기 전에 값을 가려요.
 * 가리는 것은 값 전체예요. 앞뒤 몇 글자도 남기지 않고 길이만 알려 줘요.
 */

/** 값을 가릴 헤더 이름. 대소문자는 가리지 않아요 */
const SECRET_HEADER =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|[\w-]*-(token|key|secret))$/i;

/** 주소 쿼리에서 값을 가릴 이름 (Cloud Build 웹훅 주소의 key, secret 등) */
const SECRET_QUERY =
  /([?&](?:key|secret|token|access_token|api_key|apikey)=)[^&\s]+/gi;

/** 헤더 한 줄: "    Authorization: Bearer abc" (앞 공백, 이름, 값) */
const HEADER_LINE = /^(\s*)([A-Za-z][\w-]*)(:\s*)(.*)$/;

export interface MaskResult {
  /** 토큰을 가린 글 */
  text: string;
  /** 가린 값 수 */
  masked: number;
  /** 토큰 자리에 `<팀 토큰>` 같은 자리 표시 글자가 그대로 들어간 헤더 이름 */
  placeholders: string[];
}

export function maskSecrets(text: string): MaskResult {
  let masked = 0;
  const placeholders: string[] = [];
  const lines = text.split('\n').map((line) => {
    const header = HEADER_LINE.exec(line);
    if (header) {
      const [, indent = '', name = '', colon = '', value = ''] = header;
      if (SECRET_HEADER.test(name)) {
        const { shown, secret } = splitScheme(value.trim());
        if (/[<>]|\s/.test(secret)) placeholders.push(name);
        masked += 1;
        return `${indent}${name}${colon}${shown}${hidden(secret)}`;
      }
      // 이름 헤더는 퍼센트 인코딩돼 있어서, 누구로 등록됐는지 읽을 수 있게 풀어 보여 줘요
      if (/^x-sil-user$/i.test(name)) {
        const decoded = decodeName(value.trim());
        return decoded && decoded !== value.trim()
          ? `${line} (${decoded})`
          : line;
      }
    }
    return line.replace(SECRET_QUERY, (_all, key: string) => {
      masked += 1;
      return `${key}(가림)`;
    });
  });
  return { text: lines.join('\n'), masked, placeholders };
}

/** "Bearer abc" → 앞의 방식(Bearer)은 남기고 뒤 값만 가려요 */
function splitScheme(value: string): { shown: string; secret: string } {
  const m = /^(Bearer|Basic|Token)(?:\s+(.*))?$/i.exec(value);
  return m
    ? { shown: `${m[1]} `, secret: m[2] ?? '' }
    : { shown: '', secret: value };
}

function hidden(secret: string): string {
  return secret ? `(가림, ${[...secret].length}자)` : '(비어 있음)';
}

function decodeName(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
