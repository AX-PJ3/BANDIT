/**
 * 레포의 team-wiki/ 파일을 읽어 기준과 이슈로 바꿔요. `sil import`가 써요 (SIL-65).
 *
 * - 형식은 team-wiki/기준-작성-원칙.md, scripts/check_wiki.py와 같아요: `### 기준ID` 아래 `- 칸: 값` 줄.
 * - 기준 ID와 개수는 코드에 적지 않아요. 파일에 있는 `### 기준ID`를 모두 읽어요.
 * - 문자열을 읽는 순수 함수(parseWikiMarkdown, parseIssuesCsv, planWikiImport)와
 *   파일을 여는 함수(readTeamWiki, readIssuesFile)를 나눠서 테스트하기 쉽게 했어요.
 * - DB에 쓰는 일은 하지 않아요. 저장은 `sil import --apply`가 saveStandard·saveIssue로 해요.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { STANDARD_ID_PATTERN } from '../rules.ts';
import type {
  ImportProblem,
  IssueEntry,
  IssueStatus,
  StandardScope,
  StandardWithLatest,
  WikiEntry,
} from '../types/index.ts';

/** 기준이 아닌 참고 파일 (check_wiki.py의 NOT_STANDARD_FILES와 같아요) */
export const NOT_STANDARD_FILES = new Set([
  'INDEX.md',
  'CHANGELOG.md',
  '용어.md',
  '기준-작성-원칙.md',
  'README.md',
]);

const SCOPE_KINDS: Record<string, keyof StandardScope> = {
  코드: 'code',
  API: 'api',
  화면: 'screen',
  문서: 'doc',
};
const KNOWN_FIELDS = new Set([
  '제목',
  '값',
  '이유',
  '적용 범위',
  '근거',
  '항상 적용',
  '상태',
  '대체',
  '버전',
  '잠금',
]);
/** v2에서 저장할 때 꼭 있어야 하는 칸 (SIL-65). ID는 `### 기준ID` 줄이에요 */
const REQUIRED_FIELDS = ['제목', '값', '이유', '항상 적용'] as const;

// ---------------------------------------------------------------------------
// 기준 (마크다운)
// ---------------------------------------------------------------------------

interface RawEntry {
  id: string;
  line: number;
  fields: Map<string, { value: string; line: number }>;
}

/** 위키 파일 하나를 읽어요. 문제가 있는 기준은 건너뛰고 problems에 알려요. */
export function parseWikiMarkdown(
  text: string,
  file: string,
): { entries: WikiEntry[]; problems: ImportProblem[] } {
  const problems: ImportProblem[] = [];
  const raws: RawEntry[] = [];
  let current: RawEntry | null = null;
  let inFence = false;

  text.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const heading = /^###\s+(\S+)\s*$/.exec(line);
    if (heading) {
      current = { id: heading[1]!, line: lineNo, fields: new Map() };
      raws.push(current);
      return;
    }
    if (line.startsWith('#')) {
      current = null;
      return;
    }
    const field = /^-\s*([^:]+?)\s*:\s*(.*)$/.exec(line);
    if (current && field) {
      const key = field[1]!.trim();
      if (current.fields.has(key)) {
        problems.push(
          warning(
            file,
            lineNo,
            `${current.id}: '${key}' 칸이 두 번 있어요. 뒤의 값을 써요`,
          ),
        );
      }
      current.fields.set(key, { value: field[2]!.trim(), line: lineNo });
    }
  });

  const entries: WikiEntry[] = [];
  for (const raw of raws) {
    const entry = toWikiEntry(raw, file, problems);
    if (entry) entries.push(entry);
  }
  return { entries, problems };
}

