import { checkStandardWording } from '@sil/core';
import { saveStandard as save } from '@sil/core/node';
import { z } from 'zod';
import { defineTool } from '../../lib/define-tool.ts';
import {
  baseVersionSchema,
  requiredText,
  sourceSchema,
  standardIdSchema,
} from './shared.ts';

/**
 * 새 기준 저장, 새 버전 저장 (SIL-19, SIL-65).
 * 필수 칸은 ID, 제목, 값, 이유, 항상 적용 5개예요. 근거와 적용 범위는 있으면 저장만 해요.
 * AI가 찾았나(aiDetected)는 에이전트 경로 T1이 true로 넣어요 (SIL-66, D61). 비우면 아니오예요.
 * 형식 검사는 두 번 해요: 여기 입력 모양(zod)에서 한 번, 데이터베이스 함수에서 한 번.
 * 그래서 앱이나 GitHub Actions처럼 이 도구를 거치지 않는 저장도 같은 규칙을 지켜요.
 *
 * 결과에는 두 가지를 더해요.
 * - changelogLine: team-wiki/CHANGELOG.md에 붙일 한 줄 (항상 적용 기준 work.wiki.changelog)
 * - warnings: check_wiki.py와 같은 문장 경고 (wiki.standard.one-rule 등). 저장은 막지 않아요
 */
/** 저장 뒤 CHANGELOG를 어떻게 하는지 AI에게 알려 줘요 */
export const CHANGELOG_HINT =
  '작업 중인 저장소에 team-wiki/CHANGELOG.md가 있으면 changelogLine을 그 파일 맨 아래에 그대로 붙여요. 없으면 따로 쓰지 않아요 (DB에 기록이 남아요).';

export const saveStandard = defineTool({
  name: 'save_standard',
  title: '결정 사항 저장',
  description:
    '팀 결정 사항을 새로 만들거나 새 버전을 저장해요. 이전 버전은 지우지 않고 쌓여요. ' +
    'ID, 제목, 값, 이유, 항상 적용(alwaysOn) 중 하나라도 없으면 저장하지 않고 빠진 칸을 알려 줘요. 모르는 칸은 지어내지 말고 사람에게 물어봐요. ' +
    '고칠 때는 get_standard로 본 currentVersion을 baseVersion으로, 지금 alwaysOn 값을 그대로 넣고, 새 결정 사항이면 search_standards로 같은 결정 사항이 없는지 먼저 찾은 뒤 baseVersion 0으로 저장해요.',
  inputSchema: z.object({
    id: standardIdSchema,
    title: requiredText('제목(title)').describe(
      '한 문장 제목. 예: 앱 알림 제목은 32자 이하로 쓴다',
    ),
    value: requiredText('값(value)').describe(
      '결정 사항 내용 한 문장. 예: 공백 포함 32자 이하',
    ),
    reason: requiredText('이유(reason)').describe(
      '왜 이렇게 정했는지. 예: Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
    ),
    alwaysOn: z
      .boolean({
        error:
          '항상 적용(alwaysOn)이 비어 있어요. 고치는 거면 get_standard의 alwaysOn 값을 그대로 넣어요',
      })
      .describe(
        '모든 작업에 항상 적용할지 (위키 전체에서 최대 10개). 고칠 때는 지금 값을 그대로 넣어요',
      ),
    baseVersion: baseVersionSchema,
    evidence: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('근거가 된 PR, 회의, 대화. 예: PR #12. 모르면 비워요'),
    scope: z
      .object({
        code: z
          .array(z.string().trim().min(1))
          .default([])
          .describe('코드 경로 glob. 예: src/order/**'),
        api: z
          .array(z.string().trim().min(1))
          .default([])
          .describe('API. 예: GET /orders/:id'),
        screen: z
          .array(z.string().trim().min(1))
          .default([])
          .describe('화면 이름. 예: 앱 알림'),
        doc: z
          .array(z.string().trim().min(1))
          .default([])
          .describe('문서. 예: INDEX.md'),
      })
      .optional()
      .describe('어디에 적용되는지. 모르면 비워요'),
    area: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        '영역 이름. 비우면 새 결정 사항은 ID 앞부분(예: app)으로 정해요',
      ),
    source: sourceSchema,
    aiDetected: z
      .boolean()
      .optional()
      .describe(
        'AI가 먼저 알아챈 변경이면 true. 작업 중에 결정 사항과 다르게 만들게 돼서 먼저 물었으면(T1) true, 사람이 직접 바꿔 달라고 했으면 비워요',
      ),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
  },
  handler: async (input, context) => {
    const result = await save({
      ...input,
      changedByActor: 'ai',
      changedBy: context.user ?? context.client,
    });
    const warnings = checkStandardWording(input);
    return {
      ...result,
      message: result.isRevert
        ? `저장했어요. 값이 v${result.revertedToVersion}과 같아져서 되돌림(v${result.version})으로 남겼어요.`
        : `저장했어요 (v${result.version}).`,
      changelog: CHANGELOG_HINT,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
});
