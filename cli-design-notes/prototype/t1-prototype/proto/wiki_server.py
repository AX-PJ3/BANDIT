#!/usr/bin/env python3
"""T1 시안용 MCP 서버. 정민님이 만든 search_standards / get_standard / save_standard를 흉내만 낸다.

패키지 없이 표준 입출력으로 JSON-RPC 메시지를 한 줄씩 주고받는다 (notify-prototype/proto/mcp_server.py와 같은 방식).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wiki  # noqa: E402

TOOLS = [
    {
        'name': 'search_standards',
        'description': '낱말로 결정 사항을 찾는다. 결정 사항마다 지금 값, 버전, 항상 적용, 연결된 이슈와 담당자, 알림 받을 이슈 수를 돌려준다.',
        'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string', 'description': '띄어 쓴 낱말 중 하나라도 들어 있으면 찾는다'}}, 'required': ['query']},
    },
    {
        'name': 'get_standard',
        'description': '결정 사항 하나의 지금 버전과 연결된 이슈를 돌려준다.',
        'inputSchema': {'type': 'object', 'properties': {'id': {'type': 'string'}}, 'required': ['id']},
    },
    {
        'name': 'show_conflicts',
        'description': 'T1 ①② 충돌 화면을 띄운다. 화면은 hooks가 사용자에게 직접 보여 주므로 Claude는 같은 내용을 글로 다시 쓰지 않는다.',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['작업', '요청'], 'description': '작업: Claude가 작업 중에 알아챔(경우 1) / 요청: 사람이 결정 사항을 바꿔 달라고 함(경우 2)'},
                'request': {'type': 'string', 'description': '부탁하신 작업이나 요청을 한 줄로 (예: 알림 제목을 32자에서 자르기)'},
                'conflicts': {
                    'type': 'array',
                    'description': '충돌하는 결정 사항. 없으면 빈 배열(경우 2만)',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'id': {'type': 'string', 'description': 'search_standards 결과의 ID 그대로'},
                            'kind': {'type': 'string', 'enum': ['바뀜', '어긋남'], 'description': '바뀜: 같은 것을 다르게 정함(새 버전이 됨) / 어긋남: 다른 결정 사항인데 같이 지킬 수 없음'},
                            'why': {'type': 'string', 'description': '왜 충돌하는지 한 문장. 그 결정 사항의 무엇이 새 값과 부딪히는지 드러나게 (예: 40자 이하로 정한 길이를 32자 이하로 다시 정해요)'},
                        },
                        'required': ['id', 'kind', 'why'],
                    },
                },
            },
            'required': ['kind', 'request', 'conflicts'],
        },
    },
    {
        'name': 'preview_standard',
        'description': 'T1 ③ 등록될 모습을 띄운다. 저장하지 않는다. 화면은 hooks가 사용자에게 직접 보여 주므로 Claude는 같은 내용을 글로 다시 쓰지 않는다.',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'id': {'type': 'string', 'description': '바꾸는 결정 사항이면 그 ID, 새 결정 사항이면 영역.주제.규칙'},
                'title': {'type': 'string', 'description': '새 값에 맞춘 한 문장, 40자 이하'},
                'value': {'type': 'string', 'description': '120자 이하'},
                'reason': {'type': 'string', 'description': '왜 바꾸는지 한 문장, 120자 이하. 대화에서 유추하거나 사람이 쓴 글을 정리'},
                'always_on': {'type': 'boolean', 'description': '모든 작업에 매번 지켜야 할 때만 true'},
            },
            'required': ['id', 'title', 'value', 'reason', 'always_on'],
        },
    },
    {
        'name': 'save_standard',
        'description': '결정 사항의 새 버전(또는 새 결정 사항)을 저장한다. 사용자가 T1 ③에서 "등록하기"를 고른 뒤에만 부른다. 등록 완료 화면은 hooks가 사용자에게 직접 보여 준다.',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'id': {'type': 'string', 'description': '영역.주제.규칙 (영문 소문자·숫자·하이픈)'},
                'title': {'type': 'string', 'description': '한 문장, 40자 이하'},
                'value': {'type': 'string', 'description': '120자 이하'},
                'reason': {'type': 'string', 'description': '왜 바꾸는지 한 문장, 120자 이하. 지어내지 않는다'},
                'always_on': {'type': 'boolean'},
                'base_version': {'type': 'integer', 'description': '바꾸는 결정 사항의 지금 버전. 새 결정 사항이면 넣지 않는다'},
            },
            'required': ['id', 'title', 'value', 'reason', 'always_on'],
        },
    },
]


def call_tool(name, args):
    if name == 'search_standards':
        return wiki.search(args.get('query'))
    if name == 'get_standard':
        return wiki.get(args.get('id'))
    if name == 'show_conflicts':
        return wiki.check_conflicts(args)
    if name == 'preview_standard':
        return wiki.check_preview(args)
    if name == 'save_standard':
        return wiki.save(args)
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
            'serverInfo': {'name': 't1-prototype', 'version': '0.1'},
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