function toWikiEntry(
  raw: RawEntry,
  file: string,
  problems: ImportProblem[],
): WikiEntry | null {
  const where = `${raw.id}`;
  const get = (key: string) => raw.fields.get(key)?.value ?? '';
  const errorsBefore = problems.length;
  const fail = (message: string) =>
    problems.push(error(file, raw.line, `${where}: ${message}`));

  if (!STANDARD_ID_PATTERN.test(raw.id)) {
    fail(
      '결정 사항 ID는 영역.주제.규칙 세 부분이고 영어 소문자, 숫자, 하이픈만 써요. 예: app.notify.title-length',
    );
  }
  const missing = REQUIRED_FIELDS.filter((key) => get(key) === '');
  if (missing.length > 0) fail(`필수 칸이 비어 있어요: ${missing.join(', ')}`);

  for (const key of raw.fields.keys()) {
    if (!KNOWN_FIELDS.has(key)) {
      problems.push(
        warning(
          file,
          raw.fields.get(key)!.line,
          `${where}: 모르는 칸 '${key}'는 저장하지 않아요`,
        ),
      );
    }
  }

  const alwaysOn = yesNo(get('항상 적용'));
  if (get('항상 적용') !== '' && alwaysOn === null)
    fail("'항상 적용'은 예 또는 아니오예요");
  const lockedText = get('잠금');
  const locked = lockedText === '' ? false : yesNo(lockedText);
  if (locked === null) fail("'잠금'은 예 또는 아니오예요");

  const statusText = get('상태') || '사용';
  const status =
    statusText === '사용'
      ? 'active'
      : statusText === '폐기'
        ? 'deprecated'
        : null;
  if (status === null) fail("'상태'는 사용 또는 폐기예요");

  const replacements = get('대체')
    .split(/[,\s]+/)
    .filter(Boolean);
  if (status === 'deprecated' && replacements.length === 0) {
    problems.push(
      warning(
        file,
        raw.line,
        `${where}: 폐기된 결정 사항인데 '대체' 칸이 없어요. 대체 없이 폐기해요`,
      ),
    );
  }
  if (replacements.length > 1) {
    problems.push(
      warning(
        file,
        raw.line,
        `${where}: 대체 결정 사항이 여러 개예요. 첫 번째(${replacements[0]})만 저장해요`,
      ),
    );
  }

  const versionText = get('버전');
  const fileVersion = /^[1-9]\d*$/.test(versionText)
    ? Number(versionText)
    : null;
  if (versionText !== '' && fileVersion === null) {
    problems.push(
      warning(
        file,
        raw.line,
        `${where}: '버전'은 1 이상의 정수예요 (받은 값: ${versionText})`,
      ),
    );
  }

  const scoped = parseScope(get('적용 범위'));
  for (const message of scoped.problems) {
    problems.push(
      warning(
        file,
        raw.fields.get('적용 범위')?.line ?? raw.line,
        `${where}: ${message}`,
      ),
    );
  }

  if (problems.slice(errorsBefore).some((problem) => problem.level === 'error'))
    return null;
  return {
    id: raw.id,
    title: get('제목'),
    value: get('값'),
    reason: get('이유'),
    alwaysOn: alwaysOn!,
    evidence: get('근거') || null,
    scope: scoped.scope,
    status: status!,
    replacedBy: replacements[0] ?? null,
    locked: locked!,
    fileVersion,
    file,
    line: raw.line,
  };
}

/**
 * "코드: a / 화면: b / 문서: c"를 { code: [a], screen: [b], doc: [c] }로 바꿔요.
 * 종류가 없는 조각은 바로 앞 종류에 붙여요. 아무것도 없으면 null이에요.
 */
export function parseScope(raw: string): {
  scope: StandardScope | null;
  problems: string[];
} {
  const scope: StandardScope = { code: [], api: [], screen: [], doc: [] };
  const problems: string[] = [];
  let last: keyof StandardScope | null = null;
  for (const piece of raw.split(' / ').map((part) => part.trim())) {
    if (piece === '') continue;
    const match = /^([^:\s]+)\s*:\s*(.+)$/.exec(piece);
    const kind = match ? SCOPE_KINDS[match[1]!] : undefined;
    if (match && kind) {
      scope[kind].push(match[2]!.trim());
      last = kind;
    } else if (last) {
      scope[last].push(piece);
    } else {
      problems.push(
        `적용 범위 '${piece}'의 종류(코드:, API:, 화면:, 문서:)를 몰라서 저장하지 않아요`,
      );
    }
  }
  const empty = Object.values(scope).every((items) => items.length === 0);
  return { scope: empty ? null : scope, problems };
}

