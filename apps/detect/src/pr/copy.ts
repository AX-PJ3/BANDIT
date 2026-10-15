import type {
  DetectedChange,
  SaveStandardInput,
  StandardWithLatest,
} from '@sil/core';
import type { AskReason, PrPathOutcome } from './decide.ts';
import type { PullRequestInput } from './github.ts';

/**
 * PR 경로가 PR 댓글과 실행 요약에 쓰는 문구예요 (SIL-66).
 * "기준" 대신 "결정 사항"이라고 쓰고 (copy.term.standard), 개발 용어 대신 쉬운 말로 써요 (copy.explain.plain-words).
 * 이전 값과 지금 값은 한 문장씩 보여 줘요 (copy.explain.before-after).
 */
export const PR_COPY = {
  heading: '#### 바뀐 결정 사항 찾기',
  dryRun: '> 시험 실행이라 저장하지 않았어요. 실제로 머지되면 아래처럼 해요.',
  /** 저장소 변수 SIL_DETECT_DRY_RUN으로 저장을 꺼 둔 기간 */
  savingOff:
    '> 지금은 결정 사항을 저장하지 않고 결과만 알려 주는 기간이에요. 저장했다면 아래처럼 했을 거예요.',
  askFooter:
    '결정 사항은 그대로 두었어요. 바뀐 게 맞으면 Claude Code에서 "결정 사항을 바꿔 줘"라고 말해 주세요. 바뀐 게 아니면 이 댓글은 넘어가셔도 돼요.',
  savedFooter:
    '잘못 찾았다면 Claude Code에서 이 결정 사항을 이전 버전으로 되돌려 달라고 말해 주세요.',
  ask: {
    unsure: '이 PR에서 결정 사항이 바뀐 것 같은데 확실하지 않아요.',
    many: '이 PR에서 결정 사항이 여러 개 바뀐 것 같아요. 한 번에 하나만 저장해서 직접 확인을 부탁드려요.',
    'unknown-standard':
      '이 PR에서 바뀐 것 같은 결정 사항을 팀 결정 사항 목록에서 찾지 못했어요.',
    'not-same-twice':
      '같은 PR을 두 번 판단했는데 결과가 달라서 저장하지 않았어요.',
    locked:
      '이 PR에서 바뀐 것 같은 결정 사항이 잠겨 있어요. 잠긴 결정 사항은 사람만 바꿀 수 있어요.',
    'no-person':
      'PR을 만든 사람의 GitHub 아이디가 이름 표에 없어서 저장하지 않았어요. 이름 표(저장소 변수 SIL_GITHUB_PEOPLE)에 추가해 주세요.',
    'no-evidence':
      '결정 사항이 바뀐 것 같다는 판단이 나왔지만, 그 근거인 바뀐 코드 줄을 PR에서 확인하지 못해서 저장하지 않았어요.',
    'no-reason':
      '결정 사항이 바뀐 것 같지만, PR 제목이나 설명에서 왜 바꿨는지 찾지 못해서 저장하지 않았어요. 이유는 지어내지 않아요.',
    'too-large':
      '바뀐 내용이 너무 많아서 판단하지 않았어요. 결정 사항이 바뀌었다면 직접 알려 주세요.',
  } satisfies Record<AskReason, string>,
  rejected: {
    CHANGE_LIMIT:
      '이 결정 사항은 최근 하루 안에 이미 두 번 바뀌어서 저장하지 않았어요. 사람이 확인해 주세요.',
    VERSION_CONFLICT:
      '판단하는 동안 다른 사람이 이 결정 사항을 먼저 바꿔서 저장하지 못했어요.',
    STANDARD_LOCKED:
      '잠긴 결정 사항이라 저장하지 못했어요. 사람만 바꿀 수 있어요.',
    other: '저장하지 못했어요.',
  },
  failed:
    '이 PR을 확인하지 못했어요. 결정 사항이 바뀌었는지는 아직 몰라요. 실행 기록을 확인해 주세요.',
} as const;

export interface RenderedResult {
  /** PR 댓글. null이면 댓글을 남기지 않아요 */
  comment: string | null;
  /** 실행 요약 (job summary) */
  summary: string;
}

export function renderOutcome(
  pr: Pick<PullRequestInput, 'number' | 'author'>,
  outcome: PrPathOutcome,
  dryRun: boolean,
  dryRunNote: string = PR_COPY.dryRun,
): RenderedResult {
  const body = renderBody(pr, outcome);
  const text = [
    `${PR_COPY.heading} · PR #${pr.number}`,
    ...(dryRun ? [dryRunNote] : []),
    body,
  ].join('\n\n');
  // 관계없는 PR에는 댓글을 남기지 않아요. 시험 실행은 결과를 보려고 늘 남겨요
  const comment = outcome.kind === 'unrelated' && !dryRun ? null : text;
  return { comment, summary: text };
}

