import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectionFailedNotice } from '@sil/notify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hookCommand,
  hooksUrlFrom,
  installHooks,
  mergeHooks,
} from './install.ts';

const SCRIPT = readFileSync(
  new URL('../../hooks-client/haribo-hook.mjs', import.meta.url),
  'utf8',
);
const dirs: string[] = [];
function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'haribo-hooks-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('hooks 주소와 명령', () => {
  it('MCP 주소에서 hooks 주소를 만들어요', () => {
    expect(hooksUrlFrom('https://sil.example.com/mcp')).toBe(
      'https://sil.example.com/hooks',
    );
    expect(hooksUrlFrom('http://127.0.0.1:3333/mcp/')).toBe(
      'http://127.0.0.1:3333/hooks',
    );
  });

  it('Windows 경로도 슬래시로 바꾸고 따옴표로 감싸요', () => {
    expect(
      hookCommand(
        'C:\\Users\\Hong Gil\\.claude\\haribo\\hook.mjs',
        'session-start',
      ),
    ).toBe('node "C:/Users/Hong Gil/.claude/haribo/hook.mjs" session-start');
  });
});

describe('mergeHooks', () => {
  const script = '/home/me/.claude/haribo/hook.mjs';

  it('빈 설정에 hooks를 넣어요 (PostToolUse는 respond, mark_reflected 두 개, 작업을 마친 뒤 Stop)', () => {
    const merged = mergeHooks({}, script);
    expect(Object.keys(merged.hooks ?? {})).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PostToolUse',
      'Stop',
      'PreToolUse',
      'PostToolUseFailure',
    ]);
    // 작업을 마친 뒤 한 줄 (notify.terminal.new-after-answered v2)
    expect(merged.hooks?.Stop).toEqual([
      {
        hooks: [
          {
            type: 'command',
            command: `node "${script}" after-work`,
            timeout: 20,
          },
        ],
      },
    ]);
    expect(merged.hooks?.PostToolUse?.[0]).toEqual({
      matcher: 'mcp__haribo__respond',
      hooks: [
        {
          type: 'command',
          command: `node "${script}" after-respond`,
          timeout: 20,
        },
      ],
    });
    expect(merged.hooks?.PostToolUse?.[1]).toEqual({
      matcher: 'mcp__haribo__mark_reflected',
      hooks: [
        {
          type: 'command',
          command: `node "${script}" after-reflect`,
          timeout: 20,
        },
      ],
    });
  });

  it('다른 설정과 다른 hooks는 그대로 두고, 여러 번 실행해도 한 벌만 남아요', () => {
    const other = {
      matcher: 'Bash',
      hooks: [{ type: 'command' as const, command: 'echo hi' }],
    };
    const settings = { model: 'opus', hooks: { PostToolUse: [other] } };
    const once = mergeHooks(settings, script);
    const twice = mergeHooks(once, script);
    expect(twice.model).toBe('opus');
    // 다른 hooks 하나 + respond 뒤 + mark_reflected 뒤 + T1 화면 뒤 + T1 저장 뒤
    expect(twice.hooks?.PostToolUse).toHaveLength(5);
    expect(twice.hooks?.PostToolUse?.[0]).toEqual(other);
    expect(twice.hooks?.SessionStart).toHaveLength(1);
    // 원래 설정은 바꾸지 않아요
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });
});

describe('mergeHooks: T1 결정 사항 확인 (BDT-108)', () => {
  const script = '/home/me/.claude/haribo/hook.mjs';
  const hook = (event: string) => ({
    type: 'command',
    command: `node "${script}" ${event}`,
    timeout: 20,
  });

  it('화면 도구 직후, 저장 직전·직후·실패에 hooks를 넣어요', () => {
    const merged = mergeHooks({}, script);
    expect(merged.hooks?.PostToolUse?.slice(2)).toEqual([
      {
        matcher: 'mcp__haribo__show_standard_check',
        hooks: [hook('after-t1')],
      },
      { matcher: 'mcp__haribo__save_standard', hooks: [hook('after-save')] },
    ]);
    expect(merged.hooks?.PreToolUse).toEqual([
      { matcher: 'mcp__haribo__save_standard', hooks: [hook('before-save')] },
    ]);
    expect(merged.hooks?.PostToolUseFailure).toEqual([
      { matcher: 'mcp__haribo__save_standard', hooks: [hook('after-save')] },
    ]);
  });

  it('이 저장소 .claude/settings.json의 지금 T1 hooks(Bash)는 지우지 않아요', () => {
    const bash = {
      matcher: 'mcp__haribo__save_standard',
      hooks: [
        {
          type: 'command' as const,
          command:
            'node "$CLAUDE_PROJECT_DIR/apps/detect/src/t1/hook-guard.ts"',
        },
      ],
    };
    const merged = mergeHooks({ hooks: { PreToolUse: [bash] } }, script);
    expect(merged.hooks?.PreToolUse?.[0]).toEqual(bash);
    expect(merged.hooks?.PreToolUse).toHaveLength(2);
  });
});

