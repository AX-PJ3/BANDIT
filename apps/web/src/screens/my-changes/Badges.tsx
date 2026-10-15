/**
 * 카드와 상세에 붙는 표시예요: 상태, 되돌림, 새 결정 사항, PR에서 찾음, 출처 칩.
 */
import { PENDING_CHECK_STATUS_LABELS } from '@sil/core';
import type { MyChange } from '../../api/types.ts';
import { isFoundInPr, isNewStandard, sourceChipLabel } from './format.ts';

export function StatusChip(props: { change: MyChange }) {
  return (
    <span className={`chip status-${props.change.status}`}>
      {PENDING_CHECK_STATUS_LABELS[props.change.status]}
    </span>
  );
}

export function ChangeBadges(props: { change: MyChange }) {
  const { change } = props;
  return (
    <span className="badges">
      {change.standard.isRevert && <span className="chip revert">되돌림</span>}
      {isNewStandard(change) && <span className="chip new">새 결정 사항</span>}
      {isFoundInPr(change) && <span className="chip ai">PR에서 찾음</span>}
      <span className="chip source">{sourceChipLabel(change)}</span>
    </span>
  );
}
