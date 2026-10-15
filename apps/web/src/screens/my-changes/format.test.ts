import { describe, expect, it } from 'vitest';
import { MOCK_ME, mockApi } from '../../api/mock.ts';
import {
  changeLetter,
  findReplacingVersion,
  groupByChange,
  groupByIssue,
  isFoundInPr,
  isNewStandard,
  MAX_NOTIFICATION_TITLE_LENGTH,
  needsRework,
  sameStandardVersions,
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
  it('PR에서 찾은 변경은 AI가 찾았고 출처가 코드일 때만 (D61)', () => {
    expect(isFoundInPr(byId('inbox-coupon-v2'))).toBe(true);
    expect(sourceChipLabel(byId('inbox-coupon-v2'))).toBe('PR에서 찾은 변경');
    // T1(AI 대화)은 AI가 먼저 알아챘어도 "AI 대화" 칩만
    expect(isFoundInPr(byId('inbox-title-length-v2'))).toBe(false);
    expect(sourceChipLabel(byId('inbox-title-length-v2'))).toBe('AI 대화');
  });

  it('출처가 위키면 "위키"예요 (app.card.source-chip-only)', () => {
    const wiki = byId('inbox-title-length-v2');
    expect(
      sourceChipLabel({
        ...wiki,
        standard: { ...wiki.standard, source: 'wiki' },
      }),
    ).toBe('위키');
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
    expect(supersededText(null)).toBe(
      '새 버전으로 대체됐다가, 내가 이미 확인한 값으로 돌아왔어요. 답하지 않아도 돼요',
    );
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

describe('이슈 별로 묶기', () => {
  it('이슈 안은 최신 변경 순이에요 (다른 결정 사항끼리 버전 번호로 섞지 않아요)', () => {
    const issue5 = groupByIssue(changes).find(
      (group) => group[0]!.issue.key === '#5',
    )!;
    const times = issue5.map((item) => Date.parse(item.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('버전 탭은 같은 이슈의 같은 결정 사항 버전만 보여 줘요', () => {
    const versions = sameStandardVersions(
      byId('inbox-reason-length-v3'),
      changes,
    );
    expect(versions.map((item) => item.standard.version)).toEqual([3, 2]);
    expect(new Set(versions.map((item) => item.standard.id))).toEqual(
      new Set(['notify.answer.reason-length']),
    );
    // 같은 이슈 #5에 다른 결정 사항도 있지만 섞이지 않아요
    expect(
      sameStandardVersions(byId('inbox-title-length-v2'), changes),
    ).toHaveLength(1);
  });
});

describe('상세 위 칩 (app.detail.change-letter)', () => {
  it('결정 사항과 이슈 한 쌍마다 칩 하나, 먼저 온 쌍이 앞이에요', () => {
    const groups = groupByChange(changes);
    for (const group of groups) {
      expect(new Set(group.map((item) => item.issue.key)).size).toBe(1);
      expect(new Set(group.map((item) => item.standard.id)).size).toBe(1);
    }
    const firstArrived = groups.map((group) =>
      Math.min(...group.map((item) => Date.parse(item.createdAt))),
    );
    expect(firstArrived).toEqual([...firstArrived].sort((a, b) => a - b));
  });

  it('글자는 A부터, Z 다음은 AA예요', () => {
    expect(changeLetter(0)).toBe('A');
    expect(changeLetter(25)).toBe('Z');
    expect(changeLetter(26)).toBe('AA');
  });
});
