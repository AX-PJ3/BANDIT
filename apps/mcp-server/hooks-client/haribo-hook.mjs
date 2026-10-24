#!/usr/bin/env node
/**
 * haribo 터미널 알림 hooks (SIL-67). `pnpm mcp:register`가 ~/.claude/haribo/에 복사해 두는 파일이에요.
 *
 *   node ~/.claude/haribo/hook.mjs session-start | prompt-submit | after-respond | after-reflect | after-work
 *   node ~/.claude/haribo/hook.mjs after-t1 | before-save | after-save   (T1 결정 사항 확인, BDT-108)
 *
 * Claude Code가 hooks 이벤트(JSON)를 표준 입력으로 주면, 그대로 팀 MCP 서버의 /hooks/<이벤트>로 보내고
 * 서버가 돌려준 JSON(systemMessage 등)을 그대로 출력해요. 화면 글은 서버가 만들어요.
 *
 * - 저장소나 패키지 없이 Node만 있으면 돌아요 (Node 18 이상의 fetch). Windows와 Mac에서 같은 명령이에요.
 * - 서버 주소·토큰·이름은 같은 폴더의 config.json에서 읽어요.
 * - 서버에 못 붙어도 작업은 막지 않아요. 실패를 한 줄로 알리고 끝나요 (notify.error.no-block-retry).
 *   이 문구는 @sil/notify의 connectionFailedNotice와 같게 둬요.
 * - T1: ③ 등록될 모습 직후(after-t1) 보여 준 값을 같은 폴더에 "세션 번호 + 결정 사항 ID" 파일로 남기고,
 *   저장 직전·직후(before-save, after-save)에 그 값을 t1_preview로 붙여 보내요. 저장이 끝나면 지워요.
 *   서버는 쉬었다 깨어나면 메모리가 비어서 ③ 값을 내 PC에 둬요 (BDT-108 10/23).
 *   ③에서 취소하면 파일이 남아서, 새 세션을 켤 때(session-start) 하루 넘은 파일을 지워요.
 */
import {
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';

const EVENTS = [
  'session-start',
  'prompt-submit',
  'after-respond',
  'after-reflect',
  'after-work',
  'after-t1',
  'before-save',
  'after-save',
];
/** 무료 호스팅은 쉬다가 깨어나느라 느릴 수 있어서 넉넉히 기다려요. Claude Code hooks 시간 제한(설정 20초)보다 짧게 둬요 */
const TIMEOUT_MS = 15_000;

const esc = (codes) => `\u001b[${codes}m`;
const FAILED_NOTICE = [
  '',
  // 노란 막대 (v2 상태 줄)
  `${esc('33')}${esc('7')} ${esc('27')}${esc('39')} ${esc('39;49')}서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.${esc('39')}`,
  `  "${esc('1')}${esc('33')}결정 사항 확인${esc('39;49')}${esc('22')}"을 입력하면 다시 시작해요.`,
].join('\n');
const FAILED_CONTEXT =
  '[확인할 변경 규칙] 확인할 변경을 불러오지 못했다는 것을 hooks가 이미 화면에 보여 줬다. 그 일에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.';

const event = process.argv[2];

/** T1 ③ 값 파일. 세션 번호와 결정 사항 ID 모양이 맞을 때만 만들어요 (경로 문자 막기) */
function previewFile(sessionId, id) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(sessionId))
    return null;
  if (typeof id !== 'string' || !/^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/.test(id))
    return null;
  return new URL(`./t1-${sessionId}-${id}.json`, import.meta.url);
}

/** 남은 ③ 파일을 지우는 나이. 같은 날 다른 창에서 쓰는 중인 파일은 건드리지 않아요 */
const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** ③에서 취소·Esc로 끝나 남은 파일 중 하루 넘은 것을 지워요. 못 지우면 그냥 넘어가요 */
function removeOldPreviews() {
  const dir = new URL('./', import.meta.url);
  try {
    for (const name of readdirSync(dir)) {
      if (!/^t1-.+\.json$/.test(name)) continue;
      const file = new URL(name, dir);
      if (Date.now() - statSync(file).mtimeMs > PREVIEW_MAX_AGE_MS)
        rmSync(file, { force: true });
    }
  } catch {
    // 정리는 다음 세션에 다시 해요
  }
}

/** 이번 저장에 붙인 ③ 값. 없으면 ③을 거치지 않은 저장이에요 */
let t1Preview;

