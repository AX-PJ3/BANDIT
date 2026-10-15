/**
 * ③ 등록될 모습에 보여 준 값을 저장하기 전까지 임시로 들고 있어요 (SIL-66 T1).
 * - `preview.ts`가 쓰고, hook(`hook-preview.ts`, `hook-guard.ts`, `hook-clear.ts`)이 읽고 지워요.
 * - 파일은 운영체제 임시 폴더에 둬서 저장소에 남지 않아요.
 * - 결정 사항마다 파일을 따로 둬요. Claude Code 창 여러 개가 다른 결정 사항을 T1으로 바꿔도 서로 덮어쓰지 않아요.
 * - 시간으로 지우지 않아요. 다음 ③이 덮어쓰고, 저장하면 지워요.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STANDARD_ID_PATTERN, type SaveStandardInput } from '@sil/core';
import type { T1Target } from './issues.ts';
import type { T1ConflictsInput } from './screens.ts';

/**
 * 사람에게 ③으로 보여 준 값. 모양은 save_standard 입력에서 골라 써요 (타입은 core에만).
 * `changedBy`는 바꾸는 사람 이름(받는 이슈에서 빼요), `targets`는 `preview.ts`가 읽어 둔 ③ 이슈 표예요(못 읽었으면 null).
 * `isNew`는 기존 결정 사항이 없는 새 결정 사항일 때 true예요 (SIL-94)
 */
export type T1Pending = Pick<
  SaveStandardInput,
  'id' | 'title' | 'value' | 'reason' | 'alwaysOn' | 'area' | 'changedBy'
> & { targets?: T1Target[] | null; isNew?: boolean };

/** 결정 사항 ID 형식이 맞을 때만 파일 경로를 줘요 (data.standard.id-format) */
export function pendingPath(id: string): string | null {
  return STANDARD_ID_PATTERN.test(id)
    ? join(tmpdir(), `haribo-t1-pending-${id}.json`)
    : null;
}

export function writePending(pending: T1Pending): void {
  const path = pendingPath(pending.id);
  if (!path) throw new Error(`결정 사항 ID 형식이 아니에요: ${pending.id}`);
  writeFileSync(path, JSON.stringify(pending, null, 2));
}

/** 없으면 null */
export function readPending(id: string | undefined): T1Pending | null {
  const path = id ? pendingPath(id) : null;
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T1Pending;
}

export function clearPending(id: string | undefined): void {
  const path = id ? pendingPath(id) : null;
  if (path) rmSync(path, { force: true });
}

/** 저장하려는 값이 ③에서 보여 준 값과 다른 칸 이름 목록. 같으면 빈 목록 */
export function diffFromPending(
  pending: T1Pending,
  input: Partial<SaveStandardInput>,
): string[] {
  const keys = ['id', 'title', 'value', 'reason', 'alwaysOn'] as const;
  return keys.filter((key) => pending[key] !== input[key]);
}

/**
 * 다른 결정 사항 화면 값도 같은 임시 폴더에 둬요 (SIL-94 직접 요청).
 * 저장과 비교하지 않아서 결정 사항 ID 대신 명령마다 새 표(UUID)로 파일을 나누고, hook이 띄운 뒤 바로 지워요.
 */
const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 표 형식이 맞을 때만 파일 경로를 줘요 (경로 문자 막기) */
export function conflictsPath(token: string): string | null {
  return TOKEN_PATTERN.test(token)
    ? join(tmpdir(), `haribo-t1-conflicts-${token}.json`)
    : null;
}

/** 값을 쓰고 표를 돌려줘요 */
export function writeConflicts(input: T1ConflictsInput): string {
  const token = randomUUID();
  writeFileSync(conflictsPath(token) as string, JSON.stringify(input, null, 2));
  return token;
}

/** 읽고 바로 지워요. 없으면 null */
export function takeConflicts(
  token: string | undefined,
): T1ConflictsInput | null {
  const path = token ? conflictsPath(token) : null;
  if (!path || !existsSync(path)) return null;
  const input = JSON.parse(readFileSync(path, 'utf8')) as T1ConflictsInput;
  rmSync(path, { force: true });
  return input;
}
