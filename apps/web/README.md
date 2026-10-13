# @sil/app

웹 앱이에요. 브라우저로 열고, PWA로 설치하면 앱 창으로도 써요 (SIL-65 조건 11, D50, D52). 화면 디자인은 **신지님**(SIL-69), 화면 구현은 **개발직군**(SIL-74), 목록·답 저장·알림 시점은 **민수님**(SIL-67), PWA·데이터 연결·배포는 **정민님**(SIL-73)이 맡아요.

Electron 데스크톱 앱과 설치 파일(.dmg, .exe)은 만들지 않아요. SIL-65에서 "웹 + PWA로 먼저 만들고, 데스크톱 앱 전환은 데모 이후에 검토"로 정했어요.

## 켜는 법

| 명령               | 언제                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm app:web`     | 화면을 만들 때. http://localhost:5173 에서 열리고, 고치면 바로 반영돼요. 서비스 워커는 켜지 않아요 |
| `pnpm app:build`   | 배포할 파일을 `apps/web/dist/`에 만들어요. 이 폴더를 그대로 올리면 돼요 (어느 경로든 열려요)       |
| `pnpm app:preview` | 배포본을 http://localhost:4173 에서 열어요. PWA 설치와 서비스 워커는 여기서 확인해요               |

**데이터:** 저장소 `.env`에 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`가 있으면 진짜 DB에 붙어요. 없으면 예시 데이터로 열려요. 배포한 곳에서는 그곳의 환경 변수에 같은 두 값을 넣고 빌드해요. 왼쪽 메뉴 아래에 지금 어느 쪽인지 나와요.

## 폴더

```
web/
├── index.html            시작 페이지 (매니페스트, 아이콘 연결)
├── vite.config.ts        빌드 설정. .env에서 Supabase 주소와 공용 키 두 값만 화면에 넣고, 빌드 뒤 sw.js에 저장 목록을 넣어요
├── public/               그대로 배포되는 파일
│   ├── manifest.webmanifest   설치 정보 (이름 HARIBO, 아이콘, 앱 창으로 열기)
│   ├── sw.js                  서비스 워커 (설치, 앱 껍데기 오프라인 열기, 알림 누르기. 데이터는 저장하지 않음)
│   └── icons/                 192·512 아이콘, 마스크 아이콘, iOS 홈 화면 아이콘
└── src/
    ├── main.tsx          화면을 그리고 서비스 워커를 등록해요
    ├── App.tsx           메뉴와 화면 세 칸, "앱으로 설치"·"알림 켜기" 버튼, 알림을 눌러 연 변경 넘겨주기
    ├── pwa.ts            서비스 워커 등록, 설치 안내, 설치한 앱인지 확인, 알림 권한·띄우기·누른 변경 받기
    ├── api/
    │   ├── types.ts      화면 ↔ 데이터 약속 (SilApi). 두 사람이 맞추는 유일한 파일
    │   ├── index.ts      화면은 여기 있는 api만 써요 (진짜 데이터 / 예시 데이터를 골라 줘요)
    │   ├── database.ts   진짜 데이터. '@sil/core/data'로 Supabase에 바로 붙어요 (정민님)
    │   └── mock.ts       예시 데이터 버전 (신지님이 먼저 만들어도 돼요)
    └── screens/          화면 파일 (신지님)
```

## 왜 이렇게 만들었나요

- **화면이 공용 키로 DB에 바로 붙어요.** 공용 키(publishable)로는 읽기와 저장 함수 호출만 되고 표에 직접 쓰거나 지울 수 없어서, 화면에 넣어도 돼요 (D21). 저장 규칙은 DB 함수가 지켜요. 그래서 Electron의 main 프로세스 같은 중간 서버가 없어요.
- **데이터 함수는 MCP 서버·명령어와 같아요.** `@sil/core/data`의 `listPendingChecks`, `saveAnswer` 등을 그대로 써요. 화면에서 `@sil/core/node`를 가져오면 린트가 막아요 (Node 전용이라 브라우저에서 돌지 않아요).
- **`api/types.ts` 하나만 맞추면** 화면과 데이터를 따로 만들 수 있어요. 화면은 예시 데이터로 먼저 만들고, 합치는 날 화면 코드를 바꾸지 않아요.
- **서비스 워커는 데이터를 저장하지 않아요.** 옛 값을 지금 값처럼 보여 주면 안 되니까요 (notify.error.not-empty). 같은 주소의 화면 파일만 저장하고, DB 요청은 늘 네트워크로 보내요. DB에 못 붙으면 메뉴 아래에 이유를 빨간 글씨로 보여 줘요.
- **처음 방문 한 번이면 오프라인으로도 열려요.** `pnpm app:build`가 끝나면 `dist/`의 파일 목록(JS·CSS·아이콘·매니페스트)을 `dist/sw.js`에 넣어서, 서비스 워커가 설치될 때 모두 저장해요. 저장 이름은 그 파일 내용으로 만든 번호라 배포할 때마다 손댈 것이 없어요 (D52).
- **상대 경로로 빌드해요** (`base: './'`). 배포할 곳이 루트 주소든 `/HARIBO/` 같은 하위 경로든 그대로 열려요. 그래서 화면 이동은 주소 경로 대신 상태와 `?check=` 같은 쿼리로 해요.

## 알림 (A1)

착수 안내 4절의 A1(OS 알림)과 "알림 꺼짐" 상태에 쓰는 함수가 `src/pwa.ts`에 있어요. **언제 띄울지**(Realtime 구독, app.notify.realtime)와 **알림 문구**(app.notify.title-length)는 쓰는 쪽에서 정해요.