/** team-wiki 폴더의 기준 파일(.md)을 모두 읽어요. 같은 ID가 두 번 나오면 뒤의 것을 건너뛰어요. */
export function readTeamWiki(dir: string): {
  entries: WikiEntry[];
  problems: ImportProblem[];
  files: string[];
} {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.md') && !NOT_STANDARD_FILES.has(name))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const entries: WikiEntry[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, WikiEntry>();
  for (const name of files) {
    const parsed = parseWikiMarkdown(
      readFileSync(join(dir, name), 'utf8'),
      name,
    );
    problems.push(...parsed.problems);
    for (const entry of parsed.entries) {
      const first = seen.get(entry.id);
      if (first) {
        problems.push(
          error(
            name,
            entry.line,
            `${entry.id}: 같은 ID가 ${first.file}:${first.line}에도 있어요. 이건 건너뛰어요`,
          ),
        );
        continue;
      }
      seen.set(entry.id, entry);
      entries.push(entry);
    }
  }
  return { entries, problems, files };
}

// ---------------------------------------------------------------------------
// 이슈 (CSV)
// ---------------------------------------------------------------------------

const ISSUE_COLUMNS = {
  key: ['이슈 번호'],
  title: ['이슈 제목'],
  assignee: ['담당자'],
  status: ['이슈 상태', '상태'],
  // 예전 샘플이 쓰던 칸 이름도 받아요
  standardIds: ['기준 ID', '연결된 결정 사항 ID', '결정 사항 ID'],
} as const;

/**
 * 이슈 CSV를 읽어요. 첫 줄은 칸 이름이에요 (예: samples/data/issue-links.csv).
 * 이슈 하나가 기준마다 한 줄씩 여러 줄이어도 이슈 번호로 묶어요. 기준 ID 칸에 여러 ID를 쉼표로 적어도 돼요.
 */
export function parseIssuesCsv(
  text: string,
  file: string,
): { entries: IssueEntry[]; problems: ImportProblem[] } {
  const problems: ImportProblem[] = [];
  // 엑셀에서 저장한 CSV는 맨 앞에 BOM(U+FEFF)이 붙어 있어서 떼어 내요
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const header = rows[0]?.map((cell) => cell.trim()) ?? [];
  const column = (names: readonly string[]) =>
    header.findIndex((cell) => names.includes(cell));
  const at = {
    key: column(ISSUE_COLUMNS.key),
    title: column(ISSUE_COLUMNS.title),
    assignee: column(ISSUE_COLUMNS.assignee),
    status: column(ISSUE_COLUMNS.status),
    standardIds: column(ISSUE_COLUMNS.standardIds),
  };
  const missingColumns = (['key', 'title', 'standardIds'] as const)
    .filter((name) => at[name] < 0)
    .map((name) => ISSUE_COLUMNS[name][0]);
  if (missingColumns.length > 0) {
    problems.push(
      error(
        file,
        1,
        `첫 줄에 꼭 있어야 하는 칸이 없어요: ${missingColumns.join(', ')}`,
      ),
    );
    return { entries: [], problems };
  }

  const byKey = new Map<string, IssueEntry>();
  rows.slice(1).forEach((row, index) => {
    const lineNo = index + 2;
    const cell = (position: number) =>
      position >= 0 ? (row[position] ?? '').trim() : '';
    if (row.every((value) => value.trim() === '')) return;
    const key = cell(at.key);
    const title = cell(at.title);
    const ids = cell(at.standardIds)
      .split(/[,;\s]+/)
      .filter(Boolean);
    if (key === '' || title === '' || ids.length === 0) {
      problems.push(
        error(
          file,
          lineNo,
          '이슈 번호, 이슈 제목, 기준 ID 중 비어 있는 칸이 있어서 건너뛰어요',
        ),
      );
      return;
    }
    const status = issueStatus(cell(at.status));
    if (status === null) {
      problems.push(
        error(
          file,
          lineNo,
          `이슈 ${key}: 이슈 상태는 진행 중 또는 완료예요 (받은 값: ${cell(at.status)})`,
        ),
      );
      return;
    }
    if (cell(at.status) === '할 일') {
      problems.push(
        warning(
          file,
          lineNo,
          `이슈 ${key}: v2에는 '할 일' 상태가 없어서 진행 중으로 저장해요`,
        ),
      );
    }
    const assignee = cell(at.assignee) || null;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        title,
        assignee,
        status,
        standardIds: [...new Set(ids)],
        file,
        line: lineNo,
      });
      return;
    }
    if (
      existing.title !== title ||
      existing.assignee !== assignee ||
      existing.status !== status
    ) {
      problems.push(
        warning(
          file,
          lineNo,
          `이슈 ${key}: 제목·담당자·상태가 ${existing.line}째 줄과 달라요. 앞의 값을 써요`,
        ),
      );
    }
    for (const id of ids)
      if (!existing.standardIds.includes(id)) existing.standardIds.push(id);
  });
  return { entries: [...byKey.values()], problems };
}

