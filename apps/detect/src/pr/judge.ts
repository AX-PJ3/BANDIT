import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { PrJudgment, StandardWithLatest, WikiIndex } from '@sil/core';
import { z } from 'zod';
import type { PullRequestInput } from './github.ts';
import {
  renderAreaTask,
  renderJudgeTask,
  renderPrData,
  SYSTEM_PROMPT,
} from './prompt.ts';

/**
 * Claude API로 PR을 판단해요 (SIL-66 PR 경로). 모델과 SDK 사용법은 claude-api 스킬(10/14)을 따랐어요.
 * - 모델은 기본 Claude Opus 5.5이고 저장소 변수 SIL_DETECT_MODEL로 바꿔요. 판단이 저장으로 이어져서 effort는 high로 둬요
 *   10/14 시험 PR 5개: Opus 5.5 5/5 약 $0.27, Sonnet 5.5 5/5 약 $0.13, Haiku 5.5 4/5 약 $0.01 (40→32를 애매로 봄)
 * - 결과는 구조화된 출력(JSON 모양 고정)으로 받아요. 등급은 점수가 아니라 세 가지예요
 * - Claude가 안전 문제로 답을 거절하면 다른 모델로 이어서 답하게 해요 (fallbacks: 'default')
 */
export const DETECT_MODEL = 'claude-opus-5-5';

/** 판단하는 쪽. 테스트에서는 미리 정한 답을 돌려주는 가짜로 바꿔 끼워요 */
export interface Judge {
  /** 1단계: 목차를 보고 관련 영역 고르기 */
  pickAreas(pr: PullRequestInput, index: WikiIndex): Promise<string[]>;
  /** 2단계: 고른 영역의 결정 사항과 PR을 비교하기 */
  judge(
    pr: PullRequestInput,
    standards: StandardWithLatest[],
  ): Promise<PrJudgment>;
}

const areasSchema = z.object({ areas: z.array(z.string()) });

const judgmentSchema = z.object({
  grade: z.enum(['sure', 'unsure', 'unrelated']),
  changes: z.array(
    z.object({
      standardId: z.string(),
      newTitle: z.string(),
      newValue: z.string(),
      changedLines: z.array(z.string()),
      why: z.string(),
      reasonQuote: z.string().nullable(),
    }),
  ),
  question: z.string().nullable(),
}) satisfies z.ZodType<PrJudgment>;

/** Claude 호출 한 번의 토큰 수. 모델을 고를 때 비교하려고 모아요 (try-pr.ts) */
export interface JudgeUsage {
  step: 'areas' | 'judge';
  /** 실제로 답한 모델 (거절로 다른 모델이 답하면 그 모델) */
  model: string;
  inputTokens: number;
  /** 생각(thinking) 토큰도 여기에 들어가요 */
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ClaudeJudgeOptions {
  /** 기본 DETECT_MODEL. 시험에서 다른 모델과 비교할 때만 바꿔요 */
  model?: string;
  onUsage?: (usage: JudgeUsage) => void;
}

export function createClaudeJudge(
  apiKey: string,
  options: ClaudeJudgeOptions = {},
): Judge {
  const client = new Anthropic({ apiKey });
  const model = options.model ?? DETECT_MODEL;
  // Haiku에는 거절 시 다른 모델로 잇는 기능(server-side fallback)이 없어요 (claude-api 스킬)
  const fallback = model.startsWith('claude-haiku')
    ? {}
    : {
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default' as const,
      };

  /** fellBack: Opus가 거절해서 다른 모델이 대신 답했는지 */
  async function ask<T>(
    step: JudgeUsage['step'],
    pr: PullRequestInput,
    task: string,
    schema: z.ZodType<T>,
  ): Promise<{ output: T; fellBack: boolean }> {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...fallback,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: betaZodOutputFormat(schema) },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            // PR 자료는 두 단계와 두 번 묻기에서 똑같아서 캐시로 다시 써요
            {
              type: 'text',
              text: renderPrData(pr),
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: task },
          ],
        },
      ],
    });
    options.onUsage?.({
      step,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('Claude가 이 PR 판단을 거절했어요.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Claude 답이 길어서 중간에 끊겼어요.');
    }
    if (!response.parsed_output) {
      throw new Error('Claude 답을 정해진 모양으로 읽지 못했어요.');
    }
    return {
      output: response.parsed_output,
      fellBack: response.content.some((block) => block.type === 'fallback'),
    };
  }

  return {
    async pickAreas(pr, index) {
      const { output } = await ask(
        'areas',
        pr,
        renderAreaTask(index),
        areasSchema,
      );
      return output.areas;
    },
    async judge(pr, standards) {
      const { output, fellBack } = await ask(
        'judge',
        pr,
        renderJudgeTask(standards),
        judgmentSchema,
      );
      // 안전 문제로 거절된 PR은 그 자체가 경고예요. 다른 모델의 "확실"로 저장하지 않고 사람에게 물어요
      if (fellBack && output.grade === 'sure') {
        return {
          ...output,
          grade: 'unsure',
          question:
            output.question ??
            '이 PR에서 결정 사항이 바뀐 게 맞는지 확인해 주세요.',
        };
      }
      return output;
    },
  };
}
