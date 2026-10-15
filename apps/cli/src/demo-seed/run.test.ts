import type { PendingCheck, StandardHistory } from '@sil/core';
import { describe, expect, it } from 'vitest';
import { checkSeedReady, runSeed, verifySeed, type SeedDeps } from './run.ts';
import { SEED_STEPS } from './steps.ts';

function history(id: string, currentVersion: number): StandardHistory {
  return {
    standard: { id, title: '제목', alwaysOn: false },
    currentVersion,
    versions: [{ scope: null }],
  } as unknown as StandardHistory;
}

function check(partial: Partial<PendingCheck>): PendingCheck {
  return {
    id: 'c1',
    standardId: 'app.screen.inbox-first',
    version: 3,
    status: 'pending',
    recipient: '신지',
    ...partial,
  } as PendingCheck;
}

function fakeDeps(overrides: Partial<SeedDeps> = {}) {
  const calls: string[] = [];
  const deps: SeedDeps = {
    getStandardHistory: async (id) => history(id, 1),
    listPendingChecks: async () => [check({})],
    saveStandard: async (input) => {
      calls.push(
        `save ${input.id} base${input.baseVersion} ${input.changedBy}`,
      );
      return { version: input.baseVersion + 1 } as never;
    },
    revertStandard: async (input) => {
      calls.push(`revert ${input.id} to${input.toVersion}`);
      return { version: input.baseVersion + 1 } as never;
    },
    saveAnswer: async (input) => {
      calls.push(`answer ${input.answeredBy} ${input.channel}`);
      return {} as never;
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('시연 시드', () => {
  it('시드 전 상태면 문제가 없어요', async () => {
    const { deps } = fakeDeps({ listPendingChecks: async () => [] });
    expect(await checkSeedReady(SEED_STEPS, deps)).toEqual([]);
  });

  it('이미 돌렸거나 확인할 변경이 있으면 시작하지 않아요', async () => {
    const { deps, calls } = fakeDeps({
      getStandardHistory: async (id) => history(id, 4),
    });
    const problems = await checkSeedReady(SEED_STEPS, deps);
    expect(problems.length).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });

  it('결정 사항이 DB에 없으면 알려요', async () => {
    const { deps } = fakeDeps({
      getStandardHistory: async () => null,
      listPendingChecks: async () => [],
    });
    const problems = await checkSeedReady(SEED_STEPS, deps);
    expect(problems.some((line) => line.includes('DB에 없어요'))).toBe(true);
  });

  it('정한 순서대로 저장하고 답하고 되돌려요', async () => {
    const { deps, calls } = fakeDeps();
    await runSeed(SEED_STEPS, deps, () => {});
    expect(calls).toEqual([
      'save notify.answer.two-questions base1 경하',
      'save app.screen.inbox-first base1 경하',
      'save app.screen.inbox-first base2 정민',
      'answer 신지 app',
      'revert app.screen.inbox-first to1',
    ]);
  });

  it('답할 확인할 변경이 없으면 멈춰요', async () => {
    const { deps } = fakeDeps({ listPendingChecks: async () => [] });
    await expect(runSeed(SEED_STEPS, deps, () => {})).rejects.toThrow(
      '찾지 못했어요',
    );
  });

  it('끝난 뒤 사람별 건수를 기대와 비교해요', async () => {
    const { deps } = fakeDeps({
      listPendingChecks: async () => [
        check({ id: 'a', recipient: '민수', status: 'pending' }),
        check({ id: 'b', status: 'superseded' }),
        check({ id: 'c', status: 'answered' }),
        check({ id: 'd', status: 'pending' }),
      ],
    });
    const lines = await verifySeed(deps);
    expect(lines.every((line) => line.startsWith('✔'))).toBe(true);
  });
});
