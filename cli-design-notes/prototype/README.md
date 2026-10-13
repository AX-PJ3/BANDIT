# 터미널 알림 시안 (움직이는 시안)

결정 내용은 [../터미널-알림-흐름-결정기록.md](../터미널-알림-흐름-결정기록.md)에 있어요. 이 폴더는 그 결정을 실제 Claude Code에서 확인하는 시안이에요.

## 켜 보기

```
cd cli-design-notes/prototype/notify-prototype && ./reset.sh && claude
```

- 처음 켤 때 폴더를 믿을지 묻는 창이 나오면 허용해요.
- 켜면 회색 알림이 뜨고, 아무 작업이나 입력하면(예: `로그인 화면 문구 고쳐 줘`) 변경 상세와 질문이 떠요.
- 답은 `answers.json`에 남아요. 처음부터 다시 보려면 `./reset.sh`.
- 질문을 Esc로 닫고 넘어가면, 그 세션에서는 다시 묻지 않고 Claude가 작업을 마칠 때마다 입력 칸 바로 위에 한 줄 알림이 떠요(v2, Stop hooks). `결정 사항 확인`만 입력하면 상세와 질문이 다시 떠요. Claude Code를 다시 켜면 처음처럼 물어요.
- v2 모양(10/13): 켤 때 첫 줄과 닫은 뒤 한 줄은 앞에 노란 막대, 변경 상세는 위아래 선으로 묶고 위 선에 머리표(진행 문장 + 몇 번째 칩)를 넣어요.
- v2 태그와 상세(10/13): 제목 끝 태그는 `(변경)` `(신규)` `(되돌림)` `(폐기)` 네 갈래, 그 아래 `상세`는 제목이 가리키는 결정 사항의 값 전체(두 줄까지). 네 갈래를 한 번에 보려면 `NOTICE_DATA=changes-v2 claude`
- 관계·알았나 질문에 직접 글을 쓰면 답으로 기록하지 않고 같은 질문을 다시 물어요. 쓴 글은 `answers.json`의 `note`에 남아요.
- 비교 방식 바꿔 보기: `NOTICE_DIFF=github|track|color claude` (기본은 summary = E 방식)
- 화살표 바꿔 보기: `NOTICE_ARROW=➜ claude`
- SIL-77 예외 보기(10/13): `NOTICE_DATA=changes-sil77 claude`. 첫 변경은 상세를 보는 사이 되돌려진 경우라 답을 눌러도 기록되지 않고 `#5 변경이 되돌려졌어요. 하려던 작업을 계속 진행하시면 돼요.` 한 줄 뒤 다음 변경이 떠요(DRI 결정 8). 둘째 변경은 지난번에 관계있다로 답한 경우라 상세의 빈 줄 자리에 `지난번 변경(32자)을 반영하셨다면 다시 고쳐야 해요.`가 나와요(DRI 결정 9). 닫힌 변경은 `closed.json`에 남아요
- 착수 문서 데모 예시로 보기: `NOTICE_DATA=changes-demo claude` (부건님이 40자 → 32자로 바꾸고 민수님 #5가 받는 경우, 1건)
- 건수 숫자 색 바꿔 보기: `NOTICE_COUNT_COLOR=36 claude` (기본 33 노랑, 36 청록)
- 상세 제목 색 바꿔 보기: `NOTICE_TITLE_COLOR=35 claude` (기본 36 청록 굵게, 10/13)
- 색·강조 비교 미리보기: `count-color-preview.html`(건수 글자색 후보), `emphasis-preview.html`(다시 부르는 말 강조 후보, 당시 문구 "기준 변경 확인")

## 사내 테스트 (자동 진행)

```
cd cli-design-notes/prototype/notify-prototype && ./test_run.py
```

- 진행자가 참가자 이름·직군·사일로 여부·테마를 입력하면, 예시 시안 3건(`changes-test.json`)으로 Claude Code가 테스트 모드로 켜져요.
- 변경마다 답한 뒤 상세를 화면 위로 밀어내고 이해도 3문항(직접 쓰기 → 무엇이 → 왜)을 물어요.
- 마지막 변경까지 답하면 Claude Code가 자동으로 닫히고(중간에 그만하려면 `/exit`) 수고 설문 5개를 묻고, `results/`에 참가자별 JSON과 `summary.csv`를 남겨요. `results/`는 GitHub에 올라가지 않아요.
- 설계: [../SIL-68-사내테스트-자동화-설계.md](../SIL-68-사내테스트-자동화-설계.md)

## T1 결정 사항 등록 켜 보기

T2~T5 시안과 따로 켜요. 결정은 [../T1-결정-사항-등록-결정기록.md](../T1-결정-사항-등록-결정기록.md)에 있어요.

```
cd cli-design-notes/prototype/t1-prototype && ./reset.sh && claude
```

- 경우 1 (Claude가 알아챔): `Windows 알림 창에서 잘리니까 알림 제목을 32자에서 자르게 고쳐 줘` → 충돌 표와 "결정 사항도 바꾸는 작업인가요?"부터 떠요. `src/notify-title.ts`가 결정 사항(40자)을 따르고 있어서예요.
- 경우 2 (사람이 직접 바꿈): `앱 알림 제목 결정 사항을 32자로 바꿔 줘. Windows 알림 창에서 잘려.` → 충돌 표 다음에 묻지 않고 ③이 떠요.
- 새 결정 사항: `앱 알림 본문은 2줄 이하로 쓰기로 결정 사항 만들어 줘` → 충돌 없음, 알림 받을 이슈 없음이 떠요.
- 충돌 화면과 ③ 등록될 모습, ④ 등록 완료는 hooks가 띄워요. Claude는 내용을 도구(`show_conflicts`, `preview_standard`, `save_standard`)에 넘기고 선택 화면만 띄워요(B, 10/12).
- 등록한 결정 사항은 `saved.json`에 남아요. 처음부터 다시 보려면 `./reset.sh`.

| 파일                                           | 하는 일                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `t1-prototype/CLAUDE.md`                       | 흐름과 Claude가 쓰는 문구, 선택 화면                                                                                                                         |
| `t1-prototype/proto/screens.py`                | 충돌 화면과 ③ 등록될 모습 글. 화면 문구·칸 너비는 여기서 고쳐요                                                                                              |
| `t1-prototype/.claude/hooks/show_screen.py`    | 충돌 화면과 ③을 띄우는 hook                                                                                                                                  |
| `t1-prototype/proto/wiki_server.py`, `wiki.py` | 시안용 MCP 서버. `search_standards`, `get_standard`, `save_standard`(정민님 도구 흉내)와 `show_conflicts`, `preview_standard`(T1 화면용, 실제로는 아직 없음) |
| `t1-prototype/proto/standards.json`            | 샘플 데이터. 착수 문서 데모 예시 + 어긋나는 결정 사항을 보여 줄 가상 결정 사항 1개                                                                           |
| `t1-prototype/.claude/hooks/after_save.py`     | ④ 등록 완료 글                                                                                                                                               |
| `t1-prototype/src/notify-title.ts`             | 경우 1을 시험할 작업 파일                                                                                                                                    |

## 구성

| 파일                                              | 하는 일                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `notify-prototype/proto/notice.py`                | 화면 글을 만드는 곳. 문구·색·순서는 여기서 고쳐요                                          |
| `notify-prototype/proto/mcp_server.py`            | 시안용 MCP 서버. 민수님의 `list_pending`, `respond`를 흉내만 내요 (패키지 없이 Python만)   |
| `notify-prototype/proto/changes.json`             | 샘플 데이터. Linear SIL-64의 실제 변경 + `samples/data/issue-links.csv` (받는 사람: 부건)  |
| `notify-prototype/proto/changes-demo.json`        | 착수 문서 데모 예시 (알림 제목 길이 40자 → 32자, 받는 사람 민수 #5)                        |
| `notify-prototype/proto/changes-sil77.json`       | SIL-77 확인용 2건 (보는 사이 자동으로 닫힘, 관계있다로 답한 뒤 다시 바뀜). 지어낸 예시     |
| `notify-prototype/proto/changes-sample.json`      | 예전 샘플 (40자 → 32자, 리뷰 규칙 폐기)                                                    |
| `notify-prototype/proto/changes-test.json`        | 사내 테스트용 예시 시안 3건 (숫자·신규·관계없음) + 관계 정답과 이해도 문제                 |
| `notify-prototype/proto/changes-v2.json`          | v2 확인용 5건 (변경·신규·되돌림·폐기·크게 바뀐 변경). 되돌림은 지어낸 예시                 |
| `notify-prototype/test_run.py`                    | 사내 테스트 진행: 참가자 입력 → 테스트 모드 시안 → 설문 → `results/` 저장                  |
| `notify-prototype/.claude/hooks/after_quiz.py`    | 테스트 모드에서 이해도 기록 뒤 다음 변경 상세                                              |
| `notify-prototype/.claude/hooks/session_start.py` | ① 켤 때 알림                                                                               |
| `notify-prototype/.claude/hooks/prompt_submit.py` | ② 작업 입력 때 첫 변경 상세 + Claude에게 질문 순서 안내                                    |
| `notify-prototype/.claude/hooks/after_respond.py` | 답 기록 뒤 "✓ 기록했어요" + 다음 변경 상세                                                 |
| `notify-prototype/.claude/hooks/after_work.py`    | 질문을 닫고 넘어간 뒤 Claude가 작업을 마치면 입력 칸 위에 한 줄 알림 (Stop)                |
| `preview.py`                                      | A·B·E 비교 방식 미리보기 HTML (`diff-preview.html`)                                        |
| `theme-preview.py`                                | 어두운·밝은 터미널 미리보기 HTML (`theme-preview.html`)                                    |
| `show.py`                                         | hooks 출력을 꾸밈 없이 칸 수와 함께 보는 도구 (`... \| python3 show.py`, 시안 폴더 안에서) |

`notice.py`는 `cli-design-notes/t2-render-check.py`의 글자 폭·값 비교 함수를 가져다 써요.
