import type { StandardId } from './common.js';
import type { Issue } from './notify.js';
import type { StandardScope, StandardStatus } from './standard.js';

/**
 * 레포의 team-wiki/ 파일에서 읽은 기준 하나예요 (`sil import`, SIL-65).
 * 칸 이름과 규칙은 team-wiki/기준-작성-원칙.md와 scripts/check_wiki.py를 따라요.
 */
export interface WikiEntry {
  id: StandardId;
  title: string;
  value: string;
  reason: string;
  alwaysOn: boolean;
  evidence: string | null;
  scope: StandardScope | null;
  status: StandardStatus;
  /** 폐기됐다면 대체한 기준 ID ("대체" 칸의 첫 번째) */
  replacedBy: StandardId | null;
  locked: boolean;
  /** 파일에 적힌 버전. DB에는 1부터 다시 쌓여요 */
  fileVersion: number | null;
  /** 어느 파일 몇째 줄인지 (문제를 알려 줄 때) */
  file: string;
  line: number;
}

/** 이슈 파일(CSV)에서 읽은 이슈 하나. 한 이슈가 여러 줄(기준마다 한 줄)에 걸쳐 있어도 하나로 묶어요 */
export interface IssueEntry extends Issue {
  file: string;
  line: number;
}

/** 읽다가 찾은 문제. error는 그 기준·이슈를 건너뛰고, warning은 읽되 알려만 줘요 */
export interface ImportProblem {
  level: 'error' | 'warning';
  file: string;
  line: number;
  message: string;
}
