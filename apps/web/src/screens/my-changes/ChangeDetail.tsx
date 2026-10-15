/**
 * A3 상세와 답하기, A4 답한 뒤 화면이에요. 배치·여백·글자는 프로토타입(SIL-69)의 변경 상세와 같아요.
 *
 * - 답: 관계있다/관계없다 → 알았다/몰랐다(누르면 바로 저장) 또는 관계없는 이유(100자). 관계없다면 known을 보내지 않아요.
 * - 답할 때 에러: PENDING_CLOSED는 에러 없이 조용히 닫고(notify.answer.one-place), FORBIDDEN이면 답하기를 숨기고,
 *   VALIDATION_FAILED는 입력란 아래에 보여 줘요 (타입명세서 11-4).
 * - 진행 단계는 새 변경 → 확인 완료 → 작업 반영 세 개예요 (app.card.three-steps).
 * - "작업 반영했어요"는 "관계있다"로 답한 카드에만, 답한 뒤에만 켜요. 풀어도 이슈를 다시 열지 않아요 (notify.check.reflected).
 */
import { isSilError, MAX_UNAFFECTED_REASON_LENGTH } from '@sil/core';
import { useRef, useState, type CSSProperties } from 'react';
import { api } from '../../api/index.ts';
import type { MyChange } from '../../api/types.ts';
import { CheckIcon, InfoIcon } from '../../ui/icons.tsx';
import {
  Button,
  C,
  Chip,
  Pill,
  ProgressSteps,
  SectionTitle,
  Text,
  TextArea,
  TextButton,
} from '../../ui/tds.tsx';
import { KindChips, SourceChips, StatusChip, statusLabel } from './Badges.tsx';
import { groupByIssue } from './ChangeList.tsx';
import {
  findReplacingVersion,
  formatTime,
  isNewStandard,
  needsRework,
} from './format.ts';

/**
 * 질문 문구는 터미널(@sil/notify terminal/questions.ts)과 같아요 (notify.answer.two-questions).
 * 그 파일이 브라우저 입구(@sil/notify/browser)에 들어오면 거기서 가져와요.
 */
const QUESTIONS = {
  relation: '이 변경이 내 이슈와 관계가 있나요?',
  known: '이 변경을 이미 알고 있었나요?',
};
const REWORK_NOTICE = '지난번 변경을 반영하셨다면 다시 고쳐야 해요';

const STEPS = ['새 변경', '확인 완료', '작업 반영'];
const STEP_DESCRIPTIONS = [
  '아직 확인하지 않은 변경이에요.',
  '담당자가 변경사항을 확인했다고 답한 상태예요.',
  '실제 작업에 반영한 상태예요.',
];

/** 고르지 않은 큰 버튼 / 고른 큰 버튼 (프로토타입 값 그대로) */
const UNSELECTED_BUTTON: CSSProperties = {
  background: 'rgba(222, 222, 255, 0.30)',
  color: '#FFFFFF',
  fontSize: 15,
};
const SELECTED_BUTTON: CSSProperties = { fontSize: 15 };

