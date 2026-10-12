/**
 * MCP 도구를 만드는 공통 틀이에요.
 *
 * 왜 SDK의 registerTool을 바로 쓰지 않나요:
 * - 도구를 만드는 사람은 "입력 → 결과 데이터"만 쓰면 되게 하려고요.
 *   결과를 MCP 응답 모양으로 감싸기, 에러를 AI가 읽을 수 있는 문장으로 바꾸기, 로그 남기기는 여기서 한 번에 해요.
 * - 도구마다 에러 처리가 다르면 같은 실패가 도구마다 다르게 보여요.
 */
import type {
  CallToolResult,
  McpServer,
  ToolAnnotations,
} from '@modelcontextprotocol/server';
import { isSilError } from '@sil/core';
import { createLogger } from '@sil/core/node';
import type { z } from 'zod';

const log = createLogger('mcp');

/**
 * 요청마다 달라지는 정보예요. HTTP 서버가 토큰과 헤더를 확인한 뒤 채워요 (src/http.ts).
 * 도구는 "누가 불렀는지"를 여기서만 읽어요. 기준을 고친 사람(changedBy)으로 남기려고요.
 */
export interface ToolContext {
  /** 부른 사람. Claude Code에 등록할 때 넣은 X-Sil-User 헤더 (보통 이메일). 없으면 null */
  user: string | null;
  /** 어느 토큰으로 들어왔는지 (SIL_MCP_TOKENS의 이름, 예: haribo). 토큰 없이 내 컴퓨터에서 켰으면 'local' */
  client: string;
}

export interface ToolDefinition<Input extends z.ZodObject = z.ZodObject> {
  /** 도구 이름. snake_case (예: search_standards). 서버 전체에서 겹치면 켜질 때 에러가 나요 */
  name: string;
  /** 사람이 보는 짧은 이름 */
  title: string;
  /** AI가 "언제 이 도구를 쓸지" 판단하는 설명. 무엇을 하고, 언제 쓰고, 무엇을 돌려주는지 적어요 */
  description: string;
  /** 입력 모양. 입력이 없으면 z.object({}) */
  inputSchema: Input;
  /** 읽기 전용인지 등 힌트. 읽기만 하는 도구는 { readOnlyHint: true } */
  annotations?: ToolAnnotations;
  /** 실제 동작. 결과 데이터를 돌려주면 JSON으로 바꿔 AI에게 전달돼요. 실패는 throw로 알려요 */
  handler(input: z.output<Input>, context: ToolContext): unknown;
}

/** 타입 추론을 돕는 함수예요. 동작은 없어요. */
export function defineTool<Input extends z.ZodObject>(
  definition: ToolDefinition<Input>,
): ToolDefinition<Input> {
  return definition;
}

/** 도구 묶음. 담당자별로 묶어서, 서로 다른 사람이 같은 파일을 고치지 않게 해요. */
export interface ToolGroup {
  /** 묶음 이름 (폴더 이름과 같게) */
  name: string;
  /** 담당자 */
  owner: string;
  /** 담당 이슈 */
  issue: string;
  tools: ToolDefinition[];
}

export function registerToolGroup(
  server: McpServer,
  group: ToolGroup,
  context: ToolContext,
): void {
  for (const tool of group.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input) => {
        try {
          return toResult(await tool.handler(input, context));
        } catch (error) {
          return toErrorResult(tool.name, error, context);
        }
      },
    );
  }
}

function toResult(data: unknown): CallToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

/** 우리가 만든 에러(SilError)는 문구 그대로, 그 밖의 에러는 로그만 자세히 남기고 짧게 알려요. */
function toErrorResult(
  toolName: string,
  error: unknown,
  context: ToolContext,
): CallToolResult {
  if (isSilError(error)) {
    log.warn(`${toolName} 실패`, {
      code: error.code,
      client: context.client,
      user: context.user,
    });
    return {
      isError: true,
      content: [{ type: 'text', text: `[${error.code}] ${error.message}` }],
    };
  }
  log.error(`${toolName} 예상하지 못한 오류`, {
    client: context.client,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `${toolName} 도구에서 예상하지 못한 오류가 났어요. 서버 로그를 확인해 주세요.`,
      },
    ],
  };
}
