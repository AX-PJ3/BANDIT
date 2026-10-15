/**
 * T1 hooks가 띄우는 화면 모양이에요. 부건님 프로토타입 "T1 결정 사항 등록"(10/14)의
 * `previewScreen`을 옮겼어요. 문구는 `copy.ts`에만 있어요.
 * Claude Code가 hook 글을 회색으로 감싸서, 강조할 글만 색 코드로 꾸며요.
 */
import { T1_COPY, type T1PreviewValues, yesNo } from './copy.ts';
import { padEnd, textWidth, wrap } from './text.ts';

/** 화면 너비. T2~T5 알림 화면과 같아요 (착수 안내 T3) */
export const COLS = 76;

const ESC = '\u001b[';
const paint = (code: string, text: string) => `${ESC}${code}m${text}${ESC}0m`;
/** 터미널 기본 글자색 (어두우면 흰색, 밝으면 검정). 회색 hook 글 안에서 내용을 또렷하게 보여요 (10/13) */
const strong = (text: string, isBold = false) =>
  paint(isBold ? '1;39' : '39', text);
/** 선은 어디서나 1칸인 영문 하이픈 (10/13) */
const RULE = '-';

/** ③ 등록될 모습: 위 선 안에 머리표, 청록 굵은 제목, 값·이유·항상 적용, 아래 선 */
export function previewScreen(values: T1PreviewValues): string {
  const { heading, labels, issueColumns } = T1_COPY.preview;
  const head = `${RULE}${RULE} ${heading} `;
  const lines = [
    // 왼쪽 --와 머리표 글자는 꾸미지 않아요 (10/13)
    `${RULE}${RULE} ${heading}${strong(` ${RULE.repeat(Math.max(2, COLS - textWidth(head)))}`)}`,
    // 제목은 청록 굵은 글자. T2~T5 상세 제목과 같은 색 (10/13)
    `  ${paint('1;36', `[${values.area}] ${values.title}`)}`,
  ];
  // 이름은 회색, 내용은 기본 글자색. 이름 칸은 6칸 (10/13)
  for (const [label, text] of [
    [labels.value, values.value],
    [labels.reason, values.reason],
  ] as const) {
    const [first = '', ...rest] = wrap(text, COLS - 10);
    lines.push(`    ${padEnd(label, 6)}${strong(first)}`);
    for (const more of rest) lines.push(`${' '.repeat(10)}${strong(more)}`);
  }
  // 항상 적용은 예일 때만 이름과 값을 굵게 (10/13)
  const alwaysOnLabel = `${labels.alwaysOn}  `;
  lines.push(
    '',
    `    ${values.alwaysOn ? paint('1', alwaysOnLabel) : alwaysOnLabel}${strong(yesNo(values.alwaysOn), values.alwaysOn)}`,
    '',
    // 누구에게 알리는지 보는 표. 이슈를 읽는 도구가 없어서 칸 이름만 두고 줄은 비워요 (10/15 경하님)
    paint(
      '2',
      `  ${padEnd(issueColumns.id, 5)}${padEnd(issueColumns.owner, 8)}${issueColumns.issue}`,
    ),
    strong(RULE.repeat(COLS)),
  );
  return lines.join('\n');
}
