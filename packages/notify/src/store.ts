import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { NotifyData, NotifyStore } from './types.ts';

// 브라우저 입구(browser.ts)가 이 파일(node:fs)을 타입으로도 끌어오지 않게 모양은 types.ts에 있어요 (SIL-100)
export type { NotifyData, NotifyStore } from './types.ts';

export function createEmptyData(): NotifyData {
  return { issues: [], standardVersions: [], pendingChecks: [], answers: [] };
}

/** 메모리에 들고 있는 저장소. 테스트에서 써요 */
export class MemoryStore implements NotifyStore {
  private data: NotifyData;

  constructor(initial: NotifyData = createEmptyData()) {
    this.data = structuredClone(initial);
  }

  async read(): Promise<NotifyData> {
    return structuredClone(this.data);
  }

  async write(data: NotifyData): Promise<void> {
    this.data = structuredClone(data);
  }
}

/** JSON 파일 하나에 저장하는 저장소. 파일이 없으면 빈 데이터로 시작해요 */
export class JsonFileStore implements NotifyStore {
  readonly filePath: string;

  // 생성자 매개변수 속성(constructor(readonly filePath))은 Node가 .ts를 바로 실행할 때 지울 수 없는 문법이라 풀어 써요 (erasableSyntaxOnly)
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async read(): Promise<NotifyData> {
    let text: string;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isFileNotFound(error)) {
        return createEmptyData();
      }
      throw error;
    }
    return {
      ...createEmptyData(),
      ...(JSON.parse(text) as Partial<NotifyData>),
    };
  }

  async write(data: NotifyData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    // 쓰다가 멈춰도 원래 파일이 깨지지 않게 임시 파일에 쓴 뒤 이름을 바꿔요
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.filePath);
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
