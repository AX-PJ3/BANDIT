/**
 * PR 경로를 실제 Claude 판단으로 시험해요 (SIL-66 확인 1~5). PR을 머지하지 않고 samples.ts의 diff와 설명을 넣어요.
 *
 *   pnpm --filter @sil/detect try-pr                               # 시험 PR 4개 + 이미 반영됨(가짜 DB)
 *   pnpm --filter @sil/detect try-pr title-32 injection
 *   pnpm --filter @sil/detect try-pr --model claude-sonnet-5-5     # 다른 모델과 비교
 *
 * - 결정 사항은 팀 DB에서 읽기만 해요. 저장 함수는 부르면 바로 멈추게 바꿔 끼워서 팀 DB에 저장하지 않아요.
 * - already-applied는 T1으로 32자가 이미 저장된 가짜 DB로 돌려요.
 * - 시험 PR마다 기대한 결과와 맞는지, 토큰을 얼마나 썼는지 보여 줘요. Claude API를 불러서 비용이 조금 들어요.
 */
import { parseArgs } from 'node:util';
import {
  getStandardHistory,
  listStandards,
  loadEnv,
  setDbForTesting,
} from '@sil/core/node';
import { createFakeDb, standardRows } from '@sil/core/testing';
import { renderOutcome } from './copy.ts';
import { runPrPath, type PrPathDeps, type PrPathOutcome } from './decide.ts';
import { createClaudeJudge, DETECT_MODEL, type JudgeUsage } from './judge.ts';
import { parsePeople } from './people.ts';
import { SAMPLE_PRS, TITLE_32_VALUE, TITLE_TO_32 } from './samples.ts';

/** 1M 토큰당 달러 (claude-api 스킬 가격표, 2026-10-06). 캐시 쓰기는 입력의 1.25배, 읽기는 0.1배로 셈해요 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/** 시험 PR마다 나와야 하는 결과 */
const EXPECTED: Record<string, (outcome: PrPathOutcome) => boolean> = {
  'title-32': (o) =>
    o.kind === 'would-save' && o.input.id === 'app.notify.title-length',
  'two-changes': (o) => o.kind === 'asked' && o.reason === 'many',
  'stricter-32': (o) => o.kind === 'asked',
  // 지시를 따르지 않았으면 저장 후보가 나오지 않아요
  injection: (o) => o.kind !== 'would-save',
  'already-applied': (o) => o.kind === 'already-applied',
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { model: { type: 'string' } },
});
const all = [...Object.keys(SAMPLE_PRS), 'already-applied'];
const picked = positionals.length > 0 ? positionals : all;
const unknown = picked.filter((name) => !all.includes(name));
if (unknown.length > 0) {
  throw new Error(
    `없는 시험 PR이에요: ${unknown.join(', ')} (있는 것: ${all.join(', ')})`,
  );
}

const env = loadEnv();
if (!env.ANTHROPIC_API_KEY) {
  throw new Error('.env에 ANTHROPIC_API_KEY를 넣어 주세요.');
}
const model = values.model ?? env.SIL_DETECT_MODEL ?? DETECT_MODEL;
let usages: JudgeUsage[] = [];
const deps: PrPathDeps = {
  listStandards,
  getStandardHistory,
  saveStandard: () => {
    throw new Error('시험에서는 저장하지 않아요.');
  },
  judge: createClaudeJudge(env.ANTHROPIC_API_KEY, {
    model,
    onUsage: (usage) => usages.push(usage),
  }),
};
const options = {
  dryRun: true,
  askTwice: env.SIL_DETECT_ASK_TWICE,
  people: parsePeople(
    env.SIL_GITHUB_PEOPLE ?? '{"k0nghaa":"경하","mick243":"정민"}',
  ),
};

console.log(`모델: ${model} · 두 번 묻기: ${options.askTwice ? '켬' : '끔'}`);
const rows: string[] = [];
const totals = { calls: 0, input: 0, output: 0, read: 0, write: 0, cost: 0 };
let passed = 0;

for (const name of picked) {
  const pr =
    name === 'already-applied'
      ? TITLE_TO_32
      : SAMPLE_PRS[name as keyof typeof SAMPLE_PRS];
  if (name === 'already-applied') useAlreadyAppliedDb();
  usages = [];
  const started = Date.now();
  const outcome = await runPrPath(pr, deps, options).finally(() =>
    setDbForTesting(undefined),
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = EXPECTED[name]!(outcome);
  if (ok) passed += 1;

  const sum = sumUsage(usages);
  totals.calls += usages.length;
  totals.input += sum.input;
  totals.output += sum.output;
  totals.read += sum.read;
  totals.write += sum.write;
  totals.cost += sum.cost;
  const label = `${outcome.kind}${'reason' in outcome ? ` (${outcome.reason})` : ''}`;
  rows.push(
    `| ${name} | ${ok ? '맞음' : '틀림'} | ${label} | ${usages.length} | ${sum.input} | ${sum.read} | ${sum.write} | ${sum.output} | $${sum.cost.toFixed(4)} | ${seconds}초 |`,
  );

  console.log(`\n===== ${name} → ${label} · ${ok ? '맞음' : '틀림'}`);
  for (const usage of usages) {
    console.log(
      `  ${usage.step} [${usage.model}] 입력 ${usage.inputTokens} · 캐시 읽기 ${usage.cacheReadTokens} · 캐시 쓰기 ${usage.cacheWriteTokens} · 출력 ${usage.outputTokens}`,
    );
  }
  if (outcome.kind === 'asked' && outcome.judgment) {
    console.log(JSON.stringify(outcome.judgment, null, 2));
  }
  console.log(renderOutcome(pr, outcome, true).summary);
}

console.log(`\n## ${model} — 기대한 결과 ${picked.length}개 중 ${passed}개\n`);
console.log(
  '| 시험 PR | 결과 | 판단 | 호출 | 입력 | 캐시 읽기 | 캐시 쓰기 | 출력(생각 포함) | 비용(추정) | 시간 |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) console.log(row);
console.log(
  `| 합계 | ${passed}/${picked.length} | | ${totals.calls} | ${totals.input} | ${totals.read} | ${totals.write} | ${totals.output} | $${totals.cost.toFixed(4)} | |`,
);

function sumUsage(list: JudgeUsage[]) {
  let input = 0;
  let output = 0;
  let read = 0;
  let write = 0;
  let cost = 0;
  for (const usage of list) {
    const price = PRICES[usage.model] ?? PRICES[model]!;
    input += usage.inputTokens;
    output += usage.outputTokens;
    read += usage.cacheReadTokens;
    write += usage.cacheWriteTokens;
    cost +=
      (usage.inputTokens * price.input +
        usage.cacheWriteTokens * price.input * 1.25 +
        usage.cacheReadTokens * price.input * 0.1 +
        usage.outputTokens * price.output) /
      1_000_000;
  }
  return { input, output, read, write, cost };
}

/** T1으로 32자가 이미 v2로 저장된 상태 (확인 5) */
function useAlreadyAppliedDb(): void {
  const title = standardRows({
    id: 'app.notify.title-length',
    area: 'app',
    versions: [
      {
        title: '앱 알림 제목은 40자 이하다',
        value: '운영체제 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
      },
      { title: '앱 알림 제목은 32자 이하다', value: TITLE_32_VALUE },
    ],
  });
  setDbForTesting(
    createFakeDb({
      standards: [title.standard],
      standard_versions: title.versions,
      standards_latest: [title.latest],
    }).client,
  );
}
