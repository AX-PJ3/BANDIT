import { z } from 'zod';

/**
 * GitHub 아이디 → 팀 이름 표예요 (SIL-66 PR 경로).
 * 표는 GitHub 저장소 변수 SIL_GITHUB_PEOPLE에 JSON으로 둬요. 예: {"k0nghaa":"경하","mick243":"정민"}
 * 결정 사항에는 이름으로만 남겨요 (사람은 이름으로만 구분). 표에 없는 사람이면 저장하지 않고 댓글로 알려요.
 */
const peopleSchema = z.record(
  z.string().trim().min(1),
  z.string().trim().min(1),
);

export type PeopleMap = ReadonlyMap<string, string>;

/** 비어 있으면 빈 표예요. 모양이 틀리면 에러를 던져요 (조용히 빈 표로 두면 모든 PR이 "표에 없음"이 돼요) */
export function parsePeople(json: string | undefined): PeopleMap {
  if (!json?.trim()) return new Map();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(
      'SIL_GITHUB_PEOPLE이 JSON이 아니에요. 예: {"k0nghaa":"경하"}',
    );
  }
  const result = peopleSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      'SIL_GITHUB_PEOPLE은 {"GitHub 아이디":"팀 이름"} 모양이어야 해요.',
    );
  }
  // GitHub 아이디는 대소문자를 가리지 않아요
  return new Map(
    Object.entries(result.data).map(([login, name]) => [
      login.toLowerCase(),
      name,
    ]),
  );
}

export function findTeamName(
  people: PeopleMap,
  githubLogin: string,
): string | null {
  return people.get(githubLogin.toLowerCase()) ?? null;
}