describe('installHooks', () => {
  it('스크립트, 설정, hooks를 깔고 원래 설정은 백업해요', () => {
    const home = tempHome();
    const settingsPath = join(home, '.claude', 'settings.json');
    installHooks({
      home,
      hooksUrl: 'https://sil.example.com/hooks',
      token: 'secret',
      user: '민수',
      scriptSource: SCRIPT,
    });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        theme: 'dark',
        ...JSON.parse(readFileSync(settingsPath, 'utf8')),
      }),
    );
    const result = installHooks({
      home,
      hooksUrl: 'https://sil.example.com/hooks',
      token: 'secret',
      user: '민수',
      scriptSource: SCRIPT,
    });
    expect(readFileSync(result.scriptPath, 'utf8')).toBe(SCRIPT);
    expect(JSON.parse(readFileSync(result.configPath, 'utf8'))).toEqual({
      hooksUrl: 'https://sil.example.com/hooks',
      token: 'secret',
      user: '민수',
    });
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.theme).toBe('dark');
    expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
    expect(result.backupPath && existsSync(result.backupPath)).toBe(true);
  });

  it('읽지 못하는 설정은 덮어쓰지 않고 멈춰요', () => {
    const home = tempHome();
    installHooks({
      home,
      hooksUrl: 'https://x/hooks',
      user: '민수',
      scriptSource: SCRIPT,
    });
    const settingsPath = join(home, '.claude', 'settings.json');
    writeFileSync(settingsPath, '{ 고장 난 설정');
    expect(() =>
      installHooks({
        home,
        hooksUrl: 'https://x/hooks',
        user: '민수',
        scriptSource: SCRIPT,
      }),
    ).toThrow(/JSON으로 읽지 못했어요/);
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ 고장 난 설정');
  });
});

/** 깐 스크립트를 실제 Node로 돌려요. Claude Code처럼 이벤트를 표준 입력으로 줘요 */
function runHook(
  scriptPath: string,
  event: string,
  input: object,
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, event]);
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('close', (code) => resolve({ code, stdout }));
    child.stdin.end(JSON.stringify(input));
  });
}

describe('팀원 PC 스크립트 (haribo-hook.mjs)', () => {
  it('이벤트를 서버로 보내고 받은 JSON을 그대로 출력해요. 이름은 퍼센트 인코딩해서 보내요', async () => {
    let seen: { url?: string; user?: string; auth?: string; body?: string } =
      {};
    const server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        seen = {
          url: req.url,
          user: req.headers['x-sil-user'] as string,
          auth: req.headers.authorization,
          body,
        };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ systemMessage: '알림' }));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    try {
      const home = tempHome();
      const { scriptPath } = installHooks({
        home,
        hooksUrl: `http://127.0.0.1:${port}/hooks`,
        token: 'secret',
        user: '민수',
        scriptSource: SCRIPT,
      });
      const result = await runHook(scriptPath, 'session-start', {
        session_id: 's1',
      });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ systemMessage: '알림' });
      expect(seen.url).toBe('/hooks/session-start');
      expect(seen.user).toBe(encodeURIComponent('민수'));
      expect(seen.auth).toBe('Bearer secret');
      expect(JSON.parse(seen.body ?? '')).toEqual({ session_id: 's1' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('서버에 못 붙어도 0으로 끝나고 실패를 한 줄로 알려요. 답한 뒤에는 조용히 끝나요 (SIL-80 B4)', async () => {
    const home = tempHome();
    const { scriptPath } = installHooks({
      home,
      // 아무도 듣지 않는 주소
      hooksUrl: 'http://127.0.0.1:9/hooks',
      user: '민수',
      scriptSource: SCRIPT,
    });
    const prompt = await runHook(scriptPath, 'prompt-submit', {
      prompt: '작업',
    });
    expect(prompt.code).toBe(0);
    const output = JSON.parse(prompt.stdout);
    // 서버가 만드는 연결 실패 줄(@sil/notify)과 글자·색이 같아야 해요 (노란 막대, v2)
    expect(output.systemMessage).toBe(connectionFailedNotice());
    expect(output.hookSpecificOutput.additionalContext).toContain(
      '사용자의 요청을 그대로 처리한다',
    );
    const after = await runHook(scriptPath, 'after-respond', {});
    expect(after).toEqual({ code: 0, stdout: '' });
    const afterReflect = await runHook(scriptPath, 'after-reflect', {});
    expect(afterReflect).toEqual({ code: 0, stdout: '' });
    const afterWork = await runHook(scriptPath, 'after-work', {});
    expect(afterWork).toEqual({ code: 0, stdout: '' });
  });
});

