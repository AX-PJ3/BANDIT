import { appendFile } from 'node:fs/promises';
import { z } from 'zod';

/**
 * GitHub REST API로 PR을 읽고 댓글을 써요 (SIL-66 PR 경로). Node에 들어 있는 fetch만 써요.
 * 토큰은 GitHub Actions가 주는 GITHUB_TOKEN이에요. 권한은 detect.yml에서 PR 읽기와 댓글 쓰기만 줘요.
 * 토큰은 요청 머리글에만 넣고 로그·댓글에 남기지 않아요.
 */

/** 판단에 쓰는 PR 내용 */
export interface PullRequestInput {
  number: number;
  title: string;
  body: string;
  /** PR 작성자의 GitHub 아이디 */
  author: string;
  url: string;
  /** PR 전체 diff */
  diff: string;
}

export interface PullRequestState {
  merged: boolean;
  /** 머지하려는(머지된) 브랜치. 예: main */
  baseRef: string;
  /** GitHub가 diff를 너무 커서 주지 않았는지 (406). 이때 pr.diff는 빈 글자예요 */
  diffTooLarge: boolean;
}

export interface GitHubClient {
  readPullRequest(
    number: number,
  ): Promise<{ pr: PullRequestInput; state: PullRequestState }>;
  comment(number: number, body: string): Promise<void>;
}

const API = 'https://api.github.com';

const pullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string(),
  merged: z.boolean(),
  user: z.object({ login: z.string() }).nullable(),
  base: z.object({ ref: z.string() }),
});

export function createGitHubClient(
  token: string,
  repository: string,
): GitHubClient {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`저장소 이름이 owner/repo 모양이 아니에요: ${repository}`);
  }
  const request = async (
    path: string,
    init: RequestInit & { accept?: string; allowStatus?: number } = {},
  ): Promise<Response> => {
    const response = await fetch(`${API}/repos/${repository}${path}`, {
      ...init,
      headers: {
        Accept: init.accept ?? 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sil-detect',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!response.ok && response.status !== init.allowStatus) {
      // 응답 본문에 토큰이 들어가지는 않지만, 상태 코드와 경로만 남겨요
      throw new Error(
        `GitHub API ${init.method ?? 'GET'} ${path}가 ${response.status}로 실패했어요.`,
      );
    }
    return response;
  };

  return {
    async readPullRequest(number) {
      const [pullResponse, diffResponse] = await Promise.all([
        request(`/pulls/${number}`),
        // 아주 큰 PR은 GitHub가 diff를 406으로 주지 않아요. 실패로 끝내지 않고 사람에게 묻게 해요
        request(`/pulls/${number}`, {
          accept: 'application/vnd.github.diff',
          allowStatus: 406,
        }),
      ]);
      const diffTooLarge = diffResponse.status === 406;
      const pull = pullSchema.parse(await pullResponse.json());
      return {
        pr: {
          number: pull.number,
          title: pull.title,
          body: pull.body ?? '',
          author: pull.user?.login ?? '',
          url: pull.html_url,
          diff: diffTooLarge ? '' : await diffResponse.text(),
        },
        state: { merged: pull.merged, baseRef: pull.base.ref, diffTooLarge },
      };
    },
    async comment(number, body) {
      await request(`/issues/${number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    },
  };
}

/** GitHub Actions 실행 요약(job summary)에 마크다운을 덧붙여요. 파일이 없으면(내 컴퓨터) 아무것도 안 해요 */
export async function writeJobSummary(
  summaryPath: string | undefined,
  markdown: string,
): Promise<void> {
  if (!summaryPath) return;
  await appendFile(summaryPath, `${markdown}\n`);
}
