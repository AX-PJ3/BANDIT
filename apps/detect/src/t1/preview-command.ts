/**
 * hook이 Bash 명령이 ③ 등록될 모습(`preview.ts`)이나 다른 결정 사항 화면(`conflicts.ts`)인지 알아보는 규칙이에요 (SIL-66 T1).
 * 다른 Bash 명령마다 hook이 돌아서, 패키지(`@sil/core`)를 불러오지 않는 이 파일에 따로 둬요.
 * 그래서 패키지를 설치하기 전에도 다른 명령에서 hook 오류가 나지 않아요.
 */

/** preview.ts가 마지막 줄에 남기는 표시. hook-preview.ts가 이 뒤의 결정 사항 ID로 파일을 찾아요 */
export const PREVIEW_DONE = '③ 등록될 모습 값을 임시로 들고 있어요:';

/** conflicts.ts가 마지막 줄에 남기는 표시. hook-conflicts.ts가 이 뒤의 표로 파일을 찾아요 */
export const CONFLICTS_DONE = '다른 결정 사항 화면 값을 임시로 들고 있어요:';

/** notice.ts가 마지막 줄에 남기는 표시. hook-notice.ts가 이 뒤의 표로 파일을 찾아요 */
export const NOTICE_DONE = 'T1 안내 값을 임시로 들고 있어요:';

/**
 * hook이 화면을 띄운 뒤 에이전트에게만 전하는 말(additionalContext). 사람에게는 보이지 않아요.
 * 에이전트는 hook 글이 사람 화면에 떴는지 몰라서 "화면을 띄웠어요" 같은 설명을 덧붙여요 (10/15 시험)
 */
export const SCREEN_SHOWN_CONTEXT =
  'T1 화면을 hook이 사람에게 이미 보여 줬어요. 화면을 띄웠다거나 무엇을 보여 줬는지 설명하는 글을 쓰지 말고, CLAUDE.md T1의 다음 단계로 바로 가세요.';

/** hook 출력: 사람에게 보이는 화면과 에이전트에게만 가는 말 */
export function screenHookOutput(screen: string): string {
  return JSON.stringify({
    // 첫 줄을 비워 hook 머리글(`PostToolUse:Bash says:`) 바로 다음 줄부터 시작해요 (프로토타입 screens.py)
    systemMessage: `\n${screen}`,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: SCREEN_SHOWN_CONTEXT,
    },
  });
}

// 앞에 `cd "…" &&`를 붙이거나 전체 경로로 불러도 알아봐요 (10/14 main-2에서 cd가 붙어 ③이 안 뜸)
const t1Command = (file: string) =>
  new RegExp(
    String.raw`(?:^|[;&|(]\s*)node\s+(?:"[^"\n]*[\\/]|'[^'\n]*[\\/]|[^\s"';&|]*[\\/])?apps[\\/]detect[\\/]src[\\/]t1[\\/]${file}\.ts\b`,
    'm',
  );
const PREVIEW_COMMAND = t1Command('preview');
const CONFLICTS_COMMAND = t1Command('conflicts');
const NOTICE_COMMAND = t1Command('notice');

export function isPreviewCommand(command: string): boolean {
  return PREVIEW_COMMAND.test(command);
}

export function isConflictsCommand(command: string): boolean {
  return CONFLICTS_COMMAND.test(command);
}

/**
 * save_standard 결과가 저장에 성공했는지 봐요. Claude Code가 MCP 결과를 어떤 겉모양(배열·content·글)으로
 * 넘겨도 찾게, 안쪽 글이 JSON이면 풀어서 standardId와 version이 있는 결과를 찾아요. 오류(isError)면 false
 */
export function isSavedResponse(response: unknown): boolean {
  if (typeof response === 'string') {
    try {
      return isSavedResponse(JSON.parse(response));
    } catch (_error) {
      return false;
    }
  }
  if (Array.isArray(response)) return response.some(isSavedResponse);
  if (typeof response !== 'object' || response === null) return false;
  const record = response as Record<string, unknown>;
  if (record.isError === true) return false;
  if (
    typeof record.standardId === 'string' &&
    typeof record.version === 'number'
  ) {
    return true;
  }
  return Object.values(record).some(isSavedResponse);
}

/** 명령 출력에서 표시 줄 뒤의 값을 찾아요. 없으면 undefined */
function findAfter(stdout: string, marker: string): string | undefined {
  const doneLine = stdout.split('\n').find((line) => line.startsWith(marker));
  return doneLine?.slice(marker.length).trim() || undefined;
}

/** preview.ts 출력에서 이번 ③의 결정 사항 ID를 찾아요. 없으면 undefined */
export function findPreviewId(stdout: string): string | undefined {
  return findAfter(stdout, PREVIEW_DONE);
}

/** conflicts.ts 출력에서 이번 화면의 표를 찾아요. 없으면 undefined */
export function findConflictsToken(stdout: string): string | undefined {
  return findAfter(stdout, CONFLICTS_DONE);
}

export function isNoticeCommand(command: string): boolean {
  return NOTICE_COMMAND.test(command);
}

/** notice.ts 출력에서 이번 안내의 표를 찾아요. 없으면 undefined */
export function findNoticeToken(stdout: string): string | undefined {
  return findAfter(stdout, NOTICE_DONE);
}
