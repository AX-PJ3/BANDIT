import { describe, expect, it } from 'vitest';
import { maskSecrets } from './mask-secrets.ts';

const TOKEN = 'fake-0123456789abcdefghijklmnopq';

/** `claude mcp get haribo`가 찍는 모양 (2.1.x) */
const MCP_GET = `haribo:
  Scope: User config (available in all your projects)
  Status: √ Connected
  Type: http
  URL: https://haribo.example.run.app/mcp
  Headers:
    Authorization: Bearer ${TOKEN}
    X-Sil-User: %EC%A0%95%EB%AF%BC

To remove this server, run: claude mcp remove haribo -s user`;

describe('maskSecrets', () => {
  it('Authorization 값을 가리고 토큰 글자는 하나도 남기지 않아요', () => {
    const { text, masked } = maskSecrets(MCP_GET);
    expect(text).toContain('Authorization: Bearer (가림, 32자)');
    expect(masked).toBe(1);
    // 토큰의 어느 4글자도 결과에 남지 않아요
    for (let i = 0; i + 4 <= TOKEN.length; i += 1) {
      expect(text).not.toContain(TOKEN.slice(i, i + 4));
    }
  });

  it('다른 줄은 그대로 두고, 이름 헤더는 풀어서 함께 보여 줘요', () => {
    const { text } = maskSecrets(MCP_GET);
    expect(text).toContain('Status: √ Connected');
    expect(text).toContain('URL: https://haribo.example.run.app/mcp');
    expect(text).toContain('X-Sil-User: %EC%A0%95%EB%AF%BC (정민)');
    expect(text).toContain('claude mcp remove haribo -s user');
  });

  it('대소문자와 다른 비밀 헤더도 가려요', () => {
    const { text, masked } = maskSecrets(
      'authorization: bearer abc123\nX-Api-Key: k-999\nCookie: sid=1\nX-Request-Id: 42',
    );
    expect(text).toBe(
      'authorization: bearer (가림, 6자)\nX-Api-Key: (가림, 5자)\nCookie: (가림, 5자)\nX-Request-Id: 42',
    );
    expect(masked).toBe(3);
  });

  it('주소 쿼리의 key·secret도 가려요 (웹훅 주소)', () => {
    const { text } = maskSecrets(
      'https://cloudbuild.googleapis.com/v1/x:webhook?key=AIzaSyA&secret=deadbeef&trigger=t',
    );
    expect(text).toBe(
      'https://cloudbuild.googleapis.com/v1/x:webhook?key=(가림)&secret=(가림)&trigger=t',
    );
  });

  it('토큰 자리에 <팀 토큰>이 그대로 들어갔으면 알려 줘요', () => {
    const { text, placeholders } = maskSecrets(
      '    Authorization: Bearer <팀 토큰>',
    );
    expect(placeholders).toEqual(['Authorization']);
    expect(text).not.toContain('팀 토큰');
  });

  it('값이 비어 있으면 비어 있다고 보여 줘요', () => {
    expect(maskSecrets('Authorization: Bearer ').text).toBe(
      'Authorization: Bearer (비어 있음)',
    );
  });
});
