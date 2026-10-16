/**
 * 앱 틀이에요: 왼쪽 아이콘 메뉴(120px, 펼치면 300px), 위쪽 줄(70px), 왼쪽 위가 둥근 흰 화면.
 * 크기·여백은 프로토타입(SIL-69)과 같아요.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AvatarIcon, SidebarToggleIcon } from './icons.tsx';
import { Badge, C, Text } from './tds.tsx';

/** 메뉴 아래 프로필에서 화면을 볼 사람을 고르는 데 필요한 값이에요 (로그인 대신, SIL-74) */
export interface ShellProfile {
  me: string | null;
  /** 고를 수 있는 이름 (이슈 담당자). 불러오는 중이면 null이에요 */
  people: string[] | null;
  onChangeMe: (name: string) => void;
}

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

/**
 * 메뉴 아래 프로필이에요. 누르면 위로 이름 목록이 열리고, 고르면 그 사람으로 화면을 다시 불러와요.
 * 로그인이 없어서 이걸로 누구인지 정해요 (SIL-74). 고른 이름은 이 브라우저가 기억해요 (me.ts).
 */
function ProfileMenu(props: {
  profile: ShellProfile;
  isSidebarOpen: boolean;
  fade: { opacity: number; transition: string };
}) {
  const { me, people, onChangeMe } = props.profile;
  /** 열린 메뉴의 화면 위치예요. 닫혀 있으면 null이에요 */
  const [menuAt, setMenuAt] = useState<{ left: number; bottom: number } | null>(
    null,
  );
  const isMenuOpen = menuAt !== null;
  const closeMenu = () => setMenuAt(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const label = me ?? '누구인지 골라 주세요';
  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
        aria-label={me ? `${me} (다른 사람으로 보기)` : '누구인지 고르기'}
        onClick={(event) => {
          if (isMenuOpen) return closeMenu();
          // 메뉴 칸이 넘치는 부분을 가려서, 목록은 화면 기준으로 버튼 바로 위에 띄워요
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuAt({
            left: rect.left,
            bottom: window.innerHeight - rect.top + 12,
          });
        }}
        style={{
          border: 0,
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
        }}
      >
        <HoverLabel
          label={label}
          placement="top"
          isDisabled={props.isSidebarOpen || isMenuOpen}
        >
          <AvatarIcon name={me ?? '?'} />
        </HoverLabel>
        <div
          aria-hidden={!props.isSidebarOpen}
          style={{ whiteSpace: 'nowrap', ...props.fade }}
        >
          <Text
            typography="st11"
            fontWeight="semibold"
            color={me ? C.grey800 : C.grey500}
          >
            {label}
          </Text>
        </div>
      </button>
      {menuAt && (
        <div
          style={{
            position: 'fixed',
            left: menuAt.left,
            bottom: menuAt.bottom,
            zIndex: 10000,
            width: 220,
            maxHeight: 320,
            overflowY: 'auto',
            borderRadius: 16,
            padding: 8,
            boxSizing: 'border-box',
            boxShadow: '0 8px 28px rgba(0,29,58,0.1)',
            background: 'var(--adaptiveFloatBackground)',
          }}
        >
          <div style={{ padding: '6px 10px 8px' }}>
            <Text typography="st12" fontWeight="semibold" color={C.grey600}>
              누구로 볼까요?
            </Text>
          </div>
          {people === null && (
            <div style={{ padding: '8px 10px' }}>
              <Text typography="t7" color={C.grey500}>
                이름을 불러오는 중이에요
              </Text>
            </div>
          )}
          {people?.length === 0 && (
            <div style={{ padding: '8px 10px' }}>
              <Text typography="t7" color={C.grey500}>
                고를 수 있는 이름이 없어요. 이슈에 담당자가 있어야 해요.
              </Text>
            </div>
          )}
          <div role="listbox" aria-label="누구로 볼까요?">
            {people?.map((name) => {
              const isSelected = name === me;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    closeMenu();
                    if (!isSelected) onChangeMe(name);
                  }}
                  style={{
                    width: '100%',
                    border: 0,
                    borderRadius: 10,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    background: isSelected ? C.grey100 : 'none',
                    textAlign: 'left',
                  }}
                >
                  <AvatarIcon name={name} />
                  <span style={{ flex: 1 }}>
                    <Text
                      typography="st11"
                      fontWeight={isSelected ? 'bold' : 'medium'}
                      color={C.grey800}
                    >
                      {name}
                    </Text>
                  </span>
                  {isSelected && (
                    <Text typography="st12" color={C.blue500}>
                      지금
                    </Text>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar(props: { items: ShellNavItem[]; profile: ShellProfile }) {
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
      <ProfileMenu profile={props.profile} isSidebarOpen={isOpen} fade={fade} />
    </div>
  );
}

export function AppShell(props: {
  navItems: ShellNavItem[];
  profile: ShellProfile;
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
      <Sidebar items={props.navItems} profile={props.profile} />
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
