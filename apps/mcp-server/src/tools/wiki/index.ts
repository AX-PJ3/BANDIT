import type { ToolGroup } from '../../lib/define-tool.ts';
import { getIndex } from './get-index.ts';
import { getStandard } from './get-standard.ts';
import { revert } from './revert.ts';
import { saveStandard } from './save-standard.ts';
import { searchStandards } from './search-standards.ts';

/**
 * 위키 읽기·쓰기 도구 묶음 (기준 모으기, SIL-19)
 *
 * 팀 위키 wiki.mcp.five-tools에 따라 다섯 개만 둬요. 알림 기능과 각자 CLAUDE.md가 이 이름을 그대로 써요.
 * 폐기는 사람이 `sil deprecate`로 해요. AI는 폐기가 필요해 보이면 사람에게 알려요.
 *
 * | 도구                | 하는 일                                          |
 * | get_index           | 목차 보기 (영역별 한 줄 요약과 기준 수)           |
 * | search_standards    | 키워드, 영역, 코드 경로로 기준 찾기               |
 * | get_standard        | 기준 하나와 버전 이력 보기                        |
 * | save_standard       | 새 기준·새 버전 저장 (형식 검사, 잠금, 버전 충돌) |
 * | revert              | 이전 버전으로 되돌리기 (되돌림도 새 버전)         |
 */
export const wikiTools: ToolGroup = {
  name: 'wiki',
  owner: '정민',
  issue: 'SIL-19',
  tools: [getIndex, searchStandards, getStandard, saveStandard, revert],
};
