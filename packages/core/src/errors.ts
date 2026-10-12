/**
 * 팀 공통 에러예요.
 * - 코드에서는 `code`로 분기해요 (문구가 바뀌어도 분기가 깨지지 않게).
 * - `message`는 사람이 읽는 한국어로 써요. MCP 도구는 이 문구를 그대로 AI에게 돌려줘요.
 */
export const SIL_ERROR_CODES = [
  'DB_NOT_CONFIGURED',
  'NOT_IMPLEMENTED',
  'INVALID_ENV',
  // 아래는 데이터베이스 함수가 거절할 때 hint로 보내는 코드예요 (supabase/migrations).
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'STANDARD_LOCKED',
  'VERSION_CONFLICT',
  'ALWAYS_ON_LIMIT',
  'FORBIDDEN',
  // 이미 답했거나 닫힌 확인할 변경에 또 답할 때. 화면은 알림만 조용히 닫으면 돼요 (notify.answer.one-place)
  'PENDING_CLOSED',
  // PR에서 찾은 변경이 하루에 두 번 넘게 같은 기준을 바꾸려 할 때. 사람에게 물어요 (detect.safety.repeat-limit)
  'CHANGE_LIMIT',
  'DB_ERROR',
] as const;

export type SilErrorCode = (typeof SIL_ERROR_CODES)[number];

export function isSilErrorCode(value: unknown): value is SilErrorCode {
  return (
    typeof value === 'string' &&
    (SIL_ERROR_CODES as readonly string[]).includes(value)
  );
}

export class SilError extends Error {
  readonly code: SilErrorCode;

  constructor(code: SilErrorCode, message: string) {
    super(message);
    this.name = 'SilError';
    this.code = code;
  }
}

/** 데이터베이스 주소나 키가 .env에 없을 때 */
export class DbNotConfiguredError extends SilError {
  constructor() {
    super(
      'DB_NOT_CONFIGURED',
      '데이터베이스가 아직 연결되지 않았어요. 서버의 .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 채워 주세요.',
    );
  }
}

/** 자리만 만들어 둔 기능을 부를 때. 어느 이슈에서 만드는지 알려 줘요. */
export class NotImplementedError extends SilError {
  constructor(what: string, issue: string) {
    super(
      'NOT_IMPLEMENTED',
      `${what}은(는) 아직 만들지 않았어요. 담당 이슈: ${issue}`,
    );
  }
}

export function isSilError(error: unknown): error is SilError {
  return error instanceof SilError;
}
