import {
  isSilError,
  normalizeStandardValue,
  type DetectedChange,
  type PrJudgment,
  type SaveStandardInput,
  type SaveStandardResult,
  type SilErrorCode,
  type StandardHistory,
  type StandardId,
  type StandardWithLatest,
} from '@sil/core';
import { buildWikiIndex } from '@sil/core/node';
import type { PullRequestInput } from './github.ts';
import type { Judge } from './judge.ts';
import { findTeamName, type PeopleMap } from './people.ts';
import { buildPrSaveInput } from './save-input.ts';

/**
 * PR 경로의 판단 → 저장 흐름이에요 (SIL-66). DB·Claude는 밖에서 받아서, 테스트는 가짜로 끝까지 돌려요.
 *
 * 1. DB에서 목차를 만들어 관련 영역을 고르고, 그 영역의 결정 사항만 보내 판단해요 (wiki.read.index-first)
 * 2. 확실하고 바뀐 결정 사항이 하나일 때만 저장 후보예요 (detect.judge.ask-if-unsure, detect.judge.one-per-run)
 * 3. DB 최신 값이 새 값과 같으면 T1에서 이미 저장한 변경이라 다시 저장하지 않아요
 * 4. 새 값이 예전 버전과 글자는 달라도 뜻이 같아 보이면 저장하지 않고 되돌린 건지 물어요 (detect.change.revert-mark)
 * 5. 두 번 묻기가 켜져 있으면 한 번 더 판단해 결과가 같을 때만 저장해요
 * 6. 하루 두 번 제한(detect.safety.repeat-limit)과 충돌 보류(detect.conflict.hold)는 DB·core가 해요. 결과만 알려요
 *
 * TODO(detect.log.every-pr): 판단 결과를 남길 코드 확인 기록 표가 생기면, 관계없음을 포함해 모든 결과를 여기서 남겨요.
 */
export interface PrPathDeps {
  listStandards: () => Promise<StandardWithLatest[]>;
  getStandardHistory: (id: StandardId) => Promise<StandardHistory | null>;
  saveStandard: (input: SaveStandardInput) => Promise<SaveStandardResult>;
  judge: Judge;
}

export interface PrPathOptions {
  /** true면 저장하지 않고 저장하려던 내용만 돌려줘요 */
  dryRun: boolean;
  /** 두 번 묻기 (SIL_DETECT_ASK_TWICE) */
  askTwice: boolean;
  people: PeopleMap;
}

/** 저장하지 않고 PR 작성자에게 묻는 까닭 */
export type AskReason =
  /** Claude가 확신하지 못함 */
  | 'unsure'
  /** 바뀐 결정 사항이 둘 이상 */
  | 'many'
  /** DB에 없거나 폐기된 결정 사항 */
  | 'unknown-standard'
  /** 두 번 물었는데 결과가 다름 */
  | 'not-same-twice'
  /** 사람이 잠근 결정 사항 */
  | 'locked'
  /** PR 작성자가 이름 표에 없음 */
  | 'no-person'
  /** Claude가 낸 바뀐 줄이 비었거나 PR diff에 없음 */
  | 'no-evidence'
  /** PR 제목·설명에 바꾼 이유가 없거나, Claude가 옮긴 이유가 PR 글에 없음 */
  | 'no-reason'
  /** diff가 너무 커서 판단하지 않음 */
  | 'too-large'
  /** 새 값이 예전 버전 값과 글자는 다르지만 뜻이 같아 보임 (되돌림인지 확인) */
  | 'maybe-revert';

/** 새 값과 뜻이 같아 보이는 예전 버전 (detect.change.revert-mark) */
export interface SameMeaningVersion {
  standardId: StandardId;
  version: number;
  value: string;
  /** Claude가 같다고 본 까닭 */
  why: string;
}

