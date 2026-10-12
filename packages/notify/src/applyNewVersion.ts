import {
  createPendingChecks,
  type CreatePendingChecksResult,
} from './createPendingChecks.js';
import type { NotifyStore } from './store.js';
import type { IsoDateTime, StandardVersionRecord } from './types.js';

export interface ApplyNewVersionOptions {
  /** 지금 시각. 안 주면 실제 시각 */
  now?: IsoDateTime;
  /** 새 확인할 변경의 ID를 만드는 함수. 안 주면 UUID */
  makeId?: () => string;
}

/**
 * 새 버전 하나를 기록하고, 그 결과로 확인할 변경을 만들거나 닫아요.
 *
 * 정민님 저장소에 붙기 전까지 save_standard와 revert 대신 데모와 테스트가 불러요.
 * 누구에게 만들고 무엇을 닫을지는 createPendingChecks가 정하고, 이 함수는 그 결과를 저장만 해요.
 */
export async function applyNewVersion(
  store: NotifyStore,
  version: StandardVersionRecord,
  options: ApplyNewVersionOptions = {},
): Promise<CreatePendingChecksResult> {
  const data = await store.read();
  const now = options.now ?? new Date().toISOString();

  const previousVersions = data.standardVersions.filter(
    (record) => record.standardId === version.standardId,
  );
  const latestVersion = Math.max(0, ...previousVersions.map((r) => r.version));
  if (version.version !== latestVersion + 1) {
    throw new Error(
      `${version.standardId}의 다음 버전은 ${latestVersion + 1}이어야 하는데 ${version.version}이 들어왔어요.`,
    );
  }

  const result = createPendingChecks({
    saved: {
      standardId: version.standardId,
      version: version.version,
      value: version.value,
      changedBy: version.changedBy,
      createdAt: version.changedAt,
    },
    issues: data.issues,
    existing: data.pendingChecks,
    history: previousVersions.map((r) => ({
      version: r.version,
      value: r.value,
    })),
    now,
    ...(options.makeId ? { makeId: options.makeId } : {}),
  });

  const closedById = new Map(result.closed.map((c) => [c.id, c]));
  const pendingChecks = data.pendingChecks.map((check) => {
    const closed = closedById.get(check.id);
    return closed
      ? { ...check, status: closed.status, closedAt: closed.closedAt }
      : check;
  });

  await store.write({
    ...data,
    standardVersions: [...data.standardVersions, version],
    pendingChecks: [...pendingChecks, ...result.created],
  });

  return result;
}
