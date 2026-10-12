// 서비스 워커예요 (SIL-65 조건 11, D50, D52). 세 가지를 맡아요.
// 1. PWA 설치: 브라우저가 이 웹 앱을 "설치할 수 있는 앱"으로 알아보게 해요.
// 2. 앱 껍데기 오프라인 열기: 설치하자마자 HTML·JS·CSS·아이콘을 저장해 둬서, 인터넷이 끊겨도 화면 틀은 열려요.
//    그때 데이터는 "불러오지 못했어요"로 보여요.
// 3. 알림 누르기: OS 알림을 누르면 나에게 온 변경 화면에서 그 변경을 열어요 (app.notify.click-to-inbox).
//
// 데이터(Supabase)는 절대 저장해 두지 않아요. 옛 값을 지금 값처럼 보여 주면 안 되니까요 (notify.error.not-empty).
// 그래서 이 주소(같은 출처)의 GET 요청만 다루고, 다른 주소로 가는 요청은 그대로 네트워크로 보내요.

// 아래 두 값은 `pnpm app:build`가 채워요 (vite.config.ts의 serviceWorkerPrecache).
// BUILD는 저장할 파일 내용으로 만든 번호라서, 파일이 하나라도 바뀌면 저장 이름이 바뀌고 옛 저장분은 지워져요.
// 개발 중(`pnpm app:web`)에는 서비스 워커를 등록하지 않아서 이 값을 쓰지 않아요.
const BUILD = 'dev';
const PRECACHE = [];

const CACHE = `haribo-shell-${BUILD}`;
const SHELL = new URL('./', self.registration.scope).href;
// 화면(pwa.ts)과 같은 이름이에요
const OPEN_CHECK = 'haribo:open-check';

self.addEventListener('install', (event) => {
  // 'reload'로 받아요. 브라우저에 남은 옛 HTML을 새 저장 이름에 담지 않으려고요.
  const urls = [SHELL, ...PRECACHE.map((path) => new URL(path, SHELL).href)];
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(urls.map((url) => new Request(url, { cache: 'reload' }))),
      ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 화면(HTML)은 늘 새로 받아요. 끊겼을 때만 저장해 둔 껍데기를 보여 줘요.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 정상 응답만 껍데기로 저장해요. 오류 화면을 저장하면 끊겼을 때 그 화면이 나와요.
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.open(CACHE).then((cache) => cache.match(SHELL))),
    );
    return;
  }

  // 빌드 파일(assets/)과 아이콘은 설치 때 저장해 둔 것을 먼저 써요.
  // 내용이 바뀌면 BUILD가 바뀌어 새로 저장하니까 옛 파일이 남지 않아요. 저장에 없는 것만 네트워크로 받아요.
  // ignoreVary: 서버가 `Vary: Origin`을 붙이면, Origin 헤더가 실리는 <script type="module" crossorigin> 요청이
  // 설치 때 저장한 것과 짝이 안 맞아 오프라인에서 빈 화면이 돼요. 저장소에는 우리 빌드 파일만 있어서 무시해도 돼요.
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(request, { ignoreVary: true }))
      .then((hit) => hit ?? fetch(request)),
  );
});

// 알림을 누르면 나에게 온 변경 화면에서 그 변경을 열어요 (app.notify.click-to-inbox).
// 앱 창이 열려 있으면 그 창을 앞으로 가져와 어떤 변경인지 알려 주고, 없으면 ?check=<ID> 주소로 새 창을 열어요.
// 알림은 pwa.ts의 showChangeNotification이 data.checkId를 넣어 띄워요.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const checkId = event.notification.data?.checkId;
  const target = new URL(SHELL);
  if (checkId) target.searchParams.set('check', checkId);

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((client) => client.url.startsWith(SHELL));
        if (!open) return self.clients.openWindow(target.href);
        if (checkId) open.postMessage({ type: OPEN_CHECK, checkId });
        return open.focus();
      }),
  );
});