export function ChangeDetail(props: {
  me: string;
  change: MyChange;
  all: MyChange[];
  onBack: () => void;
  onOpen: (pendingCheckId: string) => void;
  /** 답이나 반영함을 저장한 뒤 목록을 다시 불러요 */
  onSaved: () => Promise<void>;
  onToast: (text: string) => void;
  /** 이미 닫힌 변경(PENDING_CLOSED)이라 조용히 닫을 때 */
  onClosedElsewhere: () => void;
}) {
  const { change } = props;
  const { standard } = change;
  const isSuperseded = change.status === 'superseded';
  const replacingVersion = findReplacingVersion(change, props.all);
  const replacing = props.all.find(
    (item) =>
      item.standard.id === standard.id &&
      item.issue.key === change.issue.key &&
      item.standard.version === replacingVersion,
  );
  const nextPending = props.all.find(
    (item) =>
      item.status === 'pending' &&
      item.pendingCheckId !== change.pendingCheckId,
  );
  const currentStep = change.reflected ? 2 : change.answer ? 1 : 0;

  return (
    <div style={{ padding: '36px 35px 56px' }}>
      <PeerTabs
        change={change}
        all={props.all}
        onBack={props.onBack}
        onOpen={props.onOpen}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          minWidth: 0,
          minHeight: 30,
        }}
      >
        <Text typography="t5" fontWeight="bold" color={C.grey900}>
          {standard.title}
        </Text>
        <StatusChip change={change} />
        <KindChips change={change} />
        <SourceChips change={change} />
        {change.issue.status === 'done' && (
          <Chip inline tone="green">
            완료된 이슈
          </Chip>
        )}
      </div>

      {isSuperseded && (
        <div
          style={{
            background: C.grey50,
            borderRadius: 10,
            padding: '18px 20px',
            marginTop: 20,
          }}
        >
          <Text typography="t6" fontWeight="bold" color={C.grey800}>
            {replacingVersion === null
              ? '새 버전으로 대체됐어요'
              : `새 버전(v${replacingVersion})으로 대체됐어요`}
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text typography="t7" color={C.grey600}>
              답하기 전에 결정이 또 바뀌었어요. 이 변경에는 답하지 않아도 되고,
              새 버전을 확인해주세요.
            </Text>
          </div>
        </div>
      )}

      <IssueCard change={change} />

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {isNewStandard(change) ? (
          <ValueBox
            label="새로 생긴 결정"
            value={`${standard.value} (v${standard.version})`}
            isAfter
          />
        ) : (
          <>
            <ValueBox
              label="변경 전"
              value={`${standard.previousValue} (v${standard.previousVersion})`}
            />
            <ValueBox
              label="확정된 결과"
              value={`${standard.value} (v${standard.version})`}
              isAfter
            />
          </>
        )}
      </div>

      {isSuperseded ? (
        replacing && (
          <>
            <SectionTitle bottom={0} description="새 버전에 답해 주세요.">
              지금 해야 할 일
            </SectionTitle>
            <div style={{ marginTop: 16 }}>
              <Button
                size="large"
                isBlock
                onClick={() => props.onOpen(replacing.pendingCheckId)}
              >
                새 버전 v{replacingVersion} 보러 가기
              </Button>
            </div>
          </>
        )
      ) : change.answer ? (
        <>
          <SectionTitle bottom={0}>내 답변</SectionTitle>
          <AnsweredBox
            me={props.me}
            change={change}
            onSaved={props.onSaved}
            onToast={props.onToast}
            onNext={
              nextPending
                ? () => props.onOpen(nextPending.pendingCheckId)
                : undefined
            }
          />
        </>
      ) : (
        <>
          <SectionTitle
            bottom={0}
            description="내 작업이 바뀐 값에 영향을 받는지 답해주세요."
            right={needsRework(change) ? <ReworkNotice /> : undefined}
          >
            지금 해야 할 일
          </SectionTitle>
          <AnswerForm
            me={props.me}
            change={change}
            onSaved={props.onSaved}
            onToast={props.onToast}
            onClosedElsewhere={props.onClosedElsewhere}
          />
        </>
      )}

      {!isSuperseded && (
        <>
          <SectionTitle
            description="변경이 어디까지 처리됐는지 단계별로 보여줘요."
            bottom={20}
          >
            현재 상태
          </SectionTitle>
          <ProgressSteps
            steps={STEPS}
            current={currentStep}
            description={STEP_DESCRIPTIONS[currentStep]!}
          />
        </>
      )}
    </div>
  );
}

