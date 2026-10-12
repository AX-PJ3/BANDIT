import { describe, expect, it } from 'vitest';
import { couponStandard, couponVersions } from '../fixtures/index.ts';
import type { StandardWithLatest } from '../types/index.ts';
import {
  buildWikiIndex,
  matchesCodePath,
  searchStandardList,
} from './wiki-search.ts';

const coupon: StandardWithLatest = {
  standard: couponStandard,
  latest: couponVersions[1]!,
};

function standard(
  id: string,
  area: string,
  title: string,
  overrides: Partial<StandardWithLatest['standard']> = {},
) {
  return {
    standard: { ...couponStandard, id, area, title, ...overrides },
    latest: {
      ...couponVersions[0]!,
      standardId: id,
      title,
      value: `${title} (값)`,
      scope: { code: ['src/app/**'], api: [], screen: ['홈'], doc: [] },
    },
  } satisfies StandardWithLatest;
}

const list = [
  coupon,
  standard(
    'app.notify.title-length',
    '앱',
    '앱 알림 한 줄 문구는 32자 이하다',
    { alwaysOn: true },
  ),
  standard('app.install.command-name', '앱', '설치 명령 이름은 sil이다'),
  standard('old.thing.removed', '앱', '폐기된 결정 사항', {
    status: 'deprecated',
  }),
];

describe('buildWikiIndex', () => {
  it('영역마다 결정 사항 수와 한 줄 요약, 항상 적용되는 결정 사항을 모아요 (폐기 제외)', () => {
    const index = buildWikiIndex(list);
    expect(index.total).toBe(3);
    expect(index.areas).toEqual([
      {
        area: '앱',
        count: 2,
        summary: '앱 알림 한 줄 문구는 32자 이하다 · 설치 명령 이름은 sil이다',
      },
      { area: '주문', count: 1, summary: '쿠폰 값은 비어 있을 수 있다' },
    ]);
    expect(index.alwaysOn).toEqual([
      {
        id: 'app.notify.title-length',
        title: '앱 알림 한 줄 문구는 32자 이하다',
      },
    ]);
  });

  it('사용 중인 결정 사항 전체 목록을 ID 순으로 돌려줘요 (SIL-65)', () => {
    expect(buildWikiIndex(list).standards).toEqual([
      {
        id: 'app.install.command-name',
        area: '앱',
        title: '설치 명령 이름은 sil이다',
      },
      {
        id: 'app.notify.title-length',
        area: '앱',
        title: '앱 알림 한 줄 문구는 32자 이하다',
      },
      {
        id: 'order.coupon.nullable',
        area: '주문',
        title: '쿠폰 값은 비어 있을 수 있다',
      },
    ]);
  });
});

describe('searchStandardList', () => {
  it('키워드는 낱말이 모두 들어 있는 결정 사항만 찾아요 (적용 범위 화면 이름 포함)', () => {
    expect(
      searchStandardList(list, { keyword: '쿠폰 null' }).map(
        (hit) => hit.standard.id,
      ),
    ).toEqual(['order.coupon.nullable']);
    expect(searchStandardList(list, { keyword: '주문 상세' })).toHaveLength(1);
    expect(searchStandardList(list, { keyword: '쿠폰 없는낱말' })).toHaveLength(
      0,
    );
  });

  it('영역은 이름이나 ID 앞부분으로 찾아요', () => {
    expect(searchStandardList(list, { area: '앱' })).toHaveLength(3);
    expect(searchStandardList(list, { area: 'order' })).toHaveLength(1);
  });

  it('코드 경로는 적용 범위의 glob과 맞춰 보고, 맞은 경로를 알려 줘요', () => {
    const hits = searchStandardList(list, { codePath: 'src\\order\\api.ts' });
    expect(hits.map((hit) => hit.standard.id)).toEqual([
      'order.coupon.nullable',
    ]);
    expect(hits[0]?.matchedCode).toEqual(['src/order/**']);
  });

  it('limit만큼만 돌려줘요', () => {
    expect(searchStandardList(list, { area: '앱', limit: 1 })).toHaveLength(1);
  });

  it('적용 범위가 없는 결정 사항도 단어로 찾고, 코드 경로로는 걸리지 않아요', () => {
    const noScope = {
      ...standard('wiki.read.index-first', '위키', '목차를 먼저 읽는다'),
      latest: {
        ...standard('wiki.read.index-first', '위키', '목차를 먼저 읽는다')
          .latest,
        scope: null,
      },
    };
    expect(searchStandardList([noScope], { keyword: '목차' })).toHaveLength(1);
    expect(
      searchStandardList([noScope], { codePath: 'src/a.ts' }),
    ).toHaveLength(0);
  });
});

describe('matchesCodePath', () => {
  it('glob, 같은 파일, 폴더를 모두 받아요', () => {
    expect(matchesCodePath('src/order/**', 'src/order/deep/a.ts')).toBe(true);
    expect(matchesCodePath('src/api/order.ts', 'src/api/order.ts')).toBe(true);
    expect(matchesCodePath('./src/order/', 'src/order/a.ts')).toBe(true);
    expect(matchesCodePath('src/order/**', 'src/orders/a.ts')).toBe(false);
    expect(matchesCodePath('src/**/*.tsx', 'src/a/b.ts')).toBe(false);
  });
});