describe('팀원 PC 스크립트: T1 ③ 값 파일 (BDT-108)', () => {
  const preview = {
    id: 'app.notify.title-length',
    title: '앱 알림 제목은 32자 이하로 쓴다',
    value: '공백 포함 32자 이하',
    reason: 'Windows 알림 창에서 잘림',
    alwaysOn: false,
  };
  const save = (sessionId = 's1') => ({
    session_id: sessionId,
    tool_input: { ...preview, baseVersion: 2 },
  });

  /** 받은 본문을 남기고 정해 둔 JSON을 돌려주는 가짜 서버 */
  async function fakeServer(reply: object = {}) {
    const bodies: { url?: string; body: Record<string, unknown> }[] = [];
    const server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        bodies.push({ url: req.url, body: JSON.parse(body) });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(reply));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    return {
      hooksUrl: `http://127.0.0.1:${port}/hooks`,
      bodies,
      close: () =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  it('③ 직후 값을 남기고, 저장 직전·직후에 t1_preview로 붙여 보낸 뒤 지워요', async () => {
    const server = await fakeServer({ systemMessage: '화면' });
    try {
      const home = tempHome();
      const { scriptPath } = installHooks({
        home,
        hooksUrl: server.hooksUrl,
        user: '경하',
        scriptSource: SCRIPT,
      });
      const file = join(home, '.claude', 'haribo', `t1-s1-${preview.id}.json`);

      // ③이 아닌 화면은 남기지 않아요
      await runHook(scriptPath, 'after-t1', {
        session_id: 's1',
        tool_input: { screen: 'notice', notice: { kind: 'similarDeclined' } },
      });
      expect(existsSync(file)).toBe(false);

      const shown = await runHook(scriptPath, 'after-t1', {
        session_id: 's1',
        tool_input: { screen: 'preview', preview },
      });
      expect(JSON.parse(shown.stdout)).toEqual({ systemMessage: '화면' });
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(preview);

      await runHook(scriptPath, 'before-save', save());
      expect(server.bodies.at(-1)).toEqual({
        url: '/hooks/before-save',
        body: { ...save(), t1_preview: preview },
      });
      expect(existsSync(file)).toBe(true);

      // 다른 세션의 저장에는 붙이지 않아요
      await runHook(scriptPath, 'before-save', save('s2'));
      expect(server.bodies.at(-1)?.body).toEqual(save('s2'));

      await runHook(scriptPath, 'after-save', save());
      expect(server.bodies.at(-1)?.body.t1_preview).toEqual(preview);
      expect(existsSync(file)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('세션 번호나 결정 사항 ID 모양이 틀리면 파일을 만들지 않아요 (경로 문자 막기)', async () => {
    const server = await fakeServer();
    try {
      const home = tempHome();
      const { scriptPath } = installHooks({
        home,
        hooksUrl: server.hooksUrl,
        user: '경하',
        scriptSource: SCRIPT,
      });
      await runHook(scriptPath, 'after-t1', {
        session_id: '../../evil',
        tool_input: { screen: 'preview', preview },
      });
      await runHook(scriptPath, 'after-t1', {
        session_id: 's1',
        tool_input: { screen: 'preview', preview: { ...preview, id: '../x' } },
      });
      expect(
        readdirSync(join(home, '.claude', 'haribo')).filter((name) =>
          name.startsWith('t1-'),
        ),
      ).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('서버에 못 붙으면: 화면 뒤에는 멈추라고 알리고, ③을 거친 저장 직전에는 사람에게 물어요. 나머지는 조용히 끝나요', async () => {
    const home = tempHome();
    const { scriptPath } = installHooks({
      home,
      hooksUrl: 'http://127.0.0.1:9/hooks',
      user: '경하',
      scriptSource: SCRIPT,
    });
    const shown = await runHook(scriptPath, 'after-t1', {
      session_id: 's1',
      tool_input: { screen: 'preview', preview },
    });
    expect(shown.code).toBe(0);
    expect(
      JSON.parse(shown.stdout).hookSpecificOutput.additionalContext,
    ).toContain('다음 단계로 가지 말고');
    // 화면을 못 띄웠으니 ③ 값도 남기지 않아요
    const file = join(home, '.claude', 'haribo', `t1-s1-${preview.id}.json`);
    expect(existsSync(file)).toBe(false);

    // ③ 파일이 없는 저장(지금 T1, 안내문 2·3번)은 그대로 둬요 (PR A)
    expect(await runHook(scriptPath, 'before-save', save())).toEqual({
      code: 0,
      stdout: '',
    });

    writeFileSync(file, JSON.stringify(preview));
    const before = await runHook(scriptPath, 'before-save', save());
    expect(JSON.parse(before.stdout).hookSpecificOutput).toMatchObject({
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
    });
    expect(await runHook(scriptPath, 'after-save', save())).toEqual({
      code: 0,
      stdout: '',
    });
    expect(existsSync(file)).toBe(false);
  });
});
