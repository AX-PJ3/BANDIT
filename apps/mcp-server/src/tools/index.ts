import type { ToolGroup } from '../lib/define-tool.ts';
import { notifyTools } from './notify/index.ts';
import { systemTools } from './system/index.ts';
import { wikiTools } from './wiki/index.ts';

/**
 * 서버에 올라가는 도구 묶음 목록이에요.
 * 새 도구는 여기가 아니라 각 묶음 폴더의 index.ts에 넣어요. 새 "묶음"이 생길 때만 이 파일을 고쳐요.
 */
export const toolGroups: ToolGroup[] = [systemTools, wikiTools, notifyTools];
