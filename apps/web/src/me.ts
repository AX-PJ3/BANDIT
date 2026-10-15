/**
 * 내가 누구인지(me) 정해요. 로그인이 없고 사람은 이름으로만 구분해요 (착수 안내 2절).
 *
 * 주소에 ?me=<이름>을 붙여 열면 그 이름을 이 브라우저에 저장하고 주소에서 지워요 (10/15 호윤, SIL-74).
 * 다음부터는 주소에 없어도 저장한 이름으로 열려요. 다른 이름으로 열려면 ?me=를 다시 붙여요.
 * 이름을 고르는 화면은 만들지 않아요.
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

function store(name: string): void {
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
    store(fromUrl);
    url.searchParams.delete(ME_PARAM);
    window.history.replaceState(window.history.state, '', url);
    return fromUrl;
  }
  return readStored()?.trim() || fallback;
}
