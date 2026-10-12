/**
 * docs/타입명세서.md가 타입 폴더와 어긋나지 않았는지 확인해요.
 * 이 폴더와 웹 앱의 화면 ↔ 데이터 약속(apps/web/src/api/types.ts)에서 내보낸 타입 이름,
 * 에러 코드가 문서에 `이름` 모양으로 모두 있어야 해요.
 * 실패하면 문서의 해당 절에 그 타입을 더해 주세요 (칸까지는 검사하지 않으니 직접 챙겨요).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIL_ERROR_CODES } from '../errors.ts';

const typesDir = new URL('./', import.meta.url);
const webContract = new URL(
  '../../../../apps/web/src/api/types.ts',
  import.meta.url,
);
const spec = readFileSync(
  new URL('../../../../docs/타입명세서.md', import.meta.url),
  'utf8',
);

function typeNamesIn(file: URL): string[] {
  return [
    ...readFileSync(file, 'utf8').matchAll(
      /^export (?:interface|type) (\w+)/gm,
    ),
  ].map((match) => match[1]!);
}

function exportedTypeNames(): string[] {
  return readdirSync(typesDir)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.test.ts') &&
        file !== 'index.ts',
    )
    .flatMap((file) => typeNamesIn(new URL(file, typesDir)));
}

describe('docs/타입명세서.md', () => {
  it('타입 폴더에서 내보낸 타입을 모두 설명해요', () => {
    const names = exportedTypeNames();
    expect(names.length).toBeGreaterThan(30);
    expect(names.filter((name) => !spec.includes(`\`${name}\``))).toEqual([]);
  });

  it('웹 앱의 화면 ↔ 데이터 약속도 모두 설명해요 (11절)', () => {
    const names = typeNamesIn(webContract);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !spec.includes(`\`${name}\``))).toEqual([]);
  });

  it('에러 코드를 모두 설명해요', () => {
    expect(
      SIL_ERROR_CODES.filter((code) => !spec.includes(`\`${code}\``)),
    ).toEqual([]);
  });
});
