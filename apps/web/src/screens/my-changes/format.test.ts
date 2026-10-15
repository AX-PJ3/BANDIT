import { describe, expect, it } from 'vitest';
import { MOCK_ME, mockApi } from '../../api/mock.ts';
import {
  findReplacingVersion,
  isFoundInPr,
  isNewStandard,
  MAX_NOTIFICATION_TITLE_LENGTH,
  needsRework,
  sourceChipLabel,
  supersededText,
  toNotification,
  truncate,
} from './format.ts';

// 예시 데이터도 진짜 데이터와 같은 목록 만들기(buildPendingList)를 거쳐요
const changes = await mockApi.listMyChanges(MOCK_ME);
const byId = (id: string) => {
  const change = changes.find((item) => item.pendingCheckId === id);
  if (!change) throw new Error(`${id} 없음`);
  return change;
};

describe('예시 목록', () => {
  it('최신 것이 먼저 와요', () => {
    expect(changes[0]!.pendingCheckId).toBe('inbox-title-length-v2');
  });

  it('이전 값은 마지막으로 본 버전의 값이에요', () => {
    const revert = byId('inbox-hide-auto-closed-v3').standard;
    expect(revert.previousVersion).toBe(2);
    expect(revert.isRevert).toBe(true);
  });

  it('지난번에 관계있다고 답한 되돌림 카드에만 다시 고치라고 알려요 (SIL-77)', () => {
    expect(needsRework(byId('inbox-hide-auto-closed-v3'))).toBe(true);
    expect(needsRework(byId('inbox-title-length-v2'))).toBe(false);
  });
});

describe('카드 표시', () => {
  it('PR에서 찾음은 AI가 찾았고 출처가 코드일 때만 (D61)', () => {
    expect(isFoundInPr(byId('inbox-coupon-v2'))).toBe(true);
    // T1(AI 대화)은 AI가 먼저 알아챘어도 "AI 대화" 칩만
    expect(isFoundInPr(byId('inbox-title-length-v2'))).toBe(false);
    expect(sourceChipLabel(byId('inbox-title-length-v2'))).toBe(
      'AI 대화에서 바꿈',
    );
  });

  it('출처가 위키면 "위키"예요 (app.card.source-chip-only)', () => {
    const wiki = byId('inbox-title-length-v2');
    expect(
      sourceChipLabel({
        ...wiki,
        standard: { ...wiki.standard, source: 'wiki' },
      }),
    ).toBe('위키에서 바꿈');
  });

  it('이전 값이 없으면 새 결정 사항', () => {
    expect(isNewStandard(byId('inbox-closed-7-days-v1'))).toBe(true);
    expect(isNewStandard(byId('inbox-coupon-v2'))).toBe(false);
  });

  it('대체됨은 같은 결정 사항·같은 이슈의 더 높은 버전을 찾아요', () => {
    const superseded = byId('inbox-reason-length-v2');
    expect(findReplacingVersion(superseded, changes)).toBe(3);
    expect(findReplacingVersion(superseded, [superseded])).toBeNull();
    expect(supersededText(3)).toBe('새 버전 v3으로 대체됐어요');
    expect(supersededText(null)).toBe('새 버전으로 대체됐어요');
  });
});

describe('OS 알림 (A1)', () => {
  it('제목은 40자 이하예요 (app.notify.title-length)', () => {
    const long = byId('inbox-title-length-v2');
    const notification = toNotification({
      ...long,
      standard: { ...long.standard, title: '가'.repeat(60) },
    });
    expect([...notification.title].length).toBe(MAX_NOTIFICATION_TITLE_LENGTH);
    expect(notification.title.endsWith('…')).toBe(true);
  });

  it('본문은 이전 값 → 지금 값, 새 결정 사항이면 그렇게 적어요', () => {
    expect(toNotification(byId('inbox-title-length-v2'))).toEqual({
      checkId: 'inbox-title-length-v2',
      title: '앱 알림 제목은 32자 이하로 쓴다',
      body: '공백 포함 40자 이하 → 공백 포함 32자 이하',
    });
    expect(toNotification(byId('inbox-closed-7-days-v1')).body).toMatch(
      /^새 결정 사항 → /,
    );
  });

  it('짧은 글은 그대로 둬요', () => {
    expect(truncate('짧은 제목', 40)).toBe('짧은 제목');
  });
});
