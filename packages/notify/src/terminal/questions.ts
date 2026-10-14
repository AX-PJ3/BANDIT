/**
 * Claude Code 선택 화면(AskUserQuestion)으로 묻는 질문 세 개예요 (부건님 터미널 알림 흐름 결정 기록 3-3, T3 결정 기록).
 * 문구를 한곳에 두고 hooks가 Claude에게 "주어진 그대로" 묻게 해요. 추천 표시나 기본 선택은 두지 않아요.
 */
import type { PendingItem } from '../listPending.ts';

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

/** 관계있다 / 관계없다 보기 (위키 copy.term.related) */
export const RELATION_LABELS = { affected: '관계있다', unaffected: '관계없다' };
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
