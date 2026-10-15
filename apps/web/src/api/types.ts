/**
 * 화면과 데이터 사이의 약속이에요.
 *
 * 왜 이 파일이 따로 있나요:
 * - 화면과 데이터를 이 인터페이스 하나만 맞추면 서로 기다리지 않고 따로 만들 수 있어요.
 *   화면은 예시 데이터(mock.ts)로 먼저 만들고, 데이터는 database.ts에 붙이고, 합치는 날 바꿀 코드가 없어요.
 *
 * 함수를 추가하는 순서:
 * 1. 아래 SilApi에 함수 타입을 추가해요
 * 2. database.ts에 실제 동작을 넣어요 (데이터는 '@sil/core/data' 함수로. 화면에서 '@sil/core/node'는 쓰지 않아요)
 * 3. mock.ts에 예시 데이터 버전을 넣어요 (타입이 빠진 걸 알려 줘요)
 */
import type {
  AnswerChannel,
  DataMode,
  IssueStatus,
  PendingCheckStatus,
  SaveAnswerInput,
  SaveAnswerResult,
  SaveReflectedResult,
  StandardSource,
} from '@sil/core';

export interface AppInfo {
  version: string;
  /** 'installed'는 PWA로 설치한 앱 창, 'browser'는 브라우저 탭이에요 */
  platform: 'browser' | 'installed';
  /** 'mock'은 Supabase 주소·키 없이 예시 데이터로 열었을 때예요 */
  dataMode: DataMode | 'mock';
  /**
   * DB에 붙었는지예요. 예시 데이터면 null이에요.
   * 못 붙었으면 이유를 그대로 보여 줘요. 실패를 "변경 없음"처럼 숨기지 않아요 (notify.error.not-empty).
   */
  db:
    { ok: true; standardCount: number } | { ok: false; message: string } | null;
}

/**
 * 나에게 온 변경 한 건 (카드 한 장 = 결정 사항 한 버전 × 내 이슈 하나, app.card.one-per-my-issue).
 * A1(알림)·A2(목록)·A3(상세)·A4(답한 뒤)가 같은 모양을 써요.
 *
 * @sil/notify의 PendingItem(buildPendingList 결과)과 칸이 같아요. SIL-100으로 웹에서 그 함수를 쓸 수 있게 되면
 * 이 모양을 PendingItem으로 바꾸고, 목록 규칙(7일, 자동 닫힘 숨기기, 지난번 답)도 그 함수가 채워요.
 */
export interface MyChange {
  pendingCheckId: string;
  /** 자동 닫힘은 화면에 나오지 않아서 목록에 없어요 (notify.pending.hide-auto-closed) */
  status: Exclude<PendingCheckStatus, 'auto_closed'>;
  createdAt: string;
  /** 작업 반영했다고 표시했는지 (notify.check.reflected) */
  reflected: boolean;
  reflectedAt: string | null;
  standard: MyChangeStandard;
  issue: MyChangeIssue;
  /** 대기·대체됨이면 null */
  answer: MyChangeAnswer | null;
  /** 같은 이슈에서 이 결정 사항의 이전 버전에 한 마지막 답. "관계있다"였으면 "다시 고쳐야 해요" 안내를 붙여요 */
  previousAnswer: MyChangePreviousAnswer | null;
}

/** 확인할 그 버전 (제목, 지금 값, 이유, 누가, 언제, 출처, AI가 찾았나). 근거(evidence)는 카드에 그리지 않아요 */
export interface MyChangeStandard {
  id: string;
  title: string;
  version: number;
  value: string;
  /** 받는 사람이 마지막으로 본 버전. 새로 생긴 결정 사항이면 null */
  previousVersion: number | null;
  /** 마지막으로 본 버전의 값. null이면 "새 결정 사항" */
  previousValue: string | null;
  reason: string;
  changedBy: string | null;
  changedAt: string;
  source: StandardSource;
  aiDetected: boolean;
  isRevert: boolean;
}

/** 내 이슈 (번호, 제목, 상태) */
export interface MyChangeIssue {
  key: string;
  title: string;
  status: IssueStatus;
}

/** 내가 한 답 (A4) */
export interface MyChangeAnswer {
  affected: boolean;
  known: boolean | null;
  unaffectedReason: string | null;
  channel: AnswerChannel;
  answeredAt: string;
}

export interface MyChangePreviousAnswer {
  version: number;
  affected: boolean;
  known: boolean | null;
  answeredAt: string;
}

/** 나에게 온 변경에 답하기. 답한 사람과 답한 곳('app')은 api가 채워요 */
export type MyAnswerInput = Omit<
  SaveAnswerInput,
  'answeredBy' | 'channel' | 'reopenIssue' | 'reworkNote'
>;

export interface SilApi {
  getAppInfo(): Promise<AppInfo>;
  /**
   * 나에게 온 변경. 대기·답함·대체됨을 한 번에 돌려주고 화면이 상태로 나눠요 (notify.list.one-call). 최신 것이 먼저 와요.
   * 불러오지 못하면 빈 목록 대신 에러를 던져요 (notify.error.not-empty).
   */
  listMyChanges(me: string): Promise<MyChange[]>;
  /** 답하기. 이미 닫혔으면 PENDING_CLOSED, 받은 사람이 아니면 FORBIDDEN, 이유가 비었거나 길면 VALIDATION_FAILED */
  answer(me: string, input: MyAnswerInput): Promise<SaveAnswerResult>;
  /** 작업 반영함 켜기·끄기. 답한 변경에만 돼요. 풀어도 이슈를 다시 열지 않아요 (notify.check.reflected) */
  markReflected(
    me: string,
    pendingCheckId: string,
    reflected: boolean,
  ): Promise<SaveReflectedResult>;
  /**
   * 내 확인할 변경이 생기거나 바뀌면 onChange를 부르는 구독 (app.notify.realtime). 돌려준 함수로 끊어요.
   * 구독이 끊기면 onError로 이유를 알려 줘요.
   */
  watchMyChanges(
    me: string,
    onChange: () => void,
    onError: (message: string) => void,
  ): () => void;
}
