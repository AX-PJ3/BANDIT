import type { AnswerRecord, StandardVersion } from '@sil/core';
import { describe, expect, it } from 'vitest';
import { formatMetrics, summarizeMetrics } from './metrics.ts';
import {
  fromAnswerRecord,
  parseManualAnswers,
  RESPONSE_COLUMNS,
  toResponseCsv,
} from './records.ts';

const version = (overrides: Partial<StandardVersion>): StandardVersion => ({
  standardId: 'app.notify.title-length',
  version: 1,
  title: '제목',
  value: '40자 이하',
  reason: '이유',
  alwaysOn: false,
  evidence: 'Linear SIL-43',
  scope: null,
  changedBy: '팀 위키',
  changedByActor: 'human',
  aiDetected: false,
  isRevert: false,
  revertedToVersion: null,
  source: 'wiki',
  createdAt: '2026-10-08T09:00:00.000Z',
  ...overrides,
});

const versions = [
  version({}),
  version({
    version: 2,
    value: '32자 이하',
    changedBy: '경하',
    changedByActor: 'ai',
    aiDetected: true,
    source: 'code',
    evidence: 'PR #12',
  }),
  version({
    version: 3,
    value: '40자 이하',
    changedBy: '정민',
    isRevert: true,
    revertedToVersion: 1,
    source: 'meeting',
  }),
];

const record = (overrides: Partial<AnswerRecord>): AnswerRecord => ({
  answerId: 'a-1',
  answeredAt: '2026-10-13T06:00:00.000Z',
  standardId: 'app.notify.title-length',
  version: 2,
  previousValue: '40자 이하',
  value: '32자 이하',
  changedBy: '경하',
  changedByActor: 'ai',
  aiDetected: true,
  evidence: 'PR #12',
  issueKey: '#7',
  answeredBy: '신지',
  affected: true,
  known: false,
  elapsedSeconds: 40,
  unaffectedReason: null,
  reworkNote: '알림 제목 자르기 다시',
  channel: 'app',
  ...overrides,
});

describe('응답 기록 14칸 (data.response.columns)', () => {
  it('도구가 남긴 답을 14칸으로 바꾸고, 엑셀용 BOM과 따옴표를 붙여요', () => {
    const csv = toResponseCsv([
      fromAnswerRecord(record({})),
      fromAnswerRecord(
        record({
          answerId: 'a-2',
          affected: false,
          known: null,
          reworkNote: null,
          unaffectedReason: '화면에 제목이 없음, 관계없음',
        }),
      ),
    ]);
    const [header, first, second] = csv.slice(1).trimEnd().split('\r\n');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(header).toBe(RESPONSE_COLUMNS.join(','));
    expect(header?.split(',')).toHaveLength(14);
    expect(first).toBe(
      '2026-10-13 15:00,app.notify.title-length,2,40자 이하 → 32자 이하,경하,PR #12,#7,신지,관계있다,몰랐다,40,,알림 제목 자르기 다시,도구',
    );
    expect(second).toContain(
      '관계없다,,40,"화면에 제목이 없음, 관계없음",,도구',
    );
  });

  it('사람이 적은 answers.csv를 읽고, 바뀐 내용·바꾼 사람·근거를 버전 기록에서 채워요 (data.response.method)', () => {
    const { rows, problems } = parseManualAnswers(
      [
        '날짜시각,누가,기준ID,버전,관계,알았나,걸린시간초,이유',
        '2026-10-12 10:00,부건,app.notify.title-length,2,관계있다,몰랐다,35,',
        '2026-10-12 11:00,호윤,app.notify.title-length,v2,관계없다,,20,문구 작업만 함',
        '2026-10-12 12:00,신지,app.notify.title-length,2,모름,,,',
      ].join('\n'),
      versions,
    );
    expect(
      rows.map((row) => [
        row.assignee,
        row.change,
        row.changedBy,
        row.affected,
        row.known,
        row.unaffectedReason,
        row.method,
      ]),
    ).toEqual([
      ['부건', '40자 이하 → 32자 이하', '경하', true, false, null, '사람'],
      [
        '호윤',
        '40자 이하 → 32자 이하',
        '경하',
        false,
        null,
        '문구 작업만 함',
        '사람',
      ],
      ['신지', '40자 이하 → 32자 이하', '경하', null, null, null, '사람'],
    ]);
    expect(problems).toEqual([
      'answers.csv 4번째 줄: 관계는 관계있다 또는 관계없다예요',
    ]);
  });
});

describe('지표 (goal.metric.*, goal.guard.*)', () => {
  it('모두 "N건 중 M건"으로 보여 줘요', () => {
    const rows = [
      fromAnswerRecord(record({})),
      fromAnswerRecord(
        record({ answerId: 'a-2', known: true, elapsedSeconds: 80 }),
      ),
      fromAnswerRecord(
        record({
          answerId: 'a-3',
          affected: false,
          known: null,
          unaffectedReason: '관계없음',
          elapsedSeconds: 10,
        }),
      ),
      ...parseManualAnswers(
        '날짜시각,누가,기준ID,버전,관계,알았나,걸린시간초,이유\n2026-10-12 10:00,부건,app.notify.title-length,2,관계있다,몰랐다,,',
        versions,
      ).rows,
    ];
    const summary = summarizeMetrics({ rows, versions, pendingCheckCount: 5 });
    expect(summary.primary).toEqual({
      affected: 3,
      unknown: 2,
      byMethod: { 도구: 1, 사람: 1 },
    });
    expect(summary.funnel).toEqual({
      changedStandards: 2,
      aiChanged: 1,
      notifiedIssues: 5,
      affected: 3,
      unknown: 2,
    });
    expect(summary.checkTime).toEqual({ medianSeconds: 40, measured: 3 });
    expect(summary.unrelated).toEqual({ answers: 4, unaffected: 1 });
    // v2(AI)를 정민님이 v1로 되돌렸어요
    expect(summary.reverted).toEqual({ aiChanges: 1, revertedByHuman: 1 });
    expect(formatMetrics(summary)[0]).toBe(
      '주 지표: 관계있다 3건 중 몰랐다 2건 (도구 1건, 사람 기록 1건)',
    );
  });
});
