import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PendingItem } from '../listPending.ts';
import {
  COLS,
  allAnsweredLine,
  autoClosedLine,
  connectionFailedNotice,
  detailScreen,
  formatWhen,
  isRecall,
  isReflectPrompt,
  nothingLeft,
  nothingToReflect,
  recordedLines,
  reflectableItems,
  reflectedLine,
  reflectReminder,
  reflectScreen,
  sessionNotice,
  skippedReminder,
  unsureLine,
} from './screens.ts';
import {
  questionsFor,
  reflectGroups,
  reflectQuestionsFor,
} from './questions.ts';
import { stripAnsi, textWidth } from './text.ts';

/** 착수 안내 데모 예시: 부건님이 알림 제목 길이를 40자에서 32자로 바꿈. 받는 사람은 민수, 이슈 #5 */
function demoItem(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    pendingCheckId: 'c-5',
    status: 'pending',
    createdAt: '2026-10-13T05:13:00Z',
    reflected: false,
    reflectedAt: null,
    standard: {
      id: 'app.notify.title-length',
      title: '앱 알림 제목은 32자 이하로 쓴다',
      version: 2,
      value: '공백 포함 32자 이하',
      previousVersion: 1,
      previousValue: '공백 포함 40자 이하',
      reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
      changedBy: '부건',
      changedAt: '2026-10-13T05:13:00Z', // 한국 시각 오후 2:13
      source: 'ai_chat',
      aiDetected: false,
      isRevert: false,
      scope: null,
    },
    issue: {
      key: '#5',
      title: '담당자에게 알리고 답 기록하기',
      status: 'in_progress',
    },
    answer: null,
    previousAnswer: null,
    ...overrides,
  };
}

const SAME_DAY = '2026-10-13T06:00:00Z';
const plain = (text: string) => stripAnsi(text).split('\n');

function assertFits(text: string) {
  for (const line of plain(text)) {
    assert.ok(textWidth(line) <= COLS, `${COLS}칸을 넘어요: "${line}"`);
  }
}

describe('켤 때 알림 (T2)', () => {
  it('1건이면 "총" 없이 영역과 건수만 보여 준다', () => {
    assert.deepEqual(plain(sessionNotice([demoItem()]) ?? ''), [
      '',
      '  [app] 결정 사항이 1건 변경되었어요.',
      '  작업을 시작하면 변경 내역을 상세히 볼 수 있어요.',
    ]);
  });

  it('2건 이상이면 "총"을 붙이고 영역은 위키 목차 순서로 묶는다', () => {
    const notifyItem = demoItem({
      pendingCheckId: 'c-9',
      standard: { ...demoItem().standard, id: 'notify.terminal.one-change' },
    });
    assert.equal(
      plain(sessionNotice([demoItem(), notifyItem]) ?? '')[1],
      '  [notify, app] 결정 사항이 총 2건 변경되었어요.',
    );
  });

  it('답할 변경이 없으면 아무것도 띄우지 않는다', () => {
    assert.equal(sessionNotice([]), null);
    assert.equal(sessionNotice([demoItem({ status: 'answered' })]), null);
  });

  it('건수 숫자는 노란 굵은 글자다', () => {
    const yellowBoldOne = '\u001b[1m\u001b[33m1';
    assert.ok((sessionNotice([demoItem()]) ?? '').includes(yellowBoldOne));
  });

  it('첫 줄 앞에는 ● 대신 노란 막대를 세운다 (v2)', () => {
    const yellowBar = '\u001b[33m\u001b[7m \u001b[27m\u001b[39m ';
    const lines = (sessionNotice([demoItem()]) ?? '').split('\n');
    assert.ok(lines[1]?.startsWith(yellowBar));
    assert.ok(!lines[2]?.includes(yellowBar), '설명 줄에는 막대가 없어요');
  });
});

