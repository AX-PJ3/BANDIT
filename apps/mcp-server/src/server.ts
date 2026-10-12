import { McpServer } from '@modelcontextprotocol/server';
import { getInstructions } from './instructions.ts';
import { registerToolGroup, type ToolContext } from './lib/define-tool.ts';
import { SERVER_INFO } from './server-info.ts';
import { toolGroups } from './tools/index.ts';

/**
 * MCP 서버 하나를 만들어요. HTTP 서버(src/http.ts)가 요청마다 이 함수를 불러요 (SDK v2의 createMcpHandler).
 * 도구는 여기서 직접 등록하지 않고 tools/index.ts의 묶음 목록을 따라 등록해요.
 * context에는 "누가 불렀는지"가 들어 있어요. 도구는 기준을 고친 사람으로 이 값을 남겨요.
 */
export async function createServer(context: ToolContext): Promise<McpServer> {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: await getInstructions(context.user),
  });
  for (const group of toolGroups) registerToolGroup(server, group, context);
  return server;
}

/** 두 사람이 같은 이름의 도구를 만들면 켜는 순간 알려 줘요. 누구 것과 겹쳤는지도 함께요. */
export function assertUniqueToolNames(): void {
  const owners = new Map<string, string>();
  for (const group of toolGroups) {
    for (const tool of group.tools) {
      const previous = owners.get(tool.name);
      if (previous) {
        throw new Error(
          `도구 이름 '${tool.name}'이 ${previous} 묶음과 ${group.name} 묶음에서 겹쳐요.`,
        );
      }
      owners.set(tool.name, group.name);
    }
  }
}
