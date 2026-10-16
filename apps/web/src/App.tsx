/**
 * 앱 뼈대예요. "나에게 온 변경" 화면 하나예요 (위키·지표 화면은 만들지 않아요, app.screen.inbox-first, 10/15 호윤).
 * 위쪽 줄에는 데이터 연결 상태와 "앱으로 설치"를 보여 줘요. 틀(메뉴, 위쪽 줄)은 ui/AppShell.tsx예요.
 */
import { useEffect, useState } from 'react';
import { api, initialMe } from './api/index.ts';
import type { AppInfo } from './api/types.ts';
import { saveMe } from './me.ts';
import { useInstallPrompt, useOpenCheckRequests } from './pwa.ts';
import { MyChangesScreen } from './screens/MyChangesScreen.tsx';
import { Badge, Button } from './ui/tds.tsx';

function ConnectionBadge(props: { info: AppInfo | null }) {
  const { info } = props;
  if (!info) return null;
  if (!info.db) {
    return (
      <Badge size="medium" tone="elephant" variant="weak">
        ● 예시 데이터로 열었어요 (Supabase 주소·키 없음)
      </Badge>
    );
  }
  return info.db.ok ? (
    <Badge size="medium" tone="green" variant="weak">
      ● DB 연결됨 · 결정 사항 {info.db.standardCount}개
    </Badge>
  ) : (
    <Badge size="medium" tone="red" variant="weak">
      ● DB에 연결하지 못했어요
    </Badge>
  );
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  /** 화면을 보는 사람이에요. 로그인이 없어서 메뉴 아래 프로필에서 이슈 담당자 중에 골라요 (SIL-74) */
  const [me, setMe] = useState<string | null>(initialMe);
  const [people, setPeople] = useState<string[] | null>(null);
  /** 알림을 눌러 연 확인할 변경 ID예요. 나에게 온 변경 화면이 이 변경을 골라 보여 줘요 (app.notify.click-to-inbox) */
  const [openedCheckId, setOpenedCheckId] = useState<string | null>(null);
  const install = useInstallPrompt();

  useOpenCheckRequests(setOpenedCheckId);

  useEffect(() => {
    void api.getAppInfo().then(setInfo);
    // 이름 목록을 못 불러와도 지금 이름으로 쓸 수 있어요. 고르는 메뉴에 이유를 보여 줘요
    api.listPeople().then(setPeople, () => setPeople([]));
  }, []);

  const changeMe = (name: string) => {
    saveMe(name);
    setMe(name);
  };

  const topBar = (
    <>
      {install && (
        <Button size="small" onClick={() => void install()}>
          앱으로 설치
        </Button>
      )}
      <div style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        <ConnectionBadge info={info} />
      </div>
    </>
  );
  // DB에 못 붙으면 이유를 그대로 보여 줘요. 실패를 "변경 없음"처럼 숨기지 않아요 (notify.error.not-empty)
  const notices =
    info?.db && !info.db.ok
      ? [`DB에 연결하지 못했어요. ${info.db.message}`]
      : [];

  return (
    <MyChangesScreen
      me={me}
      people={people}
      onChangeMe={changeMe}
      openedCheckId={openedCheckId}
      topBar={topBar}
      notices={notices}
    />
  );
}
