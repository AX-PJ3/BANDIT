# 터미널 알림 시안 (움직이는 시안)

결정 내용은 [../터미널-알림-흐름-결정기록.md](../터미널-알림-흐름-결정기록.md)에 있어요. 이 폴더는 그 결정을 실제 Claude Code에서 확인하는 시안이에요.

## 켜 보기

```
cd cli-design-notes/prototype/notify-prototype && ./reset.sh && claude
```

- 처음 켤 때 폴더를 믿을지 묻는 창이 나오면 허용해요.
- 켜면 회색 알림이 뜨고, 아무 작업이나 입력하면(예: `로그인 화면 문구 고쳐 줘`) 변경 상세와 질문이 떠요.
- 답은 `answers.json`에 남아요. 처음부터 다시 보려면 `./reset.sh`.
- 질문을 Esc로 닫고 넘어가면, 그 세션에서는 작업마다 한 줄 알림만 떠요. `결정 사항 확인`만 입력하면 상세와 질문이 다시 떠요. Claude Code를 다시 켜면 처음처럼 물어요.
- 관계·알았나 질문에 직접 글을 쓰면 답으로 기록하지 않고 같은 질문을 다시 물어요. 쓴 글은 `answers.json`의 `note`에 남아요.
- 비교 방식 바꿔 보기: `NOTICE_DIFF=github|track|color claude` (기본은 summary = E 방식)
- 화살표 바꿔 보기: `NOTICE_ARROW=➜ claude`
- 착수 문서 데모 예시로 보기: `NOTICE_DATA=changes-demo claude` (부건님이 40자 → 32자로 바꾸고 민수님 #5가 받는 경우, 1건)
- 건수 숫자 색 바꿔 보기: `NOTICE_COUNT_COLOR=36 claude` (기본 33 노랑, 36 청록)
- 색·강조 비교 미리보기: `count-color-preview.html`(건수 글자색 후보), `emphasis-preview.html`(다시 부르는 말 강조 후보, 당시 문구 "기준 변경 확인")

## 구성

| 파일                                              | 하는 일                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `notify-prototype/proto/notice.py`                | 화면 글을 만드는 곳. 문구·색·순서는 여기서 고쳐요                                          |
| `notify-prototype/proto/mcp_server.py`            | 시안용 MCP 서버. 민수님의 `list_pending`, `respond`를 흉내만 내요 (패키지 없이 Python만)   |
| `notify-prototype/proto/changes.json`             | 샘플 데이터. Linear SIL-64의 실제 변경 + `samples/data/issue-links.csv` (받는 사람: 부건)  |
| `notify-prototype/proto/changes-demo.json`        | 착수 문서 데모 예시 (알림 제목 길이 40자 → 32자, 받는 사람 민수 #5)                        |
| `notify-prototype/proto/changes-sample.json`      | 예전 샘플 (40자 → 32자, 리뷰 규칙 폐기)                                                    |
| `notify-prototype/.claude/hooks/session_start.py` | ① 켤 때 알림                                                                               |
| `notify-prototype/.claude/hooks/prompt_submit.py` | ② 작업 입력 때 첫 변경 상세 + Claude에게 질문 순서 안내                                    |
| `notify-prototype/.claude/hooks/after_respond.py` | 답 기록 뒤 "✓ 기록했어요" + 다음 변경 상세                                                 |
| `preview.py`                                      | A·B·E 비교 방식 미리보기 HTML (`diff-preview.html`)                                        |
| `theme-preview.py`                                | 어두운·밝은 터미널 미리보기 HTML (`theme-preview.html`)                                    |
| `show.py`                                         | hooks 출력을 꾸밈 없이 칸 수와 함께 보는 도구 (`... \| python3 show.py`, 시안 폴더 안에서) |

`notice.py`는 `cli-design-notes/t2-render-check.py`의 글자 폭·값 비교 함수를 가져다 써요.
