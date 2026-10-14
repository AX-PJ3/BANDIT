import type { Actor, IsoDateTime, IssueKey, StandardId } from './common.ts';

/**
 * 이슈 — 이 도구 안에 미리 넣어 두는 작업 목록이에요 (Linear와 연결하지 않아요).
 * 칸은 착수 안내 "데이터 항목 목록 v2"의 이슈 표를 따라요 (SIL-65).
 */
export interface Issue {
  /** 이슈 번호. 예: '#5' (data.issue.tool-number) */
  key: IssueKey;
  /** 이슈 제목 (80자 이하) */
  title: string;
  /** 담당자 이름. 없으면 null(담당자 없음). 이때는 확인할 변경을 새로 만들지 않아요 (notify.pending.no-owner) */
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
 * 기준이 새 버전으로 저장되면 DB 함수 on_standard_version_saved()가 만들어요. 규칙은 @sil/notify의
 * createPendingChecks와 같아요 (팀 저장소 PR #7). 코드 이름은 용어.md를 따라요 (pending_check).
 */
export interface PendingCheck {
  id: string;
  standardId: StandardId;
  version: number;
  issueKey: IssueKey;
  /** 받는 사람 이름 (이슈 담당자). null이면 담당자 없음. 담당자를 비우면 save_issue가 null로 옮겨요 (notify.pending.owner-change) */
  recipient: string | null;
  status: PendingCheckStatus;
  /**
   * 마지막으로 본 버전. 새 버전의 값이 이 버전의 값과 같으면 자동으로 닫아요.
   * 화면은 이 버전과 지금 버전을 비교해 보여 줘요. 정하는 순서는 notify.pending.last-seen-order
   */
  lastSeenVersion: number | null;
  createdAt: IsoDateTime;
  closedAt: IsoDateTime | null;
  /** 반영함. 받은 사람이 답한 뒤 반영했다고 표시했는지 (data.pending.reflected, notify.check.reflected) */
  reflected: boolean;
  /** 반영했다고 표시한 시각. 표시하지 않았거나 풀었으면 null */
  reflectedAt: IsoDateTime | null;
}

/**
 * 대기 / 답함 / 대체됨 / 자동 닫힘 (10/12 피드백). 답을 기다리는 건 대기뿐이에요.
 * - 대체됨: 같은 기준이 또 바뀌어서 새 버전의 확인할 변경으로 합쳐짐 (notify.pending.merge-versions)
 * - 자동 닫힘: 새 값이 마지막으로 본 값과 같아짐 (notify.pending.close-on-revert). 화면에는 나오지 않아요 (notify.pending.hide-auto-closed)
 */
export type PendingCheckStatus =
  'pending' | 'answered' | 'superseded' | 'auto_closed';

/**
 * 답 — 담당자가 답하면 생겨요. 확인할 변경 하나에 하나이고, 지우거나 고치지 않아요.
 * 저장 값은 관계, 알았나, 관계없는 이유, 답한 곳, 답한 시각이에요 (10/12 피드백).
 * 주 지표 "몰랐다"는 affected && known === false인 답을 세요 (goal.metric.primary).
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
  /** 확인에 쓴 시간(초). 저장하지 않아도 돼요 (10/12 피드백) */
  elapsedSeconds: number | null;
  /** 답한 사람 이름 */
  answeredBy: string | null;
  /** 답한 시각 */
  answeredAt: IsoDateTime;
}

/** 터미널 / 앱 (notify.channel.three) */
export type AnswerChannel = 'terminal' | 'app';

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
  /** 확인에 쓴 시간(초). 비워도 돼요 */
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

/** 반영함 켜기·끄기 (save_reflected). 받은 사람만, 답한 확인할 변경에만 할 수 있어요. 표시를 풀어도 이슈는 다시 열지 않아요 (notify.check.reflected) */
export interface SaveReflectedInput {
  pendingCheckId: string;
  /** 표시한 사람 이름 (확인할 변경의 받는 사람) */
  markedBy: string;
  /** 켜면 true, 풀면 false */
  reflected: boolean;
}

export interface SaveReflectedResult {
  pendingCheckId: string;
  reflected: boolean;
  /** 처음 켠 시각. 다시 켜도 그대로예요. 풀면 null */
  reflectedAt: IsoDateTime | null;
}

/**
 * 응답 기록 한 줄의 재료 (DB 뷰 answer_records). `sil export`가 14칸 표로 바꿔요 (data.response.columns).
 */
export interface AnswerRecord {
  answerId: string;
  answeredAt: IsoDateTime;
  standardId: StandardId;
  version: number;
  /** 마지막으로 본 버전의 값, 없으면 바로 앞 버전 값 */
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
