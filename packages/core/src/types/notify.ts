import type { Actor, IsoDateTime, IssueKey, StandardId } from './common.ts';

/**
 * 이슈 — 이 도구 안에 미리 넣어 두는 작업 목록이에요 (Linear와 연결하지 않아요).
 * 칸은 착수 안내 "데이터 항목 목록 v2"의 이슈 표를 따라요 (SIL-65).
 */
export interface Issue {
  /** 이슈 번호. 예: '#5', 'SIL-28' */
  key: IssueKey;
  /** 이슈 제목 (80자 이하) */
  title: string;
  /** 담당자 이름. 없으면 null(담당자 없음) */
  assignee: string | null;
  /** 진행 중 / 완료. 완료된 이슈에도 알림은 가요 (notify.target.include-done) */
  status: IssueStatus;
  /** 연결된 기준 ID (1개 이상) */
  standardIds: StandardId[];
}

/** 진행 중 / 완료 */
export type IssueStatus = 'in_progress' | 'done';

/** 이슈 저장 (save_issue). 같은 번호가 있으면 바꾸고, 연결은 받은 목록과 똑같이 맞춰요 */
export type SaveIssueInput = Issue;

export interface SaveIssueResult {
  issueKey: IssueKey;
  /** 새로 만들었으면 true, 있던 이슈를 바꿨으면 false */
  created: boolean;
  standardIds: StandardId[];
  /** 담당자가 바뀌어서 새 담당자에게 옮긴 확인할 변경 수 (notify.pending.owner-change) */
  movedChecks: number;
}

/**
 * 확인할 변경 — 기준 버전 1개와 이슈 1개마다 한 줄이에요 (notify.pending.one-per-issue).
 * 만드는 기능과 예외 처리는 민수님이 만들어요 (착수 안내 6). 코드 이름은 용어.md를 따라요 (pending_check).
 */
export interface PendingCheck {
  id: string;
  standardId: StandardId;
  version: number;
  issueKey: IssueKey;
  /** 받는 사람 이름 (이슈 담당자). null이면 담당자 없음 (notify.pending.no-owner) */
  recipient: string | null;
  status: PendingCheckStatus;
  /** 받는 사람이 마지막으로 확인한 버전. 화면은 이 버전과 지금 버전을 비교해 보여 줘요 */
  lastSeenVersion: number | null;
  createdAt: IsoDateTime;
  closedAt: IsoDateTime | null;
}

/**
 * 대기 / 답함 / 새 버전으로 대체됨 / 답 취소 (data.pending.status-values)
 * + 자동 닫힘 (착수 안내 v2 예외: 되돌려서 마지막으로 본 값과 같아짐. 화면에는 나오지 않아요)
 * 대기와 답 취소는 아직 답을 기다리는 상태예요.
 */
export type PendingCheckStatus =
  'pending' | 'answered' | 'superseded' | 'answer_cancelled' | 'auto_closed';

/**
 * 답 — 담당자가 답하면 생겨요. 지우거나 고치지 않고, 잘못한 "관계없다" 답은 취소 표시만 해요.
 * 주 지표 "몰랐다"는 affected && known === false && cancelledAt === null인 답을 세요 (goal.metric.primary).
 *
 * 이름이 `Response`가 아닌 이유: 브라우저와 Node에 이미 같은 이름(fetch의 Response)이 있어서
 * 가져오기를 빠뜨리면 엉뚱한 타입이 조용히 쓰여요.
 */
export interface Answer {
  id: string;
  /** 어느 확인할 변경에 대한 답인지 */
  pendingCheckId: string;
  /** 관계있다(true) / 관계없다(false) */
  affected: boolean;
  /** 알았다(true) / 몰랐다(false). 관계있다일 때만 값이 있어요 */
  known: boolean | null;
  /** 관계없다 이유 한 줄 (100자 이하). 관계없다일 때 꼭 받아요 */
  unaffectedReason: string | null;
  /** 모르고 계속했다면 다시 할 일. 몰랐다일 때만 */
  reworkNote: string | null;
  /** 답한 곳 */
  channel: AnswerChannel;
  /** 알림을 연 순간부터 마지막 답을 고를 때까지 걸린 초. 보호 지표 "1분 이내"에 써요 */
  elapsedSeconds: number | null;
  /** 답한 사람 이름. 담당자가 바뀌어도 이 답은 그대로예요 */
  answeredBy: string | null;
  answeredAt: IsoDateTime;
  /** 취소했으면 시각. 취소한 답도 지우지 않고 남겨요 (notify.answer.cancel) */
  cancelledAt: IsoDateTime | null;
  cancelledBy: string | null;
  cancelReason: string | null;
}

/** 터미널 / 앱 / Slack DM (notify.channel.three) */
export type AnswerChannel = 'terminal' | 'app' | 'slack';

/** 답 저장 (save_answer). 받은 사람만 답할 수 있어요 */
export interface SaveAnswerInput {
  pendingCheckId: string;
  answeredBy: string;
  affected: boolean;
  /** 관계있다면 꼭 넣어요 */
  known?: boolean | null;
  /** 관계없다면 꼭 넣어요 (한 줄, 100자 이하) */
  unaffectedReason?: string | null;
  /** 몰랐다면 다시 할 일 (선택) */
  reworkNote?: string | null;
  channel: AnswerChannel;
  elapsedSeconds?: number | null;
  /** 완료된 이슈에 관계있다고 답하면서 다시 열기로 했으면 true (notify.answer.reopen-done) */
  reopenIssue?: boolean;
}

export interface SaveAnswerResult {
  answerId: string;
  pendingCheckId: string;
  issueKey: IssueKey;
  /** 답한 뒤 이슈 상태. 완료인데 관계있다면 화면이 "이슈를 다시 열까요?"를 물어요 */
  issueStatus: IssueStatus;
  issueReopened: boolean;
}

/** 잘못한 "관계없다" 답 취소 (cancel_answer) */
export interface CancelAnswerInput {
  answerId: string;
  cancelledBy: string;
  reason: string;
}

export interface CancelAnswerResult {
  answerId: string;
  pendingCheckId: string;
  /** 확인할 변경을 다시 열었으면 true (상태가 답 취소가 돼요) */
  reopened: boolean;
}

/**
 * 응답 기록 한 줄의 재료 (DB 뷰 answer_records). `sil export`가 14칸 표로 바꿔요 (data.response.columns).
 */
export interface AnswerRecord {
  answerId: string;
  answeredAt: IsoDateTime;
  standardId: StandardId;
  version: number;
  /** 받는 사람이 마지막으로 확인한 값, 없으면 바로 앞 버전 값 */
  previousValue: string | null;
  value: string;
  changedBy: string | null;
  changedByActor: Actor;
  aiDetected: boolean;
  evidence: string | null;
  issueKey: IssueKey;
  answeredBy: string | null;
  affected: boolean;
  known: boolean | null;
  elapsedSeconds: number | null;
  unaffectedReason: string | null;
  reworkNote: string | null;
  channel: AnswerChannel;
  cancelledAt: IsoDateTime | null;
}

/** "관계있다"고 답한 확인할 변경 (DB 뷰 affected_checks). 다음 세션부터 작업 맥락에 넣어요 */
export interface AffectedCheck {
  answeredBy: string | null;
  standardId: StandardId;
  version: number;
  issueKey: IssueKey;
  issueStatus: IssueStatus;
  answeredAt: IsoDateTime;
}
