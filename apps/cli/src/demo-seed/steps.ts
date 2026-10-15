/**
 * 시연용 샘플 데이터(시드)의 순서와 문장이에요 (SIL-101 9절).
 *
 * 결정 사항의 값을 바꾸는 5단계예요. 시연 DB에서만 돌리고, 팀 DB에는 돌리지 않아요.
 * `app.notify.title-length`는 시연 장면 S2에서 라이브로 바꾸니 여기서는 건드리지 않아요.
 * 바꾸는 문장은 시연 화면에서 읽혔을 때 자연스러운 것으로 정했어요 (호윤님 확인 뒤 고쳐요).
 */
import type { StandardSource } from '@sil/core';

export type SeedStep =
  | {
      kind: 'save';
      label: string;
      by: string;
      id: string;
      /** 이 버전에서 저장해요. 지금 DB의 최신 버전과 다르면 시작 전에 멈춰요 */
      baseVersion: number;
      value: string;
      reason: string;
      source: StandardSource;
      /** PR에서 찾음 카드: 출처 code + AI가 찾았나 */
      aiDetected?: boolean;
      evidence?: string;
    }
  | {
      kind: 'revert';
      label: string;
      by: string;
      id: string;
      baseVersion: number;
      toVersion: number;
      reason: string;
      source: StandardSource;
    }
  | {
      kind: 'answer';
      label: string;
      by: string;
      id: string;
      /** 이 버전의 내 카드에 답해요 */
      version: number;
      affected: boolean;
      known: boolean;
    };

export const SEED_STEPS: SeedStep[] = [
  {
    kind: 'save',
    label: '1. 경하가 PR에서 찾은 변경 (민수 #5에게 PR에서 찾음 카드)',
    by: '경하',
    id: 'notify.answer.two-questions',
    baseVersion: 1,
    value:
      '첫 질문은 이 변경이 내 작업에 영향을 주는지(관계있다/관계없다)이고, 관계있다면 미리 알았는지(알았다/몰랐다)를 묻는다. 두 질문은 한 화면에서 이어서 묻는다',
    reason:
      '질문이 따로 나오면 답하는 사람이 중간에 멈춰서 답이 비는 일이 있었다',
    source: 'code',
    aiDetected: true,
    evidence: '코드: 답하기 화면이 두 질문을 한 번에 보여 주도록 바뀜',
  },
  {
    kind: 'save',
    label: '2. 경하가 앱 화면 범위를 줄임 (신지 #7에게 카드)',
    by: '경하',
    id: 'app.screen.inbox-first',
    baseVersion: 1,
    value:
      '이번 범위에서 꼭 만들 앱 화면은 나에게 온 변경과 답하기이며, 위키 화면과 지표 화면은 만들지 않는다',
    reason: '발표 전까지 만들 수 있는 화면이 한 개라서 범위를 줄인다',
    source: 'meeting',
  },
  {
    kind: 'save',
    label: '3. 정민이 신지의 답 전에 다시 바꿈 (v2는 대체됨, v3 대기)',
    by: '정민',
    id: 'app.screen.inbox-first',
    baseVersion: 2,
    value:
      '이번 범위에서 꼭 만들 앱 화면은 나에게 온 변경과 답하기이며, 위키 화면과 지표 화면은 발표 뒤에 만든다',
    reason: '완전히 빼지 않고 발표 뒤 일정으로 미룬다',
    source: 'meeting',
  },
  {
    kind: 'answer',
    label: '4. 신지가 v3에 답함 (관계있다, 알았다, 앱)',
    by: '신지',
    id: 'app.screen.inbox-first',
    version: 3,
    affected: true,
    known: true,
  },
  {
    kind: 'revert',
    label:
      '5. 정민이 처음 값으로 되돌림 (신지에게 되돌림 카드 + 지난번 답 안내)',
    by: '정민',
    id: 'app.screen.inbox-first',
    baseVersion: 3,
    toVersion: 1,
    reason: '미루기로 한 것을 취소하고 처음 범위로 돌아간다',
    source: 'meeting',
  },
];

/** 시드가 끝난 뒤 사람별로 보여야 하는 건수 (확인할 변경 / 확인한 변경) */
export const SEED_EXPECTED: Record<string, { open: number; closed: number }> = {
  민수: { open: 1, closed: 0 },
  신지: { open: 1, closed: 2 },
  정민: { open: 0, closed: 0 },
  경하: { open: 0, closed: 0 },
  부건: { open: 0, closed: 0 },
};
