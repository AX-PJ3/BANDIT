/**
 * 터미널 알림 화면 글을 만들어요 (착수 안내 T2~T5, 부건님 SIL-68 시안).
 *
 * 모양과 문구는 부건님 결정 기록(cli-design-notes/터미널-알림-흐름-결정기록.md, T3-질문과-답-결정기록.md)과
 * 움직이는 시안(prototype/notify-prototype/proto/notice.py)을 그대로 옮겼어요. 비교 방식은 결정된 "요약(E)"만 써요.
 * 데이터는 list_pending 결과(PendingItem)를 받아요. hooks가 이 글을 화면에 직접 띄워요.
 *
 * 꾸밈 규칙 (결정 기록 4장, 6장):
 * - Claude Code는 hooks 글을 회색으로 감싸요. 꾸밈을 끄는 코드는 하나씩 따로 써야 회색으로 돌아가요.
 * - 터미널 기본 글자색을 낼 때만 "39;49"를 묶어 써서 회색을 풀어요.
 * - 테마가 정한 16색(노랑 33, 초록 32), 굵게, 흐리게, 반전만 써요. 흰색·검정을 직접 칠하지 않아요.
 */
import type { PendingItem } from '../listPending.ts';
import type { IsoDateTime } from '../types.ts';
import { changedWords, cutEnd, isLargeChange, textWidth } from './text.ts';

/** Claude Code가 hooks 글 앞에 2칸을 들여 써서 80칸에서 뺀 너비 */
export const COLS = 76;

/** 질문을 닫고 넘어간 뒤 다시 답하려고 입력하는 말 (입력 전체가 이 말일 때만) */
export const RECALL_PHRASE = '결정 사항 확인';

/** 화살표. 어느 터미널 설정에서나 1칸이에요 (결정 기록 5-10) */
const ARROW = '⭢';

/** 위키 목차 순서. 켤 때 알림의 영역 이름을 이 순서로 보여 줘요 */
const AREA_ORDER = [
  'goal',
  'wiki',
  'detect',
  'notify',
  'app',
  'data',
  'copy',
  'work',
];
const MAX_AREAS = 3;

const esc = (codes: string) => `\u001b[${codes}m`;
const STRONG = '39;49';
const bold = (text: string) => `${esc('1')}${text}${esc('22')}`;
const dim = (text: string) => `${esc('2')}${text}${esc('22')}`;
/** 한 줄을 터미널 기본 글자색으로 */
const strongLine = (text: string) => `${esc(STRONG)}${text}${esc('39')}`;
const green = (text: string) => `${esc('32')}${text}${esc('39')}`;
const check = green('✓');

/** 건수 숫자: 노란 굵은 글자. 숫자 뒤에는 기본 글자색으로 돌아가요 */
const countText = (count: number) =>
  `${esc('1')}${esc('33')}${count}${esc(STRONG)}${esc('22')}`;

/** 몇 번째 변경인지: 반전 칩 */
const countChip = (index: number, total: number) =>
  `${esc(STRONG)}${esc('7')} ${index}/${total} ${esc('27')}${esc('39')}`;

/** 결정 사항 ID의 첫 부분이 영역이에요. 예: app.notify.title-length → app */
export function areaOf(item: PendingItem): string {
  return item.standard.id.split('.')[0] ?? item.standard.id;
}

/** 영역 이름을 대괄호 하나에 쉼표로 (3개까지, 넘으면 …) */
function areaLabel(items: PendingItem[]): string {
  const rank = (area: string) => {
    const index = AREA_ORDER.indexOf(area);
    return index === -1 ? AREA_ORDER.length : index;
  };
  const areas = [...new Set(items.map(areaOf))].sort(
    (a, b) => rank(a) - rank(b),
  );
  const shown = [
    ...areas.slice(0, MAX_AREAS),
    ...(areas.length > MAX_AREAS ? ['…'] : []),
  ];
  return `[${shown.join(', ')}]`;
}

// ---------------------------------------------------------------------------
// ① 켤 때 (SessionStart)
// ---------------------------------------------------------------------------

