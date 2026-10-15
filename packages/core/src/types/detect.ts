import type { IsoDateTime, StandardId } from './common.ts';

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

// ---------------------------------------------------------------------------
// PR 경로 판단 (SIL-66). 판단 로직(@sil/detect)이 만들고, 코드 확인 기록(detect.log.every-pr)도 이 모양을 남길 거예요
// ---------------------------------------------------------------------------

/**
 * 판단 등급. 점수 대신 세 등급으로 시작해요 (SIL-66).
 * - sure: 확실히 결정 사항이 바뀌었어요. 이때만 저장할 수 있어요
 * - unsure: 바뀐 것 같지만 확신하지 못해요. 저장하지 않고 PR 작성자에게 물어요 (detect.judge.ask-if-unsure)
 * - unrelated: 결정 사항과 관계없는 PR이에요
 */
export type DetectGrade = 'sure' | 'unsure' | 'unrelated';

/** AI가 PR에서 찾은 결정 사항 변경 하나 */
export interface DetectedChange {
  /** 바뀐 결정 사항 ID. DB에 있는 ID여야 저장해요 */
  standardId: StandardId;
  /** 새 제목. 값이 바뀌면 제목도 바뀔 수 있어요 (예: 40자 이하다 → 32자 이하다) */
  newTitle: string;
  /** 새 값. 한 문장 */
  newValue: string;
  /** 판단에 쓴 바뀐 코드 줄 (diff의 +/- 줄 그대로). 근거 칸에 남겨요 (detect.change.evidence) */
  changedLines: string[];
  /** 코드에서 무엇이 바뀌었는지 한 문장. 근거 칸에 남겨요 */
  why: string;
  /** PR 작성자가 제목이나 설명에 적은 바꾼 이유를 글자 그대로 옮긴 것. 이유 칸에 넣어요. 없으면 null이고 저장하지 않고 물어요 */
  reasonQuote: string | null;
}

/** PR 하나를 판단한 결과 */
export interface PrJudgment {
  grade: DetectGrade;
  /** 바뀐 것으로 보이는 결정 사항. 관계없음이면 빈 목록. 둘 이상이면 저장하지 않고 물어요 (detect.judge.one-per-run) */
  changes: DetectedChange[];
  /** 애매할 때 PR 작성자에게 물을 한 문장. 없으면 null */
  question: string | null;
}
