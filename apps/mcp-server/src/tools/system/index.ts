import type { ToolGroup } from '../../lib/define-tool.ts';
import { ping } from './ping.ts';

/** 서버 자체를 확인하는 도구 묶음 */
export const systemTools: ToolGroup = {
  name: 'system',
  owner: '정민',
  issue: 'SIL-16',
  tools: [ping],
};
