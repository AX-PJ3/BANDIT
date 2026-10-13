/**
 * ③ 등록될 모습에 보여 준 값을 저장하기 전까지 임시로 들고 있어요 (SIL-66 T1).
 * - `preview.ts`가 쓰고, hook(`hook-preview.ts`, `hook-guard.ts`)이 읽어요.
 * - 파일은 운영체제 임시 폴더에 둬서 저장소에 남지 않아요.
 * - 시간으로 지우지 않아요. 사람이 ③을 오래 보고 있다가 등록해도 값이 남아 있어야 해요.
 *   대신 다음 ③이 덮어쓰고, 저장한 뒤와 Claude Code를 새로 켤 때 지워요 (`hook-clear.ts`).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SaveStandardInput } from '@sil/core';

/** 사람에게 ③으로 보여 준 값. 모양은 save_standard 입력에서 골라 써요 (타입은 core에만) */
export type T1Pending = Pick<
  SaveStandardInput,
  'id' | 'title' | 'value' | 'reason' | 'alwaysOn' | 'area'
>;

export const PENDING_PATH = join(tmpdir(), 'haribo-t1-pending.json');

export function writePending(pending: T1Pending): void {
  writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2));
}

/** 없으면 null */
export function readPending(): T1Pending | null {
  if (!existsSync(PENDING_PATH)) return null;
  return JSON.parse(readFileSync(PENDING_PATH, 'utf8')) as T1Pending;
}

export function clearPending(): void {
  rmSync(PENDING_PATH, { force: true });
}

/** 저장하려는 값이 ③에서 보여 준 값과 다른 칸 이름 목록. 같으면 빈 목록 */
export function diffFromPending(
  pending: T1Pending,
  input: Partial<SaveStandardInput>,
): string[] {
  const keys = ['id', 'title', 'value', 'reason', 'alwaysOn'] as const;
  return keys.filter((key) => pending[key] !== input[key]);
}