export type PrPathOutcome =
  | { kind: 'unrelated'; areas: string[] }
  | {
      kind: 'asked';
      reason: AskReason;
      judgment: PrJudgment | null;
      /** 판단한 결정 사항의 지금 값 (댓글에 함께 보여 줘요) */
      current: StandardWithLatest[];
      /** maybe-revert일 때 뜻이 같아 보이는 예전 버전 */
      sameMeaning?: SameMeaningVersion;
    }
  | { kind: 'already-applied'; change: DetectedChange; version: number }
  | { kind: 'would-save'; input: SaveStandardInput; previousValue: string }
  | {
      kind: 'saved';
      input: SaveStandardInput;
      previousValue: string;
      result: SaveStandardResult;
    }
  | {
      kind: 'rejected';
      input: SaveStandardInput;
      code: SilErrorCode;
      message: string;
    };

/** 이보다 긴 diff는 자르지 않고 사람에게 물어요. 잘라서 보내면 판단이 틀려도 알 수 없어요 */
export const MAX_DIFF_CHARS = 400_000;

export async function runPrPath(
  pr: PullRequestInput,
  deps: PrPathDeps,
  options: PrPathOptions,
): Promise<PrPathOutcome> {
  if (pr.diff.length > MAX_DIFF_CHARS) {
    return { kind: 'asked', reason: 'too-large', judgment: null, current: [] };
  }

  const list = await deps.listStandards();
  const index = buildWikiIndex(list);
  const knownAreas = new Set(index.areas.map(({ area }) => area));
  // 목차에 없는 영역은 버려요. 새 영역은 만들지 않아요 (detect.change.no-new-area)
  const areas = [...new Set(await deps.judge.pickAreas(pr, index))].filter(
    (area) => knownAreas.has(area),
  );
  if (areas.length === 0) return { kind: 'unrelated', areas };

  const candidates = list.filter(({ standard }) =>
    areas.includes(standard.area),
  );
  const judgment = await deps.judge.judge(pr, candidates);
  const currentOf = (changes: DetectedChange[]) =>
    candidates.filter(({ standard }) =>
      changes.some((change) => change.standardId === standard.id),
    );
  const ask = (reason: AskReason): PrPathOutcome => ({
    kind: 'asked',
    reason,
    judgment,
    current: currentOf(judgment.changes),
  });

  if (judgment.grade === 'unrelated' && judgment.changes.length === 0) {
    return { kind: 'unrelated', areas };
  }
  // 확신하지 못하거나, 등급과 바뀐 목록이 서로 맞지 않으면(확실인데 비었음 등) 사람에게 물어요
  if (judgment.grade !== 'sure' || judgment.changes.length === 0) {
    return ask('unsure');
  }
  if (judgment.changes.length > 1) return ask('many');

  const change = judgment.changes[0]!;
  const seen = candidates.find(
    ({ standard }) => standard.id === change.standardId,
  );
  if (!seen) return ask('unknown-standard');
  // 바뀐 줄은 PR diff에 글자 그대로 있어야 해요. PR 설명 속 지시나 지어낸 줄로는 저장하지 않아요
  if (!hasEvidence(change, pr.diff)) return ask('no-evidence');
  // 판단하는 동안 T1 등으로 바뀌었을 수 있어서 저장 직전 값을 다시 읽어요
  const history = await deps.getStandardHistory(change.standardId);
  const latest = history?.versions[0];
  if (!history || !latest || history.standard.status !== 'active') {
    return ask('unknown-standard');
  }
  // T1에서 이미 저장한 변경이면 다시 저장하지 않아요
  if (sameText(latest.value, change.newValue)) {
    return {
      kind: 'already-applied',
      change,
      version: history.currentVersion,
    };
  }
  if (history.standard.locked) return ask('locked');
  const changedBy = findTeamName(options.people, pr.author);
  if (!changedBy) return ask('no-person');
  // 이유는 지어내지 않아요. PR 작성자가 쓴 이유가 PR 글에 그대로 있어야 저장해요 (detect.change.evidence)
  if (!hasReason(change, pr)) return ask('no-reason');

  // 되돌림은 DB가 글자 비교로 표시해요. 글자 다듬기로 같은 예전 버전이 있으면 DB가 표시하니 그대로 저장해요.
  // 글자만 다르고 뜻이 같아 보이면 AI는 후보만 찾고, 저장하지 않은 채 사람에게 물어요 (detect.change.revert-mark)
  const older = history.versions.slice(1);
  const newValue = normalizeStandardValue(change.newValue);
  const hasSameText = older.some(
    ({ value }) => normalizeStandardValue(value) === newValue,
  );
  if (!hasSameText && older.length > 0) {
    const found = await deps.judge.findSameMeaning(
      latest.title,
      change.newValue,
      older.map(({ version, value }) => ({ version, value })),
    );
    // 안전 문제로 거절돼 다른 모델이 대신 답했으면 그 답을 믿지 않고 사람에게 물어요 (judge의 확실과 같은 원칙)
    if (found.fellBack) return ask('unsure');
    // Claude가 목록에 없는 버전을 내면 쓰지 않아요
    const match = older.find(({ version }) => version === found.version);
    if (match) {
      return {
        kind: 'asked',
        reason: 'maybe-revert',
        judgment,
        current: currentOf(judgment.changes),
        sameMeaning: {
          standardId: change.standardId,
          version: match.version,
          value: match.value,
          why: found.why,
        },
      };
    }
  }

  if (options.askTwice) {
    const second = await deps.judge.judge(pr, candidates);
    if (!sameSingleChange(change, second)) return ask('not-same-twice');
  }

  // baseVersion은 Claude가 보고 판단한 버전이에요. 그사이 바뀌었으면 DB가 충돌로 보류해요 (detect.conflict.hold)
  const input = buildPrSaveInput(
    history,
    change,
    pr,
    changedBy,
    seen.latest.version,
  );
  if (options.dryRun) {
    return { kind: 'would-save', input, previousValue: latest.value };
  }
  try {
    const result = await deps.saveStandard(input);
    return { kind: 'saved', input, previousValue: latest.value, result };
  } catch (error) {
    // 하루 두 번 제한, 충돌 보류, 잠금, 형식 거절은 DB가 정해요. 그대로 알려요
    if (isSilError(error) && error.code !== 'DB_ERROR') {
      return {
        kind: 'rejected',
        input,
        code: error.code,
        message: error.message,
      };
    }
    throw error;
  }
}