| 함수                                               | 하는 일                                                                                                                                  | 쓰는 곳                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `useNotificationPermission()`                      | 알림 권한(`granted`·`default`·`denied`·`unsupported`)과 요청 함수. `granted`가 아니면 "알림 꺼짐" 상태예요. 요청은 버튼을 누를 때만 해요 | A2 알림 꺼짐 (호윤님)   |
| `showChangeNotification({ checkId, title, body })` | OS 알림을 띄워요. 같은 변경은 알림 센터에 한 건만 남아요. 권한이 없으면 `false`                                                          | 새 확인할 변경 (민수님) |
| `useOpenCheckRequests(onOpen)`                     | 알림을 눌러 연 확인할 변경 ID를 받아요. `App.tsx`가 받아서 나에게 온 변경 화면에 `openedCheckId`로 넘겨요                                | A1 → A3 (호윤님)        |

알림을 누르면 이렇게 열려요 (app.notify.click-to-inbox, `public/sw.js`의 `notificationclick`):

- 앱 창이 열려 있으면: 그 창을 앞으로 가져오고 메시지로 ID를 알려요. 위키 화면에 있었어도 나에게 온 변경으로 옮겨요.
- 앱 창이 없으면: `?check=<ID>` 주소로 새 창을 열어요. 화면은 ID를 읽은 뒤 주소에서 지워요 (새로 고쳐도 다시 열리지 않게).
- 개발 중(`pnpm app:web`)에는 서비스 워커가 없어서 창에서 바로 띄우고, 눌렀을 때 같은 길로 ID를 넘겨요.

```ts
// 예: 새 확인할 변경이 생겼을 때 (민수님 Realtime 구독 안에서)
await showChangeNotification({
  checkId: check.id,
  title: version.title, // 결정 사항 제목 (40자 이하, app.notify.title-length)
  body: `${previousValue ?? '새 결정 사항'} → ${version.value}`,
});
```

창을 닫아도 오는 알림(웹 푸시)은 10/13 이후예요. 그때는 `sw.js`에 `push` 이벤트를 더하고 발송 서버가 필요해요.

## 배포하기

1. `pnpm app:build` → `apps/web/dist/`가 생겨요. 이 폴더를 정적 파일 호스팅에 그대로 올려요.
2. 배포한 곳의 환경 변수(빌드할 때 읽어요)에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 넣어요. 없으면 예시 데이터로 열려요.
3. **HTTPS 주소**여야 설치와 서비스 워커가 돼요 (`localhost`는 예외). 정적 호스팅은 대부분 HTTPS를 붙여 줘요.
4. 루트 주소(예: `https://haribo.vercel.app/`)와 하위 경로(예: `https://ax-pj3.github.io/HARIBO/`) 모두 설정 없이 열려요. "없는 경로는 index.html로" 설정도 필요 없어요.
5. 하위 경로로 미리 확인하려면 `pnpm -C apps/web exec vite preview --base /HARIBO/ --port 4174`로 열고 http://localhost:4174/HARIBO/ 로 들어가요.

응답 헤더는 따로 바꾸지 않아도 돼요. 브라우저는 `sw.js`를 확인할 때 HTTP 저장을 거치지 않아서(`updateViaCache` 기본값) 새 배포를 알아채요. `assets/*`는 이름에 내용 해시가 붙어서 오래 저장해도 돼요.

## 화면에 데이터 연결하기 (예: 나에게 온 변경 목록)

1. `src/api/types.ts`: `SilApi`에 `listMyChanges(): Promise<PendingCheck[]>`를 더해요 (타입은 `@sil/core`에서)
2. `src/api/mock.ts`: 같은 함수를 `@sil/core`의 쿠폰 예시 데이터로 만들어요 (화면 담당이 먼저 해도 돼요)
3. `src/api/database.ts`: `@sil/core/data`의 `listPendingChecks({ recipient })`로 진짜 데이터를 읽어요 (정민님)

빠뜨리면 타입 검사(`pnpm typecheck`)가 어디가 비었는지 알려 줘요.

## 꼭 지킬 것

- 화면 코드에서는 `@sil/core`(타입, 규칙)와 `@sil/core/data`(DB)만 가져와요.
- 예시 데이터는 직접 만들지 말고 `@sil/core`의 쿠폰 예시를 써요. 10/13 통합 확인 때 모양이 맞아요.
- `public/sw.js`의 `const BUILD = 'dev';`와 `const PRECACHE = [];` 두 줄은 그대로 둬요. `pnpm app:build`가 채우고, 못 찾으면 빌드가 멈춰요.
- 화면을 나눌 때 주소 경로(`/changes/12` 같은 라우터)를 쓰지 않아요. 상태와 쿼리(`?check=`)로 해요. 경로를 쓰면 하위 경로 배포와 오프라인 열기가 깨져요.
- MCP 토큰 같은 다른 비밀 값은 화면에 넣지 않아요. `vite.config.ts`가 넣는 값은 Supabase 주소와 공용 키 두 개뿐이에요.

## 아직 남은 것

- **배포 주소:** 어디에 올릴지(호스팅)만 정하면 돼요. 위 "배포하기" 순서대로 올려요 (SIL-73 마지막 조건).
- **앱 알림 시점(app.notify.realtime):** 알림을 띄우고 누르는 길은 있어요(위 "알림"). 확인할 변경이 생길 때 Realtime으로 받아 `showChangeNotification`을 부르는 곳은 민수님(SIL-67)이 만들어요.
- **위키 적용 범위 경로:** 팀 위키는 PR #5(SIL-64)에서 웹 + PWA 기준으로 고쳐졌어요. 다만 `app.*` 기준의 적용 범위가 `packages/app/**`라서 이 폴더(`apps/web`)와 경로가 달라요 (`pnpm sil scope-check`).
