/**
 * A2 목록이에요. "확인할 변경"(대기)과 "확인한 변경"(답함, 대체됨) 두 칸으로 나눠요.
 * 목록은 한 번 불러서 화면이 상태로 나눠요 (notify.list.one-call). "이슈 별로 보기"는 이슈 번호로 묶어요.
 */
import type { MyChange } from '../../api/types.ts';
import { ChangeBadges, StatusChip } from './Badges.tsx';
import {
  findReplacingVersion,
  formatTime,
  needsRework,
  supersededText,
} from './format.ts';

export type ListView = 'all' | 'by-issue';

export function ChangeList(props: {
  changes: MyChange[];
  view: ListView;
  onOpen: (pendingCheckId: string) => void;
}) {
  const open = props.changes.filter((item) => item.status === 'pending');
  const closed = props.changes.filter((item) => item.status !== 'pending');
  return (
    <>
      <ListSection
        title="확인할 변경"
        empty="아직 확인할 변경이 없어요"
        items={open}
        all={props.changes}
        view={props.view}
        onOpen={props.onOpen}
      />
      <ListSection
        title="확인한 변경"
        empty="아직 확인한 변경이 없어요"
        items={closed}
        all={props.changes}
        view={props.view}
        onOpen={props.onOpen}
      />
    </>
  );
}

function ListSection(props: {
  title: string;
  empty: string;
  items: MyChange[];
  all: MyChange[];
  view: ListView;
  onOpen: (pendingCheckId: string) => void;
}) {
  const renderCards = (items: MyChange[]) =>
    items.map((item) => (
      <ChangeCard
        key={item.pendingCheckId}
        change={item}
        all={props.all}
        onOpen={props.onOpen}
      />
    ));

  return (
    <section className="panel">
      <h2 className="panel-title">
        {props.title} <span className="count">{props.items.length}</span>
      </h2>
      {props.items.length === 0 ? (
        <p className="empty">{props.empty}</p>
      ) : props.view === 'all' ? (
        renderCards(props.items)
      ) : (
        groupByIssue(props.items).map((group) => (
          <div className="issue-group" key={group[0]!.issue.key}>
            <h3 className="issue-group-title">
              {group[0]!.issue.key} {group[0]!.issue.title}
              {group[0]!.issue.status === 'done' && (
                <span className="muted"> (완료)</span>
              )}
            </h3>
            {renderCards(group)}
          </div>
        ))
      )}
    </section>
  );
}

/** 이슈 번호로 묶어요. 묶음 순서는 그 안의 가장 최근 변경 순이에요 (목록이 이미 최신순) */
function groupByIssue(items: MyChange[]): MyChange[][] {
  const groups = new Map<string, MyChange[]>();
  for (const item of items) {
    groups.set(item.issue.key, [...(groups.get(item.issue.key) ?? []), item]);
  }
  return [...groups.values()];
}

function ChangeCard(props: {
  change: MyChange;
  all: MyChange[];
  onOpen: (pendingCheckId: string) => void;
}) {
  const { change } = props;
  const { standard } = change;
  const isPending = change.status === 'pending';
  return (
    <article
      className={`card ${change.status === 'superseded' ? 'dimmed' : ''}`}
    >
      <StatusChip change={change} />
      <div className="card-body">
        <div className="card-title">
          <strong>{standard.title}</strong>
          <ChangeBadges change={change} />
        </div>
        <p className="card-values">
          {standard.previousValue === null
            ? '이전 값이 없어요'
            : `${standard.previousValue} (v${standard.previousVersion})`}{' '}
          → {standard.value} (v{standard.version})
        </p>
        {change.status === 'superseded' && (
          <p className="muted">
            {supersededText(findReplacingVersion(change, props.all))}
          </p>
        )}
        {isPending && needsRework(change) && (
          <p className="notice">지난번 변경을 반영하셨다면 다시 고쳐야 해요</p>
        )}
        <p className="card-meta">
          {change.issue.key} {change.issue.title}
          {change.issue.status === 'done' && ' (완료)'} ·{' '}
          {standard.changedBy ?? '모름'} · {formatTime(standard.changedAt)}
        </p>
      </div>
      <button
        className={isPending ? 'button primary' : 'button'}
        onClick={() => props.onOpen(change.pendingCheckId)}
      >
        {isPending ? '답하기 ›' : '보기 ›'}
      </button>
    </article>
  );
}
