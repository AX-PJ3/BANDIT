/**
 * 사람 (표 1/7)
 *
 * @draft SIL-15 초안 그대로예요. 사람 연결표를 어떻게 채우고 무엇을 열쇠로 쓸지는
 *        docs/proposals/sil-15-people-mapping.md 제안을 10/12 스펙 리뷰에서 정한 뒤 반영해요.
 */
export interface Person {
  /** 이름 */
  name: string;
  /** Linear 아이디 */
  linearUserId: string | null;
  /** GitHub 아이디 (로그인 이름) */
  githubLogin: string | null;
  /** Slack 아이디 */
  slackUserId: string | null;
  /** 이메일 */
  email: string | null;
}
