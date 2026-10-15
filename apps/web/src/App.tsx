/**
 * 앱 뼈대예요. 왼쪽 메뉴와 "나에게 온 변경" 화면 하나예요.
 * 위키·지표 화면은 만들지 않아요 (app.screen.inbox-first, 타입명세서 11-6, 10/15 호윤).
 */
import { useEffect, useState } from 'react';
import { api, isMock, me } from './api/index.ts';
import type { AppInfo } from './api/types.ts';
import { useInstallPrompt, useOpenCheckRequests } from './pwa.ts';
import { MyChangesScreen } from './screens/MyChangesScreen.tsx';

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
  const [info, setInfo] = useState<AppInfo | null>(null);
  /** 알림을 눌러 연 확인할 변경 ID예요. 나에게 온 변경 화면이 이 변경을 골라 보여 줘요 (app.notify.click-to-inbox) */
  const [openedCheckId, setOpenedCheckId] = useState<string | null>(null);
  const install = useInstallPrompt();

  useOpenCheckRequests(setOpenedCheckId);

  useEffect(() => {
    void api.getAppInfo().then(setInfo);
  }, []);

  return (
    <div className="layout">
      <nav className="nav">
        <button className="nav-item active">나에게 온 변경</button>
        <footer className="nav-footer">
          {install && (
            <button className="install-button" onClick={() => void install()}>
              앱으로 설치
            </button>
          )}
          {me && <div>내 이름: {me}</div>}
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
        <MyChangesScreen me={me} openedCheckId={openedCheckId} />
      </main>
    </div>
  );
}