/** 저장 직전·직후에만 ③ 값을 붙여요. 그 밖에는 받은 그대로 보내요 */
function withPreview(input) {
  if (!['before-save', 'after-save'].includes(event)) return input || '{}';
  try {
    const parsed = JSON.parse(input);
    const file = previewFile(parsed.session_id, parsed.tool_input?.id);
    t1Preview = file ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
    // 저장이 끝나면 지워요. 다음 저장은 ③을 다시 거쳐요
    if (file && event === 'after-save') rmSync(file, { force: true });
    return t1Preview
      ? JSON.stringify({ ...parsed, t1_preview: t1Preview })
      : input;
  } catch {
    return input || '{}';
  }
}

/** ③을 사람에게 보여 준 뒤(서버가 화면을 돌려줬을 때) 그 값을 남겨요 */
function keepPreview(input, body) {
  if (event !== 'after-t1') return;
  try {
    // 서버가 화면을 못 만들었으면(systemMessage 없음) 사람이 ③을 못 봤으니 남기지 않아요
    if (!JSON.parse(body).systemMessage) return;
    const parsed = JSON.parse(input);
    const file = previewFile(parsed.session_id, parsed.tool_input?.preview?.id);
    if (parsed.tool_input?.screen === 'preview' && file)
      writeFileSync(file, JSON.stringify(parsed.tool_input.preview), 'utf8');
  } catch {
    // 남기지 못하면 저장 직전에 ③이 없다고 막혀서 ③을 다시 보여 줘요
  }
}

/**
 * T1 실패 출력. 화면을 못 띄웠으면 Claude가 다음 단계로 가지 않게 알리고,
 * ③을 거친 저장 직전이면 그래도 사람에게 물어요. 저장 직후는 조용히 끝내요
 */
function t1Failed() {
  if (event === 'after-t1') {
    return JSON.stringify({
      systemMessage: `\n${esc('31')}${esc('7')} ${esc('27')}${esc('39')} 서버에 연결하지 못해서 결정 사항 확인 화면을 띄우지 못했어요.`,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          '결정 사항 확인 화면을 띄우지 못했어요(서버 연결 실패). 사람에게 화면이 보이지 않았으니 다음 단계로 가지 말고 멈춘 뒤 사람의 말을 기다려요.',
      },
    });
  }
  if (event === 'before-save' && t1Preview) {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason:
          '서버에 연결하지 못해 ③에서 보여 드린 값과 같은지 확인하지 못했어요. 저장할지 직접 확인해 주세요.',
      },
    });
  }
  return '';
}

/**
 * 실패를 알리는 출력. 도구를 부른 뒤(after-respond, after-reflect)에는 Claude가 결과를 이미 받아서,
 * 작업을 마친 뒤(after-work)에는 다음 입력 때 실패를 알리니 조용히 끝내요
 */
function failed(detail) {
  if (['after-t1', 'before-save', 'after-save'].includes(event))
    return t1Failed();
  if (['after-respond', 'after-reflect', 'after-work'].includes(event))
    return '';
  const message = detail ? `${FAILED_NOTICE}\n  (${detail})` : FAILED_NOTICE;
  if (event === 'prompt-submit') {
    return JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: FAILED_CONTEXT,
      },
    });
  }
  return JSON.stringify({ systemMessage: message });
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  if (!EVENTS.includes(event)) return '';
  if (event === 'session-start') removeOldPreviews();
  const input = await readStdin();
  let config;
  try {
    config = JSON.parse(
      readFileSync(new URL('./config.json', import.meta.url), 'utf8'),
    );
  } catch {
    return failed(
      'config.json이 없어요. pnpm mcp:register를 다시 실행해 주세요',
    );
  }
  const headers = { 'content-type': 'application/json' };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  // HTTP 헤더에는 한글을 그대로 못 넣어서 퍼센트 인코딩해요. 서버(auth.ts readUser)가 풀어서 읽어요
  if (config.user) headers['x-sil-user'] = encodeURIComponent(config.user);
  try {
    const response = await fetch(`${config.hooksUrl}/${event}`, {
      method: 'POST',
      headers,
      body: withPreview(input),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) {
      let detail = `서버 응답 ${response.status}`;
      try {
        detail = JSON.parse(body).error?.message ?? detail;
      } catch {
        // 서버가 JSON이 아닌 글을 돌려주면 상태 번호만 알려요
      }
      return failed(detail);
    }
    keepPreview(input, body);
    return body === '{}' ? '' : body;
  } catch {
    return failed();
  }
}

// 어떤 경우에도 0으로 끝나요. hooks가 실패 코드로 끝나면 Claude Code가 작업을 멈출 수 있어요
main()
  .then((output) => {
    if (output) process.stdout.write(output);
  })
  .catch(() => {})
  .finally(() => process.exit(0));
