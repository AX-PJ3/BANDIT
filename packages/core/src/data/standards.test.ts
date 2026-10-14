import { afterEach, describe, expect, it } from 'vitest';
import { isSilError } from '../errors.ts';
import { setDbForTesting, toSilError } from './client.ts';
import { createFakeDb, standardRows } from '../node/fake-db.ts';
import {
  getStandardHistory,
  listStandards,
  revertStandard,
  saveIssue,
  saveStandard,
} from './standards.ts';

const coupon = standardRows({
  id: 'order.coupon.nullable',
  area: '주문',
  versions: [
    { title: '쿠폰 값은 항상 있다', value: 'coupon 칸은 항상 값이 있다' },
    {
      title: '쿠폰 값은 비어 있을 수 있다',
      value: 'coupon 칸은 null일 수 있다',
    },
  ],
});

afterEach(() => setDbForTesting(undefined));

describe('읽기', () => {
  it('listStandards는 DB 행(snake_case)을 우리 타입으로 바꿔요', async () => {
    setDbForTesting(createFakeDb({ standards_latest: [coupon.latest] }).client);
    const [first] = await listStandards();
    expect(first?.standard).toMatchObject({
      id: 'order.coupon.nullable',
      alwaysOn: false,
      deprecatedReason: null,
    });
    expect(first?.latest).toMatchObject({
      version: 2,
      title: '쿠폰 값은 비어 있을 수 있다',
      changedByActor: 'human',
    });
  });

  it('getStandardHistory는 최신 버전부터 돌려주고, 없으면 null이에요', async () => {
    setDbForTesting(
      createFakeDb({
        standards: [coupon.standard],
        standard_versions: coupon.versions,
      }).client,
    );
    const history = await getStandardHistory('order.coupon.nullable');
    expect(history?.currentVersion).toBe(2);
    expect(history?.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(await getStandardHistory('order.coupon.missing')).toBeNull();
  });

  it('항상 적용은 버전마다 읽고, 목록의 최신 버전은 결정 사항 표의 값을 따라요 (데이터 항목 목록 v2)', async () => {
    const flag = standardRows({
      id: 'app.notify.flag',
      area: 'app',
      alwaysOn: true,
      versions: [
        { title: '처음', value: '값 1', alwaysOn: false },
        { title: '항상 적용으로', value: '값 2', alwaysOn: true },
      ],
    });
    setDbForTesting(
      createFakeDb({
        standards: [flag.standard],
        standard_versions: flag.versions,
        standards_latest: [flag.latest],
      }).client,
    );
    const history = await getStandardHistory('app.notify.flag');
    expect(
      history?.versions.map(({ version, alwaysOn }) => [version, alwaysOn]),
    ).toEqual([
      [2, true],
      [1, false],
    ]);
    const [latest] = await listStandards();
    expect([latest?.standard.alwaysOn, latest?.latest.alwaysOn]).toEqual([
      true,
      true,
    ]);
  });

  it('v2 전에 저장된 줄(적용 범위에 doc 없음)과 근거·적용 범위가 없는 줄도 읽어요', async () => {
    const old = {
      ...coupon.latest,
      scope: { code: ['src/**'], api: [], screen: [] },
    };
    const empty = {
      ...coupon.latest,
      id: 'order.coupon.empty',
      evidence: null,
      scope: null,
    };
    setDbForTesting(createFakeDb({ standards_latest: [old, empty] }).client);
    const byId = new Map(
      (await listStandards()).map((item) => [item.standard.id, item.latest]),
    );
    expect(byId.get('order.coupon.nullable')?.scope).toEqual({
      code: ['src/**'],
      api: [],
      screen: [],
      doc: [],
    });
    expect(byId.get('order.coupon.empty')).toMatchObject({
      evidence: null,
      scope: null,
      aiDetected: false,
    });
  });

  it('DB 모양이 코드와 다르면 엉뚱한 값 대신 DB_ERROR로 알려요', async () => {
    setDbForTesting(
      createFakeDb({
        standards_latest: [{ ...coupon.latest, scope: 'src/**' }],
      }).client,
    );
    await expect(listStandards()).rejects.toMatchObject({ code: 'DB_ERROR' });
  });
});

describe('쓰기', () => {
  it('saveStandard는 함수 인자 이름으로 바꿔 부르고, 기본값(출처 ai_chat, AI)을 채워요', async () => {
    const fake = createFakeDb({}, () => ({
      data: {
        standardId: 'order.coupon.nullable',
        version: 3,
        isRevert: false,
        revertedToVersion: null,
        previousValue: '이전 값',
        savedAt: '2026-10-09T07:48:40.698Z',
      },
      error: null,
    }));
    setDbForTesting(fake.client);
    const result = await saveStandard({
      id: 'order.coupon.nullable',
      title: '제목',
      value: '값',
      reason: '이유',
      alwaysOn: false,
      baseVersion: 2,
    });
    expect(result.version).toBe(3);
    // CHANGELOG 한 줄 (data.changelog.format): 한국 시간, 누가, ID 이전→새, 이전 → 새 값, 이유, 출처
    expect(result.changelogLine).toBe(
      '2026-10-09 16:48 | 이름 없음 | order.coupon.nullable 2→3 | 이전 값 → 값 | 이유 | AI 대화',
    );
    expect(fake.rpcCalls[0]).toMatchObject({
      name: 'save_standard',
      args: {
        p_id: 'order.coupon.nullable',
        p_base_version: 2,
        p_source: 'ai_chat',
        p_actor: 'ai',
        p_area: null,
        p_always_on: false,
        p_evidence: null,
        p_scope: null,
        p_ai_detected: false,
        p_locked: null,
      },
    });
  });

  it('DB 함수가 거절하면 hint의 코드와 문구를 그대로 SilError로 던져요', async () => {
    setDbForTesting(
      createFakeDb({}, () => ({
        data: null,
        error: {
          code: 'P0001',
          hint: 'VERSION_CONFLICT',
          message: '그사이 v3이 됐어요',
        },
      })).client,
    );
    await expect(
      saveStandard({
        id: 'order.coupon.nullable',
        title: '제목',
        value: '값',
        reason: '이유',
        alwaysOn: false,
        baseVersion: 2,
      }),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      message: '그사이 v3이 됐어요',
    });
  });

  it('버전 충돌로 거절되면 그 변경을 충돌로 보류하고, 보류 번호를 알려 줘요 (detect.conflict.hold)', async () => {
    const fake = createFakeDb({}, (name) =>
      name === 'save_standard'
        ? {
            data: null,
            error: {
              code: 'P0001',
              hint: 'VERSION_CONFLICT',
              message: '그사이 v3이 됐어요.',
            },
          }
        : {
            data: { held: true, conflictId: 'c-1', currentVersion: 3 },
            error: null,
          },
    );
    setDbForTesting(fake.client);
    const saving = saveStandard({
      id: 'order.coupon.nullable',
      title: '제목',
      value: '값',
      reason: '이유',
      alwaysOn: false,
      baseVersion: 2,
      changedBy: '경하',
    });
    await expect(saving).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(saving).rejects.toThrow(
      /충돌로 보류해 두었어요 \(보류 번호 c-1\)/,
    );
    expect(fake.rpcCalls.map((call) => call.name)).toEqual([
      'save_standard',
      'hold_conflict',
    ]);
    expect(fake.rpcCalls[1]?.args).toMatchObject({
      p_base_version: 2,
      p_changed_by: '경하',
      p_value: '값',
    });
    expect(fake.rpcCalls[1]?.args).not.toHaveProperty('p_always_on');
  });

  it('지금 버전과 내용이 같아 보류하지 않았으면 원래 거절을 그대로 알려요', async () => {
    setDbForTesting(
      createFakeDb({}, (name) =>
        name === 'save_standard'
          ? {
              data: null,
              error: {
                code: 'P0001',
                hint: 'VERSION_CONFLICT',
                message: '그사이 v3이 됐어요.',
              },
            }
          : {
              data: { held: false, conflictId: null, currentVersion: 3 },
              error: null,
            },
      ).client,
    );
    await expect(
      saveStandard({
        id: 'order.coupon.nullable',
        title: '제목',
        value: '값',
        reason: '이유',
        alwaysOn: false,
        baseVersion: 2,
      }),
    ).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      message: '그사이 v3이 됐어요.',
    });
  });

  it('되돌리기의 CHANGELOG 줄은 되돌아간 버전의 값과 "vN로 되돌림"을 적어요', async () => {
    setDbForTesting(
      createFakeDb(
        { standards: [coupon.standard], standard_versions: coupon.versions },
        () => ({
          data: {
            standardId: 'order.coupon.nullable',
            version: 3,
            isRevert: true,
            revertedToVersion: 1,
            previousValue: 'coupon 칸은 null일 수 있다',
            savedAt: '2026-10-09T08:00:00.000Z',
          },
          error: null,
        }),
      ).client,
    );
    const result = await revertStandard({
      id: 'order.coupon.nullable',
      toVersion: 1,
      reason: '회의에서 정함',
      baseVersion: 2,
      changedBy: '정민',
      source: 'meeting',
    });
    expect(result.changelogLine).toBe(
      '2026-10-09 17:00 | 정민 | order.coupon.nullable 2→3 | coupon 칸은 null일 수 있다 → coupon 칸은 항상 값이 있다 | 회의에서 정함 (v1로 되돌림) | 회의',
    );
  });
});

