/**
 * 알리기 도구들이 함께 쓰는 것: 부른 사람 확인, DB에서 알리기 데이터 모으기.
 *
 * 목록을 만들고 답을 검사하는 규칙과 DB 값을 바꾸는 코드는 @sil/notify에 있어요 (buildPendingList, checkAnswer, loadNotifyData).
 * 웹 앱도 같은 loadNotifyData에 @sil/core/data 함수를 넘겨 써서, 터미널과 웹의 목록이 같게 나와요 (SIL-100).
 * 여기서는 서버용 DB 함수(@sil/core/node)를 넘기기만 해요 (SIL-17: DB를 직접 부르지 않아요).
 */
import { SilError } from '@sil/core';
import {
  getStandardHistory,
  listAnswerRecords,
  listIssues,
  listPendingChecks,
} from '@sil/core/node';
import {
  loadNotifyData as loadFromSource,
  type NotifyData,
  type NotifyDataSource,
} from '@sil/notify';
import type { ToolContext } from '../../lib/define-tool.ts';

export { toNotifyCheck } from '@sil/notify';

/** 서버가 쓰는 DB 함수 (.env의 Supabase 주소·키로 붙어요) */
const serverSource: NotifyDataSource = {
  listPendingChecks,
  listIssues,
  listAnswerRecords,
  getStandardHistory,
};

/**
 * 부른 사람 이름. 알리기 도구는 "나에게 온 변경"만 다뤄서 이름이 꼭 있어야 해요.
 * 다른 사람 이름을 입력으로 받지 않아요. 남의 변경을 보거나 대신 답하지 못하게 하려고요.
 */
export function requireUser(context: ToolContext): string {
  if (!context.user) {
    throw new SilError(
      'FORBIDDEN',
      '누구인지 알 수 없어서 나에게 온 변경을 찾을 수 없어요. MCP 서버를 등록할 때 X-Sil-User에 이름을 넣어 주세요 (pnpm mcp:register).',
    );
  }
  return context.user;
}

/** 한 사람의 목록을 만드는 데 필요한 데이터를 DB에서 모아요 (@sil/notify loadNotifyData) */
export function loadNotifyData(recipient: string): Promise<NotifyData> {
  return loadFromSource(serverSource, recipient);
}
