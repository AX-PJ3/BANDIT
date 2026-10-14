/**
 * 터미널 글자 폭 계산과 자르기, 바뀐 부분 찾기예요.
 * 부건님 시안(cli-design-notes/t2-render-check.py)의 같은 이름 함수를 그대로 옮겼어요 (SIL-68).
 */

/** 한글·한자·전각 문자처럼 터미널에서 2칸을 차지하는 글자인지 (유니코드 동아시아 폭 W·F) */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모 (초성)
    (code >= 0x2e80 && code <= 0x303e) || // 한자 부수, 구두점
    (code >= 0x3041 && code <= 0x33ff) || // 가나, 한글 호환 자모, 기호
    (code >= 0x3400 && code <= 0x4dbf) || // 한자 확장 A
    (code >= 0x4e00 && code <= 0x9fff) || // 한자
    (code >= 0xa960 && code <= 0xa97f) || // 한글 자모 확장 A
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // 한자 호환
    (code >= 0xfe30 && code <= 0xfe4f) || // 세로쓰기 구두점
    (code >= 0xff00 && code <= 0xff60) || // 전각 문자
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) || // 그림 문자
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd) // 한자 확장 B 이후
  );
}

/** 글자 하나의 칸 수. 모호한 폭(A)은 1칸으로 봐요 (시안과 같아요) */
export function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return isWide(code) ? 2 : 1;
}

/** 꾸밈 코드(ANSI)를 뺀 글의 칸 수 */
export function textWidth(text: string): number {
  let width = 0;
  for (const char of stripAnsi(text)) width += charWidth(char);
  return width;
}

/** 꾸밈 코드를 지워요. 테스트와 칸 수 계산에 써요 */
export function stripAnsi(text: string): string {
  // ESC 문자로 시작하는 색 코드를 지워요
  // eslint-disable-next-line no-control-regex -- 터미널 색 코드(ESC)를 지우려면 제어 문자가 필요해요
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** 뒤를 잘라 budget 칸에 맞춰요. 잘렸으면 끝에 … */
export function cutEnd(text: string, budget: number): string {
  if (textWidth(text) <= budget) return text;
  let out = '';
  for (const char of text) {
    if (textWidth(`${out}${char}…`) > budget) break;
    out += char;
  }
  return `${out.trimEnd()}…`;
}

/** 앞을 잘라 budget 칸에 맞춰요. 바뀐 곳에 가까운 뒤쪽을 남겨요 */
export function cutStart(text: string, budget: number): string {
  if (textWidth(text) <= budget) return text;
  const chars = Array.from(text);
  let out = '';
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    if (textWidth(`…${chars[i]}${out}`) > budget) break;
    out = chars[i] + out;
  }
  return `…${out.trimStart()}`;
}

function commonPrefixLength<T>(a: readonly T[], b: readonly T[]): number {
  let n = 0;
  while (n < Math.min(a.length, b.length) && a[n] === b[n]) n += 1;
  return n;
}

/** 바뀐 부분이 값의 절반을 넘으면 "문장을 새로 썼어요"로 보여 줘요 */
const LARGE_CHANGE_RATIO = 0.5;

/**
 * 앞뒤 공통 단어를 걷어낸 가운데 단어들이에요. 예: "공백 포함 40자 이하" → "공백 포함 32자 이하"는 ["40자", "32자"]
 * 지운 경우는 지금 쪽이, 넣은 경우는 이전 쪽이 빈 글이에요.
 */
export function changedWords(
  previous: string,
  current: string,
): [string, string] {
  const a = previous.split(' ');
  const b = current.split(' ');
  const p = commonPrefixLength(a, b);
  const q = commonPrefixLength(a.slice(p).reverse(), b.slice(p).reverse());
  return [
    a.slice(p, a.length - q).join(' '),
    b.slice(p, b.length - q).join(' '),
  ];
}

/** 크게 바뀌었는지. 글자 단위로 좁힌 바뀐 부분 길이가 두 값 길이 합의 절반을 넘으면 크게 바뀐 거예요 */
export function isLargeChange(previous: string, current: string): boolean {
  const [oldMid, newMid] = narrowChange(previous, current);
  return (
    oldMid.length + newMid.length >
    LARGE_CHANGE_RATIO * (previous.length + current.length)
  );
}

/** 단어 단위로 좁힌 뒤, 양쪽이 한 단어씩이면 글자 단위로 한 번 더 좁혀요 (40자 → [40]자) */
function narrowChange(previous: string, current: string): [string, string] {
  const [oldMid, newMid] = changedWords(previous, current);
  if (oldMid && newMid && !oldMid.includes(' ') && !newMid.includes(' ')) {
    const a = Array.from(oldMid);
    const b = Array.from(newMid);
    const cp = commonPrefixLength(a, b);
    const cs = commonPrefixLength(a.slice(cp).reverse(), b.slice(cp).reverse());
    return [
      a.slice(cp, a.length - cs).join(''),
      b.slice(cp, b.length - cs).join(''),
    ];
  }
  return [oldMid, newMid];
}
