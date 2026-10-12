import type { ToolGroup } from '../../lib/define-tool.ts';

/**
 * 알리기 도구 묶음 (담당자에게 알리기)
 *
 * 민수님이 이 폴더에 도구 파일을 하나씩 만들고 아래 tools 배열에 넣어요.
 * 이 폴더와 이 파일만 고치면 돼서 위키 도구 작업과 부딪히지 않아요.
 * | 도구          | 하는 일                                                  | 이슈    |
 * | link_task     | Linear 이슈와 기준 이어 두기 (AI 제안, 사람 확인)         | SIL-29  |
 * | list_pending  | 나에게 온 확인할 변경 목록                                | SIL-30  |
 * | respond       | 관계, 알았나, 관계없는 이유, 답한 곳 저장                 | SIL-31  |
 */
export const notifyTools: ToolGroup = {
  name: 'notify',
  owner: '민수',
  issue: 'SIL-29~31',
  tools: [],
};
