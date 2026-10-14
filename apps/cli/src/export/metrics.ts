/**
 * Metric Review에서 보는 숫자 (goal.metric.*, goal.guard.*).
 *
 * 숫자는 비율만 쓰지 않고 "N건 중 M건"으로 보여 줘요 (goal.report.as-is).
 * 취소한 답은 세지 않아요. 우리 팀과 다른 팀을 나누는 칸은 아직 없어서 우리 팀 숫자만 나와요 (goal.metric.team-split).
 */
import type { StandardVersion } from '@sil/core';
import type { ResponseRow } from './records.ts';

export interface MetricInput {
  rows: ResponseRow[];
  versions: StandardVersion[];
  /** 만들어진 확인할 변경 수 (알림을 보낸 이슈 수) */
  pendingCheckCount: number;
}

export interface MetricSummary {
  /** 주 지표: 관계있다고 답한 것 중 몰랐다 (goal.metric.primary) */
  primary: {
    affected: number;
    unknown: number;
    byMethod: Record<'도구' | '사람', number>;
  };
  /** 5단계 (goal.metric.funnel) */
  funnel: {
    changedStandards: number;
    aiChanged: number;
    notifiedIssues: number;
    affected: number;
    unknown: number;
  };
  /** 확인 시간 중간값(초)과 잰 답 수 (goal.guard.check-time, 60초 이내) */
  checkTime: { medianSeconds: number | null; measured: number };
  /** 전체 답 중 관계없다 (goal.guard.unrelated-rate) */
  unrelated: { answers: number; unaffected: number };
  /** AI가 고친 버전 중 사람이 되돌린 것 (goal.guard.revert-rate) */
  reverted: { aiChanges: number; revertedByHuman: number };
}

export function summarizeMetrics(input: MetricInput): MetricSummary {
  const answers = input.rows.filter((row) => row.affected !== null);
  const affected = answers.filter((row) => row.affected);
  const unknown = affected.filter((row) => row.known === false);
  const changes = input.versions.filter(
    (v) => v.version >= 2 && v.source !== 'wiki',
  );
  const aiChanges = changes.filter(
    (v) => v.changedByActor === 'ai' && !v.isRevert,
  );
  const seconds = answers
    .map((row) => row.elapsedSeconds)
    .filter((value): value is number => value !== null);

  return {
    primary: {
      affected: affected.length,
      unknown: unknown.length,
      byMethod: {
        도구: unknown.filter((row) => row.method === '도구').length,
        사람: unknown.filter((row) => row.method === '사람').length,
      },
    },
    funnel: {
      changedStandards: changes.length,
      aiChanged: changes.filter((v) => v.aiDetected).length,
      notifiedIssues: input.pendingCheckCount,
      affected: affected.length,
      unknown: unknown.length,
    },
    checkTime: { medianSeconds: median(seconds), measured: seconds.length },
    unrelated: {
      answers: answers.length,
      unaffected: answers.filter((row) => row.affected === false).length,
    },
    reverted: {
      aiChanges: aiChanges.length,
      revertedByHuman: aiChanges.filter((change) =>
        input.versions.some(
          (later) =>
            later.standardId === change.standardId &&
            later.version > change.version &&
            later.isRevert &&
            later.changedByActor === 'human' &&
            (later.revertedToVersion ?? Infinity) < change.version,
        ),
      ).length,
    },
  };
}

/** 사람이 읽는 줄. 모두 "N건 중 M건" 모양이에요 */
export function formatMetrics(summary: MetricSummary): string[] {
  const { primary, funnel, checkTime, unrelated, reverted } = summary;
  return [
    `주 지표: 관계있다 ${primary.affected}건 중 몰랐다 ${primary.unknown}건 (도구 ${primary.byMethod.도구}건, 사람 기록 ${primary.byMethod.사람}건)`,
    `단계: 바뀐 결정 사항 ${funnel.changedStandards}건 → AI가 찾아 고침 ${funnel.aiChanged}건 → 알림 보낸 이슈 ${funnel.notifiedIssues}건 → 관계있다 ${funnel.affected}건 → 몰랐다 ${funnel.unknown}건`,
    checkTime.medianSeconds === null
      ? '확인 시간: 잰 답이 아직 없어요'
      : `확인 시간: ${checkTime.measured}건의 중간값 ${checkTime.medianSeconds}초 (지킬 선: 60초 이내${checkTime.medianSeconds > 60 ? ', 넘었어요' : ''})`,
    `관계없다: 답 ${unrelated.answers}건 중 ${unrelated.unaffected}건`,
    `되돌림: AI가 고친 ${reverted.aiChanges}건 중 사람이 되돌린 ${reverted.revertedByHuman}건`,
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
