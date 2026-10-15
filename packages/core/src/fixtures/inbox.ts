/**
 * "나에게 온 변경" 화면(SIL-74) 예시 데이터예요. 민수님 한 사람에게 온 확인할 변경이에요.
 *
 * 웹 앱이 Supabase 없이 열릴 때(mock) 이 데이터로 화면의 상태를 모두 보여 줘요.
 * - 사람이 바꾼 결정 사항: 착수 안내 데모 예시 app.notify.title-length 40자 → 32자 (#5, 대기)
 * - PR에서 찾은 결정 사항: 쿠폰 예시(couponVersions) v2, 출처 코드 (#8, 대기)
 * - 새로 생긴 결정 사항: 버전 1이라 이전 값이 없어요 (#5, 대기)
 * - 대체됨: v2에 답하기 전에 v3이 저장됐어요 (#5, v2 대체됨 · v3 대기)
 * - 되돌림: v2에 "관계있다"로 답한 뒤 v1 값으로 되돌렸어요 (#8, v2 답함 · v3 대기)
 * - 답함: 관계있다 + 몰랐다 (#5), 관계없다 + 이유 (#8)
 *
 * 값은 notify 데모 데이터(packages/notify/src/demoData.ts)와 베타 시험표(samples/베타-시험표.md)의 이름을 따랐어요.
 */
import type {
  Answer,
  Issue,
  PendingCheck,
  StandardSource,
  StandardVersion,
} from '../types/index.ts';
import { couponVersions } from './coupon.ts';

/** 이 예시를 받는 사람 */
export const INBOX_RECIPIENT = '민수';

export const inboxIssues: Issue[] = [
  {
    key: '#5',
    title: '담당자에게 알리고 답 기록하기',
    assignee: INBOX_RECIPIENT,
    status: 'in_progress',
    standardIds: [
      'app.notify.title-length',
      'notify.list.closed-7-days',
      'notify.answer.reason-length',
      'notify.terminal.one-change',
    ],
  },
  {
    key: '#8',
    title: '주문 화면의 쿠폰 칸 처리',
    assignee: INBOX_RECIPIENT,
    status: 'done',
    standardIds: [
      'order.coupon.nullable',
      'notify.pending.hide-auto-closed',
      'app.screen.inbox-first',
    ],
  },
];

function version(
  fields: Pick<
    StandardVersion,
    'standardId' | 'version' | 'title' | 'value' | 'reason' | 'createdAt'
  > & {
    changedBy: string;
    source: StandardSource;
    aiDetected?: boolean;
    revertedToVersion?: number;
  },
): StandardVersion {
  return {
    alwaysOn: false,
    evidence: null,
    scope: null,
    changedByActor: fields.aiDetected ? 'ai' : 'human',
    aiDetected: false,
    isRevert: fields.revertedToVersion !== undefined,
    revertedToVersion: null,
    ...fields,
  };
}

