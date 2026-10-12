/**
 * team-wiki/CHANGELOG.md 한 줄 만들기 (data.changelog.format, work.wiki.changelog).
 *
 * 형식: 날짜 시각 | 누가 | 기준 ID 이전버전→새버전 | 이전 값 → 새 값 | 이유 | 출처
 * - 새 기준은 이전 버전을 new로, 이전 값을 (없음)으로 써요.
 * - 폐기는 새 값을 "폐기(대체: ID)"로 써요.
 * - 시각은 한국 시간이에요. check_wiki.py가 " | "로 칸을 나누니 값 안의 "|"는 "/"로 바꿔요.
 */
import { SOURCE_LABELS } from './rules.ts';
import type { IsoDateTime, StandardId, StandardSource } from './types/index.ts';

export interface ChangelogLineInput {
  at: IsoDateTime | Date;
  by: string | null;
  standardId: StandardId;
  /** 이전 버전. 새 기준이면 null */
  fromVersion: number | null;
  toVersion: number;
  /** 이전 값. 새 기준이면 null */
  before: string | null;
  after: string;
  reason: string;
  source: StandardSource;
  /** 되돌림이면 어느 버전으로 돌아갔는지. 이유에 "vN로 되돌림"이 없으면 붙여요 (기준 작성 원칙 7) */
  revertedToVersion?: number | null;
}

const KOREA_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatChangelogLine(input: ChangelogLineInput): string {
  const revertNote =
    input.revertedToVersion != null && !input.reason.includes('되돌림')
      ? ` (v${input.revertedToVersion}로 되돌림)`
      : '';
  return [
    KOREA_TIME.format(new Date(input.at)),
    cell(input.by ?? '이름 없음'),
    `${input.standardId} ${input.fromVersion ?? 'new'}→${input.toVersion}`,
    `${cell(input.before ?? '(없음)')} → ${cell(input.after)}`,
    cell(input.reason) + revertNote,
    SOURCE_LABELS[input.source],
  ].join(' | ');
}

function cell(text: string): string {
  return text
    .replace(/\s*\|\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}
