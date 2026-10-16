/**
 * 진짜 데이터 버전의 api예요 (D50).
 *
 * 화면이 Supabase 공용 키로 DB에 바로 붙어요. 공용 키로는 읽기와 저장 함수 호출만 되고,
 * 표에 직접 쓰거나 지울 수 없어서 화면에 넣어도 돼요 (D21). 저장 규칙은 DB 함수가 지켜요.
 * 데이터는 '@sil/core/data' 함수로만 읽고 써요. MCP 서버·명령어와 같은 함수예요.
 */
import * as data from '@sil/core/data';
import { buildPendingList, loadNotifyData } from '@sil/notify/browser';
import { currentPlatform } from '../pwa.ts';
import { toPeople } from './people.ts';
import type { SilApi } from './types.ts';

export function createDatabaseApi(url: string, publishableKey: string): SilApi {
  data.connectDb(url, publishableKey);
  return {
    getAppInfo: async () => ({
      version: __APP_VERSION__,
      platform: currentPlatform(),
      dataMode: 'database',
      db: await data.checkDbConnection(),
    }),

    listPeople: async () => toPeople(await data.listIssues()),

    // 터미널(MCP list_pending)과 같은 데이터 모으기와 목록 규칙이에요 (SIL-100, notify.list.one-call)
    listMyChanges: async (me) =>
      buildPendingList(await loadNotifyData(data, me), {
        recipient: me,
        includeClosed: true,
      }).items,

    answer: (me, input) =>
      data.saveAnswer({ ...input, answeredBy: me, channel: 'app' }),

    markReflected: (me, pendingCheckId, reflected) =>
      data.saveReflected({ pendingCheckId, markedBy: me, reflected }),

    watchMyChanges: (me, onChange, onError) =>
      data.watchPendingChecks({ recipient: me, onChange, onError }),
  };
}
