/**
 * 내가 누구인지(me) 정해요. 로그인이 없고 사람은 이름으로만 구분해요 (착수 안내 2절).
 *
 * 메뉴 아래 프로필을 눌러 이슈 담당자 중에서 고르면 이 브라우저에 저장해요 (10/16 호윤, SIL-74).
 * 주소에 ?me=<이름>을 붙여 열어도 그 이름을 저장하고 주소에서 지워요 (10/15 호윤).
 * 다음부터는 저장한 이름으로 열려요.
 */
const ME_PARAM = 'me';
const ME_STORAGE_KEY = 'haribo:me';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(ME_STORAGE_KEY);
  } catch (_error) {
    // 사생활 보호 창처럼 저장소를 못 쓰면 주소의 이름만 써요
    return null;
  }
}

/** 고른 이름을 이 브라우저에 저장해요. 다음에 열 때도 이 이름으로 열려요 */
export function saveMe(name: string): void {
  try {
    window.localStorage.setItem(ME_STORAGE_KEY, name);
  } catch (_error) {
    // 저장하지 못해도 이번에 연 창에서는 그 이름을 써요
  }
}

/** 주소의 ?me=, 저장한 이름, fallback 순서로 찾아요. 없으면 null이에요 */
export function readMe(fallback: string | null = null): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(ME_PARAM)?.trim();
  if (fromUrl) {
    saveMe(fromUrl);
    url.searchParams.delete(ME_PARAM);
    window.history.replaceState(window.history.state, '', url);
    return fromUrl;
  }
  return readStored()?.trim() || fallback;
}
