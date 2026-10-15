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

  it('PR 경로의 두 번 묻기는 기본 켬이고 false로 끌 수 있어요 (SIL-66)', () => {
    expect(parseEnv({}).SIL_DETECT_ASK_TWICE).toBe(true);
    expect(parseEnv({ SIL_DETECT_ASK_TWICE: '' }).SIL_DETECT_ASK_TWICE).toBe(
      true,
    );
    expect(
      parseEnv({ SIL_DETECT_ASK_TWICE: 'false' }).SIL_DETECT_ASK_TWICE,
    ).toBe(false);
    expect(
      parseEnv({ SIL_DETECT_ASK_TWICE: ' False ' }).SIL_DETECT_ASK_TWICE,
    ).toBe(false);
    expect(() => parseEnv({ SIL_DETECT_ASK_TWICE: 'yes' })).toThrow();
  });

  it('PR 경로 저장 끄기는 기본 끔이고 true로 켜요 (SIL-66)', () => {
    expect(parseEnv({}).SIL_DETECT_DRY_RUN).toBe(false);
    expect(parseEnv({ SIL_DETECT_DRY_RUN: 'TRUE' }).SIL_DETECT_DRY_RUN).toBe(
      true,
    );
  });

  it('PR 경로 모델은 비우면 없음(코드 기본값), claude- 모델 ID만 받아요 (SIL-66)', () => {
    expect(parseEnv({}).SIL_DETECT_MODEL).toBeUndefined();
    expect(
      parseEnv({ SIL_DETECT_MODEL: ' claude-sonnet-5-5 ' }).SIL_DETECT_MODEL,
    ).toBe('claude-sonnet-5-5');
    expect(() => parseEnv({ SIL_DETECT_MODEL: 'gpt-5' })).toThrow();
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
