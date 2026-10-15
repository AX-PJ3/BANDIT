/**
 * 터미널 알림 화면 글을 만들어요 (착수 안내 T2~T5, 부건님 SIL-68 시안).
 *
 * 모양과 문구는 부건님 결정 기록(cli-design-notes/터미널-알림-흐름-결정기록.md, T3-질문과-답-결정기록.md)과
 * 움직이는 시안(prototype/notify-prototype/proto/notice.py)을 그대로 옮겼어요. 비교 방식은 결정된 "요약(E)"만 써요.
 * 화면은 v2 시안(10/13 부건, prototype/업데이트-내역.md "v2 화면")을 따라요: 노란 막대, 위아래 선과 머리표,
 * 청록 제목, 종류 태그 네 가지, 상세 줄, 초록 "✓ 기록했어요" (SIL-67).
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
const YELLOW = '33';

/**
 * 상태 줄(켤 때 첫 줄, 닫은 뒤 한 줄, 연결 실패) 앞에 세우는 노란 막대: 노랑을 반전한 칸 하나 + 빈칸 (v2).
 * v1의 ●는 Claude가 답할 때 붙이는 점과 같아서 Claude의 말처럼 읽혔어요 (v1 피드백 P1·P2).
 * 막대와 빈칸이 2칸이라 아래 설명 줄(2칸 들여쓰기)과 글자 시작이 맞아요.
 */
const BAR = `${esc(YELLOW)}${esc('7')} ${esc('27')}${esc('39')} `;
const statusLine = (text: string) => `${BAR}${strongLine(text)}`;

/** 입력할 말: 노란 굵은 글자, 따옴표는 터미널 기본 글자색 (v2) */
const recallWord = () =>
  `"${esc('1')}${esc(YELLOW)}${RECALL_PHRASE}${esc(STRONG)}${esc('22')}"`;

/** 상세 제목: 청록 굵은 글자 (v2). 끝나면 줄 색으로 돌아가 뒤의 태그가 회색이 되지 않게 해요 */
const TITLE_COLOR = '36';
const titleText = (title: string) =>
  `${esc('1')}${esc(TITLE_COLOR)}${title}${esc(STRONG)}${esc('22')}`;

/** 상세를 묶는 선. 어느 설정에서나 1칸인 영문 하이픈이에요 (상자 선 ─ 는 한국어 글꼴에서 2칸) */
const RULE = '-';
/** 상세 줄은 두 줄까지 접고, 넘치면 끝을 … 으로 (값은 최대 120자) */
const DETAIL_LINES = 2;

