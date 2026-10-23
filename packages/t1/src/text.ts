/**
 * T1 hooks 화면의 칸 수 계산과 줄 나누기예요.
 * 칸 규칙은 부건님 프로토타입(t1-prototype, screens.py)과 `@sil/notify`의 `terminal/text.ts`와 같아요.
 * t1은 notify를 불러오지 않아서 T1 화면에 필요한 것만 둬요.
 */

/** 한글·한자·전각 문자처럼 터미널에서 2칸을 차지하는 글자인지 (유니코드 동아시아 폭 W·F) */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모 (초성)
    (code >= 0x2e80 && code <= 0xa4cf) || // 한자, 가나, 한글 호환 자모
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // 한자 호환
    (code >= 0xfe30 && code <= 0xfe4f) || // 세로쓰기 구두점
    (code >= 0xff00 && code <= 0xff60) || // 전각 문자
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** 글의 칸 수 (꾸밈 코드가 없는 글) */
export function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
}

/** 오른쪽을 빈칸으로 채워 cols칸으로 맞춰요 */
export function padEnd(text: string, cols: number): string {
  return text + ' '.repeat(Math.max(0, cols - textWidth(text)));
}

/** 뒤를 잘라 cols칸에 맞춰요. 잘렸으면 끝에 … */
export function cutEnd(text: string, cols: number): string {
  if (textWidth(text) <= cols) return text;
  let out = '';
  for (const char of text) {
    if (textWidth(out + char) > cols - 1) break;
    out += char;
  }
  return `${out}…`;
}

/** 띄어쓰기에서 나눠 cols칸 줄들로 만들어요. 한 낱말이 cols보다 길면 글자로 나눠요 */
export function wrap(text: string, cols: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate) <= cols) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (textWidth(rest) > cols) {
      let part = '';
      for (const char of rest) {
        if (textWidth(part + char) > cols) break;
        part += char;
      }
      lines.push(part);
      rest = rest.slice(part.length);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}
