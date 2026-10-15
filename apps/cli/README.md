# @sil/cli

`sil` 명령어예요. 담당: **민수님** (명령어 이름과 도움말 문구는 **부건님**, SIL-39)

## 지금 있는 명령

| 명령                                 | 하는 일                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm sil doctor` (= `pnpm onboard`) | 개발 환경 확인. Node 버전, .env, DB 상태, Claude Code와 MCP 등록 여부               |
| `pnpm sil import`                    | team-wiki/ 파일의 기준과 이슈를 DB에 넣기 (기본은 미리 보기, `--apply`로 저장)      |
| `pnpm sil deprecate <ID> --reason …` | 사람이 기준을 폐기 (지우지 않고 상태만, 대체 기준 남김). CHANGELOG 줄을 보여 줌     |
| `pnpm sil changelog`                 | DB 기록으로 CHANGELOG 줄 만들기. `--append team-wiki/CHANGELOG.md`로 없는 줄만 더함 |
| `pnpm sil export`                    | 응답 기록 14칸 CSV + Metric Review 숫자("N건 중 M건")                               |
| `pnpm sil backup`                    | 표 전체를 JSON으로 남김 (매일 백업 workflow가 씀)                                   |
| `pnpm sil scope-check`               | 위키 적용 범위의 코드 경로가 실제 파일과 맞는지 확인                                |
| `pnpm sil seed-demo`                 | 시연용 샘플 데이터 쌓기 (기본은 미리 보기, `--apply --confirm-host`로 저장)         |

## 들어올 명령

| 명령     | 하는 일                                                               | 이슈           |
| -------- | --------------------------------------------------------------------- | -------------- |
| `brief`  | 확인할 변경 보기. Claude Code를 켤 때 SessionStart hook으로 자동 실행 | SIL-28, SIL-21 |
| `status` | 내 이슈와 이어진 기준 보기                                            | SIL-29         |

## `sil import` (SIL-65)

```bash
pnpm sil import                                   # 미리 보기: 파일 형식 확인 + DB와 비교
pnpm sil import --apply                           # 저장 (기준은 지울 수 없으니 미리 보기를 먼저)
pnpm sil import --issues samples/data/issue-links.csv --apply
```

- 위키 형식은 `team-wiki/기준-작성-원칙.md`, `scripts/check_wiki.py`와 같아요. 기준 ID와 개수는 코드에 적지 않고 파일에서 읽어요.
- DB에 없는 기준은 새로 저장(출처 `wiki`, 고친 사람 `--by`, 기본 `팀 위키`), 같은 기준은 건너뛰어요. 몇 번 돌려도 같아요.
- DB와 다른 기준은 알려만 줘요. `--update`를 붙여야 새 버전으로 저장해요 (AI가 그사이 고친 버전을 덮지 않으려고요).
- 이슈 파일은 `--issues`로 알려 줘요 (없으면 `team-wiki/issues.csv`). 칸: 이슈 번호, 이슈 제목, 담당자, 이슈 상태, 기준 ID.

## `sil seed-demo` (SIL-101)

시연 화면이 비어 보이지 않게 이력을 미리 쌓아요. 순서와 문장은 `src/demo-seed/steps.ts`에 있어요.

```bash
pnpm sil seed-demo                                          # 미리 보기: 순서와 시드 전 상태 확인
pnpm sil seed-demo --apply --confirm-host <미리 보기에 나온 주소>  # 저장
```

- **시연 DB에서만** 돌려요. 결정 사항과 답은 지울 수 없어요. 연결된 DB의 호스트를 `--confirm-host`로 직접 적어야 저장해요.
- 위키와 이슈를 가져온 직후(`sil import --apply`)의 DB에서 시작해요. 시드할 결정 사항의 버전이 다르거나 확인할 변경이 이미 있으면 하나도 저장하지 않고 멈춰요 (두 번 돌리는 것도 막아요).
- 끝나면 사람별 확인할 변경·확인한 변경 건수를 기대와 비교해 보여 줘요.

## 명령 추가하기

1. `src/commands/_template.ts`를 복사해요. 예: `src/commands/brief.ts`
2. 이름, 설명, 옵션, `action`을 채워요.
3. `src/commands/index.ts`의 배열에 한 줄 넣어요.
4. `pnpm sil brief --help`로 확인해요.

## 왜 이렇게 만들었나요

- **명령 하나 = 파일 하나**: 민수님이 기능을, 부건님이 문구를 동시에 고쳐도 서로 다른 줄이라 충돌이 적어요.
- **commander**: 가장 널리 쓰이는 명령어 도구라 Claude Code도 잘 알아요. `--help`가 자동으로 만들어져요.
- **빌드 없음**: Node 24.18이 `bin/sil.mjs`에서 TypeScript를 바로 실행해요 (D48). hook처럼 다른 폴더에서 불려도 이 파일 위치 기준으로 동작해요.

## 꼭 지킬 것

- 사용자에게 보여 줄 결과는 `console.log`, 진행 로그는 `createLogger`(stderr)로 나눠요.
- Claude Code hook에서 불리는 명령(`brief`)은 stdout이 AI 작업 맥락에 그대로 들어가요. 짧게 유지해요.
- 다른 프로그램(claude, gh, git)을 부를 때는 `@sil/core/node`의 `runCommand`를 써요. Windows 처리가 들어 있어요.