function renderBody(
  pr: Pick<PullRequestInput, 'author'>,
  outcome: PrPathOutcome,
): string {
  const mention = pr.author ? `@${pr.author} ` : '';
  switch (outcome.kind) {
    case 'unrelated':
      return outcome.areas.length > 0
        ? `바뀐 결정 사항이 없어요. (살펴본 영역: ${outcome.areas.join(', ')})`
        : '바뀐 결정 사항이 없어요.';
    case 'asked': {
      const lines = [`${mention}${PR_COPY.ask[outcome.reason]}`];
      if (outcome.judgment?.question) {
        lines.push(`> ${quiet(outcome.judgment.question)}`);
      }
      for (const change of outcome.judgment?.changes ?? []) {
        lines.push(renderChange(change, outcome.current));
      }
      lines.push(PR_COPY.askFooter);
      return lines.join('\n\n');
    }
    case 'already-applied':
      return [
        `이 PR의 변경은 결정 사항에 이미 반영돼 있어요 (v${outcome.version}). 다시 저장하지 않았어요.`,
        `- 결정 사항: \`${outcome.change.standardId}\``,
        `- 지금 값: ${quiet(outcome.change.newValue)}`,
      ].join('\n');
    case 'would-save':
      return [
        `${mention}이 PR로 결정 사항 하나가 바뀌었어요. 아래 내용으로 새 버전을 저장하려고 했어요.`,
        renderSaveInput(outcome.input, outcome.previousValue),
      ].join('\n\n');
    case 'saved': {
      const { result } = outcome;
      const lines = [
        `${mention}이 PR로 결정 사항 하나가 바뀌어서 새 버전(v${result.version})으로 저장했어요.`,
        renderSaveInput(outcome.input, outcome.previousValue),
      ];
      if (result.isRevert && result.revertedToVersion !== null) {
        lines.push(
          `이번 값은 예전 v${result.revertedToVersion}의 값과 같아서 "되돌림"으로 남겼어요.`,
        );
      }
      lines.push(
        'CHANGELOG에 붙일 한 줄이에요.',
        `\`\`\`\n${result.changelogLine}\n\`\`\``,
        PR_COPY.savedFooter,
      );
      return lines.join('\n\n');
    }
    case 'rejected': {
      const known = PR_COPY.rejected as Record<string, string>;
      return [
        `${mention}${known[outcome.code] ?? PR_COPY.rejected.other}`,
        `> ${outcome.message}`,
        renderSaveInput(outcome.input, null),
      ].join('\n\n');
    }
  }
}

function renderChange(
  change: DetectedChange,
  current: StandardWithLatest[],
): string {
  const now = current.find(({ standard }) => standard.id === change.standardId);
  return [
    `**\`${change.standardId}\`** ${now?.latest.title ?? ''}`.trim(),
    ...(now ? [`- 지금 값: ${now.latest.value}`] : []),
    `- 바뀐 것 같은 값: ${quiet(change.newValue)}`,
    `- 코드에서 바뀐 것: ${quiet(change.why)}`,
    ...(change.reasonQuote
      ? [`- PR에 적힌 이유: ${quiet(change.reasonQuote)}`]
      : []),
    ...renderLines(change.changedLines),
  ].join('\n');
}

function renderSaveInput(
  input: SaveStandardInput,
  previousValue: string | null,
): string {
  return [
    `**\`${input.id}\`** ${quiet(input.title)}`,
    ...(previousValue !== null ? [`- 이전 값: ${previousValue}`] : []),
    `- 새 값: ${quiet(input.value)}`,
    `- 이유: ${quiet(input.reason)}`,
    `- 근거: ${quiet(input.evidence ?? '')}`,
    `- 바꾼 사람: ${input.changedBy} · AI가 찾음 (출처: 코드)`,
    `- 저장할 버전: v${input.baseVersion + 1} (지금 v${input.baseVersion})`,
  ].join('\n');
}

function renderLines(lines: string[]): string[] {
  if (lines.length === 0) return [];
  // 코드 줄에 ```가 있어도 블록이 깨지지 않게 더 긴 울타리를 써요
  return ['````diff', ...lines, '````'];
}

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

/** Claude가 쓴 문장은 PR 내용을 옮길 수 있어요. @이름이 다른 사람을 부르지 않게 끊고, 줄바꿈은 한 줄로 이어요 */
function quiet(text: string): string {
  return text.replaceAll('@', `@${ZERO_WIDTH_SPACE}`).replace(/\s*\n\s*/g, ' ');
}
