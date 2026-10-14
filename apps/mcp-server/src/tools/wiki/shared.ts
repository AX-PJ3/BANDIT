/**
 * 위키 도구들이 함께 쓰는 입력 모양과 결과 줄이기예요.
 * AI에게는 필요한 만큼만 돌려줘요 (위키 관리 원칙 2: 필요할 때 꺼내 읽기).
 */
import { STANDARD_ID_PATTERN, type StandardWithLatest } from '@sil/core';
import { z } from 'zod';

/**
 * 칸을 아예 빼고 부르면 zod 기본 문구("expected string, received undefined") 대신 이 문구를 보여 줘요.
 * 모양이 틀린 값(예: 글자 자리에 숫자)은 기본 문구 그대로예요.
 */
export const whenMissing = (message: string) => ({
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? message : undefined,
});

/** 기준 ID 형식은 팀 위키 data.standard.id-format, check_wiki.py와 같아요 (@sil/core rules.ts) */
export const standardIdSchema = z
  .string(
    whenMissing(
      "결정 사항 ID(id)가 비어 있어요. '영역.주제.규칙' 모양으로 넣어요. 고치는 거면 get_standard의 id를 그대로 넣어요",
    ),
  )
  .trim()
  .regex(
    STANDARD_ID_PATTERN,
    '결정 사항 ID는 영역.주제.규칙 세 부분이고 영어 소문자, 숫자, 하이픈만 써요',
  )
  .describe("결정 사항 ID. '영역.주제.규칙' 모양. 예: order.coupon.nullable");

export const baseVersionSchema = z
  .number(
    whenMissing(
      '결정 사항 버전(baseVersion)이 비어 있어요. 고치는 거면 get_standard의 currentVersion을, 새 결정 사항이면 0을 넣어요',
    ),
  )
  .int()
  .min(0)
  .describe(
    '내가 보고 고친 버전 (get_standard의 currentVersion). 새 결정 사항이면 0. 그사이 바뀌었으면 거절돼요',
  );

/** 칸을 빼거나 빈 칸을 넣으면 "지어내지 말고 물어보라"고 알려 줘요 */
export const requiredText = (what: string) => {
  const message = `${what}이(가) 비어 있어요. 지어내지 말고 사람에게 물어본 뒤 다시 저장해 주세요`;
  return z.string(whenMissing(message)).trim().min(1, message);
};

export const sourceSchema = z
  .enum(['code', 'ai_chat', 'figma', 'meeting', 'slack'])
  .default('ai_chat')
  .describe(
    '어디서 정해졌는지: code(코드), ai_chat(AI 대화), figma, meeting(회의), slack',
  );

/** 목록에 보여 줄 짧은 모양. 이유·근거·버전 기록은 get_standard로 꺼내요 */
export function toSummary({ standard, latest }: StandardWithLatest) {
  return {
    id: standard.id,
    area: standard.area,
    title: latest.title,
    value: latest.value,
    version: latest.version,
    alwaysOn: standard.alwaysOn,
    locked: standard.locked,
    ...(standard.status === 'deprecated'
      ? { status: standard.status, replacedBy: standard.replacedBy }
      : {}),
  };
}
