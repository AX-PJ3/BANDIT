/**
 * 알리기 기능이 쓰는 타입이에요. 칸은 착수 안내 "7. 데이터 항목 목록 v2"를 따라요.
 *
 * 공통 타입 PR(#6, @sil/core)이 머지되면 여기 있는 Issue, PendingCheck는 그쪽 타입으로 바꿔요.
 * 지금은 이 패키지가 혼자 돌 수 있게 필요한 칸만 두었어요.
 */

/** 기준 ID. '영역.주제.규칙' 모양. 예: 'app.notify.title-length' */
export type StandardId = string;

/** 이슈 번호 그대로. 착수 안내 v2는 '#5' 모양이에요 */
export type IssueKey = string;

/** 날짜와 시각은 ISO 문자열로 주고받아요 */
export type IsoDateTime = string;

/**
 * 새 버전 저장 신호 — save_standard나 revert가 새 버전을 저장한 직후 알리기 기능에 넘기는 값이에요.
 * 확인할 변경을 만드는 데 필요한 칸만 담아요. 제목, 이유 같은 나머지 칸은 기준 버전(StandardVersionRecord)에 있어요.
 */
export interface SavedVersion {
  standardId: StandardId;
  /** 방금 저장된 버전. 1부터 하나씩 올라가요 */
  version: number;
  /** 방금 저장된 값. 되돌림 자동 닫힘을 판단할 때 이전에 본 값과 비교해요 */
  value: string;
  /** 바꾼 사람 이름. 본인에게는 확인할 변경을 만들지 않아요. PR에서 찾았으면 PR을 만든 사람 */
  changedBy: string | null;
  /** 저장한 시각 */
  createdAt: IsoDateTime;
}

/** 기준 버전 하나의 값. 되돌림 판단에 쓰려고 이전 버전 값을 받아요 */
export interface VersionValue {
  version: number;
  value: string;
}

/** 진행 중 / 완료. 완료된 이슈에도 확인할 변경은 만들어요 (notify.target.include-done) */
export type IssueStatus = 'in_progress' | 'done';

/** 이슈 — 이 도구 안에 미리 넣어 두는 작업 목록이에요. Linear와 연결하지 않아요 */
export interface Issue {
  key: IssueKey;
  title: string;
  /** 담당자 이름. 없으면 null이고, 그 이슈는 건너뛰어요 (notify.pending.no-owner) */
  assignee: string | null;
  status: IssueStatus;
  /** 연결된 기준 ID (1개 이상) */
  standardIds: StandardId[];
}

/**
 * 대기 / 답함 / 대체됨 / 자동 닫힘 (착수 안내 v2).
 * 자동 닫힘은 되돌려서 담당자가 마지막으로 본 값과 같아진 경우이고, 화면에는 나오지 않아요.
 */
export type PendingCheckStatus =
  'pending' | 'answered' | 'superseded' | 'auto_closed';

/** 확인할 변경 — 기준 버전 1개와 이슈 1개마다 한 줄이에요 (notify.pending.one-per-issue) */
export interface PendingCheck {
  id: string;
  standardId: StandardId;
  version: number;
  issueKey: IssueKey;
  /** 받는 사람 이름. 만들 때의 이슈 담당자예요 */
  recipient: string;
  status: PendingCheckStatus;
  /**
   * 받는 사람이 마지막으로 본 버전. 화면은 이 버전과 지금 버전을 비교해 보여 줘요.
   * 새로 생긴 기준처럼 비교할 이전 버전이 없으면 null이에요.
   */
  lastSeenVersion: number | null;
  createdAt: IsoDateTime;
  closedAt: IsoDateTime | null;
  /** 담당자가 반영했다고 표시했는지 (notify.check.reflected, data.pending.reflected) */
  reflected: boolean;
  /** 반영했다고 표시한 시각. 표시하지 않았으면 null */
  reflectedAt: IsoDateTime | null;
}

/**
 * 출처: AI 대화 / 코드 / Figma / 회의 / Slack / 팀 위키 파일. DB(@sil/core StandardSource)와 같은 값이에요.
 * 화면에는 "AI 대화에서 바꿈", "코드에서 바꿈" 두 가지만 나와요. wiki는 예전 위키에서 가져온 버전이에요.
 */
export type StandardSource =
  'ai_chat' | 'code' | 'figma' | 'meeting' | 'slack' | 'wiki';

/**
 * 기준 버전 하나 — 착수 안내 v2 "결정 사항" 표의 한 줄이에요.
 * 정민님 저장소(SIL-73)에 붙기 전까지 알리기 쪽 임시 저장소가 이 모양으로 들고 있어요.
 */
export interface StandardVersionRecord {
  standardId: StandardId;
  version: number;
  /** 제목. 버전마다 다를 수 있어요 (최대 40자) */
  title: string;
  /** 값 (최대 120자) */
  value: string;
  /** 이유 (최대 120자) */
  reason: string;
  /** 바꾼 사람 이름. PR에서 찾았으면 PR을 만든 사람 */
  changedBy: string | null;
  /** 저장한 시각 */
  changedAt: IsoDateTime;
  source: StandardSource;
  /** AI가 먼저 알아챈 변경이면 true (PR에서 찾음, T1). 출처가 code일 때만 화면에 "PR에서 찾음"으로 보여요 (D61) */
  aiDetected: boolean;
  /** 예전 버전 값으로 되돌린 버전이면 true */
  isRevert: boolean;
}

/** 답한 곳: 터미널 / 앱 (착수 안내 v2. Slack은 만들지 않아요) */
export type AnswerChannel = 'terminal' | 'app';

/** 답 — 착수 안내 v2 "답" 표의 다섯 칸과 어느 확인할 변경에 대한 답인지 */
export interface Answer {
  id: string;
  pendingCheckId: string;
  /** 답한 사람 이름 (확인할 변경의 받는 사람) */
  answeredBy: string;
  /** 관계있다(true) / 관계없다(false) */
  affected: boolean;
  /** 알았다(true) / 몰랐다(false). 관계있다일 때만 값이 있어요 */
  known: boolean | null;
  /** 관계없는 이유 (최대 100자). 관계없다일 때만 값이 있어요 */
  unaffectedReason: string | null;
  channel: AnswerChannel;
  answeredAt: IsoDateTime;
}