describe('변경 상세 (T3)', () => {
  it('데모 예시가 부건님 v2 시안 모양 그대로 나온다', () => {
    assert.deepEqual(plain(detailScreen(demoItem(), 1, 1, { now: SAME_DAY })), [
      '',
      `-- 작업 전에 확인할 변경이 1건 있어요 ${'-'.repeat(38)}`,
      '[app] 앱 알림 제목은 32자 이하로 쓴다 (변경)',
      '      부건님이 오후 2:13에 변경했어요.',
      '  변경  40자 ⭢ 32자',
      '  상세  공백 포함 32자 이하',
      '',
      '  이유  Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
      '  이슈  #5 담당자에게 알리고 답 기록하기',
      '  출처  AI 대화',
      '-'.repeat(COLS),
    ]);
  });

  it('위아래 선은 76칸이다', () => {
    const lines = plain(detailScreen(demoItem(), 2, 3, { now: SAME_DAY }));
    assert.equal(textWidth(lines[1] ?? ''), COLS);
    assert.equal(textWidth(lines.at(-1) ?? ''), COLS);
  });

  it('제목은 청록 굵은 글자다 (v2)', () => {
    const cyanBold = '\u001b[1m\u001b[36m앱 알림 제목은 32자 이하로 쓴다';
    assert.ok(
      detailScreen(demoItem(), 1, 1, { now: SAME_DAY }).includes(cyanBold),
    );
  });

  it('2건 이상이면 위 선 머리표에 반전 칩을 붙이고, 두 번째부터는 남은 건수를 보여 준다', () => {
    const lines = plain(detailScreen(demoItem(), 2, 3, { now: SAME_DAY }));
    assert.match(
      lines[1] ?? '',
      /^-- {2}2\/3 {2}확인할 변경이 2건 남았어요 -+$/,
    );
  });

  it('"결정 사항 확인"으로 다시 부르면 "작업 전에"를 뺀다', () => {
    const lines = plain(
      detailScreen(demoItem(), 1, 1, { now: SAME_DAY, recall: true }),
    );
    assert.match(lines[1] ?? '', /^-- 확인할 변경이 1건 있어요 -+$/);
  });

  it('오늘이 아니면 날짜를 함께 쓴다', () => {
    assert.equal(
      formatWhen('2026-10-13T05:13:00Z', '2026-10-14T01:00:00Z'),
      '10월 13일 오후 2:13',
    );
  });

  it('새로 생긴 결정 사항은 (신규) 태그와 상세만 보여 준다', () => {
    const item = demoItem();
    item.standard = {
      ...item.standard,
      previousValue: null,
      previousVersion: null,
    };
    const lines = plain(detailScreen(item, 1, 1, { now: SAME_DAY }));
    assert.equal(lines[2], '[app] 앱 알림 제목은 32자 이하로 쓴다 (신규)');
    assert.equal(lines[4], '  상세  공백 포함 32자 이하');
    assert.equal(lines[5], '');
  });

  it('되돌림은 (되돌림)을 회색 글자색으로 붙인다 (notify.revert.mark-by-screen, 임시 회색)', () => {
    const item = demoItem();
    item.standard = { ...item.standard, isRevert: true };
    const text = detailScreen(item, 1, 1, { now: SAME_DAY });
    assert.match(plain(text)[2] ?? '', /\(되돌림\)$/);
    const grayRevert = '\u001b[90m (되돌림)\u001b[39m';
    assert.ok(text.includes(grayRevert), '회색(90) 글자색이 아니에요');
  });

  it('(변경)과 (신규)는 흐린 글자다', () => {
    const dimChange = '\u001b[2m (변경)\u001b[22m';
    assert.ok(
      detailScreen(demoItem(), 1, 1, { now: SAME_DAY }).includes(dimChange),
    );
    const item = demoItem();
    item.standard = {
      ...item.standard,
      previousValue: null,
      previousVersion: null,
    };
    const dimNew = '\u001b[2m (신규)\u001b[22m';
    assert.ok(detailScreen(item, 1, 1, { now: SAME_DAY }).includes(dimNew));
  });

  it('지운 말과 넣은 말은 따옴표로 보여 준다', () => {
    const removed = demoItem();
    removed.standard = {
      ...removed.standard,
      previousValue:
        '변경마다 기준 제목, 이전 값, 지금 값, 이유, 근거, 바꾼 사람을 보여 준다',
      value:
        '변경마다 기준 제목, 이전 값, 지금 값, 이유, 바꾼 사람을 보여 준다',
    };
    assert.equal(
      plain(detailScreen(removed, 1, 1, { now: SAME_DAY }))[4],
      '  변경  "근거," 삭제',
    );
  });

  it('크게 바뀌면 이전 값 한 줄과 상세(지금 값)를 보여 준다', () => {
    const item = demoItem();
    item.standard = {
      ...item.standard,
      previousValue: '데스크톱 앱은 Electron으로 만든다',
      value: '앱은 웹 앱으로 만들고 PWA로 설치할 수 있게 한다',
    };
    const lines = plain(detailScreen(item, 1, 1, { now: SAME_DAY }));
    assert.equal(lines[4], '  이전  데스크톱 앱은 Electron으로 만든다');
    assert.equal(
      lines[5],
      '  상세  앱은 웹 앱으로 만들고 PWA로 설치할 수 있게 한다',
    );
  });

  it('긴 상세는 두 줄까지 접고, 넘치면 끝을 줄인다', () => {
    const item = demoItem();
    item.standard = {
      ...item.standard,
      previousValue: '짧은 값',
      value: Array.from({ length: 40 }, (_, i) => `낱말${i}`).join(' '),
    };
    const text = detailScreen(item, 1, 1, { now: SAME_DAY });
    assertFits(text);
    const lines = plain(text);
    assert.match(lines[5] ?? '', /^ {2}상세 {2}낱말0 /);
    assert.match(lines[6] ?? '', /^ {8}낱말\d+ .*…$/);
    assert.equal(lines[7], '');
  });

  it('이전 버전에 관계있다고 답했으면 빈 줄 자리에 "다시 고쳐야 해요"를 넣는다 (SIL-77)', () => {
    const item = demoItem({
      previousAnswer: {
        version: 2,
        affected: true,
        known: false,
        answeredAt: SAME_DAY,
      },
    });
    item.standard = {
      ...item.standard,
      previousValue: '공백 포함 32자 이하',
      value: '공백 포함 30자 이하',
    };
    const lines = plain(detailScreen(item, 1, 1, { now: SAME_DAY }));
    assert.equal(lines[4], '  변경  32자 ⭢ 30자');
    assert.equal(
      lines[6],
      '        지난번 변경(32자)을 반영하셨다면 다시 고쳐야 해요.',
    );
  });

  it('완료된 이슈는 [완료]를 붙이고, PR에서 찾은 변경은 출처를 그렇게 쓴다', () => {
    const item = demoItem({
      issue: {
        key: '#7',
        title: '앱 알림과 나에게 온 변경 화면',
        status: 'done',
      },
    });
    item.standard = { ...item.standard, source: 'code', aiDetected: true };
    const lines = plain(detailScreen(item, 1, 1, { now: SAME_DAY }));
    assert.equal(lines[8], '  이슈  #7 앱 알림과 나에게 온 변경 화면 [완료]');
    assert.equal(lines[9], '  출처  PR · AI가 찾음');
  });

  it('긴 제목과 이유는 76칸 안에서 끝을 줄인다', () => {
    const item = demoItem();
    item.standard = {
      ...item.standard,
      title:
        '같은 이슈에 확인하지 않은 이전 버전이 있으면 새 버전으로 대체하고 남은 것은 닫는다',
      reason: '가'.repeat(120),
    };
    const text = detailScreen(item, 1, 2, { now: SAME_DAY });
    assertFits(text);
    assert.match(plain(text)[2] ?? '', /… \(변경\)$/);
  });

  it('Claude Code 머리줄을 더해도 15줄 안에 들어간다 (착수 안내 T3)', () => {
    const item = demoItem();
    item.standard = {
      ...item.standard,
      previousValue: '데스크톱 앱은 Electron으로 만든다',
      value: '앱은 웹 앱으로 만들고 PWA로 설치할 수 있게 한다',
    };
    const lines = plain(detailScreen(item, 1, 2, { now: SAME_DAY }));
    assert.ok(lines.length + 1 <= 15, `${lines.length + 1}줄이에요`);
  });
});