export const inboxVersions: StandardVersion[] = [
  // 사람이 바꾼 결정 사항 (착수 안내 데모 예시)
  version({
    standardId: 'app.notify.title-length',
    version: 1,
    title: '앱 알림 제목은 40자 이하로 쓴다',
    value: '공백 포함 40자 이하',
    reason: '40자를 넘으면 운영체제 알림 창에서 잘린다',
    changedBy: '호윤',
    source: 'wiki',
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  version({
    standardId: 'app.notify.title-length',
    version: 2,
    title: '앱 알림 제목은 32자 이하로 쓴다',
    value: '공백 포함 32자 이하',
    reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
    changedBy: '부건',
    source: 'ai_chat',
    aiDetected: true,
    createdAt: '2026-10-15T05:13:00.000Z',
  }),
  // PR에서 찾은 결정 사항
  ...couponVersions,
  // 새로 생긴 결정 사항
  version({
    standardId: 'notify.list.closed-7-days',
    version: 1,
    title: '답한 변경은 7일 동안만 목록에 보인다',
    value: '답함과 대체됨은 닫힌 지 7일이 지나면 목록에서 뺀다',
    reason: '목록이 길어지면 아직 답할 변경을 찾기 어렵다',
    changedBy: '호윤',
    source: 'meeting',
    createdAt: '2026-10-14T02:00:00.000Z',
  }),
  // 대체됨
  version({
    standardId: 'notify.answer.reason-length',
    version: 1,
    title: '관계없는 이유는 50자 이하다',
    value: '관계없는 이유는 공백 포함 50자 이하로 받는다',
    reason: '한 줄로 읽히게 하려고',
    changedBy: '호윤',
    source: 'wiki',
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  version({
    standardId: 'notify.answer.reason-length',
    version: 2,
    title: '관계없는 이유는 80자 이하다',
    value: '관계없는 이유는 공백 포함 80자 이하로 받는다',
    reason: '50자로는 이슈 번호와 이유를 같이 쓰기 어렵다',
    changedBy: '신지',
    source: 'figma',
    createdAt: '2026-10-13T01:00:00.000Z',
  }),
  version({
    standardId: 'notify.answer.reason-length',
    version: 3,
    title: '관계없는 이유는 100자 이하다',
    value: '관계없는 이유는 공백 포함 100자 이하로 받는다',
    reason: 'DB 칸 길이(100자)와 맞춘다',
    changedBy: '정민',
    source: 'slack',
    createdAt: '2026-10-14T06:30:00.000Z',
  }),
  // 답함 (관계있다 + 몰랐다)
  version({
    standardId: 'notify.terminal.one-change',
    version: 1,
    title: '터미널 알림은 여러 변경을 한 번에 보여 준다',
    value: '터미널 알림은 대기 중인 변경을 표 하나로 모아 보여 준다',
    reason: '한눈에 보이게 하려고',
    changedBy: '호윤',
    source: 'wiki',
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  version({
    standardId: 'notify.terminal.one-change',
    version: 2,
    title: '터미널 알림은 변경을 하나씩 보여 준다',
    value: '터미널 알림은 대기 중인 변경을 하나씩 차례로 보여 준다',
    reason: '여러 개를 한 번에 보여 주면 답을 건너뛴다',
    changedBy: '부건',
    source: 'meeting',
    createdAt: '2026-10-13T04:00:00.000Z',
  }),
  // 되돌림: v2에 관계있다로 답한 뒤 v1 값으로 되돌림
  version({
    standardId: 'notify.pending.hide-auto-closed',
    version: 1,
    title: '자동 닫힘은 화면에 보이지 않는다',
    value: '자동으로 닫힌 확인할 변경은 목록에 보여 주지 않는다',
    reason: '답할 필요가 없는 변경이다',
    changedBy: '호윤',
    source: 'wiki',
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  version({
    standardId: 'notify.pending.hide-auto-closed',
    version: 2,
    title: '자동 닫힘도 확인한 변경에 보인다',
    value: '자동으로 닫힌 확인할 변경도 확인한 변경 칸에 회색으로 보여 준다',
    reason: '왜 사라졌는지 묻는 사람이 있었다',
    changedBy: '정민',
    source: 'slack',
    createdAt: '2026-10-12T03:00:00.000Z',
  }),
  version({
    standardId: 'notify.pending.hide-auto-closed',
    version: 3,
    title: '자동 닫힘은 화면에 보이지 않는다',
    value: '자동으로 닫힌 확인할 변경은 목록에 보여 주지 않는다',
    reason: '보여 주니 답해야 하는 줄 알고 헷갈려해서 되돌린다',
    changedBy: '정민',
    source: 'ai_chat',
    revertedToVersion: 1,
    createdAt: '2026-10-15T01:40:00.000Z',
  }),
  // 답함 (관계없다 + 이유)
  version({
    standardId: 'app.screen.inbox-first',
    version: 1,
    title: '앱에서 꼭 만들 화면은 세 개다',
    value: '이번 범위에서 꼭 만들 앱 화면은 나에게 온 변경, 위키, 지표다',
    reason: '착수 안내 첫 버전',
    changedBy: '호윤',
    source: 'wiki',
    createdAt: '2026-10-08T09:00:00.000Z',
  }),
  version({
    standardId: 'app.screen.inbox-first',
    version: 2,
    title: '앱에서 꼭 만들 화면은 "나에게 온 변경" 하나다',
    value: '이번 범위에서 꼭 만들 앱 화면은 나에게 온 변경과 답하기다',
    reason: '발표까지 시간이 모자라 위키와 지표 화면은 뺀다',
    changedBy: '호윤',
    source: 'meeting',
    createdAt: '2026-10-12T08:00:00.000Z',
  }),
];

function check(
  fields: Pick<
    PendingCheck,
    | 'id'
    | 'standardId'
    | 'version'
    | 'issueKey'
    | 'status'
    | 'lastSeenVersion'
    | 'createdAt'
  > &
    Partial<Pick<PendingCheck, 'closedAt' | 'reflected' | 'reflectedAt'>>,
): PendingCheck {
  return {
    recipient: INBOX_RECIPIENT,
    closedAt: null,
    reflected: false,
    reflectedAt: null,
    ...fields,
  };
}

export const inboxPendingChecks: PendingCheck[] = [
  check({
    id: 'inbox-title-length-v2',
    standardId: 'app.notify.title-length',
    version: 2,
    issueKey: '#5',
    status: 'pending',
    lastSeenVersion: 1,
    createdAt: '2026-10-15T05:13:02.000Z',
  }),
  check({
    id: 'inbox-coupon-v2',
    standardId: 'order.coupon.nullable',
    version: 2,
    issueKey: '#8',
    status: 'pending',
    lastSeenVersion: 1,
    createdAt: '2026-10-13T05:13:05.000Z',
  }),
  check({
    id: 'inbox-closed-7-days-v1',
    standardId: 'notify.list.closed-7-days',
    version: 1,
    issueKey: '#5',
    status: 'pending',
    lastSeenVersion: null,
    createdAt: '2026-10-14T02:00:02.000Z',
  }),
  check({
    id: 'inbox-reason-length-v2',
    standardId: 'notify.answer.reason-length',
    version: 2,
    issueKey: '#5',
    status: 'superseded',
    lastSeenVersion: 1,
    createdAt: '2026-10-13T01:00:02.000Z',
    closedAt: '2026-10-14T06:30:02.000Z',
  }),
  check({
    id: 'inbox-reason-length-v3',
    standardId: 'notify.answer.reason-length',
    version: 3,
    issueKey: '#5',
    status: 'pending',
    lastSeenVersion: 1,
    createdAt: '2026-10-14T06:30:02.000Z',
  }),
  check({
    id: 'inbox-one-change-v2',
    standardId: 'notify.terminal.one-change',
    version: 2,
    issueKey: '#5',
    status: 'answered',
    lastSeenVersion: 1,
    createdAt: '2026-10-13T04:00:02.000Z',
    closedAt: '2026-10-13T07:20:00.000Z',
  }),
  check({
    id: 'inbox-hide-auto-closed-v2',
    standardId: 'notify.pending.hide-auto-closed',
    version: 2,
    issueKey: '#8',
    status: 'answered',
    lastSeenVersion: 1,
    createdAt: '2026-10-12T03:00:02.000Z',
    closedAt: '2026-10-12T05:00:00.000Z',
    reflected: true,
    reflectedAt: '2026-10-12T09:00:00.000Z',
  }),
  check({
    id: 'inbox-hide-auto-closed-v3',
    standardId: 'notify.pending.hide-auto-closed',
    version: 3,
    issueKey: '#8',
    status: 'pending',
    lastSeenVersion: 2,
    createdAt: '2026-10-15T01:40:02.000Z',
  }),
  check({
    id: 'inbox-inbox-first-v2',
    standardId: 'app.screen.inbox-first',
    version: 2,
    issueKey: '#8',
    status: 'answered',
    lastSeenVersion: 1,
    createdAt: '2026-10-12T08:00:02.000Z',
    closedAt: '2026-10-12T10:30:00.000Z',
  }),
];

export const inboxAnswers: Answer[] = [
  {
    id: 'inbox-answer-one-change-v2',
    pendingCheckId: 'inbox-one-change-v2',
    affected: true,
    known: false,
    unaffectedReason: null,
    reworkNote: null,
    channel: 'terminal',
    elapsedSeconds: 35,
    answeredBy: INBOX_RECIPIENT,
    answeredAt: '2026-10-13T07:20:00.000Z',
  },
  {
    id: 'inbox-answer-hide-auto-closed-v2',
    pendingCheckId: 'inbox-hide-auto-closed-v2',
    affected: true,
    known: true,
    unaffectedReason: null,
    reworkNote: null,
    channel: 'app',
    elapsedSeconds: 20,
    answeredBy: INBOX_RECIPIENT,
    answeredAt: '2026-10-12T05:00:00.000Z',
  },
  {
    id: 'inbox-answer-inbox-first-v2',
    pendingCheckId: 'inbox-inbox-first-v2',
    affected: false,
    known: null,
    unaffectedReason: '내 작업 범위가 아니에요',
    reworkNote: null,
    channel: 'app',
    elapsedSeconds: 12,
    answeredBy: INBOX_RECIPIENT,
    answeredAt: '2026-10-12T10:30:00.000Z',
  },
];
