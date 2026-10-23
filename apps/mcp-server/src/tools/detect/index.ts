import type { ToolGroup } from '../../lib/define-tool.ts';
import { showStandardCheck } from './show-standard-check.ts';

/**
 * 바뀐 결정 사항 찾기 도구 묶음 (BDT-108)
 *
 * | 도구                | 하는 일                                                         |
 * | show_standard_check | T1 결정 사항 확인 화면(② 다른 결정 사항, ③ 등록될 모습, 예외) 띄우기 |
 */
export const detectTools: ToolGroup = {
  name: 'detect',
  owner: '경하',
  issue: 'BDT-108',
  tools: [showStandardCheck],
};
