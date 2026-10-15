/**
 * 카드와 상세에 붙는 칩이에요: 상태, 새 결정 사항, 새 버전, 되돌림, 출처(PR에서 찾은 변경 포함), 완료된 이슈.
 * 색과 크기는 프로토타입(SIL-69)과 같아요.
 */
import type { MyChange } from '../../api/types.ts';
import { SparkleIcon } from '../../ui/icons.tsx';
import { Chip, type ChipTone } from '../../ui/tds.tsx';
import {
  isFoundInPr,
  isNewStandard,
  isNewVersion,
  sourceChipLabel,
} from './format.ts';

const STATUS: Record<MyChange['status'], { label: string; tone: ChipTone }> = {
  pending: { label: '대기', tone: 'orange' },
  answered: { label: '답함', tone: 'blueFill' },
  superseded: { label: '대체됨', tone: 'gray' },
};

export function statusLabel(change: MyChange): string {
  return STATUS[change.status].label;
}

/** 카드 왼쪽 상태 칸 (폭 96px) */
export function StatusCell(props: { change: MyChange }) {
  const status = STATUS[props.change.status];
  return (
    <div style={{ width: 96, display: 'flex' }}>
      <Chip tone={status.tone}>{status.label}</Chip>
    </div>
  );
}

/** 상세 제목 옆 상태 칩. 대기는 보여 주지 않아요 */
export function StatusChip(props: { change: MyChange }) {
  if (props.change.status === 'pending') return null;
  const status = STATUS[props.change.status];
  return (
    <Chip inline tone={status.tone}>
      {status.label}
    </Chip>
  );
}

/** 새 결정 사항, 새 버전, 되돌림 */
export function KindChips(props: { change: MyChange }) {
  const { change } = props;
  return (
    <>
      {isNewStandard(change) && (
        <Chip inline tone="blue">
          새 결정 사항
        </Chip>
      )}
      {isNewVersion(change) && (
        <Chip inline tone="blue">
          새 버전 v{change.standard.version}
        </Chip>
      )}
      {change.standard.isRevert && (
        <Chip inline tone="purple">
          되돌림
        </Chip>
      )}
    </>
  );
}

/**
 * 출처 칩 하나. 모두 같은 모양이고 AI 대화에만 반짝 아이콘을 붙여요 (신지님 시안 10/15)
 * (app.card.source-chip-only, app.card.found-in-pr-code-only v2)
 */
export function SourceChips(props: { change: MyChange }) {
  const { change } = props;
  const isAiChat = change.standard.source === 'ai_chat' && !isFoundInPr(change);
  return (
    <Chip inline tone="ai" icon={isAiChat ? <SparkleIcon /> : undefined}>
      {sourceChipLabel(change)}
    </Chip>
  );
}