describe('답한 뒤 (T4·T5)', () => {
  it('"✓ 기록했어요"는 통째로 초록이다 (v2)', () => {
    const [first] = recordedLines(demoItem(), {
      affected: true,
      known: false,
      unaffectedReason: null,
    });
    assert.ok(first?.startsWith('\u001b[32m✓ 기록했어요\u001b[39m'));
  });

  it('관계있다면 기록 줄과 "다음 작업부터 따라요"', () => {
    assert.deepEqual(
      recordedLines(demoItem(), {
        affected: true,
        known: false,
        unaffectedReason: null,
      }).map(stripAnsi),
      [
        '✓ 기록했어요  #5 · 관계있다 · 몰랐다',
        '  다음 작업부터 바뀐 결정 사항을 따라요.',
      ],
    );
  });

  it('관계없다면 이유를 보여 주고 둘째 줄은 없다', () => {
    assert.deepEqual(
      recordedLines(demoItem(), {
        affected: false,
        known: null,
        unaffectedReason: '내 작업 범위가 아니에요',
      }).map(stripAnsi),
      ['✓ 기록했어요  #5 · 관계없다 · 내 작업 범위가 아니에요'],
    );
  });

  it('마무리 한 줄: 1건이면 숫자를 빼고, 다시 부른 경우는 작업을 시작하지 않는다', () => {
    assert.equal(
      stripAnsi(allAnsweredLine(1, false)),
      '확인할 변경을 모두 답했어요. 이제 작업을 시작할게요.',
    );
    assert.equal(
      stripAnsi(allAnsweredLine(3, true)),
      '확인할 변경 3건을 모두 답했어요.',
    );
  });

  it('닫고 넘어간 뒤 알림, 0건, 자동 닫힘 한 줄', () => {
    assert.equal(
      plain(skippedReminder(2))[1],
      '  확인할 변경 2건 · "결정 사항 확인"을 입력하면 변경 내역을 볼 수 있어요.',
    );
    assert.equal(plain(nothingLeft())[1], '✓ 확인할 변경이 없어요.');
    assert.equal(
      stripAnsi(autoClosedLine('#5')),
      '✓ #5 변경이 되돌려졌어요. 하려던 작업을 계속 진행하시면 돼요.',
    );
  });

  it('연결에 실패하면 실패와 다시 시작하는 방법을 알린다 (SIL-80 B4)', () => {
    assert.deepEqual(plain(connectionFailedNotice()), [
      '',
      '  서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.',
      '  "결정 사항 확인"을 입력하면 다시 시작해요.',
    ]);
  });

  it('잘 모르겠다로 남긴 변경이 있으면 "모두" 없이 답한 건수만 말한다 (notify.answer.unsure-later)', () => {
    assert.equal(
      stripAnsi(allAnsweredLine(4, false, 3)),
      '확인할 변경 3건을 답했어요. 이제 작업을 시작할게요.',
    );
    assert.equal(
      stripAnsi(unsureLine()),
      '  나중에 답할 수 있게 남겨 두었어요. "결정 사항 확인"으로 다시 볼 수 있어요.',
    );
    assertFits(unsureLine());
  });

  it('"결정 사항 확인"만 입력했을 때만 다시 부른 것으로 본다', () => {
    assert.equal(isRecall('결정 사항 확인'), true);
    assert.equal(isRecall(' 결정 사항 확인. '), true);
    assert.equal(isRecall('결정 사항 확인하고 로그인 고쳐 줘'), false);
  });
});

