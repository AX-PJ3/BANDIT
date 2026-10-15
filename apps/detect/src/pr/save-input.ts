import type {
  DetectedChange,
  PersonRef,
  SaveStandardInput,
  StandardHistory,
} from '@sil/core';
import type { PullRequestInput } from './github.ts';

/** 근거 칸에 넣는 바뀐 코드 줄 수와 한 줄 길이. 근거가 너무 길어지지 않게 해요 */
const MAX_EVIDENCE_LINES = 5;
const MAX_LINE_LENGTH = 120;

/**
 * PR에서 찾은 변경을 저장할 값이에요 (SIL-66 PR 경로). saveStandard(core 함수)에 그대로 넣어요.
 * MCP save_standard 도구는 쓰지 않아요. 바꾼 사람 표시(changedByActor)와 바꾼 사람 이름을 정해서 넣어야 해서요.
 * 이유 칸에는 PR 작성자가 쓴 이유를, 근거 칸에는 PR 번호와 바뀐 코드 줄을 넣어요 (detect.change.evidence v3, 레포 위키).
 * reasonQuote가 없으면 decide.ts가 저장하지 않고 물어서, 여기까지 오지 않아요.
 */
export function buildPrSaveInput(
  current: StandardHistory,
  change: DetectedChange,
  pr: Pick<PullRequestInput, 'number' | 'url'>,
  changedBy: PersonRef,
  /** Claude가 보고 판단한 버전. 지금 버전과 다르면 DB가 충돌로 보류해요 */
  seenVersion: number = current.currentVersion,
): SaveStandardInput {
  const latest = current.versions[0];
  return {
    id: current.standard.id,
    title: change.newTitle.trim() || (latest?.title ?? current.standard.title),
    value: change.newValue.trim(),
    // PR 작성자가 쓴 바꾼 이유 그대로예요. 지어내지 않아요
    reason: (change.reasonQuote ?? '').trim().replace(/\s+/g, ' '),
    // 고칠 때는 지금 항상 적용 값을 그대로 넣어요
    alwaysOn: current.standard.alwaysOn,
    // 비우고 저장하면 새 버전에서 적용 범위가 지워져서 지금 값을 넘겨요. 없으면(null) 칸을 빼요
    ...(latest?.scope ? { scope: latest.scope } : {}),
    // Claude가 보고 판단한 버전. 그사이 바뀌었으면 DB가 충돌로 보류해요 (detect.conflict.hold)
    baseVersion: seenVersion,
    // PR에서 찾은 변경(AI가 찾았나 + 출처 code)은 근거가 꼭 있어야 해요
    evidence: formatEvidence(change, pr),
    source: 'code',
    aiDetected: true,
    // AI가 저장했다는 표시 (detect.change.ai-mark). 바꾼 사람은 PR 작성자예요
    changedByActor: 'ai',
    changedBy,
  };
}

/** 근거 칸: PR 번호·주소, 코드에서 무엇이 바뀌었는지, 판단에 쓴 바뀐 줄 */
export function formatEvidence(
  change: DetectedChange,
  pr: Pick<PullRequestInput, 'number' | 'url'>,
): string {
  const lines = change.changedLines
    .slice(0, MAX_EVIDENCE_LINES)
    .map((line) => `\`${truncate(line.trim(), MAX_LINE_LENGTH)}\``)
    .join(' / ');
  const why = change.why.trim().replace(/[.。]?$/, '.');
  return [
    `PR #${pr.number} ${pr.url}`,
    why,
    ...(lines ? [`바뀐 줄: ${lines}`] : []),
  ].join(' · ');
}

function truncate(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
