/**
 * 앱 틀이에요: 왼쪽 아이콘 메뉴(120px, 펼치면 300px), 위쪽 줄(70px), 왼쪽 위가 둥근 흰 화면.
 * 크기·여백은 프로토타입(SIL-69)과 같아요.
 */
import { useState, type ReactNode } from 'react';
import { AvatarIcon, SidebarToggleIcon } from './icons.tsx';
import { Badge, C, Text } from './tds.tsx';

export interface ShellNavItem {
  key: string;
  label: string;
  description: string;
  icon: (isActive: boolean) => ReactNode;
  isActive: boolean;
  badge?: number;
  onClick: () => void;
}

/** 메뉴를 접었을 때 아이콘에 마우스를 올리면 뜨는 이름표 */
function HoverLabel(props: {
  label: string;
  placement: 'top' | 'bottom';
  isDisabled: boolean;
  children: ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      style={{ position: 'relative', flexShrink: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {props.children}
      {isHovered && !props.isDisabled && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            ...(props.placement === 'bottom'
              ? { top: 'calc(100% + 18px)' }
              : { bottom: 'calc(100% + 18px)' }),
            zIndex: 10000,
            borderRadius: 12,
            padding: '8px 12px',
            minWidth: 58,
            boxShadow: '0 8px 28px rgba(0,29,58,0.1)',
            background: 'var(--adaptiveFloatBackground)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 13,
              lineHeight: '19.5px',
              fontWeight: 600,
              color: C.grey800,
            }}
          >
            {props.label}
          </span>
        </div>
      )}
    </div>
  );
}

function Sidebar(props: { items: ShellNavItem[]; me: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const fade = {
    opacity: isOpen ? 1 : 0,
    transition: isOpen
      ? 'opacity 140ms ease-out 90ms'
      : 'opacity 60ms ease-out',
  };
  return (
    <div
      style={{
        width: isOpen ? 300 : 120,
        flexShrink: 0,
        padding: '26px 25px 29px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 160ms ease-out',
        overflow: 'hidden',
      }}
    >
      <div>
        <button
          type="button"
          aria-label={isOpen ? '메뉴 접기' : '메뉴 펼치기'}
          onClick={() => setIsOpen((value) => !value)}
          style={{
            border: 0,
            background: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'block',
            marginLeft: 1,
            lineHeight: 0,
          }}
        >
          <SidebarToggleIcon />
        </button>
        <nav
          style={{
            marginTop: 48,
            display: 'flex',
            flexDirection: 'column',
            gap: 25,
          }}
        >
          {props.items.map((item) => (
            <div
              key={item.key}
              role="button"
              tabIndex={0}
              aria-current={item.isActive ? 'page' : undefined}
              aria-label={item.label}
              onClick={item.onClick}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  item.onClick();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                cursor: 'pointer',
              }}
            >
              <HoverLabel
                label={item.label}
                placement="bottom"
                isDisabled={isOpen}
              >
                {item.icon(item.isActive)}
                {!!item.badge && (
                  <div style={{ position: 'absolute', top: -6, right: -6 }}>
                    <Badge size="xsmall" tone="red" variant="fill">
                      {item.badge}
                    </Badge>
                  </div>
                )}
              </HoverLabel>
              <div
                aria-hidden={!isOpen}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  pointerEvents: isOpen ? 'auto' : 'none',
                  ...fade,
                }}
              >
                <Text typography="st11" fontWeight="bold" color={C.grey900}>
                  {item.label}
                </Text>
                <Text typography="st12" color={C.grey600}>
                  {item.description}
                </Text>
              </div>
            </div>
          ))}
        </nav>
      </div>
      {props.me && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HoverLabel label={props.me} placement="top" isDisabled={isOpen}>
            <AvatarIcon name={props.me} />
          </HoverLabel>
          <div aria-hidden={!isOpen} style={{ whiteSpace: 'nowrap', ...fade }}>
            <Text typography="st11" fontWeight="semibold" color={C.grey800}>
              {props.me}
            </Text>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell(props: {
  navItems: ShellNavItem[];
  me: string | null;
  /** 위쪽 줄 오른쪽 (연결 상태, 앱으로 설치) */
  topBar: ReactNode;
  /** 흰 화면 맨 위 노란 띠 (DB 연결 실패, 실시간 구독 끊김) */
  notices: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="soft-press"
      style={{
        height: '100vh',
        display: 'flex',
        background: C.grey50,
        overflow: 'hidden',
      }}
    >
      <Sidebar items={props.navItems} me={props.me} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 70,
            flexShrink: 0,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 12,
            overflowX: 'auto',
          }}
        >
          {props.topBar}
        </div>
        <main
          className="app-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            background: C.background,
            borderTopLeftRadius: 20,
          }}
        >
          {props.notices.map((notice) => (
            <div
              key={notice}
              role="alert"
              style={{ background: C.yellow50, padding: '10px 35px' }}
            >
              <Text typography="t7" color={C.grey800}>
                {notice}
              </Text>
            </div>
          ))}
          {props.children}
        </main>
      </div>
    </div>
  );
}

/** 가운데 정렬 (빈 화면, 불러오기 실패) */
export function Centered(props: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {props.children}
    </div>
  );
}
