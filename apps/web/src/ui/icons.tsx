/**
 * 아이콘이에요. 신지님 프로토타입(SIL-69)의 그림을 그대로 옮겼어요.
 */
import { C } from './tds.tsx';

const railFill = (isActive: boolean) => ({
  fill: isActive ? C.blue500 : C.blue200,
});

/** 메뉴 접기·펼치기 */
export function SidebarToggleIcon() {
  return (
    <svg width="24" height="22" viewBox="24 71 24 20" aria-hidden>
      <rect
        x="26"
        y="72"
        width="20"
        height="18"
        rx="4"
        fill="none"
        stroke={C.grey300}
        strokeWidth="2"
      />
      <rect
        x="29"
        y="75"
        width="5"
        height="12"
        rx="2"
        style={{ fill: C.grey300 }}
      />
    </svg>
  );
}

/** 메뉴: 나에게 온 변경 */
export function InboxIcon(props: { isActive: boolean }) {
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" aria-hidden>
      <rect
        width="50"
        height="50"
        rx="15.3846"
        style={railFill(props.isActive)}
      />
      <path
        d="M25 15.7142H22.1429C18.5925 15.7142 15.7143 18.5924 15.7143 22.1428V27.8571C15.7143 31.4075 18.5925 34.2857 22.1429 34.2857H27.8572C31.4076 34.2857 34.2857 31.4075 34.2857 27.8571V24.9999"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="31.4286" cy="18.5714" r="3.57143" fill="#fff" />
    </svg>
  );
}

/** 메뉴: 변경 상세 */
export function DetailIcon(props: { isActive: boolean }) {
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" aria-hidden>
      <rect
        width="50"
        height="50"
        rx="15.3846"
        style={railFill(props.isActive)}
      />
      <path
        d="M20.7143 34.2857H29.2857C32.0471 34.2857 34.2857 32.0471 34.2857 29.2857V20.7142C34.2857 17.9528 32.0471 15.7142 29.2857 15.7142H20.7143C17.9529 15.7142 15.7143 17.9528 15.7143 20.7142V29.2857C15.7143 32.0471 17.9529 34.2857 20.7143 34.2857Z"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
      />
      <line
        x1="20"
        y1="22"
        x2="30"
        y2="22"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="28"
        x2="26"
        y2="28"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 메뉴 아래 내 이름 동그라미 (프로토타입은 글자 그림, 여기는 이름 첫 글자) */
export function AvatarIcon(props: { name: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 35,
        height: 35,
        borderRadius: '50%',
        background: C.purple500,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {[...props.name][0]}
    </span>
  );
}

/** 알림 꺼짐 종 */
export function BellOffIcon() {
  return (
    <svg width="50" height="50" viewBox="185 247 50 50" aria-hidden>
      <rect
        x="185"
        y="247"
        width="50"
        height="50"
        rx="15.3846"
        style={{ fill: C.blue500 }}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M203.782 266.397C204.949 264.683 206.917 263.195 210.002 263.195C213.087 263.195 215.054 264.683 216.222 266.397C217.362 268.072 217.752 269.971 217.752 270.945V275.823L219.042 279.695H200.961L202.252 275.823V270.945C202.252 269.971 202.641 268.072 203.782 266.397Z"
        fill="#fff"
      />
      <path
        d="M208.75 263.282C209.145 263.225 209.562 263.195 210.002 263.195C210.44 263.195 210.856 263.226 211.25 263.282V262.659C211.25 262.312 211.128 262.017 210.885 261.774C210.641 261.531 210.346 261.409 209.999 261.409C209.652 261.409 209.357 261.531 209.114 261.774C208.872 262.017 208.75 262.312 208.75 262.659V263.282Z"
        fill="#fff"
      />
      <path
        d="M210.001 282.436C209.504 282.436 209.078 282.259 208.725 281.905C208.372 281.551 208.195 281.125 208.195 280.628H211.811C211.811 281.127 211.634 281.553 211.279 281.906C210.925 282.259 210.499 282.436 210.001 282.436Z"
        fill="#fff"
      />
      <path
        d="M198.646 282.36L219.86 261.146"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="1374 236 10 10" aria-hidden>
      <path
        d="M1384 246L1374 236M1374 246L1384 236"
        stroke={C.grey900}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "AI 대화에서 바꿈" 칩의 반짝이 */
export function SparkleIcon() {
  return (
    <svg width="11" height="11" viewBox="420 722 11 11" aria-hidden>
      <path
        d="M424.107 725.002C424.114 724.969 424.16 724.969 424.167 725.002C424.51 726.679 425.821 727.99 427.498 728.333C427.531 728.34 427.531 728.386 427.498 728.393C425.821 728.736 424.51 730.047 424.167 731.724C424.16 731.757 424.114 731.757 424.107 731.724C423.764 730.047 422.453 728.736 420.776 728.393C420.743 728.386 420.743 728.34 420.776 728.333C422.453 727.99 423.764 726.679 424.107 725.002Z"
        fill="currentColor"
      />
      <path
        d="M423.39 724.775C423.615 724.018 424.738 724.044 424.903 724.851C425.186 726.234 426.266 727.314 427.649 727.597C428.482 727.767 428.482 728.958 427.649 729.129C426.266 729.411 425.186 730.492 424.903 731.875C424.733 732.708 423.542 732.708 423.371 731.875C423.089 730.492 422.008 729.411 420.625 729.129C419.792 728.958 419.792 727.767 420.625 727.597L420.754 727.568C422.075 727.247 423.097 726.191 423.371 724.851L423.39 724.775ZM424.137 726.878C423.752 727.472 423.246 727.978 422.652 728.363C423.246 728.748 423.752 729.254 424.137 729.847C424.522 729.254 425.028 728.748 425.622 728.363C425.028 727.978 424.522 727.472 424.137 726.878Z"
        fill="currentColor"
      />
      <path
        d="M428.366 722.73C428.428 722.423 428.866 722.423 428.929 722.73C429.068 723.407 429.597 723.937 430.274 724.075C430.581 724.138 430.581 724.576 430.274 724.639C429.597 724.777 429.068 725.307 428.929 725.984C428.866 726.291 428.428 726.291 428.366 725.984C428.227 725.307 427.698 724.777 427.02 724.639C426.714 724.576 426.714 724.138 427.02 724.075C427.698 723.937 428.227 723.407 428.366 722.73Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 상세 "지금 해야 할 일" 옆 주황 안내의 느낌표 */
export function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5v5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

const CHECK_PATH =
  'm10.4099 17.8538c-.3393 0-.67866-.1131-.90488-.4524l-5.20306-5.2031c-.56556-.5655-.56556-1.3573 0-1.9228.56555-.56559 1.35732-.56559 1.92287 0l4.18507 4.185 7.4653-7.46523c.5655-.56555 1.3573-.56555 1.9228 0 .5656.56555.5656 1.35732 0 1.92287l-8.3701 8.37016c-.3393.4524-.6787.5655-1.018.5655z';

/** 답 여부 체크 (아직 답 안 함은 회색, 내가 답함은 파란색) */
export function CheckIcon(props: { isDone: boolean; label: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={props.label}
      style={{ width: 20, height: 20, flex: '0 0 auto', display: 'block' }}
    >
      <path
        d={CHECK_PATH}
        fill={props.isDone ? C.blue500 : '#EDEFF0'}
        style={{ transition: 'fill 160ms ease-out' }}
      />
    </svg>
  );
}
