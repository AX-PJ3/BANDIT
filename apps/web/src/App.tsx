/**
 * 앱 뼈대예요. 왼쪽 메뉴와 화면 세 칸만 있어요.
 * 화면 내용은 screens/ 폴더의 파일을 채워요 (신지님, SIL-42·44·45).
 * 새 화면을 추가하려면 screens/에 파일을 만들고 아래 screens 배열에 한 줄 넣어요.
 */
import { useEffect, useState } from 'react';
import { api, isMock } from './api/index.ts';
import type { AppInfo } from './api/types.ts';
import {
  useInstallPrompt,
  useNotificationPermission,
  useOpenCheckRequests,
} from './pwa.ts';
import { MetricsScreen } from './screens/MetricsScreen.tsx';
import { MyChangesScreen } from './screens/MyChangesScreen.tsx';
import { WikiScreen } from './screens/WikiScreen.tsx';

const screens = [
  { id: 'my-changes', label: '나에게 온 변경', Component: MyChangesScreen },
  { id: 'wiki', label: '위키', Component: WikiScreen },
  { id: 'metrics', label: '지표', Component: MetricsScreen },
] as const;

type ScreenId = (typeof screens)[number]['id'];

const platformLabel: Record<AppInfo['platform'], string> = {
  browser: '브라우저',
  installed: '설치한 앱',
};

function dataLabel(info: AppInfo): string {
  if (!info.db) return '데이터: 예시';
  return info.db.ok
    ? `데이터: DB (결정 사항 ${info.db.standardCount}개)`
    : 'DB에 연결하지 못했어요';
}

export function App() {
  const [current, setCurrent] = useState<ScreenId>('my-changes');
  const [info, setInfo] = useState<AppInfo | null>(null);
  /** 알림을 눌러 연 확인할 변경 ID예요. 나에게 온 변경 화면이 이 변경을 골라 보여 줘요 (app.notify.click-to-inbox) */
  const [openedCheckId, setOpenedCheckId] = useState<string | null>(null);
  const install = useInstallPrompt();
  const notifications = useNotificationPermission();

  useOpenCheckRequests((checkId) => {
    setCurrent('my-changes');
    setOpenedCheckId(checkId);
  });

  useEffect(() => {
    void api.getAppInfo().then(setInfo);
  }, []);

  const screen = screens.find((item) => item.id === current) ?? screens[0];

  return (
    <div className="layout">
      <nav className="nav">
        {screens.map((item) => (
          <button
            key={item.id}
            className={item.id === current ? 'nav-item active' : 'nav-item'}
            onClick={() => setCurrent(item.id)}
          >
            {item.label}
          </button>
        ))}
        <footer className="nav-footer">
          {install && (
            <button className="install-button" onClick={() => void install()}>
              앱으로 설치
            </button>
          )}
          {notifications.permission === 'default' && (
            <button
              className="install-button"
              onClick={() => void notifications.request()}
            >
              알림 켜기
            </button>
          )}
          {notifications.permission === 'denied' && (
            <div>
              알림이 꺼져 있어요. 주소창의 사이트 설정에서 알림을 허용해 주세요
            </div>
          )}
          {info
            ? `${platformLabel[info.platform]} · ${dataLabel(info)}`
            : '불러오는 중'}
          {info?.db && !info.db.ok && (
            <div className="db-error">{info.db.message}</div>
          )}
          {isMock && (
            <div>Supabase 주소·키가 없어서 예시 데이터로 열었어요</div>
          )}
        </footer>
      </nav>
      <main className="content">
        {screen.id === 'my-changes' ? (
          <MyChangesScreen openedCheckId={openedCheckId} />
        ) : (
          <screen.Component />
        )}
      </main>
    </div>
  );
}
