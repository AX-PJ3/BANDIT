import type { SaveStandardResult, Standard, StandardVersion } from '@sil/core';

/**
 * T1 "결정 사항 변경 확인" 문구. 착수 안내 3절 T1에서 시작해 FigJam "T1 결정 사항 등록"(10/13)에 맞췄어요.
 * 부건님과 정하는 문구라 여기에만 둬요.
 * 에이전트는 CLAUDE.md "팀 위키 규칙"을 따라 이 파일을 읽고 그대로 보여 줘요.
 * 화면·도구 문구에서는 "기준" 대신 "결정 사항"이라고 써요 (copy.term.standard).
 * {자리}에는 get_standard로 읽은 값과 바꿀 값을 넣어요.
 */
export const T1_COPY = {
  /**
   * ①② 묻기 (AskUserQuestion). header는 12자 이하.
   * 선택지 설명은 끝에 마침표를 찍지 않고, Claude가 쓰는 글은 문장마다 마침표를 찍어요 (PR #24 부건님 확정)
   */
  ask: {
    header: '결정 사항 등록',
    // 첫 줄은 FigJam "T1 결정 사항 등록" ①② 문구 (10/13)
    question:
      '기존 결정 사항과 다른 작업이에요. 그래도 진행할까요?\n' +
      '{title}\n' +
      '  지금 값: {currentValue}\n' +
      '  바꿀 값: {newValue}',
    yes: {
      label: '예',
      description:
        '결정 사항을 등록하고 작업을 진행할게요. 등록될 모습 먼저 보여 드릴게요',
    },
    no: {
      label: '아니오',
      description:
        '부탁하신 작업은 멈춰 둘게요. 기존 결정 사항은 그대로 유지할게요',
    },
  },
  /**
   * 아니오를 고른 뒤. 이 줄을 보여 주고 작업을 멈춰요 (FigJam 10/13 "작업 끝").
   * 사람이 "40자로 작업해 줘"처럼 어떻게 할지 다시 말할 때만 진행해요 (10/13 경하님)
   */
  notChanged: '기존 결정 사항을 그대로 유지할게요. 다른 작업을 시작해 주세요.',
  /** 대화에서 이유를 유추할 수 없을 때 글로 묻기. 답을 한 문장으로 정리해 ③에 넣어요 */
  reasonPrompt:
    '이 결정 사항을 바꾸는 이유를 작성해 주세요. 작성해 주신 내용을 기반으로 정리해 드릴게요.',
  /** ③ 등록될 모습 (AskUserQuestion). 이슈 표는 이슈를 읽는 도구가 생기면 넣어요 */
  preview: {
    header: '결정 사항 등록',
    /** hook(`hook-preview.ts`)이 꾸며서 띄우는 ③ 본문 */
    question:
      '이렇게 등록할게요.\n' +
      '[{area}] {title}\n' +
      '  값: {value}\n' +
      '  이유: {reason}\n' +
      '  항상 적용: {alwaysOn}',
    register: { label: '등록하기', description: '결정 사항을 저장해요' },
    /**
     * 연결된 이슈가 있을 때의 등록하기. 저장 전에 연결된 이슈를 알 방법이 없어서
     * 이슈를 읽는 도구가 생기기 전까지는 `register`만 써요
     */
    registerWithIssues: {
      label: '등록하기',
      description: '결정 사항을 저장하고 연결되어 있는 이슈 담당자에게 알려요',
    },
    edit: { label: '수정하기', description: '수정할 내용을 말해 주세요' },
    cancel: {
      label: '취소하기',
      description: '결정 사항 등록을 취소해요. 기존 결정 사항을 유지해요',
    },
    /** ③을 hook이 띄운 뒤 묻는 짧은 선택 창 (AskUserQuestion). ③ 내용을 다시 적지 않아요 */
    confirm: '이대로 등록할까요?',
  },
  /** 수정하기를 고른 뒤 글로 묻기. 고친 뒤 ③을 다시 보여 줘요 */
  editPrompt: '어떤 부분을 수정할까요?',
  /**
   * ③에서 취소하기. 하던 작업을 멈추고 사람의 말을 기다려요 (FigJam 10/13).
   * 선택 창을 Esc로 닫았을 때도 다음 말에서 이 문구를 보여 줘요 (10/13 경하님).
   * withTask는 다른 작업 중에 T1이 떴을 때, noTask는 결정 사항을 바꿔 달라는 것 자체가 요청이었을 때예요
   */
  cancelled: {
    withTask:
      '결정 사항 등록을 취소했어요. 기존 결정 사항이 유지돼 하던 작업은 멈춰 둘게요. 어떻게 진행할지 알려 주세요.',
    noTask: '결정 사항 등록을 취소했어요. 결정 사항은 그대로예요.',
  },
  /** ④ 등록 완료 (FigJam). 확인할 변경을 보낸 이슈 수는 이슈를 읽는 도구가 생기면 넣어요 */
  saved: '✓ 결정 사항을 등록했어요 (v{version}) · 항상 적용 {alwaysOn}',
} as const;

// 문구에 넣을 값의 모양은 core 타입에서 골라 써요 (타입은 core에만)
export type T1QuestionValues = Pick<StandardVersion, 'title'> & {
  currentValue: StandardVersion['value'];
  newValue: StandardVersion['value'];
};

export type T1PreviewValues = Pick<Standard, 'area'> &
  Pick<StandardVersion, 'title' | 'value' | 'reason' | 'alwaysOn'>;

export type T1SavedValues = Pick<SaveStandardResult, 'version'> &
  Pick<StandardVersion, 'alwaysOn'>;

const yesNo = (value: boolean) => (value ? '예' : '아니오');

/** {자리}를 값으로 채워요 */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)\}/g,
    (slot, key: string) => values[key] ?? slot,
  );
}

/** ①② 질문 문구 */
export function renderT1Question(values: T1QuestionValues): string {
  return fill(T1_COPY.ask.question, { ...values });
}

/** ③ 등록될 모습 문구 */
export function renderT1Preview(values: T1PreviewValues): string {
  return fill(T1_COPY.preview.question, {
    ...values,
    alwaysOn: yesNo(values.alwaysOn),
  });
}

/** ④ 등록 완료 문구 */
export function renderT1Saved(values: T1SavedValues): string {
  return fill(T1_COPY.saved, {
    version: String(values.version),
    alwaysOn: yesNo(values.alwaysOn),
  });
}
