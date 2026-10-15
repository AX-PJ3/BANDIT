/**
 * 화면 부품이에요. 신지님 프로토타입(SIL-69)이 쓰는 TDS(토스 디자인 시스템) 부품과 크기·여백·글자 값을 그대로 옮겼어요.
 * 색은 styles.css의 TDS 색 변수(--adaptive*)를 써요. 프로토타입이 바뀌면 여기 값을 같이 고쳐요.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

const color = (name: string) => `var(--adaptive${name})`;

/** 프로토타입의 색 이름 (TDS) */
export const C = {
  background: color('Background'),
  grey50: color('Grey50'),
  grey100: color('Grey100'),
  grey200: color('Grey200'),
  grey300: color('Grey300'),
  grey400: color('Grey400'),
  grey500: color('Grey500'),
  grey600: color('Grey600'),
  grey700: color('Grey700'),
  grey800: color('Grey800'),
  grey900: color('Grey900'),
  blue50: color('Blue50'),
  blue100: color('Blue100'),
  blue200: color('Blue200'),
  blue500: color('Blue500'),
  blue700: color('Blue700'),
  green50: color('Green50'),
  green700: color('Green700'),
  red50: color('Red50'),
  red500: color('Red500'),
  red600: color('Red600'),
  purple500: color('Purple500'),
  yellow50: color('Yellow50'),
} as const;

// ---------------------------------------------------------------------------
// 글자
// ---------------------------------------------------------------------------

const TYPOGRAPHY = {
  t3: [22, 31],
  t4: [20, 28],
  t5: [17, 25.5],
  t6: [15, 22.5],
  t7: [13, 19.5],
  st10: [16, 24],
  st11: [14, 21],
  st12: [12, 18],
} as const;
const WEIGHT = { bold: 700, semibold: 600, medium: 500, regular: 400 };

export type Typography = keyof typeof TYPOGRAPHY;

