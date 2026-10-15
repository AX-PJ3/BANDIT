/**
 * A3 상세와 답하기, A4 답한 뒤 화면이에요.
 *
 * - 답: 관계있다/관계없다 → 알았다/몰랐다 또는 관계없는 이유(100자). 관계없다면 known을 보내지 않아요.
 * - 답할 때 에러: PENDING_CLOSED는 에러 없이 조용히 닫고(notify.answer.one-place), FORBIDDEN이면 답하기 버튼을 숨기고,
 *   VALIDATION_FAILED는 입력란 옆에 보여 줘요 (타입명세서 11-4).
 * - 진행 단계는 새 변경 → 확인 완료 → 작업 반영 세 개예요 (app.card.three-steps).
 * - "작업 반영했어요"는 "관계있다"로 답한 카드에만, 답한 뒤에만 켜요. 풀어도 이슈를 다시 열지 않아요 (notify.check.reflected).
 */
import { isSilError, MAX_UNAFFECTED_REASON_LENGTH } from '@sil/core';
import { useRef, useState } from 'react';
import { api } from '../../api/index.ts';
import type { MyChange } from '../../api/types.ts';
import { ChangeBadges, StatusChip } from './Badges.tsx';
import {
  findReplacingVersion,
  formatTime,
  needsRework,
  supersededText,
} from './format.ts';

/**
 * 질문과 보기 문구는 터미널(@sil/notify terminal/questions.ts)과 같아요 (notify.answer.two-questions).
 * SIL-100으로 웹에서 @sil/notify를 쓸 수 있게 되면 그 파일에서 가져와요.
 */
const QUESTIONS = {
  relation: '이 변경이 내 이슈와 관계가 있나요?',
  known: '이 변경을 이미 알고 있었나요?',
  reason: '왜 관계가 없나요?',
};
const UNAFFECTED_REASONS = [
  '내 작업 범위가 아니에요',
  '내 이슈와 연결이 잘못됐어요',
  '바뀐 부분은 내 작업에 안 쓰여요',
];

export function ChangeDetail(props: {
  me: string;
  change: MyChange;
  all: MyChange[];
  onBack: () => void;
  /** 답이나 반영함을 저장한 뒤 목록을 다시 불러요 */
  onSaved: () => Promise<void>;
  /** 이미 닫힌 변경(PENDING_CLOSED)이라 조용히 닫을 때 */
  onClosedElsewhere: () => void;
}) {
  const { change } = props;
  const { standard } = change;

  return (
    <section className="detail">
      <button className="back" onClick={props.onBack}>
        ‹ 목록으로
      </button>

      <header className="detail-header">
        <div className="card-title">
          <h1>{standard.title}</h1>
          <ChangeBadges change={change} />
        </div>
        <p className="muted">
          결정 사항 ID {standard.id} · v{standard.version} ·{' '}
          {standard.changedBy ?? '모름'} · {formatTime(standard.changedAt)}
        </p>
      </header>

      <div className="panel">
        <div className="row">
          <span className="row-label">내 이슈</span>
          <span>
            {change.issue.key} {change.issue.title}
            {change.issue.status === 'done' && (
              <span className="muted"> (완료)</span>
            )}
          </span>
          <StatusChip change={change} />
        </div>
        <div className="row">
          <span className="row-label">이유</span>
          <span>{standard.reason}</span>
        </div>
      </div>

      <div className="values">
        <div className="value-box">
          <span className="value-label">
            {standard.previousValue === null
              ? '이전 값'
              : `이전 값 (v${standard.previousVersion})`}
          </span>
          <p>
            {standard.previousValue ?? '이전 값이 없어요 · 새 결정 사항이에요'}
          </p>
        </div>
        <div className="value-box current">
          <span className="value-label">지금 값 (v{standard.version})</span>
          <p>{standard.value}</p>
        </div>
      </div>

      {change.status === 'pending' && needsRework(change) && (
        <p className="notice">지난번 변경을 반영하셨다면 다시 고쳐야 해요</p>
      )}

      {change.status === 'pending' && (
        <AnswerForm
          me={props.me}
          change={change}
          onSaved={props.onSaved}
          onClosedElsewhere={props.onClosedElsewhere}
        />
      )}
      {change.status === 'superseded' && (
        <div className="panel">
          <p>{supersededText(findReplacingVersion(change, props.all))}</p>
          <p className="muted">
            답하기 전에 같은 결정 사항이 또 바뀌었어요. 이 변경에는 답하지
            않아도 되고, 새 버전을 확인해 주세요.
          </p>
        </div>
      )}
      {change.answer && <MyAnswer change={change} />}
      {change.answer?.affected && (
        <ReflectedCheck me={props.me} change={change} onSaved={props.onSaved} />
      )}

      <ProgressSteps change={change} />
    </section>
  );
}

