/**
 * Claude Code가 세션을 시작할 때 작업 맥락에 넣는 서버 안내문(instructions)이에요.
 *
 * 왜 여기에 기준을 넣나요 (SIL-19 "세션 시작 때 작업 맥락에 들어간다"):
 * MCP 서버는 먼저 말을 걸 수 없어요. 대신 연결할 때 주는 안내문은 Claude Code가 세션 맥락에 넣어 줘요.
 * 그래서 두 가지를 붙여요. 본문이 더 필요하면 AI가 get_standard로 꺼내요.
 * - 항상 적용 기준 (최대 10개, wiki.always-on.max-ten)
 * - 부른 사람이 "관계있다"고 답한 바뀐 기준 (진행 중인 이슈만, notify.answer.next-run-context)
 * - 부른 사람에게 답을 기다리는 확인할 변경 수. 있으면 첫 요청보다 먼저 묻게 해요 (notify.terminal.session-start)
 *
 * HTTP 서버는 요청마다 서버를 새로 만들어서, DB를 매번 읽지 않게 사람마다 잠깐(CACHE_MS) 기억해 둬요.
 * DB가 느리거나 실패해도 서버는 켜져야 해서, 기다리는 시간(TIMEOUT_MS)을 넘기면 안내만 바꿔요.
 */
import type { AffectedCheck, StandardWithLatest } from '@sil/core';
import {
  getDataMode,
  listAffectedChecks,
  listPendingChecks,
  listStandards,
} from '@sil/core/node';

const CACHE_MS = 60_000;
const TIMEOUT_MS = 3_000;
const VALUE_LENGTH = 160;
const MAX_AFFECTED = 10;

const USAGE = [
  'haribo는 팀 위키예요. 코드나 화면을 바꾸기 전에 관련 결정 사항을 먼저 찾아요.',
  '1. 작업을 시작할 때 get_index로 영역을 보고, search_standards(keyword, area, codePath)로 관련 결정 사항을 찾아요.',
  '2. 사람에게 묻기 전에 결정 사항을 먼저 찾아요. 없으면 사람에게 묻고, 답을 save_standard로 새 결정 사항(baseVersion 0)으로 저장해요. 저장 전에는 10번처럼 ③을 먼저 보여 줘요.',
  '3. 결정 사항을 고칠 때는 get_standard로 currentVersion과 alwaysOn을 보고 그대로 baseVersion, alwaysOn에 넣어요. 이유는 지어내지 말고 사람에게 물어요. 저장 전에는 10번처럼 ③을 먼저 보여 줘요.',
  '4. 저장이 거절되면 메시지에 적힌 대로 해요. 잠긴 결정 사항은 고치지 말고 사람에게 알려요.',
  '5. 결정 사항 폐기는 사람이 해요(sil deprecate). 폐기가 필요해 보이면 사람에게 알려요.',
  '6. save_standard와 revert는 CHANGELOG 한 줄(changelogLine)을 돌려줘요. 작업 중인 저장소에 team-wiki/CHANGELOG.md가 있으면 그 줄을 맨 아래에 붙여요.',
  // 일반 세션에서도 확인할 변경을 묻게 해요. hooks 없이 서버 안내문과 list_pending 결과(questions)만으로 돼요
  '7. 사람이 작업을 시작하면 그 일보다 먼저 list_pending을 불러요 (notify.terminal.session-start). 한 세션에서 한 번 확인했으면 사람이 다시 묻기 전에는 또 부르지 않아요.',
  '8. 대기 중인 확인할 변경이 있으면 하나씩 차례로 다뤄요 (notify.terminal.one-change). 결정 사항 제목, 이전 값, 지금 값, 이유, 바꾼 사람과 시각, 내 이슈를 표로 보여 주고(notify.terminal.show-fields), 바로 이어서 그 항목의 questions를 AskUserQuestion으로 글자 그대로 물어요. 고른 답으로 respond를 부르고 다음 변경으로 넘어가요. 잘 모르겠다를 고르면 더 묻지 않고 respond를 unsure: true로 불러요(기록되지 않고 대기로 남아요). 관계있다로 기록되어 respond 결과에 scopeCheck가 오면, 그 guide대로 적용 범위부터 훑어 새 값과 다른 곳을 알려 주기만 해요. 다 끝나면 원래 하려던 일을 이어서 해요.',
  // 이슈 반영 표시는 사람이 말했을 때만 해요. AI가 코드를 보고 짐작하지 않아요 (SIL-93, notify.check.reflected)
  '9. 이슈 반영: 사람이 관계있다로 답한 변경을 "이슈에 반영했어요"라고 말하면 mark_reflected로 표시해요. "이슈 반영"만 입력하면 hooks가 목록과 질문을 알려 주니 그대로 따라요. 표시를 풀어 달라고 하면 reflected를 false로 불러요. 코드를 보고 반영했다고 짐작해서 표시하지 않아요.',
  // T1 절차는 도구 설명과 hooks가 넘겨요. 여기에는 언제 부르는지만 둬요 (BDT-108)
  '10. 작업이 결정 사항과 다르게 되면 만들기 전에 show_standard_check를 불러 사람에게 먼저 물어요 (work.wiki.ask-before-change). 사람이 결정 사항이나 위키를 바꿔 달라고 할 때도 이 도구로 시작해요. save_standard로 저장하기 전에는 늘 이 도구로 ③ 등록될 모습을 먼저 보여 줘요. ③ 없이 저장하면 막혀요.',
].join('\n');

