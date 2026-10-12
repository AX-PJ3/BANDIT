import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type {
  Answer,
  Issue,
  PendingCheck,
  StandardVersionRecord,
} from './types.ts';

/**
 * 알리기 기능이 읽고 쓰는 데이터 전체예요.
 * 정민님 DB(SIL-73)의 기준 버전, 이슈, 확인할 변경, 답 표와 같은 네 묶음이에요.
 */
export interface NotifyData {
  issues: Issue[];
  standardVersions: StandardVersionRecord[];
  pendingChecks: PendingCheck[];
  answers: Answer[];
}

/**
 * 임시 저장소. 지금은 JSON 파일과 메모리 두 가지가 있고, DB에 붙일 때 이 모양만 DB로 바꿔요.
 * 한 번에 전체를 읽고 전체를 써요. 데모와 시험용이라 동시에 여러 곳에서 쓰는 경우는 다루지 않아요.
 */
export interface NotifyStore {
  read(): Promise<NotifyData>;
  write(data: NotifyData): Promise<void>;
}

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
