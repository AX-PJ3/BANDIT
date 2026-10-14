/**
 * 쿠폰 예시 데이터예요. 10/13 통합 확인(SIL-20)에서 처음부터 끝까지 돌려 볼 바로 그 시나리오예요.
 *
 * 왜 core에 두나요:
 * - DB가 보류인 동안에도 앱 화면, MCP 도구, 테스트가 "같은 예시"로 개발할 수 있게요.
 * - 각자 가짜 데이터를 따로 만들면 합치는 날 모양이 서로 달라요.
 *
 * 값은 [spec] 기준 모으기 "기준 하나의 모양"과 [Spec] 담당자에게 알리기 "터미널 알림"에서 가져왔어요.
 * 사람은 실제 팀원 대신 역할 이름으로 적었어요.
 */
import type {
  Answer,
  Issue,
  PendingCheck,
  Standard,
  StandardVersion,
} from '../types/index.ts';

export const couponStandard: Standard = {
  id: 'order.coupon.nullable',
  area: '주문',
  title: '쿠폰 값은 비어 있을 수 있다',
  alwaysOn: false,
  status: 'active',
  replacedBy: null,
  deprecatedReason: null,
  locked: false,
};

const couponScope = {
  code: ['src/order/**', 'src/api/order.ts'],
  api: ['GET /orders/:id'],
  screen: ['주문 내역', '주문 상세'],
  doc: [],
};

export const couponVersions: StandardVersion[] = [
  {
    standardId: 'order.coupon.nullable',
    version: 1,
    title: '쿠폰 값은 항상 있다',
    value: '주문 응답의 coupon 칸은 항상 값이 있다',
    reason: '기획서 첫 버전의 주문 응답 정의',
    alwaysOn: false,
    evidence: '기획서 v1 (주문 API)',
    scope: couponScope,
    changedBy: 'example-po',
    changedByActor: 'human',
    aiDetected: false,
    isRevert: false,
    revertedToVersion: null,
    source: 'meeting',
    createdAt: '2026-10-12T01:00:00.000Z',
  },
  {
    standardId: 'order.coupon.nullable',
    version: 2,
    title: '쿠폰 값은 비어 있을 수 있다',
    value: '주문 응답의 coupon 칸은 null일 수 있다',
    reason: '쿠폰을 쓰지 않는 주문이 있음',
    alwaysOn: false,
    evidence: 'PR #12 (주문 API)',
    scope: couponScope,
    changedBy: 'example-backend-dev',
    changedByActor: 'ai',
    aiDetected: true,
    isRevert: false,
    revertedToVersion: null,
    source: 'code',
    createdAt: '2026-10-13T05:13:00.000Z',
  },
];

export const couponIssue: Issue = {
  key: '#24',
  title: '주문 화면 만들기',
  assignee: 'example-frontend-dev',
  status: 'in_progress',
  standardIds: ['order.coupon.nullable'],
};

export const couponPendingCheck: PendingCheck = {
  id: 'example-pending-1',
  standardId: 'order.coupon.nullable',
  version: 2,
  issueKey: '#24',
  recipient: 'example-frontend-dev',
  status: 'pending',
  lastSeenVersion: 1,
  createdAt: '2026-10-13T05:13:05.000Z',
  closedAt: null,
  reflected: false,
  reflectedAt: null,
};

export const couponAnswer: Answer = {
  id: 'example-answer-1',
  pendingCheckId: 'example-pending-1',
  affected: true,
  known: false,
  unaffectedReason: null,
  reworkNote: '주문 화면의 쿠폰 칸 처리 다시 하기',
  channel: 'terminal',
  elapsedSeconds: 42,
  answeredBy: 'example-frontend-dev',
  answeredAt: '2026-10-13T06:00:00.000Z',
};
