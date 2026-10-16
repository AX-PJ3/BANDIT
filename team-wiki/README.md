# team-wiki

우리 팀이 함께 지키는 **기준**을 모아 둔 팀 위키예요. 사람과 각자의 Claude Code가 모두 읽어요.
10/12부터 v0 도그푸딩으로 쓰고, 10/14쯤 진짜 도구(데이터베이스 + MCP)로 옮겨요.

## 처음 보는 사람은

1. `INDEX.md`를 열어요. 항상 적용되는 기준과 영역 목록이 있어요.
2. 기준을 새로 쓰거나 고치기 전에 `기준-작성-원칙.md`를 읽어요.
3. 기준을 바꾸면 버전을 1 올리고 `CHANGELOG.md` 맨 아래에 한 줄 남겨요.
4. 고친 뒤에는 형식 검사를 돌려요.

```bash
python3 team-wiki/scripts/check_wiki.py team-wiki
```

## AI가 따르는 규칙

규칙은 레포 최상단 CLAUDE.md에 있어요. 개인 CLAUDE.md에 따로 붙여 넣지 않아요.

## 파일

| 파일 | 내용 |
|---|---|
| INDEX.md | 목차 |
| 문제와-목표.md ~ 일하는-방식.md | 영역별 기준 8개 파일 |
| 기준-작성-원칙.md | 기준을 쓰는 규칙 |
| 용어.md | 용어집 (기준 아님) |
| CHANGELOG.md | 바뀐 기록 |
| answers.csv | 알림에 대한 답 기록 |
| scripts/check_wiki.py | 형식 검사 |
