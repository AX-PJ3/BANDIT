/**
 * 터미널 알림 hooks를 팀원 PC의 Claude Code 사용자 설정에 까는 부분이에요 (SIL-67). `pnpm mcp:register`가 불러요.
 *
 * 왜 사용자 설정(~/.claude/settings.json)인가요:
 * 팀원은 이 저장소가 아니라 각자 일하는 저장소에서 Claude Code를 켜요. MCP 서버를 사용자 범위로 등록하는 것과 같은 이유예요.
 *
 * 까는 것:
 *   ~/.claude/haribo/hook.mjs     hooks-client/haribo-hook.mjs 복사본 (Node만 있으면 돌아요)
 *   ~/.claude/haribo/config.json  hooks 주소, 팀 토큰, 이름
 *   ~/.claude/settings.json       hooks 세 개. 다른 hooks와 설정은 그대로 두고, 예전에 깐 haribo hooks만 바꿔요
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { SERVER_INFO } from '../server-info.ts';
import type { HookEvent } from './notify-hooks.ts';

/** 설정 파일에서 우리가 깐 hooks를 알아보는 표시. 명령 안의 스크립트 경로예요 */
export const HOOK_SCRIPT_MARKER = 'haribo/hook.mjs';
/** Claude Code hooks 시간 제한(초). 스크립트는 15초 안에 포기해요 */
const HOOK_TIMEOUT_SECONDS = 20;

/** Claude Code hooks 이벤트 이름 → 서버 주소 이벤트 이름, 그리고 matcher */
const HOOK_TABLE: {
  claudeEvent: string;
  event: HookEvent;
  matcher?: string;
}[] = [
  { claudeEvent: 'SessionStart', event: 'session-start', matcher: 'startup' },
  { claudeEvent: 'UserPromptSubmit', event: 'prompt-submit' },
  {
    claudeEvent: 'PostToolUse',
    event: 'after-respond',
    matcher: `mcp__${SERVER_INFO.name}__respond`,
  },
];

interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks: HookCommand[];
}

type Settings = Record<string, unknown> & {
  hooks?: Record<string, HookGroup[]>;
};

/** MCP 주소(…/mcp)에서 hooks 주소(…/hooks)를 만들어요 */
export function hooksUrlFrom(mcpUrl: string): string {
  const url = new URL(mcpUrl);
  url.pathname = `${url.pathname.replace(/\/mcp\/?$/, '').replace(/\/$/, '')}/hooks`;
  url.search = '';
  return url.toString();
}

/**
 * hooks 명령. 경로는 슬래시(/)로 바꾸고 따옴표로 감싸서 Windows(cmd, PowerShell, Git Bash)와 Mac에서 같은 명령이 되게 해요.
 * 이름에 빈칸이 있는 폴더(C:/Users/Hong Gil Dong/…)도 따옴표 덕분에 돼요.
 */
export function hookCommand(scriptPath: string, event: HookEvent): string {
  return `node "${scriptPath.replaceAll('\\', '/')}" ${event}`;
}

function isOurs(hook: HookCommand): boolean {
  return (
    typeof hook?.command === 'string' &&
    hook.command.replaceAll('\\', '/').includes(HOOK_SCRIPT_MARKER)
  );
}

/**
 * 사용자 설정에 haribo hooks 세 개를 넣은 새 설정을 돌려줘요. 원래 설정은 바꾸지 않아요.
 * 예전에 깐 haribo hooks는 지우고 다시 넣어서, 여러 번 실행해도 한 벌만 남아요. 다른 hooks는 그대로 둬요.
 */
export function mergeHooks(settings: Settings, scriptPath: string): Settings {
  const hooks: Record<string, HookGroup[]> = { ...(settings.hooks ?? {}) };
  for (const [claudeEvent, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    hooks[claudeEvent] = groups
      .map((group) => ({
        ...group,
        hooks: (group.hooks ?? []).filter((hook) => !isOurs(hook)),
      }))
      .filter((group) => group.hooks.length > 0);
  }
  for (const { claudeEvent, event, matcher } of HOOK_TABLE) {
    const group: HookGroup = {
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: 'command',
          command: hookCommand(scriptPath, event),
          timeout: HOOK_TIMEOUT_SECONDS,
        },
      ],
    };
    hooks[claudeEvent] = [...(hooks[claudeEvent] ?? []), group];
  }
  return { ...settings, hooks };
}

export interface InstallHooksInput {
  /** 사용자 홈 폴더 (os.homedir()). 테스트에서 임시 폴더를 넣어요 */
  home: string;
  /** hooks 주소 (hooksUrlFrom으로 만든 것) */
  hooksUrl: string;
  /** 팀 토큰. 내 컴퓨터 서버(--local)면 없어요 */
  token?: string | undefined;
  /** 이슈 담당자와 같은 사람 이름 */
  user: string;
  /** hooks-client/haribo-hook.mjs 내용 */
  scriptSource: string;
}

export interface InstallHooksResult {
  scriptPath: string;
  configPath: string;
  settingsPath: string;
  /** 고치기 전 설정을 백업한 곳. 설정 파일이 없었으면 null */
  backupPath: string | null;
}

export function installHooks(input: InstallHooksInput): InstallHooksResult {
  const claudeDir = join(input.home, '.claude');
  const dir = join(claudeDir, 'haribo');
  mkdirSync(dir, { recursive: true });

  const scriptPath = join(dir, 'hook.mjs');
  writeFileSync(scriptPath, input.scriptSource, 'utf8');

  // 토큰이 들어 있어서 나만 읽을 수 있게 해요 (Windows에서는 효과가 없지만 사용자 폴더 안이라 괜찮아요)
  const configPath = join(dir, 'config.json');
  writeFileSync(
    configPath,
    `${JSON.stringify({ hooksUrl: input.hooksUrl, token: input.token ?? null, user: input.user }, null, 2)}\n`,
    'utf8',
  );
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // 권한을 바꿀 수 없는 파일 시스템이면 그대로 둬요
  }

  const settingsPath = join(claudeDir, 'settings.json');
  let settings: Settings = {};
  let backupPath: string | null = null;
  if (existsSync(settingsPath)) {
    const text = readFileSync(settingsPath, 'utf8');
    try {
      settings = text.trim() ? (JSON.parse(text) as Settings) : {};
    } catch {
      // 읽지 못하는 설정을 덮어쓰면 다른 설정이 사라져서, 고치지 않고 멈춰요
      throw new Error(
        `${settingsPath}를 JSON으로 읽지 못했어요. 파일을 고친 뒤 다시 실행해 주세요. (아무것도 바꾸지 않았어요)`,
      );
    }
    backupPath = `${settingsPath}.bak-haribo`;
    writeFileSync(backupPath, text, 'utf8');
  }
  writeFileSync(
    settingsPath,
    `${JSON.stringify(mergeHooks(settings, scriptPath), null, 2)}\n`,
    'utf8',
  );
  return { scriptPath, configPath, settingsPath, backupPath };
}
