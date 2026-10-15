/**
 * 진짜 데이터 버전의 api예요 (D50).
 *
 * 화면이 Supabase 공용 키로 DB에 바로 붙어요. 공용 키로는 읽기와 저장 함수 호출만 되고,
 * 표에 직접 쓰거나 지울 수 없어서 화면에 넣어도 돼요 (D21). 저장 규칙은 DB 함수가 지켜요.
 * 데이터는 '@sil/core/data' 함수로만 읽고 써요. MCP 서버·명령어와 같은 함수예요.
 */
import type { AnswerRecord, PendingCheck } from '@sil/core';
import {
  checkDbConnection,
  connectDb,
  getStandardHistory,
  listAnswerRecords,
  listIssues,
  listPendingChecks,
  saveAnswer,
  saveReflected,
  watchPendingChecks,
} from '@sil/core/data';
import { currentPlatform } from '../pwa.ts';
import { toMyChanges, type MyChangeAnswerRow } from './my-changes.ts';
import type { SilApi } from './types.ts';

/**
 * 응답 기록(answer_records)에는 확인할 변경 ID가 없어요.
 * 결정 사항 ID, 버전, 이슈 번호, 답한 사람이 같으면 같은 확인할 변경이라 그걸로 이어 붙여요.
 * MCP 서버(tools/notify/shared.ts)와 같은 방법이에요. SIL-100에서 공용으로 옮기면 그쪽을 써요.
 */
function toAnswerRows(
  records: AnswerRecord[],
  checks: PendingCheck[],
): MyChangeAnswerRow[] {
  return records.flatMap((record) => {
    const check = checks.find(
      (item) =>
        item.standardId === record.standardId &&
        item.version === record.version &&
        item.issueKey === record.issueKey &&
        item.recipient === record.answeredBy,
    );
    return check ? [{ ...record, pendingCheckId: check.id }] : [];
  });
}

export function createDatabaseApi(url: string, publishableKey: string): SilApi {
  connectDb(url, publishableKey);
  return {
    getAppInfo: async () => ({
      version: __APP_VERSION__,
      platform: currentPlatform(),
      dataMode: 'database',
      db: await checkDbConnection(),
    }),

    listMyChanges: async (me) => {
      const [checks, issues, records] = await Promise.all([
        listPendingChecks({ recipient: me, status: 'all' }),
        listIssues(),
        listAnswerRecords(),
      ]);
      const standardIds = [...new Set(checks.map((item) => item.standardId))];
      const histories = await Promise.all(standardIds.map(getStandardHistory));
      return toMyChanges({
        checks,
        issues,
        versions: histories.flatMap((history) => history?.versions ?? []),
        answers: toAnswerRows(records, checks),
      });
    },

    answer: (me, input) =>
      saveAnswer({ ...input, answeredBy: me, channel: 'app' }),

    markReflected: (me, pendingCheckId, reflected) =>
      saveReflected({ pendingCheckId, markedBy: me, reflected }),

    watchMyChanges: (me, onChange, onError) =>
      watchPendingChecks({ recipient: me, onChange, onError }),
  };
}
