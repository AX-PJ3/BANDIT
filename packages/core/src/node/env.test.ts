import { describe, expect, it } from 'vitest';
import { isSilError } from '../errors.ts';
import { parseEnv } from './env.ts';

describe('parseEnv', () => {
  it('Supabase 값이 비어 있으면 DB 없이 켜지는 상태(undefined)로 읽어요', () => {
    const env = parseEnv({ SUPABASE_URL: '  ', SUPABASE_PUBLISHABLE_KEY: '' });
    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
  });

  it('기본값: LOG_LEVEL은 info, 서버는 127.0.0.1:3333', () => {
    const env = parseEnv({});
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SIL_MCP_HOST).toBe('127.0.0.1');
    expect(env.PORT).toBe(3333);
  });

  it('호스팅이 정해 준 PORT를 숫자로 읽어요', () => {
    expect(parseEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('Supabase 주소와 키는 둘 다 있거나 둘 다 없어야 해요', () => {
    expect(() =>
      parseEnv({ SUPABASE_URL: 'https://abcd.supabase.co' }),
    ).toThrow(/둘 다/);
    expect(
      parseEnv({
        SUPABASE_URL: 'https://abcd.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      }).SUPABASE_URL,
    ).toBe('https://abcd.supabase.co');
  });

  it('잘못된 값은 한국어 설명과 함께 INVALID_ENV로 거절해요', () => {
    for (const source of [
      { LOG_LEVEL: 'loud' },
      { SUPABASE_URL: 'abcd.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'x' },
    ]) {
      try {
        parseEnv(source);
        expect.unreachable();
      } catch (error) {
        expect(isSilError(error) && error.code).toBe('INVALID_ENV');
      }
    }
  });
});