const cache = new Map<string, { at: number; text: string }>();
const pending = new Map<string, Promise<string>>();

/** user는 X-Sil-User로 들어온 이름이에요. 없으면 항상 적용 기준만 넣어요. */
export async function getInstructions(
  user: string | null = null,
): Promise<string> {
  const key = user ?? '';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  let promise = pending.get(key);
  if (!promise) {
    promise = buildInstructions(user).finally(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

/** 테스트에서 기억해 둔 안내문을 지울 때 */
export function clearInstructionsCache(): void {
  cache.clear();
}

async function buildInstructions(user: string | null): Promise<string> {
  const context = await contextSections(user);
  const text = [USAGE, ...context.sections].join('\n\n');
  // 실패한 안내문은 기억하지 않아요. 다음 연결 때 다시 읽어요.
  if (context.ok) cache.set(user ?? '', { at: Date.now(), text });
  return text;
}

async function contextSections(
  user: string | null,
): Promise<{ ok: boolean; sections: string[] }> {
  if (getDataMode() === 'none') {
    return {
      ok: false,
      sections: [
        '데이터베이스가 아직 연결되지 않아 항상 적용되는 결정 사항을 불러오지 못했어요.',
      ],
    };
  }
  let standards: StandardWithLatest[];
  try {
    standards = await withTimeout(listStandards(), TIMEOUT_MS);
  } catch {
    return {
      ok: false,
      sections: [
        '항상 적용되는 결정 사항을 불러오지 못했어요. 작업 전에 get_index를 불러 확인해 주세요. 결정 사항이 없다고 여기지 마세요.',
      ],
    };
  }
  const sections = [alwaysOnSection(standards)];
  if (!user) return { ok: true, sections };
  const [affected, pending] = await Promise.allSettled([
    withTimeout(listAffectedChecks(user), TIMEOUT_MS),
    withTimeout(listPendingChecks({ recipient: user }), TIMEOUT_MS),
  ]);
  let ok = true;
  // 답을 기다리는 변경이 있으면 맨 앞에 둬서 다른 일보다 먼저 묻게 해요 (notify.terminal.session-start)
  if (pending.status === 'fulfilled') {
    if (pending.value.length > 0) {
      sections.unshift(pendingSection(user, pending.value.length));
    }
  } else {
    ok = false;
    sections.unshift(
      '나에게 온 확인할 변경을 불러오지 못했어요. 작업을 시작하기 전에 list_pending을 불러 확인해 주세요. 확인할 변경이 없다고 여기지 마세요.',
    );
  }
  if (affected.status === 'fulfilled') {
    const section = affectedSection(standards, affected.value);
    if (section) sections.push(section);
  } else {
    ok = false;
    sections.push(
      '내가 "관계있다"고 답한 바뀐 결정 사항을 불러오지 못했어요. 이슈와 이어진 결정 사항은 search_standards로 확인해 주세요.',
    );
  }
  return { ok, sections };
}

/** 답을 기다리는 확인할 변경 수. 이 안내가 있으면 Claude가 첫 요청보다 먼저 7·8번 순서로 물어요 */
function pendingSection(user: string, count: number): string {
  return `지금 ${user}님에게 답을 기다리는 확인할 변경이 ${count}개 있어요. 사람의 첫 요청을 처리하기 전에 list_pending을 불러 7·8번 순서대로 하나씩 보여 주고 AskUserQuestion으로 물어요.`;
}

function alwaysOnSection(standards: StandardWithLatest[]): string {
  const alwaysOn = standards.filter(({ standard }) => standard.alwaysOn);
  if (alwaysOn.length === 0) return '항상 적용되는 결정 사항은 아직 없어요.';
  return [
    '항상 적용되는 결정 사항 (모든 작업에서 지켜요):',
    ...alwaysOn.map((item) => line(item)),
  ].join('\n');
}

/** 진행 중인 이슈에서 "관계있다"고 답한 기준만, 최근 답부터 10개까지. 폐기됐거나 이미 항상 적용인 기준은 빼요 */
function affectedSection(
  standards: StandardWithLatest[],
  affected: AffectedCheck[],
): string | null {
  const byId = new Map(standards.map((item) => [item.standard.id, item]));
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const check of affected) {
    const item = byId.get(check.standardId);
    if (check.issueStatus !== 'in_progress' || seen.has(check.standardId))
      continue;
    if (!item || item.standard.alwaysOn) continue;
    seen.add(check.standardId);
    lines.push(`${line(item)} (이슈 ${check.issueKey})`);
    if (lines.length >= MAX_AFFECTED) break;
  }
  if (lines.length === 0) return null;
  return [
    '내가 "관계있다"고 답한 바뀐 결정 사항 (진행 중인 이슈, 이 작업에서도 지켜요):',
    ...lines,
  ].join('\n');
}

function line({ standard, latest }: StandardWithLatest): string {
  return `- ${standard.id} (v${latest.version}): ${truncate(latest.value, VALUE_LENGTH)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${ms}ms 안에 응답이 없어요`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function truncate(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