/** 건수 숫자: 노란 굵은 글자. 숫자 뒤에는 기본 글자색으로 돌아가요 */
const countText = (count: number) =>
  `${esc('1')}${esc(YELLOW)}${count}${esc(STRONG)}${esc('22')}`;

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
  // 첫 줄(상태 줄)에만 노란 막대. 아래 설명 줄에는 넣지 않아요 (v2)
  return [
    '',
    statusLine(
      `${areaLabel(pending)} 결정 사항이 ${total}${countText(pending.length)}건 변경되었어요.`,
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

/** 제목 끝 종류 태그. v2에서 일반 변경에도 (변경)을 붙여요. 폐기는 아직 알리지 않아서 없어요 */
const TAGS: Record<ChangeKind, string> = {
  normal: '변경',
  new: '신규',
  revert: '되돌림',
};

/**
 * 제목 끝의 종류 표시.
 * - (되돌림)은 괄호 글자에 글자색만 입혀요 (notify.revert.mark-by-screen). 색은 SIL-81에서 정하는 중이라
 *   부건님과 정한 대로 임시로 회색(테마 16색의 밝은 검정 90)을 써요 (10/14).
 * - (변경)·(신규)는 시안대로 흐린 글자예요.
 */
function tagText(kind: ChangeKind): string {
  const tag = TAGS[kind];
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

/**
 * 값 전체를 낱말 단위로 76칸 안에 접어요. 둘째 줄은 이름표 폭(8칸)만큼 들여 써요.
 * 두 줄을 넘으면 둘째 줄 끝을 … 으로 줄여요.
 */
function detailValueLines(text: string): string[] {
  const budget = COLS - 8;
  const rows: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next) > budget) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  rows.push(current);
  const shown =
    rows.length > DETAIL_LINES
      ? [
          ...rows.slice(0, DETAIL_LINES - 1),
          cutEnd(`${rows[DETAIL_LINES - 1]} …`, budget),
        ]
      : rows;
  return shown.map(
    (row, i) =>
      `${i === 0 ? label('상세') : ' '.repeat(8)}${strongLine(cutEnd(row, budget))}`,
  );
}

/**
 * 변경 줄과 상세 줄 (v2 "요약"). 종류는 제목 끝 태그가 말하고, 상세는 지금 값 전체예요.
 * - 변경·되돌림: 바뀐 낱말 요약(변경 줄) 또는 크게 바뀌면 이전 값 한 줄 → 상세
 * - 신규: 상세만
 * 지금 값이 상세로 들어가서 위키 notify.terminal.show-fields(이전 값·지금 값)와 맞아요.
 * 그 아래 한 줄은 빈 줄이거나 "다시 고쳐야 해요" 안내예요.
 */
function changeLines(item: PendingItem): string[] {
  const previous = item.standard.previousValue;
  const current = item.standard.value;
  const valueLines = detailValueLines(current);
  if (previous === null) return valueLines;
  if (isLargeChange(previous, current)) {
    return [`${label('이전')}${cutEnd(previous, COLS - 8)}`, ...valueLines];
  }
  return [`${label('변경')}${changeWhat(previous, current)}`, ...valueLines];
}

/** 바뀐 낱말만. 일대일로 바뀌면 이전은 흐리게, 지금은 굵게 (10/12 부건) */
function changeWhat(previous: string, current: string): string {
  const [oldWords, newWords] = changedWords(previous, current);
  if (oldWords && newWords) {
    return `${dim(oldWords)} ${ARROW} ${bold(newWords)}`;
  }
  if (oldWords) return `"${bold(oldWords)}" 삭제`;
  if (newWords) return `"${bold(newWords)}" 추가`;
  return '값은 그대로예요';
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

/** 머리표 문장: 처음에는 전체 건수, 다음부터는 남은 건수(지금 보는 것 포함) */
function progress(index: number, total: number, recall: boolean): string {
  if (index === 1) {
    return `${recall ? '' : '작업 전에 '}확인할 변경이 ${total}건 있어요`;
  }
  return `확인할 변경이 ${total - index + 1}건 남았어요`;
}

/**
 * 위 선: "-- [1/3] 작업 전에 확인할 변경이 3건 있어요 -------" (1건이면 칩 없이, v2).
 * 칩은 머리표 문장 왼쪽에 두고, 문장은 Claude Code 기본 회색·보통 굵기예요. 선과 칩은 기본 글자색이에요.
 */
function ruleTop(index: number, total: number, recall: boolean): string {
  const lead = `${RULE.repeat(2)} `;
  const chip = total > 1 ? `${countChip(index, total)} ` : '';
  const chipWidth = total > 1 ? textWidth(` ${index}/${total}  `) : 0;
  const head = `${progress(index, total, recall)} `;
  const fill = RULE.repeat(
    Math.max(2, COLS - textWidth(lead + head) - chipWidth),
  );
  return `${strongLine(lead)}${chip}${head}${strongLine(fill)}`;
}

const ruleBottom = () => strongLine(RULE.repeat(COLS));

/** 변경 상세 화면 하나 (위 선 → 제목·태그 → 바꾼 사람·시간 → 변경·상세 → 이유 · 이슈 · 출처 → 아래 선) */
export function detailScreen(
  item: PendingItem,
  index: number,
  total: number,
  options: DetailOptions = {},
): string {
  const now = options.now ?? new Date().toISOString();
  const area = areaOf(item);
  const kind = kindOf(item);
  const tagWidth = textWidth(TAGS[kind]) + 3;
  const headWidth = textWidth(area) + 3; // [영역] + 빈칸
  const title = cutEnd(item.standard.title, COLS - headWidth - tagWidth);
  const who = item.standard.changedBy ?? '누군가';
  return [
    '',
    ruleTop(index, total, options.recall ?? false),
    strongLine(`[${area}] ${titleText(title)}${tagText(kind)}`),
    `${' '.repeat(headWidth)}${who}님이 ${formatWhen(item.standard.changedAt, now)}에 변경했어요.`,
    ...changeLines(item),
    reworkLine(item),
    `${label('이유')}${cutEnd(item.standard.reason, COLS - 8)}`,
    `${label('이슈')}${issueText(item)}`,
    `${label('출처')}${sourceText(item)}`,
    ruleBottom(),
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

/** "✓ 기록했어요  #5 · 관계있다 · 몰랐다" (+ 관계있다면 다음 작업부터 따른다는 둘째 줄). "✓ 기록했어요"는 초록 (v2) */
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
    `${green('✓ 기록했어요')}  ${strongLine(cutEnd([item.issue.key, relation, second].join(' · '), COLS - 16))}`,
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

/**
 * 질문을 닫고 넘어간 뒤 Claude가 작업을 마칠 때마다 입력 칸 바로 위에 띄우는 한 줄 (notify.terminal.new-after-answered v2).
 * 모양은 v2 상태 줄(노란 막대)이에요. 입력할 때 띄우면 작업 결과에 밀려 올라가서 못 봤어요 (v1 피드백 P1·P3).
 */
export function skippedReminder(count: number): string {
  return [
    '',
    statusLine(
      `확인할 변경 ${countText(count)}건 · ${recallWord()}을 입력하면 변경 내역을 볼 수 있어요.`,
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
    statusLine('서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.'),
    `  ${recallWord()}을 입력하면 다시 시작해요.`,
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

// ---------------------------------------------------------------------------
// 이슈 반영 (SIL-93, 부건님 10/15 시안 notice.py "이슈 반영")
// 관계있다로 답한 변경을 내 이슈에 반영했다고 사람이 직접 표시해요 (notify.check.reflected v2).
// 말은 위키 app.card.three-steps v2의 "이슈 반영"과 같아요. 터미널에서 "작업"은 지금 하는 코드 작업이라서요.
// ---------------------------------------------------------------------------

/** 이슈 반영을 부르는 말 (입력 전체가 이 말일 때만) */
export const REFLECT_PHRASE = '이슈 반영';

/** 입력 전체가 "이슈 반영"인지 (끝의 . ! ? 는 봐줘요) */
export function isReflectPrompt(prompt: string | null | undefined): boolean {
  return (prompt ?? '').trim().replace(/[.!?]+$/, '') === REFLECT_PHRASE;
}

/** 이슈 반영할 수 있는 변경: 관계있다로 답했고 아직 표시하지 않은 것 */
export function reflectableItems(items: PendingItem[]): PendingItem[] {
  return items.filter(
    (item) =>
      item.status === 'answered' &&
      item.answer?.affected === true &&
      !item.reflected,
  );
}

/** 제목 줄: [영역] 청록 제목 (태그). 상세와 같아요 */
function titleLine(item: PendingItem): string {
  const area = areaOf(item);
  const kind = kindOf(item);
  const tagWidth = textWidth(TAGS[kind]) + 3;
  const title = cutEnd(
    item.standard.title,
    COLS - (textWidth(area) + 3) - tagWidth,
  );
  return strongLine(`[${area}] ${titleText(title)}${tagText(kind)}`);
}

/** 목록에서 무엇이 바뀌었는지 한 줄: 작게 바뀌면 변경 줄, 크게 바뀌거나 신규면 지금 값 */
function reflectValueLine(item: PendingItem): string {
  const previous = item.standard.previousValue;
  const current = item.standard.value;
  if (previous === null || isLargeChange(previous, current)) {
    return `${label('상세')}${strongLine(cutEnd(current, COLS - 8))}`;
  }
  return `${label('변경')}${changeWhat(previous, current)}`;
}

/**
 * "이슈 반영"을 입력했을 때 목록. 상세와 같은 위아래 선으로 묶고, 한 건은 제목 · 바뀐 것 · 이슈 세 줄이에요.
 * 고르는 것은 바로 아래 선택 화면이 해요. 목록과 선택 화면의 순서가 같아요.
 * 여러 건이면 아래 선 밑에 "하나도 없으면 Esc" 한 줄을 둬요. 시안은 질문 아래에 두지만 선택 화면에는 글을 더할 수 없어서예요.
 */
export function reflectScreen(items: PendingItem[]): string {
  const lead = `${RULE.repeat(2)} `;
  const head = `관계있다로 답한 변경이 ${items.length}건 있어요 `;
  const top = `${strongLine(lead)}${head}${strongLine(
    RULE.repeat(Math.max(2, COLS - textWidth(lead + head))),
  )}`;
  const rows = items.flatMap((item) => [
    titleLine(item),
    reflectValueLine(item),
    `${label('이슈')}${issueText(item)}`,
  ]);
  const help =
    items.length > 1
      ? ['  반영한 변경이 하나도 없으면 Esc를 눌러 닫아 주세요.']
      : [];
  return ['', top, ...rows, ruleBottom(), ...help].join('\n');
}

/** "✓ 이슈에 반영했어요  #7 · 앱 알림 제목은 32자 이하로 쓴다". 기록 줄과 같은 모양이에요 */
export function reflectedLine(item: PendingItem): string {
  const done = '✓ 이슈에 반영했어요';
  const rest = cutEnd(
    `${item.issue.key} · ${item.standard.title}`,
    COLS - textWidth(done) - 2,
  );
  return `${green(done)}  ${strongLine(rest)}`;
}

/** 이슈 반영할 변경이 없을 때. 관계있다로 답한 변경만 등록할 수 있다는 것을 함께 알려요 */
export function nothingToReflect(): string {
  return [
    '',
    `${check} 이슈 반영할 변경이 없어요.`,
    '  관계있다로 답한 변경만 이슈 반영으로 등록할 수 있어요.',
  ].join('\n');
}

/** 안내 줄 앞 회색 막대: 글자색 없이 반전만 해서 Claude Code 회색이 칸 바탕이 돼요 */
const GRAY_BAR = `${esc('7')} ${esc('27')} `;

/**
 * 이슈 반영할 변경이 남았을 때 작업을 입력하면 띄우는 안내 한 줄. 한 세션에 한 번만 (10/15 부건).
 * 상태 줄이 아니라 안내라서 노란 막대 대신 회색 막대를 쓰고, 건수는 넣지 않아요. 입력할 말만 노란 굵은 글자예요.
 */
export function reflectReminder(): string {
  const word = `${esc('1')}${esc(YELLOW)}${REFLECT_PHRASE}${esc('39')}${esc('22')}`;
  return [
    '',
    `${GRAY_BAR}확인한 결정 사항을 이슈에도 반영했다면, "${word}"을 입력해 주세요.`,
  ].join('\n');
}

/** 선택 화면 보기에 쓰는 바뀐 것 (색 없이) */
export function reflectWhatText(item: PendingItem): string {
  const previous = item.standard.previousValue;
  const current = item.standard.value;
  if (previous === null) return '새로 생긴 결정 사항이에요';
  const [oldWords, newWords] = changedWords(previous, current);
  if (isLargeChange(previous, current) || !(oldWords && newWords)) {
    return '문장을 새로 썼어요';
  }
  return `${oldWords} ${ARROW} ${newWords}`;
}

/** 선택 화면 보기 설명 앞의 종류 낱말 (변경·신규·되돌림) */
export function kindWord(item: PendingItem): string {
  return TAGS[kindOf(item)];
}
