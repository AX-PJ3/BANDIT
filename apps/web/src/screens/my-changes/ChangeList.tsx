/**
 * A2 목록이에요. "확인할 변경"(대기)과 "확인한 변경"(답함, 대체됨) 두 상자로 나눠요.
 * 목록은 한 번 불러서 화면이 상태로 나눠요 (notify.list.one-call). "이슈 별로 보기"는 이슈 번호로 묶어요.
 * 상자·줄·글자 값은 프로토타입(SIL-69)과 같아요.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { MyChange } from '../../api/types.ts';
import { C, ListRow, Result, Text } from '../../ui/tds.tsx';
import { KindChips, SourceChips, StatusCell } from './Badges.tsx';
import {
  findReplacingVersion,
  formatTime,
  groupByIssue,
  needsRework,
  supersededText,
} from './format.ts';

export type ListView = 'all' | 'by-issue';

const OPEN_TITLE = '확인할 변경';
const CLOSED_TITLE = '확인한 변경';

const box = (borderColor: string): CSSProperties => ({
  marginTop: 18,
  border: `1px solid ${borderColor}`,
  borderRadius: 14,
  background: C.background,
  overflow: 'hidden',
});

const rowTop = (isFirst: boolean): CSSProperties => ({
  borderTop: isFirst ? 'none' : `1px solid ${C.grey100}`,
});

export function ChangeList(props: {
  changes: MyChange[];
  view: ListView;
  onOpen: (pendingCheckId: string) => void;
}) {
  if (props.changes.length === 0) return <EmptyBoxes />;
  if (props.view === 'by-issue') return <IssueGroups {...props} />;

  const open = props.changes.filter((item) => item.status === 'pending');
  const closed = props.changes.filter((item) => item.status !== 'pending');
  return (
    <>
      <div style={box(C.blue100)}>
        <BoxHeader title={OPEN_TITLE} count={open.length} />
        {open.length === 0 && (
          <div style={{ padding: '8px 0 32px' }}>
            <Result
              title={`지금 ${OPEN_TITLE}이 없어요`}
              description="새로운 변경이 감지되면 이곳에서 알려드릴게요."
            />
          </div>
        )}
        {open.map((item) => (
          <ChangeRow
            key={item.pendingCheckId}
            change={item}
            all={props.changes}
            isFirst={false}
            onOpen={props.onOpen}
          />
        ))}
      </div>
      {closed.length > 0 && (
        <div style={box(C.grey200)}>
          <BoxHeader title={CLOSED_TITLE} count={closed.length} />
          {closed.map((item, index) => (
            <ChangeRow
              key={item.pendingCheckId}
              change={item}
              all={props.changes}
              isFirst={index === 0}
              onOpen={props.onOpen}
            />
          ))}
        </div>
      )}
    </>
  );
}

function BoxHeader(props: { title: string; count: number }) {
  return (
    <div style={{ padding: '24px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Text typography="t6" fontWeight="bold" color={C.grey900}>
          {props.title}
        </Text>
        <Text typography="t6" fontWeight="bold" color={C.blue500}>
          {props.count}
        </Text>
      </div>
    </div>
  );
}

/** 받은 변경이 하나도 없을 때 (프로토타입 빈 화면) */
function EmptyBoxes() {
  const emptyBox = (
    borderColor: string,
    title: string,
    message: string,
    description: string,
  ) => (
    <div style={box(borderColor)}>
      <BoxHeader title={title} count={0} />
      <div
        style={{
          borderTop: `1px solid ${C.grey100}`,
          padding: '28px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <Text typography="st11" color={C.grey900}>
          {message}
        </Text>
        <Text typography="t7" color={C.grey700}>
          {description}
        </Text>
      </div>
    </div>
  );
  return (
    <>
      {emptyBox(
        C.blue100,
        OPEN_TITLE,
        `아직 ${OPEN_TITLE}이 없어요`,
        '새로운 변경이 감지되면 이곳에서 알려드릴게요',
      )}
      {emptyBox(
        C.grey200,
        CLOSED_TITLE,
        `아직 ${CLOSED_TITLE}이 없어요`,
        '변경에 답하면 이곳에 모여요',
      )}
    </>
  );
}

/** 이슈 별로 보기: 이슈마다 상자 하나. 답할 변경이 있는 이슈가 먼저, 상자 안은 높은 버전부터 */
function IssueGroups(props: {
  changes: MyChange[];
  onOpen: (pendingCheckId: string) => void;
}) {
  return (
    <>
      {groupByIssue(props.changes).map((group) => {
        const issue = group[0]!.issue;
        const hasPending = group.some((item) => item.status === 'pending');
        return (
          <div key={issue.key} style={box(hasPending ? C.blue100 : C.grey200)}>
            <div style={{ padding: '24px 20px 20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  minWidth: 0,
                  height: 23,
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <Text typography="t6" fontWeight="bold" color={C.grey900}>
                    이슈 {issue.key}
                  </Text>
                </div>
                <div style={ellipsis}>
                  <Text typography="t7" color={C.grey600}>
                    {issue.title}
                  </Text>
                </div>
              </div>
            </div>
            {group.map((item) => (
              <ChangeRow
                key={item.pendingCheckId}
                change={item}
                all={props.changes}
                isFirst={false}
                onOpen={props.onOpen}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

const ellipsis: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** 목록 한 줄 */
function ChangeRow(props: {
  change: MyChange;
  all: MyChange[];
  isFirst: boolean;
  onOpen: (pendingCheckId: string) => void;
}) {
  const { change } = props;
  const isPending = change.status === 'pending';
  const isSuperseded = change.status === 'superseded';
  // 프로토타입: 확인한 변경 상자의 첫 줄은 옅은 파란 바탕이에요 (대체됨은 빼고)
  const isHighlighted = !isPending && props.isFirst && !isSuperseded;
  return (
    <div
      style={{
        ...rowTop(props.isFirst),
        background: isHighlighted ? C.blue50 : undefined,
      }}
    >
      <ListRow
        onClick={() => props.onOpen(change.pendingCheckId)}
        left={<StatusCell change={change} />}
        contents={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 0,
              opacity: isSuperseded ? 0.55 : undefined,
            }}
          >
            <TitleLine change={change} />
            <ValueLine change={change} />
            {isPending && needsRework(change) && (
              <ReworkNote>
                이전 결정 사항으로 작업 중이었다면 최신 결정 사항을 반영해
                주세요
              </ReworkNote>
            )}
            {isSuperseded && (
              <Text typography="st12" color={C.grey500}>
                {supersededText(findReplacingVersion(change, props.all))}
              </Text>
            )}
            <MetaLine change={change} />
          </div>
        }
        right={
          isPending ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 32,
                padding: '0 14px',
                borderRadius: 9,
                background: '#3182F6',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              답하기 ›
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

function TitleLine(props: { change: MyChange }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        minHeight: 26,
      }}
    >
      <Text typography="st11" fontWeight="bold" color={C.grey900}>
        {props.change.standard.title}
      </Text>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'nowrap',
        }}
      >
        <KindChips change={props.change} />
        <SourceChips change={props.change} />
      </div>
    </div>
  );
}

/** 이전 값 → 지금 값. 되돌림이면 내가 답했던 버전을 함께 적어요 */
function ValueLine(props: { change: MyChange }) {
  const { standard, previousAnswer } = props.change;
  const values = (
    <Text typography="t7" color={C.grey700}>
      {standard.previousValue === null
        ? '새 결정 사항'
        : `${standard.previousValue} (v${standard.previousVersion})`}{' '}
      → {standard.value} (v{standard.version})
    </Text>
  );
  if (!standard.isRevert || !previousAnswer) return values;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px 8px',
      }}
    >
      {values}
      <Text typography="t7" color={C.grey500}>
        · 내가 v{previousAnswer.version}에 답한 이력이 있어요
      </Text>
    </div>
  );
}

function ReworkNote(props: { children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 2,
        alignSelf: 'flex-start',
        padding: '6px 10px',
        borderRadius: 8,
        background: C.grey100,
      }}
    >
      <Text typography="st12" color={C.grey700}>
        {props.children}
      </Text>
    </div>
  );
}

/** #5 · 이슈 제목 (완료된 이슈) · 바꾼 사람 · 시각 */
function MetaLine(props: { change: MyChange }) {
  const { issue, standard } = props.change;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        color: C.grey500,
      }}
    >
      <Text typography="st12" color={C.grey500}>
        {issue.key}
      </Text>
      <div style={ellipsis}>
        <Text typography="st12" color={C.grey500}>
          · {issue.title}
          {issue.status === 'done' ? ' (완료된 이슈)' : ''}
        </Text>
      </div>
      <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
        <Text typography="st12" color={C.grey500}>
          · {standard.changedBy ?? '모름'} · {formatTime(standard.changedAt)}
        </Text>
      </div>
    </div>
  );
}
