/**
 * Claude Code가 세션을 시작할 때 작업 맥락에 넣는 서버 안내문(instructions)이에요.
 *
 * 왜 여기에 기준을 넣나요 (SIL-19 "세션 시작 때 작업 맥락에 들어간다"):
 * MCP 서버는 먼저 말을 걸 수 없어요. 대신 연결할 때 주는 안내문은 Claude Code가 세션 맥락에 넣어 줘요.
 * 그래서 두 가지를 붙여요. 본문이 더 필요하면 AI가 get_standard로 꺼내요.
 * - 항상 적용 기준 (최대 10개, wiki.always-on.max-ten)
 * - 부른 사람이 "관계있다"고 답한 바뀐 기준 (진행 중인 이슈만, notify.answer.next-run-context)
 *
 * HTTP 서버는 요청마다 서버를 새로 만들어서, DB를 매번 읽지 않게 사람마다 잠깐(CACHE_MS) 기억해 둬요.
 * DB가 느리거나 실패해도 서버는 켜져야 해서, 기다리는 시간(TIMEOUT_MS)을 넘기면 안내만 바꿔요.
 */
import type { AffectedCheck, StandardWithLatest } from '@sil/core';
import { getDataMode, listAffectedChecks, listStandards } from '@sil/core/node';

const CACHE_MS = 60_000;
const TIMEOUT_MS = 3_000;
const VALUE_LENGTH = 160;
const MAX_AFFECTED = 10;

const USAGE = [
  'haribo는 팀 위키예요. 코드나 화면을 바꾸기 전에 관련 결정 사항을 먼저 찾아요.',
  '1. 작업을 시작할 때 get_index로 영역을 보고, search_standards(keyword, area, codePath)로 관련 결정 사항을 찾아요.',
  '2. 사람에게 묻기 전에 결정 사항을 먼저 찾아요. 없으면 사람에게 묻고, 답을 save_standard로 새 결정 사항(baseVersion 0)으로 저장해요.',
  '3. 결정 사항을 고칠 때는 get_standard로 currentVersion과 alwaysOn을 보고 그대로 baseVersion, alwaysOn에 넣어요. 이유는 지어내지 말고 사람에게 물어요.',
  '4. 저장이 거절되면 메시지에 적힌 대로 해요. 잠긴 결정 사항은 고치지 말고 사람에게 알려요.',
  '5. 결정 사항 폐기는 사람이 해요(sil deprecate). 폐기가 필요해 보이면 사람에게 알려요.',
  '6. save_standard와 revert는 CHANGELOG 한 줄(changelogLine)을 돌려줘요. 작업 중인 저장소에 team-wiki/CHANGELOG.md가 있으면 그 줄을 맨 아래에 붙여요.',
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
  try {
    const affected = affectedSection(
      standards,
      await withTimeout(listAffectedChecks(user), TIMEOUT_MS),
    );
    if (affected) sections.push(affected);
    return { ok: true, sections };
  } catch {
    sections.push(
      '내가 "관계있다"고 답한 바뀐 결정 사항을 불러오지 못했어요. 이슈와 이어진 결정 사항은 search_standards로 확인해 주세요.',
    );
    return { ok: false, sections };
  }
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
