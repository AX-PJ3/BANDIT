/**
 * 착수 안내 "데모 예시: 알림 제목 길이"를 처음부터 끝까지 돌려요.
 *
 *   pnpm --filter @sil/notify demo              임시 폴더에 저장
 *   pnpm --filter @sil/notify demo ./demo.json  지정한 파일에 저장 (있으면 덮어써요)
 *
 * 정민님 저장소에 붙기 전이라 save_standard 대신 applyNewVersion으로 v2를 저장해요.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { applyNewVersion } from './applyNewVersion.js';
import { listPending, type PendingItem } from './listPending.js';
import { respond, type RespondInput } from './respond.js';
import { JsonFileStore } from './store.js';
import { DEMO_V2, createDemoData } from './demoData.js';

const PEOPLE = ['민수', '신지', '부건'];

async function main(): Promise<void> {
  const filePath = process.argv[2]
    ? resolve(process.argv[2])
    : join(await mkdtemp(join(tmpdir(), 'notify-demo-')), 'data.json');
  const store = new JsonFileStore(filePath);
  await store.write(createDemoData());

  step('1. 처음 상태');
  console.log('  app.notify.title-length v1: 공백 포함 40자 이하');
  console.log('  연결된 이슈: #5 (민수), #7 (신지)');

  step('2. 부건님이 v2(공백 포함 32자 이하)를 저장해요');
  const created = await applyNewVersion(store, DEMO_V2, {
    now: DEMO_V2.changedAt,
  });
  for (const check of created.created) {
    console.log(`  확인할 변경 만듦: ${check.issueKey} → ${check.recipient}`);
  }
  for (const skipped of created.skipped) {
    console.log(`  건너뜀: ${skipped.issueKey} (${skipped.reason})`);
  }

  step('3. 사람마다 list_pending');
  const minsuItems = await printPending();

  step('4. 부건님이 민수님 변경에 답하려 하면 거절돼요');
  const firstId = minsuItems[0]?.pendingCheckId ?? '';
  await answer({
    pendingCheckId: firstId,
    answeredBy: '부건',
    affected: true,
    known: true,
    channel: 'terminal',
  });

  step('5. 민수님은 터미널에서, 신지님은 앱에서 답해요');
  await answer(
    {
      pendingCheckId: firstId,
      answeredBy: '민수',
      affected: true,
      known: false,
      channel: 'terminal',
    },
    '2026-10-13T14:20:00+09:00',
  );
  const sinjiItems = (await listPending(store, { recipient: '신지' })).items;
  await answer(
    {
      pendingCheckId: sinjiItems[0]?.pendingCheckId ?? '',
      answeredBy: '신지',
      affected: true,
      known: true,
      channel: 'app',
    },
    '2026-10-13T14:25:00+09:00',
  );

  step('6. 다시 list_pending');
  await printPending();

  const data = await store.read();
  step(`7. 기록된 답 ${data.answers.length}개`);
  for (const a of data.answers) {
    const relation = a.affected ? '관계있다' : '관계없다';
    const known = a.known === null ? '' : a.known ? ' · 알았다' : ' · 몰랐다';
    const place = a.channel === 'terminal' ? '터미널' : '앱';
    console.log(`  ${a.answeredBy}: ${relation}${known} (${place})`);
  }
  console.log(`\n데이터 파일: ${filePath}`);

  async function printPending(): Promise<PendingItem[]> {
    let minsu: PendingItem[] = [];
    for (const person of PEOPLE) {
      const result = await listPending(store, { recipient: person });
      if (person === '민수') minsu = result.items;
      const summary = result.items
        .map(
          (i) =>
            `${i.standard.title} (${i.issue.key}) ${i.standard.previousValue} → ${i.standard.value}`,
        )
        .join(' / ');
      console.log(
        `  ${person}: ${result.pendingCount}건${summary ? ` · ${summary}` : ''}`,
      );
    }
    return minsu;
  }

  async function answer(input: RespondInput, now?: string): Promise<void> {
    const result = await respond(store, input, now ? { now } : {});
    if (!result.ok) {
      console.log(`  ${input.answeredBy}: 거절 · ${result.message}`);
      return;
    }
    const reread = result.rereadStandardId
      ? ` → 에이전트가 get_standard(${result.rereadStandardId})로 다시 읽어요`
      : '';
    console.log(`  ${input.answeredBy}: 기록됨${reread}`);
  }
}

function step(title: string): void {
  console.log(`\n${title}`);
}

await main();
