import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 브라우저 입구(browser.ts)에서 값으로 가져오는 파일을 모두 따라가서, Node 전용 모듈이 섞이지 않았는지 봐요 (SIL-100).
 * `import type`과 `export type`은 빌드할 때 지워져서 세지 않아요.
 * 웹 빌드(Vite)가 실패했던 원인이 store.ts의 node:fs였어요.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const NODE_ONLY = [/^node:/, /^@sil\/core\/node$/, /^@sil\/core\/testing$/];

/** 값으로 가져오는 모듈 이름들 (type 전용 가져오기는 빼요) */
function valueImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  const pattern =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*'([^']+)'/g;
  for (const match of text.matchAll(pattern)) {
    const [, , typeOnly, , from] = match;
    if (!typeOnly && from) found.push(from);
  }
  for (const match of text.matchAll(/(?:^|\n)\s*import\s*'([^']+)'/g)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

function walk(entry: string): { files: string[]; modules: string[] } {
  const seen = new Set<string>();
  const modules = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const from of valueImports(file)) {
      if (from.startsWith('.')) queue.push(resolve(dirname(file), from));
      else modules.add(from);
    }
  }
  return { files: [...seen], modules: [...modules] };
}

describe('브라우저 입구 (@sil/notify/browser)', () => {
  it('Node 전용 모듈을 값으로 가져오지 않는다', () => {
    const { files, modules } = walk(join(SRC, 'browser.ts'));
    const nodeOnly = modules.filter((m) => NODE_ONLY.some((p) => p.test(m)));
    assert.deepEqual(nodeOnly, [], `브라우저에서 못 쓰는 모듈: ${nodeOnly}`);
    // 파일 저장소(store.ts)는 값으로 끌려오면 안 돼요
    assert.ok(
      !files.some((f) => f.endsWith('store.ts')),
      'store.ts가 값으로 끌려왔어요',
    );
  });

  it('검사기가 Node 전용 가져오기를 실제로 잡아낸다 (패키지 전체 입구는 잡혀야 해요)', () => {
    const { modules } = walk(join(SRC, 'index.ts'));
    assert.ok(modules.includes('node:fs/promises'));
  });
});
