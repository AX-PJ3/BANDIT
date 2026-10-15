/**
 * A2 "알림이 꺼져 있어요" 안내예요. 권한이 'granted'가 아닐 때 목록 위에 보여 줘요. 모양은 프로토타입(SIL-69)과 같아요.
 * - 'default': 버튼을 누를 때만 권한을 물어요 (브라우저 규칙).
 * - 'denied': 다시 묻지 않고 "설정 변경 방법 보기"로 사이트 설정에서 허용하는 방법만 안내해요 (app.notify.permission-denied).
 */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { NotificationPermissionState } from '../../pwa.ts';
import { BellOffIcon, CloseIcon } from '../../ui/icons.tsx';
import { C, Text } from '../../ui/tds.tsx';

/** 펼침 애니메이션 시간 (styles.css .notify-panel과 같아요) */
const PANEL_MS = 420;

/** 안내 그림(public/notify-guide.svg) 한 장에서 세 칸을 잘라 보여 줘요 */
const GUIDE_COLUMNS = [
  { x: 20, width: 240 },
  { x: 324, width: 240 },
  { x: 630, width: 220 },
];
const GUIDE_STEPS = [
  '사이트 정보 아이콘을 클릭. 브라우저에서 주소창 왼쪽의 자물쇠 또는 사이트 정보 아이콘을 클릭합니다',
  '알림 권한을 허용으로 변경하세요. 사이트 설정 메뉴에서 알림 항목을 찾아 허용으로 변경합니다',
  '이제 알림을 받을 수 있어요. 설정 변경 후 이 화면으로 돌아와 권한을 다시 확인해 주세요',
];

const DESCRIPTIONS: Record<
  Exclude<NotificationPermissionState, 'granted'>,
  string
> = {
  default:
    '알림을 켜면 창이 열려 있는 동안 새 확인할 변경이 생길 때 바로 알려 드려요.',
  denied:
    '브라우저 설정에서 알림이 차단된 상태예요. 알림을 받으려면 브라우저 설정에서 권한을 허용해 주세요.',
  unsupported:
    '이 브라우저는 알림을 띄울 수 없어요. 새 변경은 이 화면에서 확인해 주세요.',
};

function BannerButton(props: {
  onClick: () => void;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-expanded={props['aria-expanded']}
      aria-controls={props['aria-controls']}
      style={{
        height: 30,
        padding: '0 12px',
        border: 0,
        borderRadius: 10,
        background: C.blue500,
        color: '#fff',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {props.children}
    </button>
  );
}

export function NotificationBanner(props: {
  permission: NotificationPermissionState;
  onRequest: () => void;
}) {
  const [isClosed, setIsClosed] = useState(false);
  if (props.permission === 'granted' || isClosed) return null;
  return (
    <Banner
      permission={props.permission}
      onRequest={props.onRequest}
      onClose={() => setIsClosed(true)}
    />
  );
}

function Banner(props: {
  permission: Exclude<NotificationPermissionState, 'granted'>;
  onRequest: () => void;
  onClose: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // 펼칠 때는 내용 높이까지 늘였다가 auto로, 접을 때는 지금 높이에서 0으로 줄여요
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isOpen) {
      panel.style.height = `${panel.scrollHeight}px`;
      const timer = setTimeout(() => {
        if (panelRef.current) panelRef.current.style.height = 'auto';
      }, PANEL_MS + 60);
      return () => clearTimeout(timer);
    }
    panel.style.height = `${panel.getBoundingClientRect().height}px`;
    void panel.offsetHeight;
    panel.style.height = '0px';
    return undefined;
  }, [isOpen]);

  return (
    <div
      style={{
        position: 'relative',
        marginTop: 22,
        borderRadius: 14,
        background: '#F0F6FF',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: 30,
        }}
      >
        <BellOffIcon />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Text
            typography="t6"
            fontWeight="bold"
            color={C.grey900}
            style={{ lineHeight: '22px' }}
          >
            알림이 꺼져 있어요
          </Text>
          <Text
            typography="st12"
            color={C.grey700}
            style={{ lineHeight: '20px' }}
          >
            {DESCRIPTIONS[props.permission]}
          </Text>
        </div>
        <div
          style={{
            alignSelf: 'flex-end',
            display: 'flex',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {props.permission === 'default' && (
            <BannerButton onClick={props.onRequest}>알림 켜기</BannerButton>
          )}
          {props.permission === 'denied' && (
            <BannerButton
              onClick={() => setIsOpen((value) => !value)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              설정 변경 방법 보기
            </BannerButton>
          )}
        </div>
        <button
          type="button"
          aria-label="알림 안내 닫기"
          onClick={props.onClose}
          style={{
            position: 'absolute',
            top: 19,
            right: 21,
            border: 0,
            background: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <CloseIcon />
        </button>
      </div>
      {props.permission === 'denied' && (
        <div
          ref={panelRef}
          id={panelId}
          className="notify-panel"
          data-open={isOpen}
          aria-hidden={!isOpen}
        >
          <div className="notify-guide">
            <div className="notify-guide-cols">
              {GUIDE_COLUMNS.map((column) => (
                <div key={column.x} className="notify-guide-box">
                  <div
                    style={{
                      position: 'relative',
                      flexShrink: 0,
                      width: column.width,
                      height: 244,
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}notify-guide.svg`}
                      alt=""
                      draggable={false}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: -column.x,
                        width: 870,
                        height: 244,
                        maxWidth: 'none',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <ol className="sr-only">
              {GUIDE_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
