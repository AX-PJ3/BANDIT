/**
 * 위키 적용 범위의 코드 경로가 저장소의 실제 파일과 맞는지 확인해요.
 *
 * 왜 필요한가요: 바뀐 기준 찾기는 PR에서 바뀐 파일 경로와 적용 범위가 겹치는 기준만 AI에게 보내요 (detect.filter.scope-first).
 * 적용 범위가 실제 파일과 안 맞으면 그 기준은 영영 걸리지 않아요.
 * 기준 작성 원칙 4는 "코드가 없으면 만들어질 위치를 예상해서 적고, 저장소 구조가 정해지면 고친다"고 해요.
 * 이 확인 결과가 "고칠 목록"이에요.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StandardScope } from '../types/index.ts';
import { matchesCodePath } from './wiki-search.ts';

const SKIPPED_FOLDERS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
  '.turbo',
  '.vite',
]);

export interface ScopePathReport {
  /** 적용 범위의 코드 경로 (glob) */
  pattern: string;
  /** 이 경로를 쓰는 기준 ID */
  standardIds: string[];
  /** 맞는 파일 수 */
  matchedFiles: number;
  /** 맞는 파일이 없을 때, 같은 패키지 안에서 이름이 비슷한 파일 (최대 3개) */
  candidates: string[];
  /** 경로 모양이 아니에요 (예: "전체 저장소"). 바뀐 기준 찾기가 파일 경로와 맞춰 볼 수 없어요 */
  notAPath: boolean;
}

/** 저장소 파일 경로 목록 (/로 이은 상대 경로). node_modules 같은 폴더는 건너뛰어요. */
export function listRepoFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        files.push(relative(root, join(dir, entry.name)).replaceAll('\\', '/'));
      }
    }
  };
  walk(root);
  return files.sort();
}

/** 코드 경로마다 맞는 파일 수를 세고, 하나도 없으면 비슷한 이름의 파일을 찾아 줘요. */
export function checkScopePaths(
  entries: { id: string; scope: StandardScope | null }[],
  files: string[],
): ScopePathReport[] {
  const byPattern = new Map<string, string[]>();
  for (const entry of entries) {
    for (const pattern of entry.scope?.code ?? []) {
      byPattern.set(pattern, [...(byPattern.get(pattern) ?? []), entry.id]);
    }
  }
  return (
    [...byPattern.entries()]
      .map(([pattern, standardIds]) => {
        const notAPath = !/^[\x21-\x7e]+$/.test(pattern);
        const matchedFiles = notAPath
          ? 0
          : files.filter((file) => matchesCodePath(pattern, file)).length;
        return {
          pattern,
          standardIds,
          matchedFiles,
          candidates:
            matchedFiles === 0 && !notAPath
              ? findCandidates(pattern, files)
              : [],
          notAPath,
        };
      })
      // 글자 순서 그대로 정렬해요 (localeCompare는 환경마다 한글과 영어 순서가 달라요)
      .sort((a, b) =>
        a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0,
      )
  );
}

/**
 * 옮긴 패키지 폴더예요 (D49, 팀 저장소 PR #3 구조). 위키에는 아직 옛 경로가 적혀 있어서,
 * 옛 경로로 찾을 때는 새 폴더 안을 봐요. 위키 경로를 고치면(SIL-62) 이 표는 지워도 돼요.
 */
const MOVED_PACKAGES: Record<string, string> = {
  'packages/mcp/': 'apps/mcp-server/',
  'packages/app/': 'apps/web/',
  'packages/cli/': 'apps/cli/',
  'packages/detect/': 'apps/detect/',
};

/**
 * 경로의 마지막 이름(예: save_standard*)을 _와 -를 구분하지 않고 찾아요.
 * packages/<이름>/이나 apps/<이름>/으로 시작하면 그 패키지 안에서만 찾아요 (다른 패키지의 같은 이름은 다른 코드예요).
 */
function findCandidates(pattern: string, files: string[]): string[] {
  const segments = pattern
    .split('/')
    .filter((segment) => segment && !/^\*+$/.test(segment));
  const last = segments.at(-1) ?? '';
  const token = normalize(
    last.replace(/\*.*$/, '').replace(/\.[a-z0-9]+$/i, ''),
  );
  if (token.length < 3) return [];
  const writtenDir = /^(?:packages|apps)\/[^/*]+\//.exec(pattern)?.[0];
  const packageDir = writtenDir
    ? (MOVED_PACKAGES[writtenDir] ?? writtenDir)
    : undefined;
  return files
    .filter((file) => !packageDir || file.startsWith(packageDir))
    .filter((file) =>
      normalize(file.slice(packageDir?.length ?? 0)).includes(token),
    )
    .slice(0, 3);
}

function normalize(text: string): string {
  return text.toLowerCase().replaceAll('_', '-');
}
