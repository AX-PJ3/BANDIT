#!/usr/bin/env python3
"""시안용 MCP 서버. 민수님이 만들 list_pending / respond 를 흉내만 낸다.

패키지 없이 표준 입출력으로 JSON-RPC 메시지를 한 줄씩 주고받는다.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import notice  # noqa: E402

TOOLS = [
    {
        'name': 'list_pending',
        'description': '나에게 온 확인할 변경(답하지 않은 것)을 차례대로 불러온다. 상세 화면은 hooks가 사용자에게 직접 보여 주므로 여기에는 없다.',
        'inputSchema': {'type': 'object', 'properties': {}},
    },
    {
        'name': 'respond',
        'description': '확인할 변경 하나에 대한 사용자의 답을 기록한다. 잘 모르겠다는 답으로 기록하지 않고 나중에 답하도록 남긴다. 기록 결과와 다음 변경 상세는 hooks가 사용자에게 직접 보여 준다.',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'change_id': {'type': 'string'},
                'relation': {'type': 'string', 'enum': ['관계있다', '관계없다', '잘 모르겠다'], 'description': '잘 모르겠다면 knew·reason 없이 넘긴다'},
                'knew': {'type': 'string', 'enum': ['알았다', '몰랐다'], 'description': '관계있다일 때만'},
                'reason': {'type': 'string', 'description': '관계없다일 때만: 고른 이유 또는 사용자가 직접 입력한 이유 (100자 이하)'},
                'note': {'type': 'string', 'description': '관계·알았나 질문에서 보기 대신 사용자가 직접 쓴 글. 여러 번이면 줄바꿈으로 이어 붙인다'},
            },
            'required': ['change_id', 'relation'],
        },
    },
]
# 사내 테스트 모드에서만: 변경마다 답한 뒤 이해도를 묻고 기록한다
QUIZ_TOOLS = [
    {
        'name': 'get_quiz',
        'description': '방금 답한 확인할 변경의 이해도 문제 3개를 불러온다. 받은 questions 를 AskUserQuestion 한 번에 그대로 묻는다.',
        'inputSchema': {'type': 'object', 'properties': {'change_id': {'type': 'string'}}, 'required': ['change_id']},
    },
    {
        'name': 'save_quiz',
        'description': '이해도 답을 기록한다. 기록 뒤 다음 변경 상세는 hooks가 사용자에게 직접 보여 준다.',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'change_id': {'type': 'string'},
                'written': {'type': 'string', 'description': '첫 문항: 사용자가 직접 쓴 글, 또는 고른 보기의 label'},
                'what': {'type': 'string', 'description': '둘째 문항에서 고른 보기의 label 그대로'},
                'why': {'type': 'string', 'description': '셋째 문항에서 고른 보기의 label 그대로'},
            },
            'required': ['change_id', 'written', 'what', 'why'],
        },
    },
]
if notice.IS_TEST:
    TOOLS += QUIZ_TOOLS


def call_tool(name, args):
    if name == 'list_pending':
        items = notice.flow_pending()     # 이번 세션에 잘 모르겠다로 남긴 변경은 다시 묻지 않는다
        return {
            'count': len(items),
            'changes': [{'change_id': c['id'], 'issue': c['issue'], 'title': c['title'], 'questions': notice.questions_for(c)}
                        for c in items],
        }
    if name == 'respond':
        ids = {c['id'] for c in notice.load_changes()['changes']}
        if args.get('change_id') not in ids:
            raise ValueError('없는 change_id예요')
        status = notice.close_on_respond(args['change_id'])
        if status:      # 이미 닫힌 변경: 답을 기록하지 않는다 (PR #15와 같은 모양)
            return {'ok': False, 'code': 'already_closed', 'closedStatus': status}
        if args.get('relation') == notice.UNSURE:     # 답으로 기록하지 않고 대기로 남긴다 (notify.answer.unsure-later)
            notice.defer(args['change_id'])
            return {'ok': True, 'saved': False, 'deferred': True}
        problem = notice.check_answer(args.get('relation'), args.get('knew'), args.get('reason'))
        if problem:
            raise ValueError(problem)
        notice.save_answer(args['change_id'], args['relation'], args.get('knew'), args.get('reason'), args.get('note'))
        return {'ok': True, 'saved': True}
    if name in ('get_quiz', 'save_quiz') and notice.IS_TEST:
        if not notice.has_quiz(args.get('change_id')):
            raise ValueError('이해도 문제가 없는 change_id예요')
        if name == 'get_quiz':
            return {'questions': notice.quiz_questions(args['change_id'])}
        problem = notice.check_quiz(args['change_id'], args.get('what'), args.get('why'))
        if problem:
            raise ValueError(problem)
        notice.save_quiz(args['change_id'], args.get('written'), args['what'], args['why'])
        return {'saved': True}
    raise ValueError(f'모르는 도구: {name}')


def reply(msg_id, result=None, error=None):
    out = {'jsonrpc': '2.0', 'id': msg_id}
    if error:
        out['error'] = error
    else:
        out['result'] = result
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + '\n')
    sys.stdout.flush()


for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    msg = json.loads(raw)
    method, msg_id = msg.get('method'), msg.get('id')
    if msg_id is None:            # 알림 메시지(notifications/*)에는 답하지 않는다
        continue
    if method == 'initialize':
        reply(msg_id, {
            'protocolVersion': msg.get('params', {}).get('protocolVersion', '2025-06-18'),
            'capabilities': {'tools': {}},
            'serverInfo': {'name': 'notice-prototype', 'version': '0.1'},
        })
    elif method == 'tools/list':
        reply(msg_id, {'tools': TOOLS})
    elif method == 'tools/call':
        params = msg.get('params', {})
        try:
            data = call_tool(params.get('name'), params.get('arguments') or {})
            reply(msg_id, {'content': [{'type': 'text', 'text': json.dumps(data, ensure_ascii=False)}]})
        except Exception as e:  # 도구 오류는 Claude에게 오류 결과로 돌려준다
            reply(msg_id, {'content': [{'type': 'text', 'text': str(e)}], 'isError': True})
    elif method == 'ping':
        reply(msg_id, {})
    else:
        reply(msg_id, error={'code': -32601, 'message': f'지원하지 않는 요청: {method}'})
