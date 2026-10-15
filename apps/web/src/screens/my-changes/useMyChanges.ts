/**
 * 나에게 온 변경 목록을 불러오고, 바뀌면 다시 불러오고, 새 확인할 변경이 생기면 OS 알림을 띄워요 (A1).
 *
 * - 처음 불러온 대기 목록은 알림을 띄우지 않아요. 창이 열려 있는 동안 새로 생긴 것만 띄워요 (app.notify.realtime).
 * - 불러오지 못하면 빈 목록 대신 이유를 돌려줘요 (notify.error.not-empty).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/index.ts';
import type { MyChange } from '../../api/types.ts';
import { showChangeNotification } from '../../pwa.ts';
import { toNotification } from './format.ts';

export interface MyChangesState {
  /** 아직 불러오지 않았으면 null */
  changes: MyChange[] | null;
  /** 불러오지 못한 이유 */
  loadError: string | null;
  /** 실시간 구독이 끊긴 이유. 목록은 그대로 보여 주고 이 문구를 함께 보여 줘요 */
  watchError: string | null;
  reload: () => Promise<void>;
}

export function useMyChanges(me: string): MyChangesState {
  const [changes, setChanges] = useState<MyChange[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  /** 이미 본 대기 변경 ID. null이면 아직 처음 불러오기 전이에요 */
  const seenPending = useRef<Set<string> | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await api.listMyChanges(me);
      const pending = next.filter((item) => item.status === 'pending');
      const seen = seenPending.current;
      if (seen) {
        for (const item of pending) {
          if (!seen.has(item.pendingCheckId)) {
            void showChangeNotification(toNotification(item));
          }
        }
      }
      seenPending.current = new Set([
        ...(seen ?? []),
        ...pending.map((item) => item.pendingCheckId),
      ]);
      setChanges(next);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [me]);

  useEffect(() => {
    seenPending.current = null;
    void reload();
    return api.watchMyChanges(
      me,
      () => {
        setWatchError(null);
        void reload();
      },
      setWatchError,
    );
  }, [me, reload]);

  return { changes, loadError, watchError, reload };
}