describe('saveIssue', () => {
  it('이슈와 결정 사항 연결을 save_issue 함수 인자로 바꿔 불러요', async () => {
    const fake = createFakeDb({}, () => ({
      data: {
        issueKey: '#5',
        created: true,
        standardIds: ['app.notify.title-length'],
        movedChecks: 0,
      },
      error: null,
    }));
    setDbForTesting(fake.client);
    const result = await saveIssue({
      key: '#5',
      title: '담당자에게 알리고 답 기록하기',
      assignee: '민수',
      status: 'in_progress',
      standardIds: ['app.notify.title-length'],
    });
    expect(result.created).toBe(true);
    expect(fake.rpcCalls[0]).toEqual({
      name: 'save_issue',
      args: {
        p_key: '#5',
        p_title: '담당자에게 알리고 답 기록하기',
        p_standard_ids: ['app.notify.title-length'],
        p_assignee: '민수',
        p_status: 'in_progress',
      },
    });
  });
});

describe('toSilError', () => {
  it('권한 없음, 스키마 없음, 연결 실패를 무엇을 확인할지 알려 주는 문구로 바꿔요', () => {
    expect(
      toSilError({
        code: '42501',
        message: 'permission denied for table standards',
      }).code,
    ).toBe('FORBIDDEN');
    expect(
      toSilError({ code: 'PGRST202', message: 'Could not find the function' })
        .message,
    ).toMatch(/migrations/);
    const offline = toSilError({ message: 'TypeError: fetch failed' });
    expect(isSilError(offline) && offline.message).toMatch(
      /바뀐 결정 사항이 없다고 여기지 마세요/,
    );
  });

  it('우리 코드가 아닌 hint는 그대로 믿지 않아요', () => {
    expect(
      toSilError({ code: 'P0001', hint: 'SOMETHING_ELSE', message: 'x' }).code,
    ).toBe('DB_ERROR');
    expect(
      toSilError({ code: 'P0001', hint: 'DB_NOT_CONFIGURED', message: 'x' })
        .code,
    ).toBe('DB_ERROR');
  });
});