/** 두 번째 판단도 확실하고, 같은 결정 사항 하나를 같은 값으로 바꿨는지 */
function sameSingleChange(first: DetectedChange, second: PrJudgment): boolean {
  const [other, ...rest] = second.changes;
  return (
    second.grade === 'sure' &&
    other !== undefined &&
    rest.length === 0 &&
    other.standardId === first.standardId &&
    sameText(other.newValue, first.newValue)
  );
}

/** 바뀐 줄이 하나 이상이고, 모두 diff의 +/- 줄과 글자 그대로 같은지 (detect.change.evidence) */
function hasEvidence(change: DetectedChange, diff: string): boolean {
  const diffLines = new Set(diff.split('\n').map((line) => line.trimEnd()));
  return (
    change.changedLines.length > 0 &&
    change.changedLines.every((line) => {
      const trimmed = line.trimEnd();
      return /^[+-]/.test(trimmed) && diffLines.has(trimmed);
    })
  );
}

/** 옮긴 이유가 비어 있지 않고, PR 제목이나 설명에 글자 그대로 있는지 (띄어쓰기 차이는 봐줘요) */
function hasReason(
  change: DetectedChange,
  pr: Pick<PullRequestInput, 'title' | 'body'>,
): boolean {
  const quote = normalize(change.reasonQuote ?? '');
  return (
    quote.length > 0 &&
    [pr.title, pr.body].some((text) => normalize(text).includes(quote))
  );
}

/** 공백·끝 마침표·전각 글자 차이는 같은 값으로 봐요. DB 되돌림 비교와 같은 규칙이에요 (detect.change.revert-mark) */
function sameText(a: string, b: string): boolean {
  return normalizeStandardValue(a) === normalizeStandardValue(b);
}

/** PR 글에서 이유를 찾을 때는 띄어쓰기 차이만 봐줘요 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}
