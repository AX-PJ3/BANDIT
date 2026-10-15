import type { ToolGroup } from '../../lib/define-tool.ts';
import { listPendingTool } from './list-pending.ts';
import { markReflectedTool } from './mark-reflected.ts';
import { respondTool } from './respond.ts';

/**
 * 알리기 도구 묶음 (담당자에게 알리기, 민수님 SIL-67)
 *
 * | 도구          | 하는 일                                                        |
 * | list_pending  | 나에게 온 확인할 변경 목록. 결정 사항 제목·값·이유·이슈를 붙여 줘요 |
 * | respond       | 관계, 알았나, 관계없는 이유를 검사하고 저장 (답한 곳은 터미널)     |
 * | mark_reflected | 관계있다로 답한 변경을 내 작업에 반영했다고 표시하거나 풀기 (SIL-93) |
 *
 * 목록을 만들고 답을 검사하는 규칙은 @sil/notify에 있고, 이 폴더는 DB에서 데이터를 모아 넘기기만 해요.
 * 이슈와 결정 사항 이어 두기(link_task)는 MVP에서 만들지 않아요. 연결은 미리 넣어 둬요 (착수 안내).
 */
export const notifyTools: ToolGroup = {
  name: 'notify',
  owner: '민수',
  issue: 'SIL-67',
  tools: [listPendingTool, respondTool, markReflectedTool],
};
