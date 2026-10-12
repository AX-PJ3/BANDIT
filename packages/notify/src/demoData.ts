import type { NotifyData } from './store.ts';
import type { Issue, StandardVersionRecord } from './types.ts';

/**
 * 테스트와 데모가 함께 쓰는 착수 안내 "데모 예시: 알림 제목 길이" 데이터예요.
 * app.notify.title-length가 이슈 #5(민수)와 #7(신지)에 연결되어 있어요.
 */
export const DEMO_STANDARD_ID = 'app.notify.title-length';

export const DEMO_ISSUES: Issue[] = [
  {
    key: '#5',
    title: '담당자에게 알리고 답 기록하기',
    assignee: '민수',
    status: 'in_progress',
    standardIds: [DEMO_STANDARD_ID],
  },
  {
    key: '#7',
    title: '앱 알림과 나에게 온 변경 화면',
    assignee: '신지',
    status: 'in_progress',
    standardIds: [DEMO_STANDARD_ID],
  },
];

/** v1: 예전 위키에서 가져온 버전 */
export const DEMO_V1: StandardVersionRecord = {
  standardId: DEMO_STANDARD_ID,
  version: 1,
  title: '앱 알림 제목은 40자 이하로 쓴다',
  value: '공백 포함 40자 이하',
  reason: '40자를 넘으면 운영체제 알림 창에서 잘린다',
  changedBy: '호윤',
  changedAt: '2026-10-08T18:00:00+09:00',
  source: 'wiki',
  aiDetected: false,
  isRevert: false,
};

/** v2: 부건님의 에이전트가 AI 대화에서 바꾼 버전 */
export const DEMO_V2: StandardVersionRecord = {
  standardId: DEMO_STANDARD_ID,
  version: 2,
  title: '앱 알림 제목은 32자 이하로 쓴다',
  value: '공백 포함 32자 이하',
  reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
  changedBy: '부건',
  changedAt: '2026-10-13T14:13:00+09:00',
  source: 'ai_chat',
  aiDetected: false,
  isRevert: false,
};

/** v1만 있고 아직 아무 알림도 없는 처음 상태 */
export function createDemoData(): NotifyData {
  return {
    issues: structuredClone(DEMO_ISSUES),
    standardVersions: [structuredClone(DEMO_V1)],
    pendingChecks: [],
    answers: [],
  };
}

/** 순서대로 id-1, id-2 …를 만드는 함수 */
export function createIdMaker(prefix = 'id'): () => string {
  let count = 0;
  return () => `${prefix}-${++count}`;
}
