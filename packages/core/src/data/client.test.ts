import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectDb,
  getDb,
  isDbConnected,
  setDbConnector,
  setDbErrorReporter,
  setDbForTesting,
  toSilError,
  type DbClient,
} from './client.ts';

afterEach(() => setDbForTesting(undefined));

describe('연결 (D50)', () => {
  it('연결할 방법이 없으면 DB_NOT_CONFIGURED를 던지고, 등록한 방법은 처음 한 번만 불러요', () => {
    expect(() => getDb()).toThrow(
      expect.objectContaining({ code: 'DB_NOT_CONFIGURED' }),
    );
    const fake = {} as DbClient;
    const connector = vi.fn(() => fake);
    setDbConnector(connector);
    expect(isDbConnected()).toBe(false);
    expect(getDb()).toBe(fake);
    expect(getDb()).toBe(fake);
    expect(connector).toHaveBeenCalledTimes(1);
    expect(isDbConnected()).toBe(true);
  });

  it('웹 앱은 connectDb(주소, 공용 키)로 바로 연결해요', () => {
    const client = connectDb('http://127.0.0.1:54321', 'sb_publishable_test');
    expect(getDb()).toBe(client);
  });
});

describe('toSilError (브라우저)', () => {
  it('브라우저의 "Failed to fetch"도 연결 실패로 알리고, 남기는 곳은 바꿀 수 있어요', () => {
    const reported: string[] = [];
    setDbErrorReporter((message) => reported.push(message));
    const error = toSilError({ message: 'TypeError: Failed to fetch' });
    expect(error.code).toBe('DB_ERROR');
    expect(error.message).toMatch(/바뀐 결정 사항이 없다고 여기지 마세요/);
    expect(reported).toEqual(['DB에 연결하지 못했어요']);
  });
});
