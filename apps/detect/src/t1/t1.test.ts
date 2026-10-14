import { describe, expect, it } from 'vitest';
import {
  renderT1Preview,
  renderT1Question,
  renderT1Saved,
  T1_COPY,
} from './copy.ts';
import { diffFromPending, pendingPath } from './pending.ts';
import { buildT1SaveInput } from './save-input.ts';

describe('T1 문구', () => {
  it('질문에 제목, 지금 값, 바꿀 값을 넣어요', () => {
    const question = renderT1Question({
      title: '앱 알림 제목은 40자 이하다',
      currentValue: '운영체제 알림 창에 뜨는 제목은 공백 포함 40자 이하로 쓴다',
      newValue: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
    });
    expect(question).toContain('앱 알림 제목은 40자 이하다');
    expect(question).toContain(
      '지금 값: 운영체제 알림 창에 뜨는 제목은 공백 포함 40자',
    );
    expect(question).toContain(
      '바꿀 값: 운영체제 알림 창에 뜨는 제목은 공백 포함 32자',
    );
    expect(question).not.toMatch(/\{\w+\}/);
  });

  it('③ 등록될 모습에 영역, 제목, 값, 이유, 항상 적용을 넣어요', () => {
    const preview = renderT1Preview({
      area: 'app',
      title: '앱 알림 제목은 32자 이하다',
      value: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
      reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
      alwaysOn: false,
    });
    expect(preview).toContain('[app] 앱 알림 제목은 32자 이하다');
    expect(preview).toContain('이유: Windows 알림 창에서 32자를 넘으면');
    expect(preview).toContain('항상 적용: 아니오');
    expect(preview).not.toMatch(/\{\w+\}/);
  });

  it('④ 등록 완료에 버전과 항상 적용을 넣어요', () => {
    expect(renderT1Saved({ version: 2, alwaysOn: false })).toBe(
      '✓ 결정 사항을 등록했어요 (v2) · 항상 적용 아니오',
    );
  });

  it('AskUserQuestion 이름표는 12자 이하예요', () => {
    expect(T1_COPY.ask.header.length).toBeLessThanOrEqual(12);
    expect(T1_COPY.preview.header.length).toBeLessThanOrEqual(12);
  });

  it('선택지 설명은 마침표로 끝나지 않고, Claude 글은 마침표로 끝나요', () => {
    const { ask, preview } = T1_COPY;
    const descriptions = [
      ask.yes,
      ask.no,
      preview.register,
      preview.registerWithIssues,
      preview.edit,
      preview.cancel,
    ].map((option) => option.description);
    for (const description of descriptions) {
      expect(description).not.toMatch(/\.$/);
    }
    const messages = [
      T1_COPY.notChanged,
      T1_COPY.reasonPrompt,
      T1_COPY.cancelled.withTask,
      T1_COPY.cancelled.noTask,
    ];
    for (const message of messages) {
      expect(message).toMatch(/\.$/);
    }
    expect(T1_COPY.editPrompt).toMatch(/\?$/);
  });

  it('화면 문구에 "기준" 대신 "결정 사항"을 써요 (copy.term.standard)', () => {
    expect(JSON.stringify(T1_COPY)).not.toContain('기준');
  });
});

describe('buildT1SaveInput', () => {
  it('get_standard의 currentVersion, alwaysOn, scope를 그대로 넣고 출처는 AI 대화예요', () => {
    const scope = {
      code: ['packages/app/src/notify/**'],
      api: [],
      screen: ['앱 알림'],
      doc: [],
    };
    const input = buildT1SaveInput(
      {
        id: 'app.notify.title-length',
        alwaysOn: false,
        scope,
        currentVersion: 1,
      },
      {
        title: '앱 알림 제목은 32자 이하다',
        value: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
        reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘림',
      },
    );
    expect(input).toMatchObject({
      id: 'app.notify.title-length',
      baseVersion: 1,
      alwaysOn: false,
      scope,
      source: 'ai_chat',
      aiDetected: false,
    });
  });

  it('적용 범위가 없으면(null) scope 칸을 빼요 (save_standard 도구는 null을 받지 않아요)', () => {
    const input = buildT1SaveInput(
      {
        id: 'app.notify.title-length',
        alwaysOn: false,
        scope: null,
        currentVersion: 1,
      },
      { title: '제목', value: '값', reason: '이유' },
    );
    expect('scope' in input).toBe(false);
  });
});

describe('diffFromPending', () => {
  const pending = {
    id: 'app.notify.title-length',
    title: '앱 알림 제목은 32자 이하다',
    value: '운영체제 알림 창에 뜨는 제목은 공백 포함 32자 이하로 쓴다',
    reason: 'Windows 알림 창에서 32자를 넘으면 제목 끝이 잘린다',
    alwaysOn: false,
  };

  it('③에서 보여 준 값과 같으면 빈 목록이에요', () => {
    expect(diffFromPending(pending, { ...pending, baseVersion: 1 })).toEqual(
      [],
    );
  });

  it('바뀐 칸 이름을 알려 줘요', () => {
    expect(
      diffFromPending(pending, {
        ...pending,
        reason: '다른 이유',
        alwaysOn: true,
      }),
    ).toEqual(['reason', 'alwaysOn']);
  });
});

describe('pendingPath', () => {
  it('결정 사항마다 파일을 따로 둬요', () => {
    expect(pendingPath('app.notify.title-length')).toMatch(
      /haribo-t1-pending-app\.notify\.title-length\.json$/,
    );
  });

  it('결정 사항 ID 형식이 아니면 파일을 만들지 않아요 (경로 문자 막기)', () => {
    expect(pendingPath('../../etc.passwd.x')).toBeNull();
    expect(pendingPath('App.Notify.Title')).toBeNull();
  });
});
