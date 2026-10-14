import type { Actor, IsoDateTime, PersonRef, StandardId } from './common.ts';

/**
 * 기준 — 기준 하나의 "바뀌지 않는 부분"이에요. 값은 기준 버전에 쌓여요.
 * 칸은 착수 안내 "데이터 항목 목록 v2"를 따라요 (SIL-65). 잠금과 상태는 예전 위키 값을 저장만 해요.
 */
export interface Standard {
  /** ID. '영역.주제.규칙' */
  id: StandardId;
  /** 영역. 예: '주문' */
  area: string;
  /** 제목. 한 문장. 최신 버전의 제목이에요 */
  title: string;
  /** 항상 적용. 최신 버전의 값이에요. 모든 세션 작업 맥락에 들어가요 (최대 10개) */
  alwaysOn: boolean;
  /** 상태. 지우지 않고 '폐기'로 바꿔요 */
  status: StandardStatus;
  /** 대체한 기준. 폐기됐다면 무엇으로 바뀌었는지 */
  replacedBy: StandardId | null;
  /** 폐기한 이유. 사용 중이면 null */
  deprecatedReason: string | null;
  /** 잠금. 사람이 잠근 기준은 AI가 고치지 못해요 */
  locked: boolean;
}

/** 사용 / 폐기 */
export type StandardStatus = 'active' | 'deprecated';

/**
 * 기준 버전 (표 3/7) — 기준이 바뀔 때마다 한 줄씩 쌓여요. 이전 버전은 지우지 않아요.
 * 칸은 착수 안내 "데이터 항목 목록 v2"를 따라요 (SIL-65). 용어.md는 이 표를 "기준"이라고 불러요.
 * 이전 값은 따로 저장하지 않아요. 바로 앞 버전의 value가 이전 값이에요.
 */
export interface StandardVersion {
  /** 기준 ID */
  standardId: StandardId;
  /** 버전. 1부터 하나씩 올라가요 */
  version: number;
  /** 제목. 값이 바뀌면 제목도 바뀌어서 버전마다 남겨요 (SIL-57) */
  title: string;
  /** 값. 기준 내용 한 문장 */
  value: string;
  /** 이유. 없으면 저장을 거절해요 (SIL-19) */
  reason: string;
  /** 항상 적용. 버전마다 남겨요 (데이터 항목 목록 v2). 되돌리면 그 버전의 값으로 돌아가요 */
  alwaysOn: boolean;
  /** 근거. 예: 'PR #12 (주문 API)'. 예전 위키에서 가져와 저장만 하고, 없을 수 있어요 (SIL-65) */
  evidence: string | null;
  /** 적용 범위. 저장만 하고, 없을 수 있어요 (SIL-65). 바뀐 기준 찾기가 코드 경로로 거를 때 써요 */
  scope: StandardScope | null;
  /** 고친 사람 */
  changedBy: PersonRef | null;
  /** AI 여부. AI가 고쳤으면 'ai' */
  changedByActor: Actor;
  /** AI가 찾았나. AI가 먼저 알아챈 변경이면 true: PR에서 찾음(출처 code) 또는 작업 중에 먼저 물은 T1(출처 ai_chat). 화면의 "PR에서 찾음"은 출처가 code일 때만 (D61) */
  aiDetected: boolean;
  /** 되돌림 여부. 새 값이 이전 버전 값과 같으면 true */
  isRevert: boolean;
  /** 되돌림이면 어느 버전으로 돌아갔는지 ([Spec] 담당자에게 알리기 예외 3) */
  revertedToVersion: number | null;
  /** 출처 */
  source: StandardSource;
  /** 저장한 시각 */
  createdAt: IsoDateTime;
}

/** 적용 범위 (코드 / API / 화면 / 문서). 예전 위키의 "코드: … / 화면: … / 문서: …"와 같아요 */
export interface StandardScope {
  /** 코드 경로. 예: ['src/order/**'] */
  code: string[];
  /** API. 예: ['GET /orders/:id'] */
  api: string[];
  /** 화면 이름. 예: ['주문 상세'] */
  screen: string[];
  /** 문서. 예: ['INDEX.md'] */
  doc: string[];
}

/**
 * 출처: 코드 / AI 대화 / Figma / 회의 / Slack / 팀 위키 파일.
 * 화면에는 "AI 대화" / "코드" 두 가지만 나와요. wiki는 `sil import`로 예전 위키에서 가져온 버전이에요.
 */
export type StandardSource =
  'code' | 'ai_chat' | 'figma' | 'meeting' | 'slack' | 'wiki';

// ---------------------------------------------------------------------------
// 읽기 결과
// ---------------------------------------------------------------------------

/** 기준 하나와 그 최신 버전. 목차와 검색이 이 모양을 써요. */
export interface StandardWithLatest {
  standard: Standard;
  latest: StandardVersion;
}

/** 기준 하나의 버전 기록. versions는 최신 버전이 먼저 와요. */
export interface StandardHistory {
  standard: Standard;
  currentVersion: number;
  versions: StandardVersion[];
}

