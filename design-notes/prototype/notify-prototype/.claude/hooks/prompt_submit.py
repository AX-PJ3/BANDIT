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
   b. 관계있다를 고르면 questions.knew 를, 관계없다를 고르면 questions.reason 을 같은 규칙으로 묻는다.
   c. relation 이나 knew 질문에서 사용자가 보기를 고르지 않고 직접 글을 쓰거나 대화를 원하면, 그 글을 답으로 기록하지 않는다. 글이 질문이면 위에 보여 준 변경 상세에 있는 내용만으로 한두 문장으로 답하고, 같은 질문을 다시 묻는다. 무엇을 확인하겠다거나 하겠다는 말은 하지 않는다. 쓴 글은 모아 두었다가 respond 의 note 로 넘긴다.
   d. reason 질문에서 직접 쓴 글은 그대로 reason 으로 기록한다.
   e. mcp__notice__respond 로 답을 기록한다. 오류가 오면 그 안내대로 같은 질문을 다시 묻는다.
   f. 사용자가 질문을 거절하면(User declined) 질문을 닫은 것이다. 남은 변경은 묻지 않고, 거절에 대해 아무 말도 하지 않고 바로 3으로 간다.
3. {after}"""
AFTER_WORK = '모든 변경을 기록했거나 사용자가 질문을 닫았으면 사용자의 원래 요청을 처리한다. 이때도 확인한 변경에 대해서는 따로 말하지 않는다.'
AFTER_RECALL = '모든 변경을 기록했거나 사용자가 질문을 닫았으면 글을 쓰지 않고 끝낸다. 사용자의 입력은 답하기를 다시 부른 것이라 따로 처리할 요청이 없다.'


def send(message, context):
    print(json.dumps({
        'systemMessage': message,
        'hookSpecificOutput': {'hookEventName': 'UserPromptSubmit', 'additionalContext': context},
    }, ensure_ascii=False))


if not items:
    if recall:
        send(notice.nothing_left(), '[확인할 변경 시안 규칙] 답할 변경이 없다는 것을 hooks가 이미 화면에 보여 줬다. 글을 쓰지 않고 끝낸다.')
    sys.exit(0)

if notice.was_skipped(session_id) and not recall:
    send(notice.skipped_reminder(len(items)),
         '[확인할 변경 시안 규칙] 답하지 않은 변경이 있다는 한 줄은 hooks가 이미 보여 줬다. 그 변경에 대해 말하지 말고 사용자의 요청을 그대로 처리한다.')
    sys.exit(0)

send(notice.start_flow(session_id, recall), GUIDE.replace('{after}', AFTER_RECALL if recall else AFTER_WORK))