describe('질문', () => {
  it('이름표는 이슈 번호이고, 관계없다 이유 보기는 3개다', () => {
    const q = questionsFor(demoItem());
    assert.equal(q.relation.header, '#5');
    assert.deepEqual(
      q.relation.options.map((o) => o.label),
      ['관계있다', '관계없다', '잘 모르겠다'],
    );
    assert.deepEqual(
      q.known.options.map((o) => o.label),
      ['알았다', '몰랐다'],
    );
    assert.equal(q.reason.options.length, 3);
  });
});

describe('이슈 반영 (SIL-93, 부건님 10/15 시안)', () => {
  /** 관계있다로 답한 변경 n개 (#1 … #n) */
  function answeredItems(count: number): PendingItem[] {
    return Array.from({ length: count }, (_, i) =>
      demoItem({
        pendingCheckId: `c-${i + 1}`,
        status: 'answered',
        issue: {
          key: `#${i + 1}`,
          title: `이슈 ${i + 1}`,
          status: 'in_progress',
        },
        answer: {
          affected: true,
          known: false,
          unaffectedReason: null,
          channel: 'terminal',
          answeredAt: SAME_DAY,
        },
      }),
    );
  }

  it('입력 전체가 "이슈 반영"일 때만 부른 것으로 본다', () => {
    assert.equal(isReflectPrompt('이슈 반영'), true);
    assert.equal(isReflectPrompt(' 이슈 반영! '), true);
    assert.equal(isReflectPrompt('이슈 반영이 안 됐는데?'), false);
  });

  it('관계있다로 답했고 아직 표시하지 않은 변경만 고른다', () => {
    const [affected, other] = answeredItems(2);
    const unaffected = {
      ...other!,
      answer: { ...other!.answer!, affected: false },
    };
    const done = { ...affected!, pendingCheckId: 'c-9', reflected: true };
    const pending = demoItem();
    assert.deepEqual(
      reflectableItems([affected!, unaffected, done, pending]).map(
        (i) => i.pendingCheckId,
      ),
      ['c-1'],
    );
  });

  it('목록은 위아래 선 안에 제목 · 바뀐 것 · 이슈 세 줄씩이고, 여러 건이면 Esc 안내를 붙인다', () => {
    const text = reflectScreen(answeredItems(2));
    assertFits(text);
    const lines = plain(text);
    assert.match(lines[1] ?? '', /^-- 관계있다로 답한 변경이 2건 있어요 -+$/);
    assert.deepEqual(lines.slice(2, 5), [
      '[app] 앱 알림 제목은 32자 이하로 쓴다 (변경)',
      '  변경  40자 ⭢ 32자',
      '  이슈  #1 이슈 1',
    ]);
    assert.equal(lines[8], '-'.repeat(COLS));
    assert.equal(
      lines[9],
      '  반영한 변경이 하나도 없으면 Esc를 눌러 닫아 주세요.',
    );
    assert.equal(plain(reflectScreen(answeredItems(1))).length, 6);
  });

  it('한 건은 예/아니오로 묻고, 이름표는 이슈 번호다', () => {
    const [question] = reflectQuestionsFor(answeredItems(1));
    assert.deepEqual(
      {
        question: question?.question,
        header: question?.header,
        multiSelect: question?.multiSelect,
      },
      {
        question: '이 변경을 이슈에 반영했나요?',
        header: '#1',
        multiSelect: false,
      },
    );
    assert.deepEqual(
      question?.options.map((o) => o.label),
      ['이슈에 반영했어요', '아직 안 했어요'],
    );
  });

  it('여러 건은 여러 개 고르기이고, 보기 설명은 종류와 바뀐 것이다', () => {
    const questions = reflectQuestionsFor(answeredItems(3));
    assert.equal(questions.length, 1);
    assert.deepEqual(
      { header: questions[0]?.header, multiSelect: questions[0]?.multiSelect },
      { header: '이슈 반영', multiSelect: true },
    );
    assert.deepEqual(questions[0]?.options[0], {
      label: '#1 앱 알림 제목은 32자 이하로 쓴다',
      description: '변경 · 40자 ⭢ 32자',
      pendingCheckId: 'c-1',
    });
  });

  it('5건부터는 질문을 고르게 나눠 탭으로 띄우고, 16건까지만 묻는다', () => {
    assert.deepEqual(reflectGroups(4), [4]);
    assert.deepEqual(reflectGroups(5), [3, 2]);
    assert.deepEqual(reflectGroups(9), [3, 3, 3]);
    assert.deepEqual(reflectGroups(20), [4, 4, 4, 4]);
    const questions = reflectQuestionsFor(answeredItems(5));
    assert.deepEqual(
      questions.map((q) => [q.question, q.header, q.options.length]),
      [
        ['어느 변경을 이슈에 반영했나요? (1/2)', '이슈 반영 1/2', 3],
        ['어느 변경을 이슈에 반영했나요? (2/2)', '이슈 반영 2/2', 2],
      ],
    );
  });

  it('표시한 뒤 한 줄, 없을 때, 안내 한 줄', () => {
    assert.equal(
      stripAnsi(reflectedLine(answeredItems(1)[0]!)),
      '✓ 이슈에 반영했어요  #1 · 앱 알림 제목은 32자 이하로 쓴다',
    );
    assert.deepEqual(plain(nothingToReflect()), [
      '',
      '✓ 이슈 반영할 변경이 없어요.',
      '  관계있다로 답한 변경만 이슈 반영으로 등록할 수 있어요.',
    ]);
    assert.equal(
      plain(reflectReminder())[1],
      '  확인한 결정 사항을 이슈에도 반영했다면, "이슈 반영"을 입력해 주세요.',
    );
  });
});
