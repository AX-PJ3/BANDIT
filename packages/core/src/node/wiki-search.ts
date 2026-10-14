/**
 * 목차 만들기와 기준 찾기예요. DB를 부르지 않는 순수 함수라서 테스트하기 쉬워요.
 *
 * 왜 DB 대신 여기서 거르나요:
 * - 코드 경로는 적용 범위의 glob(예: src/order/**)과 맞춰 봐야 해서 SQL로는 어려워요.
 * - 기준은 많아야 수백 개라서 한 번에 받아 거르는 편이 단순하고 빨라요.
 */
import picomatch from 'picomatch';
import type { StandardWithLatest, WikiIndex } from '../types/index.ts';

export interface StandardSearchQuery {
  /** 띄어쓰기로 나눈 낱말이 모두 들어 있는 기준을 찾아요 (ID, 영역, 제목, 값, 이유, 적용 범위). 대소문자는 가리지 않아요 */
  keyword?: string;
  /** 영역 이름(예: 주문) 또는 ID 앞부분(예: order) */
  area?: string;
  /** 고치려는 파일 경로. 적용 범위의 코드 경로(glob)와 맞는 기준을 찾아요 */
  codePath?: string;
  /** 돌려줄 최대 개수 (기본 20) */
  limit?: number;
}

export interface StandardSearchHit extends StandardWithLatest {
  /** codePath로 찾았을 때 맞은 코드 경로 */
  matchedCode: string[];
}

const SUMMARY_LENGTH = 120;

export function buildWikiIndex(list: StandardWithLatest[]): WikiIndex {
  const active = list.filter(({ standard }) => standard.status === 'active');
  const byArea = new Map<string, StandardWithLatest[]>();
  for (const item of active) {
    const items = byArea.get(item.standard.area) ?? [];
    items.push(item);
    byArea.set(item.standard.area, items);
  }
  return {
    total: active.length,
    areas: [...byArea.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([area, items]) => ({
        area,
        count: items.length,
        summary: truncate(
          items.map(({ standard }) => standard.title).join(' · '),
          SUMMARY_LENGTH,
        ),
      })),
    alwaysOn: active
      .filter(({ standard }) => standard.alwaysOn)
      .map(({ standard }) => ({ id: standard.id, title: standard.title })),
    standards: active
      .map(({ standard }) => ({
        id: standard.id,
        area: standard.area,
        title: standard.title,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function searchStandardList(
  list: StandardWithLatest[],
  query: StandardSearchQuery,
): StandardSearchHit[] {
  const terms = (query.keyword ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const area = query.area?.trim().toLowerCase();
  const codePath = query.codePath ? normalizePath(query.codePath) : undefined;
  const hits: StandardSearchHit[] = [];

  for (const item of list) {
    const { standard, latest } = item;
    if (
      area &&
      standard.area.toLowerCase() !== area &&
      !standard.id.startsWith(`${area}.`)
    ) {
      continue;
    }
    const scope = latest.scope;
    if (terms.length > 0) {
      const haystack = [
        standard.id,
        standard.area,
        latest.title,
        latest.value,
        latest.reason,
        ...(scope
          ? [...scope.code, ...scope.api, ...scope.screen, ...scope.doc]
          : []),
      ]
        .join('\n')
        .toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) continue;
    }
    const matchedCode =
      codePath && scope
        ? scope.code.filter((pattern) => matchesCodePath(pattern, codePath))
        : [];
    if (codePath && matchedCode.length === 0) continue;
    hits.push({ ...item, matchedCode });
  }

  return hits.slice(0, query.limit ?? 20);
}

/** 적용 범위의 코드 경로(glob 또는 폴더)가 파일 경로와 맞는지 */
export function matchesCodePath(pattern: string, path: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern === path) return true;
  if (!picomatch.scan(normalizedPattern).isGlob) {
    return path.startsWith(`${normalizedPattern.replace(/\/$/, '')}/`);
  }
  return picomatch(normalizedPattern, { dot: true })(path);
}

/** Windows 경로(\)와 ./ 앞머리를 맞춰요 */
function normalizePath(path: string): string {
  return path
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function truncate(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
