/**
 * 응답 기록 14칸 표 (data.response.columns, data.response.method).
 *
 * 도구가 남긴 답(DB)과 사람이 손으로 적은 답(team-wiki/answers.csv)을 같은 표로 합쳐요.
 * 그래야 발표에서 두 경우를 나눠 보여 주면서도 한 번에 셀 수 있어요.
 */
import type { AnswerRecord, StandardVersion } from '@sil/core';
import { parseCsv } from '@sil/core/node';

/** 표의 칸 순서. 팀 위키 data.response.columns 그대로예요 */
export const RESPONSE_COLUMNS = [
  '기록 시각',
  '기준 ID',
  '기준 버전',
  '바뀐 내용',
  '바꾼 사람',
  '근거',
  '이슈 번호',
  '담당자',
  '관계',
  '알았나',
  '확인 시간(초)',
  '관계없다 이유',
  '모르고 계속했다면 다시 할 일',
  '기록한 방법',
] as const;

export interface ResponseRow {
  recordedAt: string;
  standardId: string;
  version: number | null;
  /** "이전 값 → 지금 값" */
  change: string;
  changedBy: string | null;
  evidence: string | null;
  issueKey: string | null;
  assignee: string | null;
  /** 관계있다 true, 관계없다 false, 모르면 null */
  affected: boolean | null;
  known: boolean | null;
  elapsedSeconds: number | null;
  unaffectedReason: string | null;
  reworkNote: string | null;
  method: '도구' | '사람';
}

export function fromAnswerRecord(record: AnswerRecord): ResponseRow {
  return {
    recordedAt: record.answeredAt,
    standardId: record.standardId,
    version: record.version,
    change: `${record.previousValue ?? '(없음)'} → ${record.value}`,
    changedBy: record.changedBy,
    evidence: record.evidence,
    issueKey: record.issueKey,
    assignee: record.answeredBy,
    affected: record.affected,
    known: record.known,
    elapsedSeconds: record.elapsedSeconds,
    unaffectedReason: record.unaffectedReason,
    reworkNote: record.reworkNote,
    method: '도구',
  };
}

/**
 * v0 도그푸딩 때 사람이 적은 team-wiki/answers.csv를 읽어요.
 * 칸: 날짜시각, 누가, 기준ID, 버전, 관계, 알았나, 걸린시간초, 이유
 * 바뀐 내용·바꾼 사람·근거는 DB 버전 기록에서 찾아 채워요 (없으면 비워 둬요).
 */
export function parseManualAnswers(
  text: string,
  versions: StandardVersion[],
): { rows: ResponseRow[]; problems: string[] } {
  const [header, ...lines] = parseCsv(
    text.charCodeAt(0) === 0xfeff ? text.slice(1) : text,
  );
  const problems: string[] = [];
  if (!header) return { rows: [], problems };
  const at = (name: string) =>
    header.findIndex((cell) => cell.replace(/\s/g, '') === name);
  const columns = {
    recordedAt: at('날짜시각'),
    who: at('누가'),
    standardId: at('기준ID'),
    version: at('버전'),
    relation: at('관계'),
    known: at('알았나'),
    seconds: at('걸린시간초'),
    reason: at('이유'),
  };
  if (columns.standardId < 0 || columns.relation < 0) {
    return {
      rows: [],
      problems: ['answers.csv 첫 줄에 기준ID와 관계 칸이 있어야 해요'],
    };
  }
  const byVersion = new Map(
    versions.map((v) => [`${v.standardId}@${v.version}`, v]),
  );
  const rows: ResponseRow[] = [];
  lines.forEach((cells, index) => {
    const get = (column: number) =>
      column >= 0 ? (cells[column] ?? '').trim() : '';
    if (cells.every((cell) => cell.trim() === '')) return;
    const standardId = get(columns.standardId);
    const versionText = get(columns.version).replace(/^v/i, '');
    const version = /^\d+$/.test(versionText) ? Number(versionText) : null;
    const found =
      version === null ? undefined : byVersion.get(`${standardId}@${version}`);
    const previous =
      version === null
        ? undefined
        : byVersion.get(`${standardId}@${version - 1}`)?.value;
    const affected = readRelation(get(columns.relation));
    if (affected === undefined) {
      problems.push(
        `answers.csv ${index + 2}번째 줄: 관계는 관계있다 또는 관계없다예요`,
      );
    }
    const seconds = get(columns.seconds);
    rows.push({
      recordedAt: get(columns.recordedAt),
      standardId,
      version,
      change: found ? `${previous ?? '(없음)'} → ${found.value}` : '',
      changedBy: found?.changedBy ?? null,
      evidence: found?.evidence ?? null,
      issueKey: null,
      assignee: get(columns.who) || null,
      affected: affected ?? null,
      known: readKnown(get(columns.known)),
      elapsedSeconds: /^\d+$/.test(seconds) ? Number(seconds) : null,
      unaffectedReason: affected === false ? get(columns.reason) || null : null,
      reworkNote: null,
      method: '사람',
    });
  });
  return { rows, problems };
}

function readRelation(text: string): boolean | undefined {
  if (/관계\s*있/.test(text)) return true;
  if (/관계\s*없/.test(text)) return false;
  return undefined;
}

function readKnown(text: string): boolean | null {
  if (text.includes('몰랐')) return false;
  if (text.includes('알았')) return true;
  return null;
}

const KOREA_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 14칸 CSV. 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM을 붙여요 */
export function toResponseCsv(rows: ResponseRow[]): string {
  const lines = [RESPONSE_COLUMNS as readonly string[]].concat(
    rows.map((row) => [
      formatTime(row.recordedAt),
      row.standardId,
      row.version === null ? '' : String(row.version),
      row.change,
      row.changedBy ?? '',
      row.evidence ?? '',
      row.issueKey ?? '',
      row.assignee ?? '',
      row.affected === null ? '' : row.affected ? '관계있다' : '관계없다',
      row.known === null ? '' : row.known ? '알았다' : '몰랐다',
      row.elapsedSeconds === null ? '' : String(row.elapsedSeconds),
      row.unaffectedReason ?? '',
      row.reworkNote ?? '',
      row.method,
    ]),
  );
  return `${String.fromCharCode(0xfeff)}${lines.map((cells) => cells.map(quote).join(',')).join('\r\n')}\r\n`;
}

function formatTime(text: string): string {
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : KOREA_TIME.format(date);
}

function quote(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}
