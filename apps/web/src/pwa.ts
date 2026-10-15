/**
 * PWA(설치할 수 있는 웹 앱) 연결이에요 (SIL-65 조건 11, D50, D52).
 *
 * - 서비스 워커(public/sw.js)는 배포본(build)에서만 등록해요. 개발 중에는 옛 파일이 남아 헷갈리지 않게 등록하지 않아요.
 * - 브라우저가 "설치할 수 있어요"를 알려 주면(beforeinstallprompt) 메뉴에 "앱으로 설치" 버튼을 보여 줘요.
 *   Chrome·Edge는 주소창의 설치 아이콘으로도 설치할 수 있어요.
 * - OS 알림(A1): 권한 확인·요청, 알림 띄우기, 알림을 눌렀을 때 어떤 변경을 열지 받기까지가 여기 있어요.
 *   언제 띄울지(Realtime 구독)와 알림 문구는 쓰는 쪽에서 정해요 (app.notify.realtime, app.notify.title-length).
 */
import { useEffect, useRef, useState } from 'react';

/** 서비스 워커(sw.js)와 같은 이름이에요. 알림을 눌렀을 때 화면에 "이 변경을 열어 줘"를 알려요 */
const OPEN_CHECK = 'haribo:open-check';
/** 알림을 눌러 새 창이 열릴 때 주소에 붙는 이름이에요 (?check=<확인할 변경 ID>) */
const CHECK_PARAM = 'check';
/** 서비스 워커(sw.js)와 같은 이름이에요. 알림을 누를 때 "이 창이 앱 창이야?"를 물어요 */
const DISPLAY_MODE = 'haribo:display-mode';

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // 알림을 누르면 서비스 워커가 앱(PWA) 창을 먼저 고를 수 있게 이 창이 앱 창인지 답해요 (app.notify.click-to-inbox)
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type !== DISPLAY_MODE) return;
    event.ports[0]?.postMessage({
      isStandalone: currentPlatform() === 'installed',
    });
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error: unknown) => {
        console.error(
          '서비스 워커를 등록하지 못했어요. 설치와 오프라인 열기가 안 돼요.',
          error,
        );
      });
  });
}

/** PWA로 설치한 앱 창에서 열었는지예요 */
export function currentPlatform(): 'browser' | 'installed' {
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches ||
    iosStandalone
    ? 'installed'
    : 'browser';
}

/** 표준 DOM 타입에 아직 없는 설치 안내 이벤트예요 (Chrome·Edge) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 설치할 수 있으면 설치 창을 여는 함수를, 아니면 null을 돌려줘요 */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (next: Event) => {
      next.preventDefault();
      setEvent(next as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  };
}

/** 브라우저 알림 권한이에요. 'unsupported'는 이 브라우저가 알림을 못 띄울 때예요 */
export type NotificationPermissionState =
  NotificationPermission | 'unsupported';

function readPermission(): NotificationPermissionState {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/**
 * 알림 권한과 요청 함수예요.
 * 'granted'가 아니면 화면은 "알림 꺼짐" 상태로 보여 줘요 (착수 안내 4절).
 * 브라우저는 사람이 버튼을 누른 뒤에만 권한을 물을 수 있어서, request는 버튼의 onClick에서만 불러요.
 * 'denied'면 다시 묻지 않고, 화면이 브라우저 사이트 설정에서 허용하는 방법을 안내해요 (app.notify.permission-denied).
 */
export function useNotificationPermission(): {
  permission: NotificationPermissionState;
  request: () => Promise<NotificationPermissionState>;
} {
  const [permission, setPermission] = useState(readPermission);

  useEffect(() => {
    // 사이트 설정에서 바꾼 것도 따라가요
    let status: PermissionStatus | undefined;
    let closed = false;
    const update = () => setPermission(readPermission());
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((result) => {
        if (closed) return;
        status = result;
        status.addEventListener('change', update);
      })
      .catch(() => undefined);
    return () => {
      closed = true;
      status?.removeEventListener('change', update);
    };
  }, []);

  const request = async () => {
    if (!('Notification' in window)) return 'unsupported';
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  };
  return { permission, request };
}

/** OS 알림 한 건이에요. 제목은 결정 사항 제목, 본문은 "이전 값 → 지금 값" 같은 문구예요 (A1) */
export interface ChangeNotification {
  /** 확인할 변경 ID (PendingCheck.id). 알림을 누르면 이 변경을 열어요 */
  checkId: string;
  title: string;
  body: string;
}

/**
 * 확인할 변경 OS 알림(A1)을 띄워요. 권한이 없거나 알림을 못 띄우면 false예요.
 * 같은 변경은 tag가 같아서 알림 센터에 한 건만 남아요.
 * 배포본은 서비스 워커로 띄워서 앱 창을 닫은 뒤에 눌러도 열려요. 개발 중에는 서비스 워커가 없어서 창에서 바로 띄워요.
 */
export async function showChangeNotification(
  notification: ChangeNotification,
): Promise<boolean> {
  if (readPermission() !== 'granted') return false;
  const options: NotificationOptions = {
    body: notification.body,
    tag: `check-${notification.checkId}`,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    data: { checkId: notification.checkId },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.active) {
      await registration.showNotification(notification.title, options);
      return true;
    }
    const shown = new Notification(notification.title, options);
    shown.onclick = () => {
      window.focus();
      shown.close();
      window.dispatchEvent(
        new CustomEvent(OPEN_CHECK, { detail: notification.checkId }),
      );
    };
    return true;
  } catch (error: unknown) {
    console.error('알림을 띄우지 못했어요.', error);
    return false;
  }
}

/**
 * 알림을 눌러 연 변경 ID를 받아요 (app.notify.click-to-inbox). 세 길을 한곳에서 받아요.
 * 1. 앱 창이 없을 때: 서비스 워커가 ?check=<ID> 주소로 새 창을 열어요. 읽은 뒤 주소에서 지워서 새로 고쳐도 다시 열리지 않아요.
 * 2. 앱 창이 열려 있을 때: 서비스 워커가 그 창에 메시지를 보내요.
 * 3. 개발 중: showChangeNotification이 창에서 띄운 알림의 onclick이 알려요.
 */
export function useOpenCheckRequests(onOpen: (checkId: string) => void): void {
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(CHECK_PARAM);
    if (fromUrl) {
      url.searchParams.delete(CHECK_PARAM);
      window.history.replaceState(window.history.state, '', url);
      latest.current(fromUrl);
    }

    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data as { type?: unknown; checkId?: unknown } | null;
      if (data?.type === OPEN_CHECK && typeof data.checkId === 'string') {
        latest.current(data.checkId);
      }
    };
    const onLocal = (event: Event) => {
      const checkId = (event as CustomEvent<unknown>).detail;
      if (typeof checkId === 'string') latest.current(checkId);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    // addEventListener만으로는 서비스 워커 메시지가 쌓여 있다가 늦게 올 수 있어서 바로 받기 시작해요
    navigator.serviceWorker?.startMessages();
    window.addEventListener(OPEN_CHECK, onLocal);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener(OPEN_CHECK, onLocal);
    };
  }, []);
}
