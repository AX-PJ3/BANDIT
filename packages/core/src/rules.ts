/**
 * 팀 위키(team-wiki/)의 형식 규칙을 코드로 옮긴 것이에요. 브라우저(앱 화면)에서도 돌아가요.
 *
 * 같은 규칙이 세 곳에 있어요. 하나를 바꾸면 나머지도 함께 바꿔요.
 * - team-wiki/scripts/check_wiki.py (위키 파일 검사)
 * - supabase/migrations (DB가 거절하는 규칙)
 * - 여기 (MCP 입력 검사, 저장 뒤 경고, 화면 표시)
 */
import type { PendingCheckStatus, StandardSource } from './types/index.ts';

/** 기준 ID: 영역.주제.규칙 세 부분. 영역은 영문 소문자만 (data.standard.id-format, check_wiki.py ID_RE) */
export const STANDARD_ID_PATTERN = /^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$/;

/** 제목은 40자 이하 (기준 작성 원칙 4, check_wiki.py MAX_TITLE) */
export const MAX_STANDARD_TITLE_LENGTH = 40;

/** 값에 들어 있으면 규칙이 두 개일 수 있는 말 (wiki.standard.one-rule) */
const SPLIT_WORDS = ['그리고', '또한', '단,'];

/** 확인할 수 없는 말 (기준 작성 원칙 5) */
const VAGUE_WORDS = [
  '적절히',
  '적당히',
  '가능하면',
  '필요시',
  '필요 시',
  '등등',
];

/**
 * 기준 문장을 check_wiki.py와 같은 규칙으로 살펴봐요. 저장을 막지는 않고 경고만 돌려줘요.
 * 경고가 있으면 AI는 사람에게 기준을 나눌지 물어요.
 */
export function checkStandardWording(input: {
  title: string;
  value: string;
}): string[] {
  const warnings: string[] = [];
  const title = input.title.trim();
  const value = input.value.trim();
  if (title.length > MAX_STANDARD_TITLE_LENGTH) {
    warnings.push(
      `제목이 ${title.length}자예요. ${MAX_STANDARD_TITLE_LENGTH}자 이하로 줄여요`,
    );
  }
  for (const word of SPLIT_WORDS) {
    if (value.includes(word)) {
      warnings.push(
        `값에 '${word}'가 있어요. 규칙이 두 개라면 결정 사항을 나눠요 (wiki.standard.one-rule)`,
      );
    }
  }
  for (const word of VAGUE_WORDS) {
    if (value.includes(word) || title.includes(word)) {
      warnings.push(
        `'${word}'는 확인할 수 없는 말이에요. 숫자나 조건으로 바꿔요`,
      );
    }
  }
  return warnings;
}

/** 아직 답을 기다리는 확인할 변경 상태: 대기뿐이에요 (10/12 피드백: 대기·답함·대체됨·자동 닫힘) */
export const OPEN_PENDING_CHECK_STATUSES = [
  'pending',
] as const satisfies readonly PendingCheckStatus[];

export function isOpenPendingCheck(status: PendingCheckStatus): boolean {
  return (OPEN_PENDING_CHECK_STATUSES as readonly string[]).includes(status);
}

/** 확인할 변경 상태를 화면에 쓰는 말 (자동 닫힘은 화면에 나오지 않아요) */
export const PENDING_CHECK_STATUS_LABELS: Record<PendingCheckStatus, string> = {
  pending: '대기',
  answered: '답함',
  superseded: '새 버전으로 대체됨',
  auto_closed: '자동 닫힘',
};

/** 관계없는 이유는 100자 이하 (notify.answer.unrelated-reason, DB answers_unaffected_reason_length) */
export const MAX_UNAFFECTED_REASON_LENGTH = 100;

/**
 * 나에게 온 변경 카드의 출처 칩에 쓰는 말 (app.card.source-chip-only).
 * CHANGELOG의 SOURCE_LABELS와 달리 wiki는 "위키"예요.
 */
export const SOURCE_CHIP_LABELS: Record<StandardSource, string> = {
  ai_chat: 'AI 대화',
  code: '코드',
  meeting: '회의',
  figma: 'Figma',
  slack: 'Slack',
  wiki: '위키',
};

/** 출처를 CHANGELOG에 쓰는 말 (data.changelog.format). wiki는 예전 위키에서 옮겨 온 것이라 "문서"예요 */
export const SOURCE_LABELS: Record<StandardSource, string> = {
  code: '코드',
  ai_chat: 'AI 대화',
  figma: 'Figma',
  meeting: '회의',
  slack: 'Slack',
  wiki: '문서',
};

/**
 * 되돌림인지 비교할 때 쓰는 값 다듬기 (detect.change.revert-mark).
 * 전각 글자를 반각으로(NFKC) → 공백 글자를 모두 지움(띄어쓰기는 보지 않아요) → 끝의 마침표(. 또는 。) 제거.
 * NFKC라서 "㎡"와 "m2"처럼 호환 글자도 같은 값으로 봐요.
 * SQL `public.normalize_standard_value`와 같은 규칙이에요. 한쪽을 고치면 다른 쪽도 고쳐요.
 * 공백 글자 목록은 SQL과 똑같이 직접 적어요(`\s`·`[[:space:]]`는 둘이 달라서 쓰지 않아요).
 * 비교에만 쓰고, 저장하는 값은 사람이 넣은 글자 그대로예요.
 */
export function normalizeStandardValue(text: string): string {
  return text
    .normalize('NFKC')
    .replace(STANDARD_VALUE_SPACES, '')
    .replace(/[.。]+$/u, '');
}

/** 다듬기에서 지우는 공백 글자. SQL `normalize_standard_value`의 목록과 같아요 */
const STANDARD_VALUE_SPACES =
  /[\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/gu;
