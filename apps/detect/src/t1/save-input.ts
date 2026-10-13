import type {
  SaveStandardInput,
  Standard,
  StandardHistory,
  StandardVersion,
} from '@sil/core';

/**
 * get_standard 결과 중 T1 저장에 쓰는 칸. 모양은 core 타입에서 골라 써요 (타입은 core에만).
 * scope는 get_standard의 versions[0].scope예요.
 */
export type CurrentStandard = Pick<Standard, 'id' | 'alwaysOn'> &
  Pick<StandardVersion, 'scope'> &
  Pick<StandardHistory, 'currentVersion'>;

/** ③ 등록될 모습에서 사람이 등록하기를 고른 내용 */
export type T1Answer = Pick<SaveStandardInput, 'title' | 'value' | 'reason'>;

/**
 * T1에서 등록하기를 골랐을 때 save_standard에 넣을 값이에요 (SIL-66 에이전트 경로).
 * 아니오나 취소하기를 고르면 이 함수를 부르지 않아요 (저장하지 않음).
 */
export function buildT1SaveInput(
  current: CurrentStandard,
  answer: T1Answer,
): SaveStandardInput {
  return {
    id: current.id,
    title: answer.title,
    value: answer.value,
    reason: answer.reason,
    // 고칠 때는 지금 alwaysOn 값을 그대로 넣어요 (save_standard 설명)
    alwaysOn: current.alwaysOn,
    // 비우고 저장하면 새 버전에서 적용 범위가 지워져서 지금 값을 넘겨요.
    // 없으면(null) 칸을 빼요. save_standard 도구는 null을 받지 않아요
    ...(current.scope ? { scope: current.scope } : {}),
    baseVersion: current.currentVersion,
    source: 'ai_chat',
    // 임시: "AI가 찾았나"를 T1에서 어떻게 둘지 아직 정하지 않아서 아니오로 둬요 (SIL-66)
    aiDetected: false,
  };
}