export function Text(props: {
  typography?: Typography;
  fontWeight?: keyof typeof WEIGHT;
  color?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [size, lineHeight] = TYPOGRAPHY[props.typography ?? 't6'];
  return (
    <span
      style={{
        position: 'relative',
        verticalAlign: 'middle',
        maxWidth: '100%',
        overflowWrap: 'anywhere',
        wordBreak: 'keep-all',
        fontSize: size,
        lineHeight: `${lineHeight}px`,
        fontWeight: WEIGHT[props.fontWeight ?? 'regular'],
        color: props.color,
        ...props.style,
      }}
    >
      {props.children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 배지와 칩
// ---------------------------------------------------------------------------

/** 작은 배지 (TDS Badge). 메뉴의 개수, 위쪽 줄의 연결 상태에 써요 */
export function Badge(props: {
  size: 'xsmall' | 'medium';
  tone: 'red' | 'green' | 'elephant';
  variant: 'fill' | 'weak';
  children: ReactNode;
}) {
  const size =
    props.size === 'xsmall'
      ? { fs: 10, pad: '3px 7px', r: 9, h: 21, fw: 600 }
      : { fs: 13, pad: '4px 9px', r: 12, h: 28, fw: 700 };
  const tone = {
    red: { fill: '#f04452', weakBg: 'rgba(240,68,82,0.14)', weakFg: '#e42939' },
    green: {
      fill: '#03b26c',
      weakBg: 'rgba(3,178,108,0.14)',
      weakFg: '#02a262',
    },
    elephant: {
      fill: '#6b7684',
      weakBg: 'rgba(78,89,104,0.1)',
      weakFg: '#4e5968',
    },
  }[props.tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        minHeight: size.h - 6,
        padding: size.pad,
        borderRadius: size.r,
        fontSize: size.fs,
        fontWeight: size.fw,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        color: props.variant === 'fill' ? '#ffffff' : tone.weakFg,
        backgroundColor: props.variant === 'fill' ? tone.fill : tone.weakBg,
      }}
    >
      {props.children}
    </span>
  );
}

export type ChipTone =
  'orange' | 'blue' | 'blueFill' | 'ai' | 'gray' | 'green' | 'red' | 'purple';

/** 줄 안에 붙는 작은 칩(inline)의 색 */
const INLINE_TONES: Record<ChipTone, { bg: string; color: string }> = {
  orange: { bg: '#FFF1E0', color: '#E8590C' },
  blue: { bg: C.blue50, color: C.blue700 },
  blueFill: { bg: C.blue500, color: '#FFFFFF' },
  ai: { bg: C.blue500, color: '#FFFFFF' },
  gray: { bg: C.grey100, color: C.grey600 },
  green: { bg: C.green50, color: C.green700 },
  red: { bg: C.red50, color: C.red600 },
  purple: { bg: '#F3EBFF', color: '#7B3FE4' },
};
/** 큰 칩(상태 칸)에서만 다른 색 */
const BLOCK_TONES: Partial<Record<ChipTone, { bg: string; color: string }>> = {
  blue: { bg: '#E9F1FC', color: '#1F72EA' },
  blueFill: { bg: '#E9F1FC', color: '#1F72EA' },
  gray: { bg: '#F1F2F4', color: '#4A4D52' },
};

/** 상태·출처 칩. inline이면 제목 옆에 붙는 작은 칩, 아니면 왼쪽 상태 칸의 큰 칩이에요 */
export function Chip(props: {
  tone: ChipTone;
  inline?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const isBlock = !props.inline;
  const tone = (isBlock && BLOCK_TONES[props.tone]) || INLINE_TONES[props.tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        minHeight: 18,
        gap: 4,
        padding: isBlock ? '6px 13px' : '2.5px 8px',
        borderRadius: isBlock ? 9 : 6,
        fontSize: isBlock ? 13 : 12,
        fontWeight: 700,
        lineHeight: isBlock ? '20px' : 1.5,
        whiteSpace: 'nowrap',
        color: tone.color,
        backgroundColor: tone.bg,
      }}
    >
      {props.icon}
      <span style={{ fontWeight: 500 }}>{props.children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 버튼
// ---------------------------------------------------------------------------

const BUTTON_SIZES = {
  large: { h: 48, r: 14, fs: 17, pad: '2px 16px' },
  medium: { h: 38, r: 10, fs: 15, pad: '2px 14px' },
  small: { h: 32, r: 10, fs: 13, pad: '2px 12px' },
} as const;

/** TDS Button. weak(옅은) 버튼의 색은 style로 바꿔요 */
export function Button(props: {
  size?: keyof typeof BUTTON_SIZES;
  variant?: 'fill' | 'weak';
  isBlock?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  'aria-pressed'?: boolean;
  children: ReactNode;
}) {
  const size = BUTTON_SIZES[props.size ?? 'large'];
  const isFill = (props.variant ?? 'fill') === 'fill';
  return (
    <button
      type="button"
      data-tds="button"
      disabled={props.disabled}
      aria-pressed={props['aria-pressed']}
      onClick={props.onClick}
      style={{
        position: 'relative',
        display: props.isBlock ? 'flex' : 'inline-flex',
        width: props.isBlock ? '100%' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        height: size.h,
        minHeight: size.h,
        padding: size.pad,
        border: 0,
        borderRadius: size.r,
        background: isFill ? '#3182f6' : 'rgba(222,222,255,0.19)',
        color: isFill ? '#ffffff' : '#4e5968',
        fontFamily: 'inherit',
        fontSize: size.fs,
        fontWeight: 600,
        lineHeight: 1.25,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        ...props.style,
      }}
    >
      {props.children}
    </button>
  );
}

function ArrowIcon(props: { size: number }) {
  return (
    <svg
      width={props.size}
      height={props.size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 글자만 있는 버튼 (TDS TextButton). "목록으로", "다음 변경 ›" */
export function TextButton(props: {
  size: 'xsmall' | 'medium';
  color?: string;
  hasArrow?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const fontSize = props.size === 'xsmall' ? 13 : 17;
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: 0,
        background: 'none',
        padding: 0,
        fontFamily: 'inherit',
        fontSize,
        fontWeight: 500,
        lineHeight: 1.252,
        color: props.color ?? C.grey600,
        cursor: 'pointer',
      }}
    >
      {props.children}
      {props.hasArrow && <ArrowIcon size={Math.round(fontSize * 1.25)} />}
    </button>
  );
}

/** 두세 개 중 하나를 고르는 칸 (전체 / 이슈 별로 보기) */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      style={{
        display: 'inline-flex',
        padding: 5,
        borderRadius: 15,
        background: C.grey100,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {props.options.map((option) => {
        const isSelected = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => props.onChange(option.value)}
            style={{
              height: 34,
              padding: '0 15px',
              border: 0,
              borderRadius: 11,
              cursor: 'pointer',
              background: isSelected ? '#FFFFFF' : 'transparent',
              boxShadow: isSelected ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
              transition:
                'background 150ms ease-out, box-shadow 150ms ease-out',
            }}
          >
            <Text
              typography="st12"
              fontWeight={isSelected ? 'bold' : 'medium'}
              color={isSelected ? C.grey900 : C.grey600}
            >
              {option.label}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

/** 상세 위쪽의 이슈 탭 (검은 알약) */
export function Pill(props: { isActive: boolean; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 12px',
        borderRadius: 999,
        background: props.isActive ? '#252525' : C.grey100,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <Text typography="t7" color={props.isActive ? '#FFFFFF' : C.grey600}>
        {props.children}
      </Text>
    </span>
  );
}

// ---------------------------------------------------------------------------
// 목록 줄, 단계, 입력
// ---------------------------------------------------------------------------

/** 누를 수 있는 목록 한 줄 (TDS ListRow, 위아래 16px · 양옆 24px) */
export function ListRow(props: {
  left?: ReactNode;
  contents: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="tds-row"
      role={props.onClick ? 'button' : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={(event) => {
        if (props.onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          props.onClick();
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        boxSizing: 'border-box',
        padding: '16px 24px',
        cursor: props.onClick ? 'pointer' : 'default',
      }}
    >
      {props.onClick && <div className="tds-touch" />}
      {props.left != null && (
        <span style={{ position: 'relative', flexShrink: 0 }}>
          {props.left}
        </span>
      )}
      <span
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          margin: props.left != null ? '0 0 0 12px' : 0,
        }}
      >
        {props.contents}
      </span>
      {props.right != null && (
        <span
          style={{
            position: 'relative',
            flexShrink: 0,
            alignSelf: 'center',
            margin: '0 0 0 12px',
          }}
        >
          {props.right}
        </span>
      )}
    </div>
  );
}

/** 진행 단계 (TDS ProgressStepper). 회색 길 위에 단계 점, 지금 단계는 점 둘레가 빛나요 */
export function ProgressSteps(props: {
  steps: string[];
  current: number;
  description: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const descriptionRef = useRef<HTMLSpanElement>(null);
  const [descriptionLeft, setDescriptionLeft] = useState<number | null>(null);

  // 설명을 지금 단계 이름 가운데 아래에 두고, 양 끝을 넘지 않게 맞춰요 (프로토타입과 같은 계산)
  useLayoutEffect(() => {
    const place = () => {
      const root = rootRef.current;
      const label = labelRefs.current[props.current];
      const description = descriptionRef.current;
      if (!root || !label || !description) return;
      const rootBox = root.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const center = labelBox.left + labelBox.width / 2 - rootBox.left;
      const width = description.offsetWidth;
      setDescriptionLeft(
        Math.max(0, Math.min(center - width / 2, rootBox.width - width)),
      );
    };
    place();
    const observer = new ResizeObserver(place);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [props.current, props.description]);

  return (
    <div ref={rootRef}>
      <div style={{ paddingTop: 4 }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 24,
              right: 24,
              height: 8,
              borderRadius: 40,
              background: '#edeff2',
            }}
          />
          {props.steps.map((step, index) => (
            <div
              key={step}
              role="text"
              aria-current={index === props.current ? 'step' : undefined}
              style={{
                position: 'relative',
                width: 48,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '100%',
                  background:
                    index <= props.current
                      ? C.blue500
                      : 'rgba(253,253,254,0.89)',
                  opacity: index <= props.current ? 1 : 0.2,
                  boxShadow:
                    index === props.current
                      ? '0 0 0 4px rgba(49,130,246,0.22)'
                      : undefined,
                }}
              />
              <div
                ref={(element) => {
                  labelRefs.current[index] = element;
                }}
                style={{
                  fontSize: 13,
                  lineHeight: '19.5px',
                  fontWeight: index === props.current ? 500 : 400,
                  color: C.grey900,
                  textAlign: 'center',
                  wordBreak: 'keep-all',
                  width: '100%',
                }}
              >
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: 20, marginTop: 6 }}>
        <span
          ref={descriptionRef}
          style={{
            position: 'absolute',
            top: 0,
            left: descriptionLeft ?? 0,
            whiteSpace: 'nowrap',
            visibility: descriptionLeft === null ? 'hidden' : 'visible',
          }}
        >
          <Text typography="st12" color={C.grey600}>
            {props.description}
          </Text>
        </span>
      </div>
    </div>
  );
}

/** 여러 줄 입력 (TDS TextArea box). 관계없는 이유 */
export function TextArea(props: {
  label: string;
  placeholder: string;
  value: string;
  isInvalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = props.isInvalid
    ? C.red500
    : isFocused
      ? 'rgba(49,130,246,0.6)'
      : 'rgba(2,32,71,0.05)';
  return (
    <div style={{ padding: '16px 0' }}>
      <div
        style={{
          padding: '0 20px',
          marginBottom: 5.5,
          fontSize: 13,
          lineHeight: '19.5px',
          color: C.grey800,
        }}
      >
        {props.label}
      </div>
      <div style={{ padding: '0 20px' }}>
        <div
          style={{
            boxSizing: 'border-box',
            minHeight: 96,
            padding: '14px 16px',
            borderRadius: 14,
            background: 'rgba(0,23,51,0.02)',
            border: `1px solid ${borderColor}`,
            transition: 'border-color 0.15s',
          }}
        >
          <textarea
            className="tds-textarea"
            aria-label={props.label}
            aria-invalid={props.isInvalid}
            value={props.value}
            placeholder={props.placeholder}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(event) => props.onChange(event.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: 64,
              boxSizing: 'border-box',
              border: 0,
              outline: 0,
              resize: 'none',
              padding: 0,
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 17,
              lineHeight: '25.5px',
              color: C.grey800,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 화면 묶음
// ---------------------------------------------------------------------------

/** 상세의 칸 제목 ("지금 해야 할 일", "현재 상태"). 위 32px, 아래 bottom px */
export function SectionTitle(props: {
  description?: string;
  bottom?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  const texts = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: 1,
        minWidth: 0,
      }}
    >
      <Text typography="t6" fontWeight="bold" color={C.grey900}>
        {props.children}
      </Text>
      {props.description && (
        <Text typography="t7" color={C.grey600}>
          {props.description}
        </Text>
      )}
    </div>
  );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        margin: `32px 0 ${props.bottom ?? 12}px`,
      }}
    >
      {texts}
      {props.right && <div style={{ flexShrink: 0 }}>{props.right}</div>}
    </div>
  );
}

/** 가운데 큰 안내 (TDS Result). 빈 화면, 불러오기 실패, 이름 없음 */
export function Result(props: {
  title: string;
  description?: string;
  button?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '24px 20px',
      }}
    >
      <div
        style={{
          fontSize: 22,
          lineHeight: '31px',
          fontWeight: 700,
          color: C.grey900,
        }}
      >
        {props.title}
      </div>
      {props.description && (
        <div
          style={{
            marginTop: 8,
            fontSize: 15,
            lineHeight: '22.5px',
            color: C.grey600,
            whiteSpace: 'pre-line',
          }}
        >
          {props.description}
        </div>
      )}
      {props.button && <div style={{ marginTop: 24 }}>{props.button}</div>}
    </div>
  );
}

/** 불러오는 중 (TDS Skeleton) */
export function Skeleton() {
  const bar = (width: string, height = 16) => (
    <div
      style={{
        width,
        height,
        borderRadius: 8,
        background: C.grey100,
        marginBottom: 12,
      }}
    />
  );
  return (
    <div aria-label="불러오는 중">
      {bar('40%', 24)}
      {bar('90%')}
      {bar('75%')}
      {bar('85%')}
    </div>
  );
}

/** 잠깐 떴다 사라지는 알림 (TDS Toast) */
export function Toast(props: { text: string | null; onClose: () => void }) {
  const { text, onClose } = props;
  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [text, onClose]);
  if (!text) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 20,
        right: 20,
        bottom: 24,
        zIndex: 10001,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 520,
          padding: '14px 20px',
          borderRadius: 16,
          background: 'rgba(25,31,40,0.92)',
          color: '#fff',
          fontSize: 15,
          lineHeight: '22.5px',
          fontWeight: 500,
        }}
      >
        {text}
      </div>
    </div>
  );
}
