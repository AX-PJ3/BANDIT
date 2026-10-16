/**
 * Claude Code 선택 화면(AskUserQuestion)으로 묻는 질문 세 개예요 (부건님 터미널 알림 흐름 결정 기록 3-3, T3 결정 기록).
 * 문구를 한곳에 두고 hooks가 Claude에게 "주어진 그대로" 묻게 해요. 추천 표시나 기본 선택은 두지 않아요.
 */
import type { PendingItem } from '../listPending.ts';
import { kindWord, reflectWhatText } from './screens.ts';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  /** 선택 화면 맨 위 이름표. 같은 변경이 이슈 두 개에 걸려도 어느 이슈에 답하는지 보이게 이슈 번호를 넣어요 */
  header: string;
  options: QuestionOption[];
}

export interface ChangeQuestions {
  relation: Question;
  known: Question;
  reason: Question;
}

/** 관계있다 / 관계없다 / 잘 모르겠다 보기 (위키 copy.term.related, notify.answer.two-questions v2) */
export const RELATION_LABELS = {
  affected: '관계있다',
  unaffected: '관계없다',
  unsure: '잘 모르겠다',
};
/** 알았다 / 몰랐다 보기 */
export const KNOWN_LABELS = { known: '알았다', unknown: '몰랐다' };

/** "관계없다" 이유 보기 3개. 고른 글을 그대로 이유로 저장해요. 직접 쓴 글도 이유로 받아요 */
export const UNAFFECTED_REASONS: QuestionOption[] = [
  {
    label: '내 작업 범위가 아니에요',
    description: '이 결정 사항이 다루는 화면·기능을 내가 맡고 있지 않아요',
  },
  {
    label: '내 이슈와 연결이 잘못됐어요',
    description: '이 결정 사항이 내 이슈에 잘못 이어져 있어요',
  },
  {
    label: '바뀐 부분은 내 작업에 안 쓰여요',
    description:
      '결정 사항은 내 작업과 이어져 있지만, 이번에 바뀐 부분은 영향이 없어요',
  },
];

/** 변경 하나에 대해 물을 질문 세 개 */
export function questionsFor(item: PendingItem): ChangeQuestions {
  const header = item.issue.key;
  return {
    relation: {
      question: '이 변경이 내 이슈와 관계가 있나요?',
      header,
      options: [
        {
          label: RELATION_LABELS.affected,
          description: '내 이슈 결과물이 이 변경에 맞춰 바뀌어야 해요',
        },
        {
          label: RELATION_LABELS.unaffected,
          description: '내 이슈와는 상관없는 변경이에요',
        },
        // 바로 판단하기 어려울 때 Esc나 Chat about this 대신 고르는 보기. 답으로 기록하지 않아요 (notify.answer.unsure-later)
        {
          label: RELATION_LABELS.unsure,
          description: '지금은 판단하기 어려워요. 나중에 답할게요',
        },
      ],
    },
    // 같은 변경이 이슈 두 개에 걸리면 두 번째에서 "방금 봤으니 알았다"로 답하기 쉬워서 기준 시점을 "오늘 알림"으로 적어요
    known: {
      question: '이 변경을 이미 알고 있었나요?',
      header,
      options: [
        {
          label: KNOWN_LABELS.known,
          description: '오늘 알림을 보기 전에 알고 있었어요',
        },
        {
          label: KNOWN_LABELS.unknown,
          description: '오늘 알림으로 처음 알았어요',
        },
      ],
    },
    reason: {
      question: '왜 관계없나요?',
      header,
      options: UNAFFECTED_REASONS,
    },
  };
}

// ---------------------------------------------------------------------------
// 이슈 반영 질문 (SIL-93, 부건님 10/15 시안 notice.py)
// ---------------------------------------------------------------------------

/** 한 건일 때 확인 질문의 "예" 보기. 이걸 골랐을 때만 등록해요 */
export const REFLECT_YES = '이슈에 반영했어요';
/** 선택 화면은 질문 하나에 보기 2~4개, 한 번에 질문 4개까지예요 */
const REFLECT_PER_QUESTION = 4;
const REFLECT_MAX_QUESTIONS = 4;

/** 이슈 반영 질문 하나. 보기마다 어느 확인할 변경인지(pendingCheckId)를 함께 둬요 */
export interface ReflectQuestion extends Question {
  multiSelect: boolean;
  options: (QuestionOption & { pendingCheckId: string })[];
}

/**
 * 몇 건을 질문 몇 개에 나눌지. 탭마다 보기가 2개 이상이어야 해서 4건씩 채우지 않고 고르게 나눠요.
 * 예: 4 → [4], 5 → [3, 2], 9 → [3, 3, 3]. 16건이 넘으면 앞 16건만 물어요.
 */
export function reflectGroups(count: number): number[] {
  const capped = Math.min(count, REFLECT_PER_QUESTION * REFLECT_MAX_QUESTIONS);
  if (capped <= 0) return [];
  const groups = Math.ceil(capped / REFLECT_PER_QUESTION);
  return Array.from(
    { length: groups },
    (_, i) => Math.floor(capped / groups) + (i < capped % groups ? 1 : 0),
  );
}

/**
 * 이슈 반영 질문.
 * - 한 건: "이 변경을 이슈에 반영했나요?" 예/아니오. 묻지 않고 바로 저장하면 잘못 표시될 수 있어서 한 건에도 물어요 (10/15)
 * - 여러 건: "어느 변경을 이슈에 반영했나요?" 여러 개 고르기. 5건부터는 질문을 나눠 탭으로 띄워요
 * 보기 이름은 이슈와 제목, 설명은 종류와 바뀐 것이에요. 선택 화면에는 색을 쓸 수 없어서 글만 넣어요.
 */
export function reflectQuestionsFor(items: PendingItem[]): ReflectQuestion[] {
  const [only] = items;
  if (items.length === 1 && only) {
    return [
      {
        question: '이 변경을 이슈에 반영했나요?',
        header: only.issue.key,
        multiSelect: false,
        options: [
          {
            label: REFLECT_YES,
            description: '이슈 반영으로 등록해요',
            pendingCheckId: only.pendingCheckId,
          },
          {
            label: '아직 안 했어요',
            description: '등록하지 않고 그대로 둬요',
            pendingCheckId: only.pendingCheckId,
          },
        ],
      },
    ];
  }
  const sizes = reflectGroups(items.length);
  let at = 0;
  return sizes.map((size, index) => {
    const group = items.slice(at, at + size);
    at += size;
    const numbered = sizes.length > 1 ? ` ${index + 1}/${sizes.length}` : '';
    return {
      question: `어느 변경을 이슈에 반영했나요?${sizes.length > 1 ? ` (${index + 1}/${sizes.length})` : ''}`,
      header: `이슈 반영${numbered}`,
      multiSelect: true,
      options: group.map((item) => {
        return {
          label: cutLabel(`${item.issue.key} ${item.standard.title}`),
          description: `${kindWord(item)} · ${reflectWhatText(item)}`,
          pendingCheckId: item.pendingCheckId,
        };
      }),
    };
  });
}

/** 보기 이름은 60자까지 */
function cutLabel(text: string): string {
  const chars = Array.from(text);
  return chars.length <= 60 ? text : `${chars.slice(0, 59).join('')}…`;
}
