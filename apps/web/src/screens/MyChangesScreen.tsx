/**
 * 나에게 온 변경 + 답하기 (A1~A4, SIL-74). 디자인은 신지님 프로토타입(SIL-69)이에요.
 *
 * - 목록(A2)과 상세(A3·A4)는 주소 경로가 아니라 상태로 바꿔요 (D52).
 * - openedCheckId는 알림(A1)을 눌러 연 확인할 변경 ID예요. 있으면 그 변경의 상세를 열어요 (app.notify.click-to-inbox).
 */
import { useEffect, useState } from 'react';
import { useNotificationPermission } from '../pwa.ts';
import { ChangeDetail } from './my-changes/ChangeDetail.tsx';
import { ChangeList, type ListView } from './my-changes/ChangeList.tsx';
import { NotificationBanner } from './my-changes/NotificationBanner.tsx';
import { useMyChanges } from './my-changes/useMyChanges.ts';

export function MyChangesScreen(props: {
  me: string | null;
  openedCheckId: string | null;
}) {
  if (!props.me) return <NoName />;
  return <MyChanges me={props.me} openedCheckId={props.openedCheckId} />;
}

/** 이름이 없으면 누구에게 온 변경인지 알 수 없어요. 이름을 고르는 화면은 만들지 않아요 (10/15 호윤) */
function NoName() {
  return (
    <section className="page">
      <h1>나에게 온 변경</h1>
      <div className="panel">
        <p>누구에게 온 변경을 보여 줄지 알 수 없어요.</p>
        <p className="muted">
          주소 끝에 <code>?me=내이름</code>을 붙여 다시 열어 주세요. 이름은 이슈
          담당자 이름과 같아야 해요. 한 번 열면 이 브라우저가 기억해요.
        </p>
      </div>
    </section>
  );
}

function MyChanges(props: { me: string; openedCheckId: string | null }) {
  const { changes, loadError, watchError, reload } = useMyChanges(props.me);
  const notifications = useNotificationPermission();
  const [view, setView] = useState<ListView>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    props.openedCheckId,
  );

  useEffect(() => {
    if (props.openedCheckId) setSelectedId(props.openedCheckId);
  }, [props.openedCheckId]);

  const selected = changes?.find((item) => item.pendingCheckId === selectedId);

  if (selected && changes) {
    return (
      <section className="page">
        <ChangeDetail
          me={props.me}
          change={selected}
          all={changes}
          onBack={() => setSelectedId(null)}
          onSaved={reload}
          onClosedElsewhere={() => {
            // 다른 곳에서 이미 답했거나 또 바뀌었어요. 에러 없이 닫고 목록을 다시 읽어요 (notify.answer.one-place)
            setSelectedId(null);
            void reload();
          }}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>나에게 온 변경</h1>
          <p className="muted">
            {props.me}님 이슈에 걸린 결정 사항이 바뀌면 여기에 와요. 확인한
            변경은 7일 동안 보여요.
          </p>
        </div>
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'all'}
            className={view === 'all' ? 'tab active' : 'tab'}
            onClick={() => setView('all')}
          >
            전체
          </button>
          <button
            role="tab"
            aria-selected={view === 'by-issue'}
            className={view === 'by-issue' ? 'tab active' : 'tab'}
            onClick={() => setView('by-issue')}
          >
            이슈 별로 보기
          </button>
        </div>
      </header>

      <NotificationBanner
        permission={notifications.permission}
        onRequest={() => void notifications.request()}
      />
      {watchError && <p className="error">{watchError}</p>}
      {selectedId && changes && !selected && (
        <p className="muted">
          알림에서 연 변경을 목록에서 찾지 못했어요. 이미 닫혔을 수 있어요.
        </p>
      )}

      {loadError ? (
        <div className="panel">
          <p className="error">
            나에게 온 변경을 불러오지 못했어요. 바뀐 결정 사항이 없다는 뜻이
            아니에요.
          </p>
          <p className="muted">{loadError}</p>
          <button className="button" onClick={() => void reload()}>
            다시 불러오기
          </button>
        </div>
      ) : changes === null ? (
        <p className="muted">불러오는 중</p>
      ) : (
        <ChangeList changes={changes} view={view} onOpen={setSelectedId} />
      )}
    </section>
  );
}