/** 맨 위: 목록으로 · 이슈 탭 · (같은 이슈에 버전이 여럿이면) 버전 탭 */
function PeerTabs(props: {
  change: MyChange;
  all: MyChange[];
  onBack: () => void;
  onOpen: (pendingCheckId: string) => void;
}) {
  const groups = groupByIssue(props.all);
  const currentGroup = groups.find((group) =>
    group.some((item) => item.pendingCheckId === props.change.pendingCheckId),
  );
  const versions =
    currentGroup && currentGroup.length > 1 ? currentGroup : null;
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: versions ? 12 : 20,
          minWidth: 0,
        }}
      >
        <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          <TextButton size="xsmall" color={C.blue500} onClick={props.onBack}>
            ‹ 목록으로
          </TextButton>
        </div>
        <div
          style={{
            width: 1,
            height: 20,
            background: C.grey200,
            flexShrink: 0,
          }}
        />
        <div
          role="tablist"
          aria-label="나에게 온 변경"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 8,
            overflowX: 'auto',
            padding: '6px 8px 4px 0',
          }}
        >
          {groups.map((group) => {
            const first = group[0]!;
            const isActive = group === currentGroup;
            const target =
              group.find((item) => item.status === 'pending') ?? first;
            const hasPending = group.some((item) => item.status === 'pending');
            return (
              <button
                key={first.issue.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`이슈 ${first.issue.key} ${first.standard.title} (${statusLabel(first)})`}
                title={`${first.standard.title} · ${statusLabel(first)}`}
                onClick={() => !isActive && props.onOpen(target.pendingCheckId)}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  display: 'inline-flex',
                  border: 0,
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
              >
                <Pill isActive={isActive}>이슈 {first.issue.key}</Pill>
                {hasPending && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 0.2,
                      right: 0.2,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      background: C.red500,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {versions && (
        <div
          role="tablist"
          aria-label="이 이슈의 버전"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <Text typography="st12" color={C.grey500}>
            버전
          </Text>
          {versions.map((item) => {
            const isActive =
              item.pendingCheckId === props.change.pendingCheckId;
            return (
              <button
                key={item.pendingCheckId}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`v${item.standard.version} (${statusLabel(item)})`}
                onClick={() => !isActive && props.onOpen(item.pendingCheckId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 0,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: isActive ? C.blue50 : C.grey100,
                  lineHeight: 1,
                }}
              >
                <Text
                  typography="st12"
                  fontWeight={isActive ? 'bold' : 'medium'}
                  color={isActive ? C.blue700 : C.grey600}
                >
                  v{item.standard.version}
                </Text>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** 내 이슈 한 줄 (프로토타입의 작업 카드 자리. 작업 코드·다른 사람 작업은 그리지 않아요, SIL-91) */
function IssueCard(props: { change: MyChange }) {
  const { change } = props;
  const answer = change.answer;
  return (
    <div
      style={{
        marginTop: 20,
        border: `1px solid ${C.grey200}`,
        borderRadius: 16,
        padding: '0 22px',
        background: C.background,
      }}
    >
      <div
        style={{
          padding: '20px 0',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}
      >
        <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
          <CheckIcon
            isDone={answer !== null}
            label={answer ? '내가 답했어요' : '아직 답하지 않았어요'}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              whiteSpace: 'nowrap',
              minHeight: 24,
            }}
          >
            <Text typography="t7" fontWeight="bold" color={C.grey900}>
              {change.issue.key}
            </Text>
            <Text typography="t7" color={C.grey400}>
              |
            </Text>
            <Text typography="t7" color={C.grey600}>
              내 이슈
            </Text>
            <Text typography="t7" color={C.grey500}>
              · 결정 사항 ID {change.standard.id}
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text typography="st10" fontWeight="medium" color={C.grey900}>
                {change.issue.title}
              </Text>
            </div>
            <div
              style={{
                flexShrink: 0,
                margin: '-4px 0',
                display: 'flex',
                flexWrap: 'nowrap',
                whiteSpace: 'nowrap',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <IssueStateChips change={change} />
            </div>
          </div>
          <Text typography="t7" color={C.grey600}>
            {change.standard.changedBy ?? '모름'} ·{' '}
            {formatTime(change.standard.changedAt)}
          </Text>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              marginTop: 4,
            }}
          >
            <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              <Text typography="t7" color={C.grey500}>
                바뀐 이유
              </Text>
            </div>
            <Text typography="t7" color={C.grey800}>
              {change.standard.reason}
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueStateChips(props: { change: MyChange }) {
  const { change } = props;
  if (change.status === 'pending') return <Chip tone="orange">대기</Chip>;
  if (change.status === 'superseded') return <Chip tone="gray">대체됨</Chip>;
  return (
    <>
      {change.answer?.affected && (
        <Chip tone="blue">{change.answer.known ? '알았다' : '몰랐다'}</Chip>
      )}
      {change.reflected ? (
        <Chip tone="ai">작업 반영</Chip>
      ) : (
        <Chip tone="blue">확인 완료</Chip>
      )}
    </>
  );
}

function ValueBox(props: { label: string; value: string; isAfter?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '22px 20px',
        borderRadius: 10,
        background: props.isAfter ? C.blue50 : C.grey50,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: 24 }}>
        <Text typography="st12" color={props.isAfter ? C.blue700 : C.grey600}>
          {props.label}
        </Text>
      </div>
      <Text typography="st11" fontWeight="medium" color={C.grey900}>
        {props.value}
      </Text>
    </div>
  );
}

function ReworkNotice() {
  return (
    <div
      role="note"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 10,
        background: '#FFF1E0',
        color: '#E8590C',
      }}
    >
      <InfoIcon />
      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: '19.5px' }}>
        {REWORK_NOTICE}
      </span>
    </div>
  );
}

function QuestionLabel(props: { children: string }) {
  return (
    <div style={{ margin: '16px 0 8px' }}>
      <Text typography="t7" fontWeight="bold" color={C.grey700}>
        {props.children}
      </Text>
    </div>
  );
}

function ChoiceButtons(props: {
  options: { label: string; value: boolean }[];
  selected: boolean | null;
  disabled: boolean;
  onSelect: (value: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {props.options.map((option) => {
        const isSelected = props.selected === option.value;
        return (
          <Button
            key={option.label}
            size="large"
            isBlock
            variant={isSelected ? 'fill' : 'weak'}
            style={isSelected ? SELECTED_BUTTON : UNSELECTED_BUTTON}
            disabled={props.disabled}
            aria-pressed={isSelected}
            onClick={() => props.onSelect(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function AnswerForm(props: {
  me: string;
  change: MyChange;
  onSaved: () => Promise<void>;
  onToast: (text: string) => void;
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
  /** 길이를 넘으면 보내기 전에 바로 알려 줘요 */
  const shownReasonError = isReasonTooLong
    ? `관계없는 이유는 ${MAX_UNAFFECTED_REASON_LENGTH}자 이하로 적어 주세요.`
    : reasonError;

  const submit = async (
    input: { affected: true; known: boolean } | { affected: false },
  ) => {
    if (!input.affected && (reasonLength === 0 || isReasonTooLong)) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await api.answer(props.me, {
        pendingCheckId: props.change.pendingCheckId,
        ...(input.affected
          ? { affected: true, known: input.known }
          : { affected: false, unaffectedReason: reason.trim() }),
        elapsedSeconds: Math.round((Date.now() - openedAt.current) / 1000),
      });
      await props.onSaved();
      props.onToast('답했어요. 확인할 변경 상태가 답함으로 바뀌었어요.');
    } catch (error: unknown) {
      if (isSilError(error) && error.code === 'PENDING_CLOSED') {
        props.onClosedElsewhere();
        return;
      }
      if (isSilError(error) && error.code === 'FORBIDDEN') {
        setIsForbidden(true);
      } else if (isSilError(error) && error.code === 'VALIDATION_FAILED') {
        if (input.affected) setFormError(error.message);
        else setReasonError(error.message);
      } else {
        setFormError(error instanceof Error ? error.message : String(error));
      }
      setKnown(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (isForbidden) {
    return (
      <div style={{ marginTop: 16 }}>
        <Text typography="t7" color={C.red600}>
          이 변경을 받은 사람만 답할 수 있어요. 주소의 ?me= 이름을 확인해
          주세요.
        </Text>
      </div>
    );
  }

  return (
    <div>
      <QuestionLabel>{QUESTIONS.relation}</QuestionLabel>
      <ChoiceButtons
        options={[
          { label: '관계있다', value: true },
          { label: '관계없다', value: false },
        ]}
        selected={affected}
        disabled={isSaving}
        onSelect={(value) => {
          setAffected(value);
          setReasonError(null);
          setFormError(null);
        }}
      />

      {affected === true && (
        <>
          <QuestionLabel>{QUESTIONS.known}</QuestionLabel>
          <ChoiceButtons
            options={[
              { label: '알았다', value: true },
              { label: '몰랐다', value: false },
            ]}
            selected={known}
            disabled={isSaving}
            onSelect={(value) => {
              setKnown(value);
              void submit({ affected: true, known: value });
            }}
          />
        </>
      )}

      {affected === false && (
        <div style={{ marginTop: 16 }}>
          <div style={{ margin: '0 -20px' }}>
            <TextArea
              label="관계없는 이유"
              placeholder="예: 터미널 화면만 다루는 작업이라 관계없음"
              value={reason}
              isInvalid={shownReasonError !== null}
              onChange={(value) => {
                setReason(value);
                setReasonError(null);
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
            }}
          >
            <Text
              typography="st12"
              color={isReasonTooLong ? C.red600 : C.grey500}
            >
              {reasonLength}/{MAX_UNAFFECTED_REASON_LENGTH}
            </Text>
            <Button
              size="medium"
              disabled={reasonLength === 0 || isReasonTooLong || isSaving}
              onClick={() => void submit({ affected: false })}
            >
              답하기
            </Button>
          </div>
          {shownReasonError && (
            <div style={{ marginTop: 8 }}>
              <Text typography="st12" color={C.red600}>
                {shownReasonError}
              </Text>
            </div>
          )}
        </div>
      )}

      {formError && (
        <div style={{ marginTop: 12 }}>
          <Text typography="st12" color={C.red600}>
            {formError}
          </Text>
        </div>
      )}
    </div>
  );
}

const CHANNEL_LABELS = { terminal: '터미널', app: '앱' } as const;

function AnsweredBox(props: {
  me: string;
  change: MyChange;
  onSaved: () => Promise<void>;
  onToast: (text: string) => void;
  onNext?: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = props.change.answer;
  if (!answer) return null;
  const isReflected = props.change.reflected;

  const toggleReflected = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.markReflected(
        props.me,
        props.change.pendingCheckId,
        !isReflected,
      );
      await props.onSaved();
      props.onToast(
        `내 작업 상태를 ${isReflected ? '확인 완료' : '작업 반영'}로 바꿨어요.`,
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        background: C.grey50,
        borderRadius: 10,
        padding: '18px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <Chip tone="blueFill">답함</Chip>
        <Chip tone="blueFill">{answer.affected ? '관계있다' : '관계없다'}</Chip>
        {answer.affected && (
          <Chip tone="blueFill">{answer.known ? '알았다' : '몰랐다'}</Chip>
        )}
        {answer.affected && (
          <button
            type="button"
            aria-pressed={isReflected}
            disabled={isSaving}
            onClick={() => void toggleReflected()}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 32,
              padding: '0 14px 0 10px',
              borderRadius: 10,
              border: `1px solid ${isReflected ? C.blue200 : C.grey200}`,
              background: isReflected ? C.blue50 : C.background,
              cursor: isSaving ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ pointerEvents: 'none', display: 'inline-flex' }}>
              <CheckIcon
                isDone={isReflected}
                label={isReflected ? '작업 반영함' : '작업 반영 안 함'}
              />
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                lineHeight: '19.5px',
                color: isReflected ? C.blue700 : C.grey700,
              }}
            >
              작업 반영했어요
            </span>
          </button>
        )}
      </div>
      {answer.unaffectedReason && (
        <div style={{ marginTop: 10 }}>
          <Text typography="t7" color={C.grey800}>
            {answer.unaffectedReason}
          </Text>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10 }}>
          <Text typography="st12" color={C.red600}>
            {error}
          </Text>
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
        }}
      >
        <Text typography="st12" color={C.grey500}>
          답한 시각 {formatTime(answer.answeredAt)} ·{' '}
          {CHANNEL_LABELS[answer.channel]}에서 답함
        </Text>
        {props.onNext && (
          <TextButton size="medium" hasArrow onClick={props.onNext}>
            <span style={{ fontSize: 13, fontWeight: 400, color: C.grey900 }}>
              다음 변경
            </span>
          </TextButton>
        )}
      </div>
    </div>
  );
}
