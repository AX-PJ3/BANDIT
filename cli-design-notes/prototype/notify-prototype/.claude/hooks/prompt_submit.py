#!/usr/bin/env python3
"""② 작업을 입력했을 때: 답하지 않은 변경이 있으면 첫 변경 상세를 직접 띄우고, Claude에게는 질문 순서만 알려 준다.

- 이번 세션에서 이미 질문을 띄웠는데 닫고 넘어갔다면: 한 줄 알림만 띄우고 작업을 그대로 진행한다.
- "결정 사항 확인"만 입력하면: 다시 상세와 질문을 띄운다. 답할 변경이 없으면 다 확인했다는 한 줄을 띄운다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import notice  # noqa: E402

event = json.load(sys.stdin)
session_id = event.get('session_id')
recall = notice.is_recall(event.get('prompt'))
items = notice.pending()

GUIDE = """[확인할 변경 시안 규칙] 사용자의 요청을 처리하기 전에 아래 순서를 먼저 끝낸다.
변경 상세와 기록 결과는 hooks가 사용자 화면에 이미 직접 보여 준다. 그러니 상세 내용, 요약, 인사말, 진행 설명을 직접 쓰지 않는다. 글은 한 글자도 출력하지 말고 도구만 부른다.
1. mcp__notice__list_pending 을 부른다.
2. changes 의 변경마다 순서대로, 그 변경의 questions 를 쓴다:
   a. AskUserQuestion 으로 questions.relation 을 묻는다. question, header, 선택지 label 과 description 을 주어진 그대로 쓰고, multiSelect 는 false, 추천 표시는 붙이지 않는다.
   b. 관계있다를 고르면 questions.knew 를, 관계없다를 고르면 questions.reason 을 같은 규칙으로 묻는다. 잘 모르겠다를 고르면 더 묻지 않고 바로 e 로 가서 relation 을 잘 모르겠다로 넘긴다(knew·reason 없이). 기록되지 않고 나중에 답하도록 남으며, 아무 말 없이 다음 변경으로 간다.
   c. relation 이나 knew 질문에서 사용자가 보기를 고르지 않고 직접 글을 쓰거나 대화를 원하면, 그 글을 답으로 기록하지 않는다. 글이 질문이면 위에 보여 준 변경 상세에 있는 내용만으로 한두 문장으로 답하고, 같은 질문을 다시 묻는다. 무엇을 확인하겠다거나 하겠다는 말은 하지 않는다. 쓴 글은 모아 두었다가 respond 의 note 로 넘긴다.
   d. reason 질문에서 직접 쓴 글은 그대로 reason 으로 기록한다.
   e. mcp__notice__respond 로 답을 기록한다. 오류가 오면 그 안내대로 같은 질문을 다시 묻는다. code 가 already_closed 면 그 변경은 이미 닫혀 기록되지 않은 것이다. 다시 묻지 말고 아무 말 없이 다음 변경으로 간다.
   f. 사용자가 질문을 거절하면(User declined) 질문을 닫은 것이다. 남은 변경은 묻지 않고, 거절에 대해 아무 말도 하지 않고 바로 3으로 간다.{quiz}
3. {after}"""
# 사내 테스트 모드: 변경마다 답한 뒤 이해도를 묻는다 (SIL-68-사내테스트-자동화-설계.md 4장)
QUIZ_STEP = """
   g. respond 로 기록한 뒤, 다음 변경으로 가기 전에 mcp__notice__get_quiz 를 그 change_id 로 부른다. 받은 questions 세 개를 AskUserQuestion 한 번에 주어진 그대로 묻는다(question, header, 선택지 label 과 description 그대로, 추천 표시 없이).
   h. 첫 문항에서 사용자가 직접 쓴 글은 그대로 written 으로, 보기를 고르면 그 label 을 written 으로 넘긴다. 둘째·셋째 문항은 고른 label 을 그대로 what, why 로 넘긴다. 맞았는지 틀렸는지는 말하지 않는다.
   i. mcp__notice__save_quiz 로 기록한다. 오류가 오면 그 안내대로 같은 질문을 다시 묻는다. 사용자가 이 질문을 거절하면 f 와 같이 처리한다."""
AFTER_WORK = '모든 변경에 답했거나(잘 모르겠다로 남긴 것 포함) 사용자가 질문을 닫았으면 사용자의 원래 요청을 처리한다. 이때도 확인한 변경에 대해서는 따로 말하지 않는다.'
AFTER_RECALL = '모든 변경에 답했거나(잘 모르겠다로 남긴 것 포함) 사용자가 질문을 닫았으면 글을 쓰지 않고 끝낸다. 사용자의 입력은 답하기를 다시 부른 것이라 따로 처리할 요청이 없다.'


def send(message, context):
    print(json.dumps({
        'systemMessage': message,
        'hookSpecificOutput': {'hookEventName': 'UserPromptSubmit', 'additionalContext': context},
    }, ensure_ascii=False))


if not items:
    if recall:
        send(notice.nothing_left(), '[확인할 변경 시안 규칙] 답할 변경이 없다는 것을 hooks가 이미 화면에 보여 줬다. 글을 쓰지 않고 끝낸다.')
    sys.exit(0)

if not recall and not notice.flow_pending(session_id):
    # 이번 세션에 남은 변경이 모두 잘 모르겠다로 남긴 것: 이번 세션에는 다시 알리지 않는다 (10/13 부건)
    sys.exit(0)

if notice.was_skipped(session_id) and not recall:
    # 한 줄 알림은 작업을 마친 뒤 Stop hooks(after_work.py)가 입력 칸 바로 위에 띄운다 (v2, 10/13). 여기서는 화면에 아무것도 안 띄운다
    print(json.dumps({'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit',
        'additionalContext': '[확인할 변경 시안 규칙] 답하지 않은 변경이 남아 있지만 사용자가 질문을 닫았다. 그 변경에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.'}},
        ensure_ascii=False))
    sys.exit(0)

guide = GUIDE.replace('{quiz}', QUIZ_STEP if notice.IS_TEST else '').replace('{after}', AFTER_RECALL if recall else AFTER_WORK)
send(notice.start_flow(session_id, recall), guide)
