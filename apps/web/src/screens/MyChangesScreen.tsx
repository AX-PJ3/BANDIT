/**
 * 나에게 온 변경 + 답하기 (A1~A4, SIL-74). 디자인은 신지님 프로토타입(SIL-69)이에요.
 *
 * - 목록(A2)과 상세(A3·A4)는 주소 경로가 아니라 상태로 바꿔요 (D52). 왼쪽 메뉴도 "나에게 온 변경"과 "변경 상세" 두 칸이에요.
 * - openedCheckId는 알림(A1)을 눌러 연 확인할 변경 ID예요. 있으면 그 변경의 상세를 열어요 (app.notify.click-to-inbox).
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNotificationPermission } from '../pwa.ts';
import { AppShell, Centered, type ShellNavItem } from '../ui/AppShell.tsx';
import { DetailIcon, InboxIcon } from '../ui/icons.tsx';
import {
  Button,
  C,
  Result,
  Segmented,
  Skeleton,
  Text,
  Toast,
} from '../ui/tds.tsx';
import { ChangeDetail } from './my-changes/ChangeDetail.tsx';
import { ChangeList, type ListView } from './my-changes/ChangeList.tsx';
import { NotificationBanner } from './my-changes/NotificationBanner.tsx';
import { useMyChanges } from './my-changes/useMyChanges.ts';

type Screen = 'inbox' | 'detail';

interface ScreenProps {
  openedCheckId: string | null;
  topBar: ReactNode;
  notices: string[];
}

export function MyChangesScreen(props: ScreenProps & { me: string | null }) {
  if (!props.me) {
    return (
      <AppShell
        navItems={[]}
        me={null}
        topBar={props.topBar}
        notices={props.notices}
      >
        <Centered>
          <Result
            title="누구에게 온 변경인지 알 수 없어요"
            description={
              '주소 끝에 ?me=내이름 을 붙여 다시 열어 주세요.\n이름은 이슈 담당자 이름과 같아야 해요. 한 번 열면 이 브라우저가 기억해요.'
            }
          />
        </Centered>
      </AppShell>
    );
  }
  return <MyChanges {...props} me={props.me} />;
}

function MyChanges(props: ScreenProps & { me: string }) {
  const { changes, loadError, watchError, reload } = useMyChanges(props.me);
  const notifications = useNotificationPermission();
  const [screen, setScreen] = useState<Screen>(
    props.openedCheckId ? 'detail' : 'inbox',
  );
  const [view, setView] = useState<ListView>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    props.openedCheckId,
  );
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!props.openedCheckId) return;
    setSelectedId(props.openedCheckId);
    setScreen('detail');
  }, [props.openedCheckId]);

  const open = (pendingCheckId: string) => {
    setSelectedId(pendingCheckId);
    setScreen('detail');
  };
  const selected = changes?.find((item) => item.pendingCheckId === selectedId);
  const pendingCount =
    changes?.filter((item) => item.status === 'pending').length ?? 0;

  const navItems: ShellNavItem[] = [
    {
      key: 'inbox',
      label: '나에게 온 변경',
      description: `${props.me}에게 온 변경 목록`,
      icon: (isActive) => <InboxIcon isActive={isActive} />,
      isActive: screen === 'inbox',
      badge: pendingCount,
      onClick: () => setScreen('inbox'),
    },
    {
      key: 'detail',
      label: '변경 상세',
      description: selected
        ? `${selected.issue.key} ${selected.standard.title}`
        : '선택한 변경이 없어요',
      icon: (isActive) => <DetailIcon isActive={isActive} />,
      isActive: screen === 'detail',
      onClick: () => setScreen('detail'),
    },
  ];

  const notices = watchError ? [...props.notices, watchError] : props.notices;

  let content: ReactNode;
  if (loadError) {
    content = (
      <Centered>
        <Result
          title="나에게 온 변경을 불러오지 못했어요"
          description={`${loadError}\n바뀐 결정 사항이 없다는 뜻이 아니에요.`}
          button={
            <Button size="medium" onClick={() => void reload()}>
              다시 불러오기
            </Button>
          }
        />
      </Centered>
    );
  } else if (changes === null) {
    content = (
      <div style={{ padding: 36 }}>
        <Skeleton />
      </div>
    );
  } else if (screen === 'detail') {
    content = selected ? (
      <ChangeDetail
        key={selected.pendingCheckId}
        me={props.me}
        change={selected}
        all={changes}
        onBack={() => setScreen('inbox')}
        onOpen={open}
        onSaved={reload}
        onToast={setToast}
        onClosedElsewhere={() => {
          // 다른 곳에서 이미 답했거나 또 바뀌었어요. 에러 없이 목록으로 돌아가 다시 읽어요 (notify.answer.one-place)
          setScreen('inbox');
          void reload();
        }}
      />
    ) : (
      <Centered>
        <Result
          title="선택한 변경이 없어요"
          description={
            selectedId
              ? '이미 닫혔거나 목록에서 사라진 변경이에요.'
              : '나에게 온 변경에서 확인할 변경을 선택해주세요.'
          }
          button={
            <Button size="medium" onClick={() => setScreen('inbox')}>
              나에게 온 변경 보기
            </Button>
          }
        />
      </Centered>
    );
  } else {
    content = (
      <div style={{ padding: '36px 35px 48px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Text typography="t3" fontWeight="bold" color={C.grey900}>
              나에게 온 변경 목록
            </Text>
            <Text typography="t7" color={C.grey600}>
              {props.me}님 이슈에 걸린 결정 사항이 바뀌면 여기에 와요. 확인한
              변경은 7일 동안 보여요.
            </Text>
          </div>
          <Segmented
            label="변경 보기 범위"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: '전체' },
              { value: 'by-issue', label: '이슈 별로 보기' },
            ]}
          />
        </div>
        {changes.length > 0 && (
          <NotificationBanner
            permission={notifications.permission}
            onRequest={() => void notifications.request()}
          />
        )}
        <ChangeList changes={changes} view={view} onOpen={open} />
      </div>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      me={props.me}
      topBar={props.topBar}
      notices={notices}
    >
      {content}
      <Toast text={toast} onClose={closeToast} />
    </AppShell>
  );
}
