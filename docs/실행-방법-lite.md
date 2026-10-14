# 실행 방법 (lite)

Claude Code에서 팀 MCP 서버 `haribo`를 쓰는 가장 짧은 방법이에요. 서버 켜기, 웹 앱, `sil` 명령까지 담은 전체 실행 방법은 [실행-방법.md](실행-방법.md)에 있어요.

## 저장소와 Node 없이 쓰기

저장소를 받지 않고(`git clone` 없이) Node와 pnpm도 깔지 않은 사람은 **Claude Code만** 있으면 돼요. 다른 팀도 이렇게 써요. 정민님에게 팀 서버 주소와 토큰을 받아요. 토큰은 저장소나 채널에 올리지 않아요.

**1. 내 이름을 퍼센트 인코딩해요.** HTTP 헤더(요청에 함께 붙여 보내는 정보)에는 한글을 그대로 넣을 수 없어서 `정민` → `%EC%A0%95%EB%AF%BC`처럼 바꿔요. 이름은 이슈 담당자와 같게 써요.

Windows PowerShell:

```powershell
[uri]::EscapeDataString('이름')
```

macOS·Linux 터미널:

```bash
printf '%s' '이름' | od -An -tx1 | tr -d ' \n' | sed 's/../%&/g' | tr a-f A-F; echo
```

**2. Claude Code에 등록해요.** 한 번만 하면 돼요.

```bash
claude mcp add --transport http --scope user haribo https://<팀 서버 주소>/mcp --header "Authorization: Bearer <팀 토큰>" --header "X-Sil-User: <1에서 나온 값>"
```

- 주소 끝의 `/mcp`까지 넣어요. 빠지면 연결되지 않아요.
- 사용자 범위(`--scope user`)로 등록돼서, 어느 폴더에서 Claude Code를 켜도 `haribo`가 보여요.

**3. 등록됐는지 봐요.**

```bash
claude mcp get haribo
```

`Status: ✔ Connected`가 나오면 돼요. 서버가 켜져 있는지만 볼 때는 아래처럼 해요. `"ok":true`가 나오면 켜져 있어요. Windows PowerShell에서는 `curl` 대신 `curl.exe`라고 써요.

```bash
curl https://<팀 서버 주소>/health
```

그다음 [써 보기](#써-보기)대로 Claude Code를 새로 켜서 확인해요.

- 이 방법으로는 Claude Code 안의 `haribo` 도구만 써요. `pnpm onboard`, `pnpm mcp:check`, `pnpm mcp:register`, `sil` 명령, 웹 앱 화면은 저장소와 Node가 있어야 해요 ([실행-방법.md](실행-방법.md)).
- 등록을 지울 때(다시 등록하기 전에도)는 `claude mcp remove haribo --scope user`를 써요. 이것도 저장소 없이 돼요.

## 써 보기

1. 아무 저장소에서 Claude Code를 **새로** 켜요.
2. `/mcp`를 입력해 `haribo`가 `connected`인지 봐요.
3. 이렇게 말해 봐요.
   - "haribo 서버 ping 해 줘" → 서버와 DB 연결, 내 이름이 나와요
   - "쿠폰 관련 기준 찾아 줘" → `search_standards`
   - "app.notify.title-length 기준 보여 줘" → `get_standard`

세션을 시작할 때 항상 적용 기준과, 내가 "관계있다"고 답한 바뀐 기준이 서버 안내문으로 함께 들어가요.
