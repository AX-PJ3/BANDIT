/**
 * 시연용 샘플 데이터를 넣는 순서대로 DB 함수를 불러요 (SIL-101).
 *
 * 결정 사항과 답은 지울 수 없어서, 시작하기 전에 DB가 시드 전 상태인지 먼저 확인하고
 * 아니면 하나도 저장하지 않고 멈춰요 (두 번 돌리는 것도 막아요).
 * DB 함수는 인자로 받아서, 테스트에서는 가짜로 바꿔 끼워요.
 */
import {
  isOpenPendingCheck,
  type PendingCheck,
  type RevertStandardInput,
  type SaveAnswerInput,
  type SaveAnswerResult,
  type SaveStandardInput,
  type SaveStandardResult,
  type StandardHistory,
} from '@sil/core';
import { SEED_EXPECTED, type SeedStep } from './steps.ts';

export interface SeedDeps {
  getStandardHistory(id: string): Promise<StandardHistory | null>;
  listPendingChecks(query: {
    recipient?: string;
    status: 'all';
  }): Promise<PendingCheck[]>;
  saveStandard(input: SaveStandardInput): Promise<SaveStandardResult>;
  revertStandard(input: RevertStandardInput): Promise<SaveStandardResult>;
  saveAnswer(input: SaveAnswerInput): Promise<SaveAnswerResult>;
}

/** 시작 전에 확인해서 문제를 모아요. 비어 있으면 시작해도 돼요 */
export async function checkSeedReady(
  steps: SeedStep[],
  deps: SeedDeps,
): Promise<string[]> {
  const problems: string[] = [];
  const versions = new Map<string, number>();
  for (const step of steps) {
    if (!versions.has(step.id)) {
      const history = await deps.getStandardHistory(step.id);
      if (!history) {
        problems.push(`${step.id}: DB에 없어요 (위키 가져오기를 먼저 해요)`);
        versions.set(step.id, -1);
        continue;
      }
      versions.set(step.id, history.currentVersion);
    }
    const current = versions.get(step.id) ?? -1;
    if (current < 0) continue;
    if (step.kind === 'answer') {
      if (step.version !== current)
        problems.push(
          `${step.label}: ${step.id} v${step.version}에 답해야 하는데 이 순서에서는 v${current}예요`,
        );
      continue;
    }
    if (step.baseVersion !== current)
      problems.push(
        `${step.id}: 시드는 v${step.baseVersion}에서 시작해요. 지금은 v${current}라서 이미 돌렸거나 다른 값이에요`,
      );
    versions.set(step.id, step.baseVersion + 1);
  }
  const existing = await deps.listPendingChecks({ status: 'all' });
  const touched = new Set(steps.map((step) => step.id));
  const seedCards = existing.filter((check) => touched.has(check.standardId));
  if (seedCards.length > 0)
    problems.push(
      `시드할 결정 사항에 이미 확인할 변경이 ${seedCards.length}건 있어요 (시드 전 상태가 아니에요)`,
    );
  return problems;
}

export interface SeedLog {
  (line: string): void;
}

/** 순서대로 저장해요. 하나라도 실패하면 그 자리에서 멈추고 에러를 던져요 */
export async function runSeed(
  steps: SeedStep[],
  deps: SeedDeps,
  log: SeedLog,
): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'save') {
      const history = await deps.getStandardHistory(step.id);
      if (!history) throw new Error(`${step.id}가 DB에 없어요`);
      const saved = await deps.saveStandard({
        id: step.id,
        title: history.standard.title,
        value: step.value,
        reason: step.reason,
        alwaysOn: history.standard.alwaysOn,
        baseVersion: step.baseVersion,
        scope: history.versions[0]?.scope ?? null,
        source: step.source,
        changedByActor: step.aiDetected ? 'ai' : 'human',
        changedBy: step.by,
        aiDetected: step.aiDetected ?? false,
        evidence: step.evidence ?? null,
      });
      log(`✔ ${step.label} → ${step.id} v${saved.version}`);
    } else if (step.kind === 'revert') {
      const saved = await deps.revertStandard({
        id: step.id,
        toVersion: step.toVersion,
        reason: step.reason,
        baseVersion: step.baseVersion,
        source: step.source,
        changedByActor: 'human',
        changedBy: step.by,
      });
      log(`✔ ${step.label} → ${step.id} v${saved.version} (되돌림)`);
    } else {
      const checks = await deps.listPendingChecks({
        recipient: step.by,
        status: 'all',
      });
      const target = checks.find(
        (check) =>
          check.standardId === step.id &&
          check.version === step.version &&
          isOpenPendingCheck(check.status),
      );
      if (!target)
        throw new Error(
          `${step.by}의 ${step.id} v${step.version} 확인할 변경을 찾지 못했어요`,
        );
      await deps.saveAnswer({
        pendingCheckId: target.id,
        answeredBy: step.by,
        affected: step.affected,
        known: step.affected ? step.known : null,
        channel: 'app',
      });
      log(`✔ ${step.label}`);
    }
  }
}

/** 시드 뒤 사람별 건수를 DB에서 세어 기대와 비교해요. 다르면 줄마다 알려요 */
export async function verifySeed(deps: SeedDeps): Promise<string[]> {
  const all = await deps.listPendingChecks({ status: 'all' });
  const lines: string[] = [];
  for (const [name, expected] of Object.entries(SEED_EXPECTED)) {
    const mine = all.filter((check) => check.recipient === name);
    const open = mine.filter((check) =>
      isOpenPendingCheck(check.status),
    ).length;
    // 자동 닫힘은 화면에 나오지 않아서 세지 않아요 (notify.pending.hide-auto-closed)
    const closed = mine.filter(
      (check) => check.status === 'answered' || check.status === 'superseded',
    ).length;
    const same = open === expected.open && closed === expected.closed;
    lines.push(
      `${same ? '✔' : '✖'} ${name}: 확인할 변경 ${open}건, 확인한 변경 ${closed}건 (기대 ${expected.open}/${expected.closed})`,
    );
  }
  return lines;
}
