/**
 * A2 "알림이 꺼져 있어요" 안내예요. 권한이 'granted'가 아닐 때 목록 위에 보여 줘요.
 * - 'default': 버튼을 누를 때만 권한을 물어요 (브라우저 규칙).
 * - 'denied': 다시 묻지 않고 사이트 설정에서 허용하는 방법만 안내해요 (app.notify.permission-denied).
 */
import { useState } from 'react';
import type { NotificationPermissionState } from '../../pwa.ts';

export function NotificationBanner(props: {
  permission: NotificationPermissionState;
  onRequest: () => void;
}) {
  const [isClosed, setIsClosed] = useState(false);
  if (props.permission === 'granted' || isClosed) return null;

  return (
    <section className="banner" role="status">
      <div className="banner-body">
        <strong>알림이 꺼져 있어요</strong>
        {props.permission === 'default' && (
          <p>
            알림을 켜면 창이 열려 있는 동안 새 확인할 변경이 생길 때 바로 알려
            드려요.
          </p>
        )}
        {props.permission === 'denied' && (
          <p>
            브라우저에서 알림이 막혀 있어요. 주소창 왼쪽의 사이트 정보 아이콘을
            누르고 알림을 허용으로 바꾼 뒤 이 화면을 새로 고쳐 주세요.
          </p>
        )}
        {props.permission === 'unsupported' && (
          <p>
            이 브라우저는 알림을 띄울 수 없어요. 새 변경은 이 화면에서 확인해
            주세요.
          </p>
        )}
      </div>
      {props.permission === 'default' && (
        <button className="button primary" onClick={props.onRequest}>
          알림 켜기
        </button>
      )}
      <button
        className="banner-close"
        aria-label="안내 닫기"
        onClick={() => setIsClosed(true)}
      >
        ×
      </button>
    </section>
  );
}
