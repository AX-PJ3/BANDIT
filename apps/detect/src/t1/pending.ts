/**
 * ③ 등록될 모습에 보여 준 값을 저장하기 전까지 임시로 들고 있어요 (SIL-66 T1).
 * - `preview.ts`가 쓰고, hook(`hook-preview.ts`, `hook-guard.ts`, `hook-clear.ts`)이 읽고 지워요.
 * - 파일은 운영체제 임시 폴더에 둬서 저장소에 남지 않아요.
 * - 결정 사항마다 파일을 따로 둬요. Claude Code 창 여러 개가 다른 결정 사항을 T1으로 바꿔도 서로 덮어쓰지 않아요.
 * - 시간으로 지우지 않아요. 다음 ③이 덮어쓰고, 저장하면 지워요.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STANDARD_ID_PATTERN, type SaveStandardInput } from '@sil/core';

/** 사람에게 ③으로 보여 준 값. 모양은 save_standard 입력에서 골라 써요 (타입은 core에만) */
export type T1Pending = Pick<
  SaveStandardInput,
  'id' | 'title' | 'value' | 'reason' | 'alwaysOn' | 'area'
>;

/** preview.ts가 마지막 줄에 남기는 표시. hook-preview.ts가 이 뒤의 결정 사항 ID로 파일을 찾아요 */
export const PREVIEW_DONE = '③ 등록될 모습 값을 임시로 들고 있어요:';

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
