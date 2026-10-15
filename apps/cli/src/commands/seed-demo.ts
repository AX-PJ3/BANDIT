/**
 * `sil seed-demo` — 시연용 샘플 데이터를 DB에 쌓아요 (SIL-101).
 *
 * 결정 사항과 답은 지울 수 없어서 기본은 "무엇을 할지 보여 주기"만 해요.
 * 저장하려면 --apply와 함께, 연결된 DB의 주소 이름을 --confirm-host로 직접 적어야 해요 (팀 DB에 잘못 돌리지 않으려고요).
 * 위키와 이슈를 가져온 직후(`sil import --apply`), 시드 전 상태인 시연 DB에서만 돌려요.
 */
import { isSilError } from '@sil/core';
import {
  getDataMode,
  getStandardHistory,
  listPendingChecks,
  loadEnv,
  revertStandard,
  saveAnswer,
  saveStandard,
} from '@sil/core/node';
import type { Command } from 'commander';
import { checkSeedReady, runSeed, verifySeed } from '../demo-seed/run.ts';
import { SEED_STEPS } from '../demo-seed/steps.ts';

interface SeedDemoOptions {
  apply?: boolean;
  confirmHost?: string;
}

export function registerSeedDemo(program: Command): void {
  program
    .command('seed-demo')
    .description(
      '시연용 샘플 데이터를 DB에 쌓아요 (기본은 미리 보기, --apply로 저장)',
    )
    .option('--apply', '실제로 저장해요. 지울 수 없으니 시연 DB에서만 해요')
    .option(
      '--confirm-host <주소 이름>',
      '--apply와 함께. 연결된 DB 주소의 호스트 이름을 그대로 적어요',
    )
    .action(async (options: SeedDemoOptions) => {
      process.exitCode = await runSeedDemo(options);
    });
}

async function runSeedDemo(options: SeedDemoOptions): Promise<number> {
  if (getDataMode() === 'none') {
    console.log(
      '✖ DB가 연결되지 않았어요. .env에 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 넣어 주세요.',
    );
    return 1;
  }
  // 주소만 보여 줘요. 키는 찍지 않아요
  const host = new URL(loadEnv().SUPABASE_URL ?? 'http://none').host;
  const deps = {
    getStandardHistory,
    listPendingChecks,
    saveStandard,
    revertStandard,
    saveAnswer,
  };
  try {
    console.log(`연결된 DB: ${host}`);
    console.log('');
    for (const step of SEED_STEPS) console.log(`  ${step.label}`);
    console.log('');

    const problems = await checkSeedReady(SEED_STEPS, deps);
    if (problems.length > 0) {
      console.log('✖ 시드를 시작할 수 없어요. 아무것도 저장하지 않았어요.');
      for (const problem of problems) console.log(`   - ${problem}`);
      return 1;
    }
    console.log('✔ 시드 전 상태예요.');

    if (!options.apply) {
      console.log(
        `→ 저장하려면 시연 DB인지 확인하고: pnpm sil seed-demo --apply --confirm-host ${host}`,
      );
      return 0;
    }
    if (options.confirmHost !== host) {
      console.log(
        `✖ --confirm-host가 연결된 DB(${host})와 달라서 저장하지 않았어요.`,
      );
      return 1;
    }
    await runSeed(SEED_STEPS, deps, console.log);
    console.log('');
    const lines = await verifySeed(deps);
    for (const line of lines) console.log(line);
    return lines.some((line) => line.startsWith('✖')) ? 1 : 0;
  } catch (error) {
    console.log(
      `✖ 중간에 멈췄어요. 저장된 것은 지울 수 없으니 DB를 확인해 주세요: ${isSilError(error) ? error.message : String(error)}`,
    );
    return 1;
  }
}
