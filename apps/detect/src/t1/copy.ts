import type { Standard, StandardVersion } from '@sil/core';

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
    // 지금 값·바꿀 값은 앞의 다른 결정 사항 화면(`conflicts`)이 보여 줘서 질문은 한 줄이에요 (프로토타입 10/14)
    question: '기존 결정 사항과 다른 작업이에요. 그래도 진행할까요?',
    yes: {
      label: '예',
      description:
        '결정 사항을 등록하고 작업을 진행할게요. 등록될 모습 먼저 보여 드릴게요',
    },
    no: {
      label: '아니요',
      description:
        '부탁하신 작업은 멈춰 둘게요. 기존 결정 사항은 그대로 유지할게요',
    },
    /** 선택지 대신 글로 답했을 때. 이 줄을 쓰고 같은 질문을 다시 물어요 (프로토타입 10/14) */
    typedReply: '예 또는 아니요로 골라 주세요.',
  },
  /**
   * 다른 결정 사항 화면. hook(`hook-conflicts.ts`)이 `screens.ts`의 모양으로 띄워요 (프로토타입 show_conflicts, 10/14).
   * 머리표와 첫 줄 이름은 T1이 어떻게 시작됐는지(`T1Trigger`)에 따라 달라요: 에이전트가 알아챈 작업 / 사람이 직접 한 요청.
   * 구분은 바꾸려는 결정 사항이면 변경, 바꾸면 함께 어긋나는 다른 결정 사항이면 어긋남이에요.
   * "충돌"은 용어집에서 동시 수정을 뜻해서 "달라요"를 써요 (10/13)
   */
  conflicts: {
    head: {
      agent: '부탁하신 작업이 기존 결정 사항과 달라요',
      direct: '요청하신 변경이 기존 결정 사항과 달라요',
    },
    requestLabel: { agent: '작업', direct: '요청' },
    kinds: { change: '변경', mismatch: '어긋남' },
    /** 다른 결정 사항이 없을 때(새 결정 사항) 요청 줄 없이 초록 막대 한 줄만 (프로토타입 10/13) */
    none: '요청하신 변경과 다른 결정 사항이 없어요',
  },
  /**
   * 아니요를 고른 뒤. 이 줄을 보여 주고 작업을 멈춰요 (FigJam 10/13 "작업 끝").
   * 사람이 "40자로 작업해 줘"처럼 어떻게 할지 다시 말할 때만 진행해요 (10/13 경하님)
   */
  notChanged: '기존 결정 사항을 그대로 유지할게요. 다른 작업을 시작해 주세요.',
  /** 대화에서 이유를 유추할 수 없을 때 글로 묻기. 답을 한 문장으로 정리해 ③에 넣어요 */
  reasonPrompt:
    '이 결정 사항을 바꾸는 이유를 작성해 주세요. 작성해 주신 내용을 기반으로 정리해 드릴게요.',
  /**
   * ③ 등록될 모습. 본문은 hook(`hook-preview.ts`)이 `screens.ts`의 모양으로 띄우고, 그 뒤 AskUserQuestion으로 물어요.
   * 부건님 프로토타입 "T1 결정 사항 등록"(10/14)과 같아요. 이슈 표는 `preview.ts`가 팀 DB에서 읽은 받는 이슈로 채워요
   */
  preview: {
    header: '결정 사항 등록',
    /** ③ 위 선 안의 머리표 */
    heading: '결정 사항을 이렇게 등록할까요',
    labels: { value: '값', reason: '이유', alwaysOn: '항상 적용' },
    /** 새 결정 사항이면 ③ 제목 줄 오른쪽 끝에 붙여요 (프로토타입 10/14) */
    newTag: '새 결정 사항',
    /** 누구에게 알리는지 보는 표의 칸 이름 (프로토타입 10/13) */
    issueColumns: { id: 'ID', owner: '담당자', issue: '이슈' },
    /** 받는 이슈가 없을 때 표 대신 보여 주는 한 줄 (프로토타입 10/13) */
    noTargets: '연결된 이슈가 없어서 알림을 받는 사람은 없어요.',
    register: { label: '등록하기', description: '결정 사항을 저장해요' },
    /**
     * 받는 이슈가 있을 때의 등록하기. `preview.ts` 출력의 "알림 받는 이슈"가 1개 이상이면 이것을, 아니면 `register`를 써요 (프로토타입 10/13)
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
  /**
   * 사람이 "결정 사항"이나 "위키"를 바꿔 달라고 직접 요청했을 때 (SIL-94, detect.ask.direct-request-skip-warn).
   * ①② 묻기는 건너뛰어요. 이미 바꾸기로 한 사람에게 같은 뜻을 두 번 묻지 않아요
   */
  direct: {
    /** 다른 결정 사항 화면과 ③을 띄운 뒤 묻는 선택 창 (`preview.confirm` 대신). 선택지는 ③과 같아요 */
    confirm:
      '달라지게 되는 기존 결정 사항 내역을 확인했나요? 이대로 등록할까요?',
  },
  /**
   * 예외 안내(10/14 확정, 결정기록 4-2). hook(`hook-notice.ts`)이 `screens.ts`의 모양으로 띄워요.
   * 막대 색: 조사 실패·완전히 같음은 빨강, 뜻이 같음·저장하는 사이 바뀜은 노랑, 뜻이 같음 → 아니요는 기본 글자색
   */
  notices: {
    /** 예외 3: 결정 사항을 불러오지 못하면 "다른 결정 사항 없음"으로 넘어가지 않고 멈춰요 */
    searchFailed: {
      head: {
        agent: '다른 결정 사항을 조회하지 못해 하던 작업을 멈췄어요.',
        direct: '다른 결정 사항을 조회하지 못해 등록을 멈췄어요.',
      },
      body: '잠시 뒤 다시 시도해 보시고 반복된다면 담당자에게 알려 주세요.',
    },
    /** 충돌 3: 같은 ID·같은 값이면 선택지 없이 끝내요 */
    same: '같은 결정 사항이 있어서 등록하지 않았어요.',
    /**
     * 되돌려 달라는 버전의 내용이 지금 내용과 이미 같으면 되돌리지 않고 끝내요 (SIL-104 초안, detect.change.revert-mark).
     * {version}은 되돌려 달라고 한 버전이에요
     */
    revertSame: '지금 값이 이미 v{version}의 값과 같아서 되돌리지 않았어요.',
    /** 충돌 3: AI가 같은 뜻이라고 보면 새로 등록할지 물어요 (제안 문구, 10/14) */
    similar: '같은 뜻의 결정 사항이 이미 있어요.',
    similarDeclined: '등록하지 않았어요. 기존 결정 사항을 그대로 둘게요.',
    /** 예외 7: 저장이 거절되면(VERSION_CONFLICT) 다른 결정 사항 확인부터 다시 해요 */
    saveRace: {
      head: '저장하는 사이 다른 사람이 먼저 이 결정 사항을 바꿨어요.',
      body: '바뀐 내용을 다시 확인할게요.',
    },
  },
  /** 충돌 3 뜻이 같음 뒤 묻기 (AskUserQuestion). 보기 이름은 짧게, 설명은 아래 줄 (제안 문구, 10/14) */
  similarAsk: {
    header: '결정 사항 등록',
    question: '그래도 새 결정 사항으로 등록할까요?',
    yes: { label: '예', description: '등록해요' },
    no: { label: '아니요', description: '등록하지 않아요' },
  },
  /**
   * 되돌림일 때 선택 창 질문 (detect.change.revert-mark). 부건님과 정할 초안 문구(SIL-104).
   * 바꿀 값이 지금이 아닌 예전 버전과 같거나 뜻이 같으면 아래 질문으로 바꿔 물어요. 선택지는 그대로예요.
   * {version}은 되돌아갈 버전 번호예요
   */
  revert: {
    /** ①② 묻기 (`ask.question` 대신) */
    ask: 'v{version}의 값으로 되돌리는 작업이에요. 그래도 진행할까요?',
    /** ③ 뒤 선택 창 (`preview.confirm` 대신) */
    confirm: 'v{version}의 값으로 되돌려 등록할까요?',
    /** 직접 요청일 때 ③ 뒤 선택 창 (`direct.confirm` 대신) */
    directConfirm:
      '달라지게 되는 기존 결정 사항 내역을 확인했나요? v{version}의 값으로 되돌려 등록할까요?',
  },
  /**
   * ④ 등록 완료. 저장 직후 hook(`hook-saved.ts`)이 `screens.ts`의 모양으로 띄워요 (프로토타입 10/14).
   * 받는 이슈 수는 ③에서 `preview.ts`가 읽어 둔 값이에요. 못 읽었으면 그 줄을 빼요
   */
  saved: {
    head: '✓ 결정 사항을 등록했어요.',
    sent: '연결된 이슈 {count}개의 담당자에게 확인할 변경을 보냈어요.',
    /** ④ 뒤 Claude가 쓰는 한 줄. 하던 작업이 있으면 withTask를 쓰고 그 작업을 이어가요 */
    next: { withTask: '하던 작업을 이어갈게요.', noTask: '등록을 마쳤어요.' },
  },
} as const;

// 문구에 넣을 값의 모양은 core 타입에서 골라 써요 (타입은 core에만)
export type T1PreviewValues = Pick<Standard, 'area'> &
  Pick<StandardVersion, 'title' | 'value' | 'reason' | 'alwaysOn'>;

export const yesNo = (value: boolean) => (value ? '예' : '아니오');
