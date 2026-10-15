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

/** 기존 결정 사항이 없는 직접 요청(새 결정 사항)에서 등록하기를 고른 내용 */
export type T1NewAnswer = Pick<
  SaveStandardInput,
  'id' | 'title' | 'value' | 'reason' | 'alwaysOn'
>;

/**
 * T1이 어떻게 시작됐나요.
 * - `agent`: 에이전트가 작업 중에 결정 사항과 다른 점을 알아챘어요
 * - `direct`: 사람이 "결정 사항"이나 "위키"를 바꿔 달라고 직접 요청했어요 (SIL-94)
 */
export type T1Trigger = 'agent' | 'direct';

/**
 * T1에서 등록하기를 골랐을 때 save_standard에 넣을 값이에요 (SIL-66 에이전트 경로).
 * 아니오나 취소하기를 고르면 이 함수를 부르지 않아요 (저장하지 않음).
 */
export function buildT1SaveInput(
  current: CurrentStandard,
  answer: T1Answer,
  trigger: T1Trigger = 'agent',
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
    // 에이전트가 먼저 알아채고 물은 변경이면 AI가 찾았나는 예, 사람이 직접 요청했으면 아니오예요 (D61, SIL-94).
    // 근거 필수·하루 두 번 제한은 PR 경로(출처 code)에만 걸려서 근거 없이 저장돼요
    aiDetected: trigger === 'agent',
  };
}

/**
 * 기존 결정 사항이 없는 직접 요청에서 등록하기를 골랐을 때 save_standard에 넣을 값이에요 (SIL-94).
 * 사람이 요청한 새 결정 사항이라 AI가 찾았나는 아니오예요. 적용 범위는 비워 둬요.
 */
export function buildT1NewSaveInput(answer: T1NewAnswer): SaveStandardInput {
  return {
    ...answer,
    baseVersion: 0,
    source: 'ai_chat',
    aiDetected: false,
  };
}
