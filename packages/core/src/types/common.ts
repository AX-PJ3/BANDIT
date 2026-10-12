/**
 * 사람을 가리키는 값이에요.
 *
 * 무엇으로 사람을 가리킬지(내부 ID / Linear 사용자 ID / 이메일)는 SIL-15 사람 연결표에서 정해요.
 * 지금은 문자열로만 두고, 정해지면 이 한 줄만 바꾸면 모든 표에 반영되게 해 두었어요.
 * 제안: docs/proposals/sil-15-people-mapping.md
 */
export type PersonRef = string;

/**
 * 이슈 번호예요. 이 도구가 붙이는 #번호(#5 형식)를 쓰고 Linear 번호와는 상관없어요 (data.issue.tool-number).
 * 지금 DB는 번호 모양을 막지 않아요(알림 기능이 생길 때까지 이전대로, D51).
 */
export type IssueKey = string;

/** 기준 ID. '영역.주제.규칙' 모양이고 한 번 정하면 바뀌지 않아요. 예: 'order.coupon.nullable' */
export type StandardId = string;

/** 날짜와 시각은 ISO 문자열로 주고받아요. 앱 화면, MCP, DB 사이에서 모양이 같게 하려고요. */
export type IsoDateTime = string;

/** AI가 했는지 사람이 했는지 */
export type Actor = 'ai' | 'human';

/** 데이터를 어디서 가져오는지. 'none'이면 DB 보류 상태예요 (SIL-14). */
export type DataMode = 'none' | 'database';
