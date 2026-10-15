/**
 * 나에게 온 변경 화면에서 쓰는 글자 만들기예요. 화면 컴포넌트와 알림(A1)이 같이 써요.
 */
import { SOURCE_CHIP_LABELS } from '@sil/core';
import type { ChangeNotification } from '../../pwa.ts';
import type { MyChange } from '../../api/types.ts';

/** 운영체제 알림 제목은 40자 이하 (app.notify.title-length) */
export const MAX_NOTIFICATION_TITLE_LENGTH = 40;

/** 길면 끝을 줄여요(…). 줄인 뒤에도 max자 이하예요 */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  hour: 'numeric',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
});

/** 오늘이면 "오후 2:13", 아니면 "10월 13일 오후 2:13" (보는 사람의 시간대, 타입명세서 11-4) */
export function formatTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = timeFormat.format(date);
  return date.toDateString() === now.toDateString()
    ? time
    : `${dateFormat.format(date)} ${time}`;
}

/**
 * 출처 칩 글자. 칩은 하나만 붙여요. 예: "AI 대화", "코드" (app.card.source-chip-only)
 * AI가 찾았고 출처가 코드면 "PR에서 찾은 변경" (app.card.found-in-pr-code-only v2)
 */
export function sourceChipLabel(change: MyChange): string {
  return isFoundInPr(change)
    ? 'PR에서 찾은 변경'
    : SOURCE_CHIP_LABELS[change.standard.source];
}

/** AI가 찾았고 출처가 코드일 때만 PR에서 찾은 변경이에요 (app.card.found-in-pr-code-only, D61) */
export function isFoundInPr(change: MyChange): boolean {
  return change.standard.aiDetected && change.standard.source === 'code';
}

/** 이전 값이 없으면 새로 생긴 결정 사항이에요 (버전 1) */
export function isNewStandard(change: MyChange): boolean {
  return change.standard.previousValue === null;
}

/** 같은 이슈에서 이전 버전에 답한 뒤 또 바뀐 버전이면 "새 버전 vN" 칩을 붙여요 (되돌림은 되돌림 칩) */
export function isNewVersion(change: MyChange): boolean {
  return change.previousAnswer !== null && !change.standard.isRevert;
}

/** 지난번에 "관계있다"로 답했으면 다시 고쳐야 한다고 알려 줘요 (SIL-77) */
export function needsRework(change: MyChange): boolean {
  return change.previousAnswer?.affected === true;
}

/**
 * 대체된 변경을 대체한 새 버전 번호예요. 서버가 알려 주지 않아서
 * 같은 목록에서 같은 결정 사항·같은 이슈의 더 높은 버전 중 가장 가까운 것을 찾아요. 없으면 null.
 */
export function findReplacingVersion(
  change: MyChange,
  all: MyChange[],
): number | null {
  const higher = all
    .filter(
      (item) =>
        item.standard.id === change.standard.id &&
        item.issue.key === change.issue.key &&
        item.standard.version > change.standard.version,
    )
    .map((item) => item.standard.version);
  return higher.length > 0 ? Math.min(...higher) : null;
}

/**
 * 대체한 버전이 목록에 없으면 그 버전이 자동으로 닫힌 거예요. 내가 이미 확인한 값으로 되돌려져서
 * 새 확인할 변경이 생기지 않았고, 자동 닫힘은 화면에 보이지 않아요 (notify.pending.last-seen-order, notify.pending.hide-auto-closed)
 */
export const RETURNED_TO_SEEN_TEXT =
  '새 버전으로 대체됐다가, 내가 이미 확인한 값으로 돌아왔어요';

export function supersededText(version: number | null): string {
  return version === null
    ? `${RETURNED_TO_SEEN_TEXT}. 답하지 않아도 돼요`
    : `새 버전 v${version}으로 대체됐어요`;
}

/** 새 확인할 변경 OS 알림(A1). 제목은 결정 사항 제목, 본문은 "이전 값 → 지금 값" */
export function toNotification(change: MyChange): ChangeNotification {
  return {
    checkId: change.pendingCheckId,
    title: truncate(change.standard.title, MAX_NOTIFICATION_TITLE_LENGTH),
    body: `${change.standard.previousValue ?? '새 결정 사항'} → ${change.standard.value}`,
  };
}

/**
 * 이슈 번호로 묶어요. 상세 위 이슈 탭도 같은 순서를 써요.
 * 이슈 하나에 결정 사항이 여럿 걸릴 수 있어서, 상자 안은 버전 번호가 아니라 최신 변경 순이에요.
 */
export function groupByIssue(items: MyChange[]): MyChange[][] {
  const groups = new Map<string, MyChange[]>();
  for (const item of items) {
    groups.set(item.issue.key, [...(groups.get(item.issue.key) ?? []), item]);
  }
  const hasPending = (group: MyChange[]) =>
    group.some((item) => item.status === 'pending');
  return [...groups.values()]
    .map((group) =>
      [...group].sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.standard.version - a.standard.version,
      ),
    )
    .sort(
      (a, b) =>
        Number(hasPending(b)) - Number(hasPending(a)) ||
        Date.parse(b[0]!.createdAt) - Date.parse(a[0]!.createdAt),
    );
}

/** 상세 위 버전 탭: 같은 이슈에서 같은 결정 사항의 버전만, 높은 버전부터. 하나뿐이면 탭을 그리지 않아요 */
export function sameStandardVersions(
  change: MyChange,
  all: MyChange[],
): MyChange[] {
  return all
    .filter(
      (item) =>
        item.issue.key === change.issue.key &&
        item.standard.id === change.standard.id,
    )
    .sort((a, b) => b.standard.version - a.standard.version);
}
