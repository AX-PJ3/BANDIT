import { describe, expect, it } from 'vitest';
import { formatChangelogLine } from './changelog.ts';
import {
  checkStandardWording,
  isOpenPendingCheck,
  normalizeStandardValue,
  OPEN_PENDING_CHECK_STATUSES,
  STANDARD_ID_PATTERN,
} from './rules.ts';

describe('결정 사항 ID 형식 (data.standard.id-format, check_wiki.py ID_RE와 같아요)', () => {
  it('세 부분, 영역은 영문 소문자만', () => {
    expect(STANDARD_ID_PATTERN.test('app.notify.title-length')).toBe(true);
    expect(STANDARD_ID_PATTERN.test('goal.metric.primary')).toBe(true);
    expect(STANDARD_ID_PATTERN.test('app.notify.title.length')).toBe(false);
    expect(STANDARD_ID_PATTERN.test('app.notify')).toBe(false);
    expect(STANDARD_ID_PATTERN.test('app2.notify.title')).toBe(false);
    expect(STANDARD_ID_PATTERN.test('App.notify.title')).toBe(false);
  });
});

describe('checkStandardWording (check_wiki.py와 같은 경고)', () => {
  it('제목 40자 초과, 값에 "그리고·또한·단,", 확인할 수 없는 말을 알려요', () => {
    expect(
      checkStandardWording({
        title: '앱 알림 제목은 40자 이하다',
        value: '공백 포함 40자 이하로 쓴다',
      }),
    ).toEqual([]);
    expect(
      checkStandardWording({
        title: '가'.repeat(41),
        value:
          '쿠폰 값은 비어 있을 수 있고 그리고 필요시 쿠폰 없음을 보여 준다',
      }),
    ).toEqual([
      '제목이 41자예요. 40자 이하로 줄여요',
      "값에 '그리고'가 있어요. 규칙이 두 개라면 결정 사항을 나눠요 (wiki.standard.one-rule)",
      "'필요시'는 확인할 수 없는 말이에요. 숫자나 조건으로 바꿔요",
    ]);
  });
});

describe('확인할 변경 상태 (data.pending.status-values)', () => {
  it('대기만 아직 답을 기다려요', () => {
    expect(OPEN_PENDING_CHECK_STATUSES).toEqual(['pending']);
    expect(isOpenPendingCheck('pending')).toBe(true);
    expect(isOpenPendingCheck('superseded')).toBe(false);
    expect(isOpenPendingCheck('auto_closed')).toBe(false);
  });
});

describe('formatChangelogLine (data.changelog.format)', () => {
  it('새 결정 사항은 new→1, 이전 값은 (없음), 시각은 한국 시간', () => {
    expect(
      formatChangelogLine({
        at: '2026-10-08T09:00:00.000Z',
        by: '호윤',
        standardId: 'goal.metric.primary',
        fromVersion: null,
        toVersion: 1,
        before: null,
        after: '몰랐다 수를 센다',
        reason: '위키 첫 등록',
        source: 'wiki',
      }),
    ).toBe(
      '2026-10-08 18:00 | 호윤 | goal.metric.primary new→1 | (없음) → 몰랐다 수를 센다 | 위키 첫 등록 | 문서',
    );
  });

  it('값 안의 |와 줄바꿈은 칸을 깨지 않게 바꾸고, 되돌림이면 이유에 "vN로 되돌림"을 붙여요', () => {
    const line = formatChangelogLine({
      at: new Date('2026-10-09T08:00:00.000Z'),
      by: null,
      standardId: 'app.notify.title-length',
      fromVersion: 2,
      toVersion: 3,
      before: '32자 | 공백 포함',
      after: '40자\n이하',
      reason: '회의에서 정함',
      source: 'meeting',
      revertedToVersion: 1,
    });
    expect(line).toBe(
      '2026-10-09 17:00 | 이름 없음 | app.notify.title-length 2→3 | 32자 / 공백 포함 → 40자 이하 | 회의에서 정함 (v1로 되돌림) | 회의',
    );
    // check_wiki.py처럼 " | "로 나누면 6칸이에요
    expect(line.split(' | ')).toHaveLength(6);
  });
});

describe('normalizeStandardValue (detect.change.revert-mark, SQL normalize_standard_value와 같아요)', () => {
  const same = (a: string, b: string) =>
    expect(normalizeStandardValue(a)).toBe(normalizeStandardValue(b));

  it('띄어쓰기·끝 마침표·전각 글자만 다르면 같은 값으로 봐요', () => {
    expect(normalizeStandardValue('  최대 4개  ')).toBe('최대4개');
    same('4개', '4 개');
    same('만듦', '만 듦');
    same('최대 4개', '최대\t4개\n');
    same('4개', '4개...');
    same('4개', '4개。');
    same('4개', '4개 .');
    same('4개', '４개');
    // NBSP, 전각 공백(U+3000), BOM(U+FEFF)
    same('최대 4개', '최대\u00A04개');
    same('최대 4개', '최대\u30004개');
    same('최대 4개', '\uFEFF최대 4개');
    // NFKC라서 호환 글자도 같은 값으로 봐요 (받아들인 차이)
    same('㎡', 'm2');
  });

  it('글자가 다르면 그대로 달라요', () => {
    expect(normalizeStandardValue('네 개')).not.toBe(
      normalizeStandardValue('4개'),
    );
    expect(normalizeStandardValue('v1.2')).toBe('v1.2');
  });
});