/** 켤 때 알림. 답할 변경이 없으면 null (아무것도 띄우지 않아요) */
export function sessionNotice(items: PendingItem[]): string | null {
  const pending = items.filter((item) => item.status === 'pending');
  if (pending.length === 0) return null;
  const total = pending.length > 1 ? '총 ' : '';
  return [
    '',
    strongLine(
      `● ${areaLabel(pending)} 결정 사항이 ${total}${countText(pending.length)}건 변경되었어요.`,
    ),
    '  작업을 시작하면 변경 내역을 상세히 볼 수 있어요.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// ② 작업을 입력했을 때: 변경 상세 (UserPromptSubmit, 답한 뒤 PostToolUse)
// ---------------------------------------------------------------------------

export interface DetailOptions {
  /** 지금 시각. "오늘이면 시각만" 판단에 써요. 안 주면 실제 시각 */
  now?: IsoDateTime;
  /** "결정 사항 확인"으로 다시 부른 경우. 기다리는 작업이 없어서 "작업 전에"를 빼요 */
  recall?: boolean;
}

type ChangeKind = 'normal' | 'new' | 'revert';

function kindOf(item: PendingItem): ChangeKind {
  if (item.standard.previousValue === null) return 'new';
  if (item.standard.isRevert) return 'revert';
  return 'normal';
}

const TAGS: Record<ChangeKind, string | null> = {
  normal: null,
  new: '신규',
  revert: '되돌림',
};

/**
 * 제목 끝의 종류 표시.
 * - (되돌림)은 괄호 글자에 글자색만 입혀요 (notify.revert.mark-by-screen). 색은 SIL-81에서 정하는 중이라
 *   부건님과 정한 대로 임시로 회색(테마 16색의 밝은 검정 90)을 써요 (10/14).
 * - (신규)는 정해진 색이 없어서 시안대로 흐린 글자예요.
 */
function tagText(kind: ChangeKind): string {
  const tag = TAGS[kind];
  if (!tag) return '';
  if (kind === 'revert') return `${esc('90')} (${tag})${esc('39')}`;
  return dim(` (${tag})`);
}

/**
 * 바꾼 시각: 오늘이면 "오후 2:13", 아니면 "10월 13일 오후 2:13" (착수 안내 5절 "언제").
 * 팀이 한국에 있어서 한국 시각으로 보여 줘요.
 */
export function formatWhen(at: IsoDateTime, now: IsoDateTime): string {
  const zone = 'Asia/Seoul';
  const day = (iso: IsoDateTime) =>
    new Intl.DateTimeFormat('ko-KR', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(iso));
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
  if (day(at) === day(now)) return time;
  const date = new Intl.DateTimeFormat('ko-KR', {
    timeZone: zone,
    month: 'long',
    day: 'numeric',
  }).format(new Date(at));
  return `${date} ${time}`;
}

/**
 * 출처 글. ※ 부건님 시안에서도 미정이에요(결정 기록 9장 "출처 카테고리").
 * 시안의 세 가지(AI 대화 / PR · AI가 찾음 / 코드)에, DB에 있는 나머지 출처를 이름 그대로 더했어요.
 */
export function sourceText(item: PendingItem): string {
  const { source, aiDetected } = item.standard;
  if (source === 'code') return aiDetected ? 'PR · AI가 찾음' : '코드';
  const names: Record<string, string> = {
    ai_chat: 'AI 대화',
    figma: 'Figma',
    meeting: '회의',
    slack: 'Slack',
    wiki: '팀 위키',
  };
  return names[source] ?? source;
}

const label = (name: string) => `  ${name}  `;

/** 변경 줄 (결정 기록 3-5). 그 아래 한 줄은 빈 줄이거나 "다시 고쳐야 해요" 안내예요 */
function changeLines(item: PendingItem): string[] {
  const previous = item.standard.previousValue;
  const current = item.standard.value;
  if (previous === null) return [`${label('변경')}새로 생긴 결정 사항이에요`];
  if (isLargeChange(previous, current)) {
    return [
      `${label('변경')}문장을 새로 썼어요`,
      `${label('이전')}${cutEnd(previous, COLS - 8)}`,
    ];
  }
  const [oldWords, newWords] = changedWords(previous, current);
  if (oldWords && newWords) {
    // 일대일로 바뀌면 이전 텍스트는 흐리게, 바뀐 부분은 굵게 (10/12 부건)
    return [`${label('변경')}${dim(oldWords)} ${ARROW} ${bold(newWords)}`];
  }
  if (oldWords) return [`${label('변경')}"${bold(oldWords)}" 삭제`];
  if (newWords) return [`${label('변경')}"${bold(newWords)}" 추가`];
  return [`${label('변경')}값은 그대로예요`];
}

/**
 * 이전 버전에 "관계있다"로 답했으면 변경 줄 아래 빈 줄 자리에 넣는 안내 (SIL-77 부건님 의견).
 * 예: "지난번 변경(32자)을 반영하셨다면 다시 고쳐야 해요."
 */
function reworkLine(item: PendingItem): string {
  if (!item.previousAnswer?.affected) return '';
  const previous = item.standard.previousValue;
  const [oldWords] =
    previous === null ? [''] : changedWords(previous, item.standard.value);
  const what = oldWords ? `(${oldWords})` : '';
  return cutEnd(
    `${' '.repeat(8)}지난번 변경${what}을 반영하셨다면 다시 고쳐야 해요.`,
    COLS,
  );
}

function issueText(item: PendingItem): string {
  const done = item.issue.status === 'done';
  const text = cutEnd(
    `${item.issue.key} ${item.issue.title}`,
    COLS - 8 - (done ? 7 : 0),
  );
  return done ? `${text} ${green('[완료]')}` : text;
}

/** 맨 위 안내: 처음에는 전체 건수, 다음부터는 남은 건수(지금 보는 것 포함) */
function progress(index: number, total: number, recall: boolean): string {
  if (index === 1) {
    return bold(
      `${recall ? '' : '작업 전에 '}확인할 변경이 ${total}건 있어요.`,
    );
  }
  return bold(`확인할 변경이 ${total - index + 1}건 남았어요.`);
}

/** 변경 상세 화면 하나 (진행 표시 → 제목 → 바꾼 사람·시간 → 변경 → 이유 · 이슈 · 출처) */
export function detailScreen(
  item: PendingItem,
  index: number,
  total: number,
  options: DetailOptions = {},
): string {
  const now = options.now ?? new Date().toISOString();
  const area = areaOf(item);
  const tag = TAGS[kindOf(item)];
  const tagWidth = tag ? textWidth(tag) + 3 : 0;
  const headWidth = textWidth(area) + 3; // [영역] + 빈칸
  const title = cutEnd(item.standard.title, COLS - headWidth - tagWidth);
  const who = item.standard.changedBy ?? '누군가';
  return [
    '',
    progress(index, total, options.recall ?? false),
    '',
    ...(total > 1 ? [countChip(index, total)] : []),
    strongLine(`[${area}] ${bold(title)}${tagText(kindOf(item))}`),
    `${' '.repeat(headWidth)}${who}님이 ${formatWhen(item.standard.changedAt, now)}에 변경했어요.`,
    ...changeLines(item),
    reworkLine(item),
    `${label('이유')}${cutEnd(item.standard.reason, COLS - 8)}`,
    `${label('이슈')}${issueText(item)}`,
    `${label('출처')}${sourceText(item)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 답한 뒤 (PostToolUse: respond)
// ---------------------------------------------------------------------------

export interface RecordedAnswer {
  affected: boolean;
  known: boolean | null;
  /** 관계없다 이유 (보기에서 고른 글 또는 직접 쓴 글) */
  unaffectedReason: string | null;
}

/** "✓ 기록했어요  #5 · 관계있다 · 몰랐다" (+ 관계있다면 다음 작업부터 따른다는 둘째 줄) */
export function recordedLines(
  item: PendingItem,
  answer: RecordedAnswer,
): string[] {
  const relation = answer.affected ? '관계있다' : '관계없다';
  const second = answer.affected
    ? answer.known
      ? '알았다'
      : '몰랐다'
    : (answer.unaffectedReason ?? '');
  const lines = [
    `${check} 기록했어요  ${strongLine(cutEnd([item.issue.key, relation, second].join(' · '), COLS - 16))}`,
  ];
  if (answer.affected) {
    // 위키 notify.answer.next-run-context "다음 실행부터"에 맞춘 문구 (부건님 T3 결정 기록)
    lines.push('  다음 작업부터 바뀐 결정 사항을 따라요.');
  }
  return lines;
}

/** 모든 변경에 답했을 때 마무리 한 줄. 1건이면 "1건을 모두"가 어색해서 숫자를 빼요 */
export function allAnsweredLine(totalAtStart: number, recall: boolean): string {
  const count = totalAtStart > 1 ? ` ${totalAtStart}건` : '';
  const start = recall ? '' : ' 이제 작업을 시작할게요.';
  return bold(`확인할 변경${count}을 모두 답했어요.${start}`);
}

/** 질문을 닫고 넘어간 뒤 작업을 입력할 때마다 띄우는 한 줄 */
export function skippedReminder(count: number): string {
  return [
    '',
    strongLine(
      `● 확인할 변경 ${countText(count)}건 · ${bold(`"${RECALL_PHRASE}"`)}을 입력하면 변경 내역을 볼 수 있어요.`,
    ),
  ].join('\n');
}

/**
 * 확인할 변경을 불러오거나 답을 기록하지 못했을 때 (SIL-80 B4, notify.error.no-block-retry).
 * "변경 없음"으로 보이지 않게 실패를 알리고, 작업은 막지 않아요. 확인할 변경은 대기로 남아요.
 */
export function connectionFailedNotice(): string {
  return [
    '',
    strongLine('● 서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.'),
    `  ${bold(`"${RECALL_PHRASE}"`)}을 입력하면 다시 시작해요.`,
  ].join('\n');
}

/** "결정 사항 확인"을 입력했는데 답할 변경이 없을 때 */
export function nothingLeft(): string {
  return ['', `${check} 확인할 변경이 없어요.`].join('\n');
}

/**
 * 상세를 보는 중에 되돌려져서 자동으로 닫혔을 때 (SIL-77 부건님 의견).
 * 터미널은 띄운 화면을 고칠 수 없어서 답을 누른 뒤에 이 줄이 나와요.
 */
export function autoClosedLine(issueKey: string): string {
  return `${check} ${issueKey} 변경이 되돌려졌어요. 하려던 작업을 계속 진행하시면 돼요.`;
}

/** 입력 전체가 "결정 사항 확인"인지 (끝의 . ! ? 는 봐줘요) */
export function isRecall(prompt: string | null | undefined): boolean {
  return (prompt ?? '').trim().replace(/[.!?]+$/, '') === RECALL_PHRASE;
}