export function readIssuesFile(path: string): {
  entries: IssueEntry[];
  problems: ImportProblem[];
} {
  return parseIssuesCsv(readFileSync(path, 'utf8'), basename(path));
}

/** v2 이슈 상태는 진행 중 / 완료 두 가지예요. 예전 샘플의 '할 일'은 완료가 아니라서 진행 중으로 봐요 */
function issueStatus(text: string): IssueStatus | null {
  if (
    text === '' ||
    text === '진행 중' ||
    text === '할 일' ||
    text === 'in_progress'
  ) {
    return 'in_progress';
  }
  if (text === '완료' || text === 'done') return 'done';
  return null;
}

/** 따옴표("…", 안의 ""는 ")와 줄바꿈이 든 칸을 받는 CSV 읽기 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// DB와 비교
// ---------------------------------------------------------------------------

export interface WikiImportPlan {
  /** DB에 없어서 새로 저장할 기준 */
  create: WikiEntry[];
  /** DB와 내용이 같아서 건너뛸 기준 */
  same: WikiEntry[];
  /** DB와 내용이 달라요. --update면 새 버전으로 저장해요 */
  different: {
    entry: WikiEntry;
    current: StandardWithLatest;
    changed: string[];
  }[];
}

/** 파일에서 읽은 기준을 DB의 지금 상태와 비교해요. DB는 폐기된 기준까지 넣어 주세요. */
export function planWikiImport(
  entries: WikiEntry[],
  existing: StandardWithLatest[],
): WikiImportPlan {
  const byId = new Map(existing.map((item) => [item.standard.id, item]));
  const plan: WikiImportPlan = { create: [], same: [], different: [] };
  for (const entry of entries) {
    const current = byId.get(entry.id);
    if (!current) {
      plan.create.push(entry);
      continue;
    }
    const changed = diffEntry(entry, current);
    if (changed.length === 0) plan.same.push(entry);
    else plan.different.push({ entry, current, changed });
  }
  return plan;
}

function diffEntry(
  entry: WikiEntry,
  { standard, latest }: StandardWithLatest,
): string[] {
  const changed: string[] = [];
  if (entry.title !== latest.title) changed.push('제목');
  if (entry.value !== latest.value) changed.push('값');
  if (entry.reason !== latest.reason) changed.push('이유');
  if (entry.alwaysOn !== standard.alwaysOn) changed.push('항상 적용');
  if (entry.evidence !== latest.evidence) changed.push('근거');
  if (scopeKey(entry.scope) !== scopeKey(latest.scope))
    changed.push('적용 범위');
  if (entry.status !== standard.status) changed.push('상태');
  if (entry.locked !== standard.locked) changed.push('잠금');
  return changed;
}

function scopeKey(scope: StandardScope | null): string {
  if (!scope) return 'null';
  return JSON.stringify([scope.code, scope.api, scope.screen, scope.doc]);
}

/** team-wiki 폴더에 이슈 파일이 있으면 그 경로, 없으면 null */
export function findIssuesFile(wikiDir: string): string | null {
  const path = join(wikiDir, 'issues.csv');
  return existsSync(path) ? path : null;
}

function error(file: string, line: number, message: string): ImportProblem {
  return { level: 'error', file, line, message };
}

function warning(file: string, line: number, message: string): ImportProblem {
  return { level: 'warning', file, line, message };
}

function yesNo(text: string): boolean | null {
  if (text === '예') return true;
  if (text === '아니오') return false;
  return null;
}
