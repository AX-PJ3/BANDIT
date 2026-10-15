/**
 * PR 경로 입구예요 (SIL-66). GitHub Actions(.github/workflows/detect.yml)가 실행해요.
 *
 *   node apps/detect/src/pr/main.ts --pr 12 --dry-run=false
 *
 * --dry-run은 기본 true예요. false를 분명히 넣어야 DB에 저장해요.
 * 비밀 값(Claude API 키, Supabase 주소·키, GitHub 토큰)은 환경 변수로만 받고 출력하지 않아요.
 */
import { parseArgs } from 'node:util';
import {
  createLogger,
  getStandardHistory,
  listStandards,
  loadEnv,
  saveStandard,
} from '@sil/core/node';
import { PR_COPY, renderOutcome } from './copy.ts';
import { runPrPath, type PrPathOutcome } from './decide.ts';
import { createGitHubClient, writeJobSummary } from './github.ts';
import { createClaudeJudge } from './judge.ts';
import { parsePeople } from './people.ts';

const log = createLogger('detect');

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      'dry-run': { type: 'string', default: 'true' },
    },
  });
  const prNumber = Number(values.pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error('--pr에 PR 번호를 넣어 주세요. 예: --pr 12');
  }
  const env = loadEnv();
  // 수동 시험 실행이거나, 저장소 변수로 저장을 꺼 둔 기간이면 저장하지 않아요
  const trialRun = values['dry-run'] !== 'false';
  const savingOff = env.SIL_DETECT_DRY_RUN;
  const dryRun = trialRun || savingOff;
  const missing = (
    ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_REPOSITORY'] as const
  ).filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`환경 변수가 비어 있어요: ${missing.join(', ')}`);
  }
  const github = createGitHubClient(env.GITHUB_TOKEN!, env.GITHUB_REPOSITORY!);

  try {
    const { pr, state } = await github.readPullRequest(prNumber);

    // main으로 머지된 PR만 봐요 (detect.input.merged-pr-only). 시험 실행은 머지 전 PR도 볼 수 있어요
    if (!state.merged || state.baseRef !== 'main') {
      const note = `PR #${pr.number}은 main으로 머지된 PR이 아니에요.`;
      if (!trialRun) {
        log.info(`${note} 건너뛰어요.`);
        await writeJobSummary(env.GITHUB_STEP_SUMMARY, `${note} 건너뛰었어요.`);
        return;
      }
      log.info(`${note} 시험 실행이라 판단만 해 봐요.`);
    }

    const outcome: PrPathOutcome = state.diffTooLarge
      ? { kind: 'asked', reason: 'too-large', judgment: null, current: [] }
      : await runPrPath(
          pr,
          {
            listStandards,
            getStandardHistory,
            saveStandard,
            judge: createClaudeJudge(env.ANTHROPIC_API_KEY!, {
              model: env.SIL_DETECT_MODEL,
            }),
          },
          {
            dryRun,
            askTwice: env.SIL_DETECT_ASK_TWICE,
            people: parsePeople(env.SIL_GITHUB_PEOPLE),
          },
        );
    log.info(`판단 결과: ${outcome.kind}`, {
      pr: pr.number,
      dryRun,
      ...(outcome.kind === 'asked' ? { reason: outcome.reason } : {}),
    });
    // 결과 글은 실행 요약 파일에만 써요. 로그(stdout)에 찍으면 PR에서 옮긴 줄이 Actions 명령(::)으로 읽힐 수 있어요
    const rendered = renderOutcome(
      pr,
      outcome,
      dryRun,
      trialRun ? PR_COPY.dryRun : PR_COPY.savingOff,
    );
    await writeJobSummary(env.GITHUB_STEP_SUMMARY, rendered.summary);
    if (rendered.comment) await github.comment(pr.number, rendered.comment);
  } catch (error) {
    // 실패를 "바뀐 결정 사항 없음"으로 보이게 두지 않아요. PR에 확인하지 못했다고 남겨요
    const failed = [
      `${PR_COPY.heading} · PR #${prNumber}`,
      PR_COPY.failed,
    ].join('\n\n');
    await writeJobSummary(env.GITHUB_STEP_SUMMARY, failed);
    await github.comment(prNumber, failed).catch(() => undefined);
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error(`PR 경로를 끝내지 못했어요: ${message}`);
  process.exitCode = 1;
});
