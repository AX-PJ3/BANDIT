/**
 * `hook-preview.ts`가 Bash 명령이 ③ 등록될 모습(`preview.ts`)인지 알아보는 규칙이에요 (SIL-66 T1).
 * 다른 Bash 명령마다 hook이 돌아서, 패키지(`@sil/core`)를 불러오지 않는 이 파일에 따로 둬요.
 * 그래서 패키지를 설치하기 전에도 다른 명령에서 hook 오류가 나지 않아요.
 */

/** preview.ts가 마지막 줄에 남기는 표시. hook-preview.ts가 이 뒤의 결정 사항 ID로 파일을 찾아요 */
export const PREVIEW_DONE = '③ 등록될 모습 값을 임시로 들고 있어요:';

// 앞에 `cd "…" &&`를 붙이거나 전체 경로로 불러도 알아봐요 (10/14 main-2에서 cd가 붙어 ③이 안 뜸)
const PREVIEW_COMMAND =
  /(?:^|[;&|(]\s*)node\s+(?:"[^"\n]*[\\/]|'[^'\n]*[\\/]|[^\s"';&|]*[\\/])?apps[\\/]detect[\\/]src[\\/]t1[\\/]preview\.ts\b/m;

export function isPreviewCommand(command: string): boolean {
  return PREVIEW_COMMAND.test(command);
}

/** preview.ts 출력에서 이번 ③의 결정 사항 ID를 찾아요. 없으면 undefined */
export function findPreviewId(stdout: string): string | undefined {
  const doneLine = stdout
    .split('\n')
    .find((line) => line.startsWith(PREVIEW_DONE));
  return doneLine?.slice(PREVIEW_DONE.length).trim() || undefined;
}