function AnswerForm(props: {
  me: string;
  change: MyChange;
  onSaved: () => Promise<void>;
  onClosedElsewhere: () => void;
}) {
  const openedAt = useRef(Date.now());
  const [affected, setAffected] = useState<boolean | null>(null);
  const [known, setKnown] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const reasonLength = [...reason.trim()].length;
  const isReasonTooLong = reasonLength > MAX_UNAFFECTED_REASON_LENGTH;
  /** 길이를 넘으면 보내기 전에 바로 알려 줘요. 비었다는 문구는 보내려 할 때 보여 줘요 */
  const shownReasonError = isReasonTooLong
    ? `관계없는 이유는 ${MAX_UNAFFECTED_REASON_LENGTH}자 이하로 적어 주세요.`
    : reasonError;
  const isReady =
    affected === true
      ? known !== null
      : affected === false
        ? // 비어 있으면 눌렀을 때 입력란 옆에 이유를 알려 줘요
          !isReasonTooLong
        : false;

  const submit = async () => {
    if (affected === null) return;
    if (affected === false && (reasonLength === 0 || isReasonTooLong)) {
      if (reasonLength === 0) setReasonError('관계없는 이유를 적어 주세요.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      await api.answer(props.me, {
        pendingCheckId: props.change.pendingCheckId,
        affected,
        ...(affected ? { known } : { unaffectedReason: reason.trim() }),
        elapsedSeconds: Math.round((Date.now() - openedAt.current) / 1000),
      });
      await props.onSaved();
    } catch (error: unknown) {
      if (isSilError(error) && error.code === 'PENDING_CLOSED') {
        props.onClosedElsewhere();
        return;
      }
      if (isSilError(error) && error.code === 'FORBIDDEN') {
        setIsForbidden(true);
      } else if (isSilError(error) && error.code === 'VALIDATION_FAILED') {
        if (affected === false) setReasonError(error.message);
        else setFormError(error.message);
      } else {
        setFormError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isForbidden) {
    return (
      <div className="panel">
        <p className="error">
          이 변경을 받은 사람만 답할 수 있어요. 주소의 ?me= 이름을 확인해
          주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="panel answer">
      <h2 className="panel-title">지금 해야 할 일</h2>
      <p className="question">{QUESTIONS.relation}</p>
      <div className="choices">
        <ChoiceButton
          isSelected={affected === true}
          label="관계있다"
          description="내 이슈 결과물이 이 변경에 맞춰 바뀌어야 해요"
          onClick={() => {
            setAffected(true);
            setReasonError(null);
          }}
        />
        <ChoiceButton
          isSelected={affected === false}
          label="관계없다"
          description="내 이슈와는 상관없는 변경이에요"
          onClick={() => {
            setAffected(false);
            setKnown(null);
          }}
        />
      </div>

      {affected === true && (
        <>
          <p className="question">{QUESTIONS.known}</p>
          <div className="choices">
            <ChoiceButton
              isSelected={known === true}
              label="알았다"
              description="오늘 알림을 보기 전에 알고 있었어요"
              onClick={() => setKnown(true)}
            />
            <ChoiceButton
              isSelected={known === false}
              label="몰랐다"
              description="오늘 알림으로 처음 알았어요"
              onClick={() => setKnown(false)}
            />
          </div>
        </>
      )}

      {affected === false && (
        <>
          <p className="question">{QUESTIONS.reason}</p>
          <div className="reason-picks">
            {UNAFFECTED_REASONS.map((text) => (
              <button
                key={text}
                className={reason === text ? 'pick selected' : 'pick'}
                onClick={() => {
                  setReason(text);
                  setReasonError(null);
                }}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="reason-field">
            <input
              className={shownReasonError ? 'input invalid' : 'input'}
              value={reason}
              placeholder="직접 적어도 돼요 (한 줄)"
              aria-label="관계없는 이유"
              aria-invalid={shownReasonError !== null}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
            />
            <span className={isReasonTooLong ? 'counter error' : 'counter'}>
              {reasonLength}/{MAX_UNAFFECTED_REASON_LENGTH}
            </span>
          </div>
          {shownReasonError && <p className="error">{shownReasonError}</p>}
        </>
      )}

      {formError && <p className="error">{formError}</p>}
      <button
        className="button primary wide"
        disabled={!isReady || isSaving}
        onClick={() => void submit()}
      >
        {isSaving ? '보내는 중' : '답 보내기'}
      </button>
    </div>
  );
}

function ChoiceButton(props: {
  isSelected: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      className={props.isSelected ? 'choice selected' : 'choice'}
      aria-pressed={props.isSelected}
      onClick={props.onClick}
    >
      <strong>{props.label}</strong>
      <span>{props.description}</span>
    </button>
  );
}

const CHANNEL_LABELS = { terminal: '터미널', app: '앱' } as const;

function MyAnswer(props: { change: MyChange }) {
  const answer = props.change.answer;
  if (!answer) return null;
  const summary = answer.affected
    ? `관계있다 · ${answer.known ? '알았다' : '몰랐다'}`
    : `관계없다 · ${answer.unaffectedReason ?? ''}`;
  return (
    <div className="panel">
      <h2 className="panel-title">내 답</h2>
      <p>{summary}</p>
      <p className="muted">
        답한 시각 {formatTime(answer.answeredAt)} ·{' '}
        {CHANNEL_LABELS[answer.channel]}에서 답함
      </p>
    </div>
  );
}

function ReflectedCheck(props: {
  me: string;
  change: MyChange;
  onSaved: () => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (reflected: boolean) => {
    setIsSaving(true);
    setError(null);
    try {
      await api.markReflected(props.me, props.change.pendingCheckId, reflected);
      await props.onSaved();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="panel">
      <label className="reflected">
        <input
          type="checkbox"
          checked={props.change.reflected}
          disabled={isSaving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        작업 반영했어요
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ProgressSteps(props: { change: MyChange }) {
  const steps = [
    { label: '새 변경', at: props.change.createdAt },
    { label: '확인 완료', at: props.change.answer?.answeredAt ?? null },
    { label: '작업 반영', at: props.change.reflectedAt },
  ];
  const reached = steps.findLastIndex((step) => step.at !== null);
  return (
    <div className="panel">
      <h2 className="panel-title">진행 상황</h2>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.label} className={index <= reached ? 'done' : ''}>
            <span className="step-dot" />
            <span>{step.label}</span>
            <span className="muted">{step.at ? formatTime(step.at) : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
