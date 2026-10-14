/**
 * 로그는 항상 stderr로 써요.
 *
 * 왜: MCP 서버는 stdout을 Claude Code와 주고받는 통로로 써요. 로그가 stdout에 섞이면 연결이 끊겨요.
 * 명령어(CLI)에서 사용자에게 보여 줄 결과는 console.log로, 진행 상황·디버그는 이 로거로 남겨요.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const rank: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): Level {
  const level = process.env.LOG_LEVEL;
  return level === 'debug' || level === 'warn' || level === 'error'
    ? level
    : 'info';
}

export interface Logger {
  debug(message: string, extra?: unknown): void;
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

/** scope에는 패키지나 기능 이름을 넣어요. 예: createLogger('mcp') */
export function createLogger(scope: string): Logger {
  const write = (level: Level, message: string, extra?: unknown) => {
    if (rank[level] < rank[currentLevel()]) return;
    const tail = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
    process.stderr.write(
      `${new Date().toISOString()} ${level} [${scope}] ${message}${tail}\n`,
    );
  };
  return {
    debug: (message, extra) => write('debug', message, extra),
    info: (message, extra) => write('info', message, extra),
    warn: (message, extra) => write('warn', message, extra),
    error: (message, extra) => write('error', message, extra),
  };
}
