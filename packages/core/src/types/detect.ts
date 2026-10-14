import type { IsoDateTime } from './common.ts';

/**
 * 코드 확인 기록 (표 7/7) — 바뀐 기준 찾기가 PR 하나를 보고 내린 판단이에요. 관계없어도 남겨요.
 *
 * @draft SIL-15 초안. 10/12 스펙 리뷰에서 확정해요.
 */
export interface CodeReviewLog {
  /** PR 번호 */
  prNumber: number;
  /** 바뀐 파일 경로 */
  changedFiles: string[];
  /** 판단 결과: 위키 고침 / PR 댓글로 물어봄 / 관계없음 */
  verdict: 'changed' | 'asked' | 'unrelated';
  /** 확신 정도 (0~1) */
  confidence: number;
  createdAt: IsoDateTime;
}