/** 목차. AI가 위키 전체 대신 이것부터 받아요 (위키 관리 원칙 1). */
export interface WikiIndex {
  /** 사용 중인 기준 수 */
  total: number;
  /** 영역별 한 줄 요약 */
  areas: WikiIndexArea[];
  /** 항상 적용되는 기준 (최대 10개) */
  alwaysOn: { id: StandardId; title: string }[];
  /** 사용 중인 기준 전체 목록 (ID 순). 값·이유는 get_standard로 꺼내요 (SIL-65) */
  standards: { id: StandardId; area: string; title: string }[];
}

export interface WikiIndexArea {
  area: string;
  count: number;
  /** 영역 안 기준 제목을 이어 붙인 한 줄 */
  summary: string;
}

// ---------------------------------------------------------------------------
// 쓰기 입력과 결과 (데이터베이스 함수 save_standard / revert_standard / deprecate_standard)
// ---------------------------------------------------------------------------

/**
 * 새 기준 또는 새 버전 저장.
 * 필수는 ID, 제목, 값, 이유, 항상 적용 5개예요 (SIL-65). 나머지는 있으면 저장만 해요.
 */
export interface SaveStandardInput {
  id: StandardId;
  title: string;
  value: string;
  reason: string;
  /** 항상 적용. 고칠 때도 지금 값을 그대로 넣어요 (최대 10개) */
  alwaysOn: boolean;
  /** 내가 보고 고친 버전. 새 기준이면 0. 그사이 바뀌었으면 거절돼요 (SIL-15 동시 수정) */
  baseVersion: number;
  evidence?: string | null;
  /** 빠진 칸은 빈 목록으로 채워 저장해요. 비우면 "적용 범위 없음" */
  scope?: Partial<StandardScope> | null;
  /** 비우면 새 기준은 ID 앞부분(예: app), 고칠 때는 그대로 둬요 */
  area?: string;
  source?: StandardSource;
  changedByActor?: Actor;
  changedBy?: PersonRef | null;
  /** AI가 먼저 알아챈 변경이면 true: PR에서 찾음 또는 T1 (바뀐 기준 찾기, D61) */
  aiDetected?: boolean;
  /** 잠금. 사람만 정할 수 있어요 (예전 위키를 불러올 때). 비우면 그대로 둬요 */
  locked?: boolean;
}

export interface SaveStandardResult {
  standardId: StandardId;
  version: number;
  /** 앞선 버전과 값이 같아져서 되돌림으로 남았는지 (detect.change.revert-mark) */
  isRevert: boolean;
  revertedToVersion: number | null;
  /** 바로 앞 버전의 값. 새 기준이면 null */
  previousValue: string | null;
  /** 저장한 시각 */
  savedAt: IsoDateTime;
  /** team-wiki/CHANGELOG.md에 붙일 한 줄 (data.changelog.format). core가 만들어요 */
  changelogLine: string;
}

/** 앞선 버전으로 되돌리기. 되돌림도 새 버전으로 쌓여요. 제목·값·적용 범위·항상 적용을 그 버전으로 돌려요. */
export interface RevertStandardInput {
  id: StandardId;
  toVersion: number;
  reason: string;
  baseVersion: number;
  evidence?: string;
  source?: StandardSource;
  changedByActor?: Actor;
  changedBy?: PersonRef | null;
}

/** 폐기. 지우지 않고 상태만 바꿔요. */
export interface DeprecateStandardInput {
  id: StandardId;
  reason: string;
  baseVersion: number;
  replacedBy?: StandardId | null;
  changedByActor?: Actor;
  changedBy?: PersonRef | null;
}

export interface DeprecateStandardResult {
  standardId: StandardId;
  status: 'deprecated';
  replacedBy: StandardId | null;
}

// ---------------------------------------------------------------------------
// 충돌 보류 (detect.conflict.hold)
// ---------------------------------------------------------------------------

/**
 * 충돌 — 같은 버전을 보고 늦게 저장해서 저장되지 못한 변경이에요. 버리지 않고 보류로 남겨요.
 * 사람이 정할 때까지 담당자에게 알리지 않아요. 같은 사람이 최신 버전을 보고 다시 저장하면 저절로 정리돼요.
 */
export interface Conflict {
  id: string;
  standardId: StandardId;
  /** 보낸 사람이 보고 고친 버전 */
  baseVersion: number;
  /** 보냈을 때 이미 저장돼 있던 최신 버전 */
  currentVersion: number;
  title: string;
  value: string;
  reason: string | null;
  evidence: string | null;
  proposedBy: PersonRef | null;
  proposedByActor: Actor;
  source: StandardSource;
  aiDetected: boolean;
  status: 'held' | 'resolved';
  /** 사람이 어떻게 정했는지 */
  resolution: string | null;
  resolvedBy: PersonRef | null;
  resolvedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface HoldConflictResult {
  /** 보류로 남겼으면 true. 지금 버전과 내용이 같으면 충돌이 아니라서 false */
  held: boolean;
  conflictId: string | null;
  currentVersion: number;
}
