#!/usr/bin/env python3
"""①② 다른 결정 사항 화면과 ③ 등록될 모습을 직접 띄운다. 도구가 오류를 돌려줬으면 아무것도 안 띄운다."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import screens  # noqa: E402

event = json.load(sys.stdin)
response = event.get('tool_response')
text = response if isinstance(response, str) else json.dumps(response, ensure_ascii=False)
if '"shown": true' not in text and '\\"shown\\": true' not in text:
    sys.exit(0)
args = event.get('tool_input') or {}


def result_of(response):
    """도구 결과(JSON)를 꺼낸다. MCP 결과는 [{type: text, text: "{...}"}] 모양으로 오기도 해요."""
    if isinstance(response, dict) and 'content' in response:
        response = response['content']
    if isinstance(response, list):
        response = next((c.get('text') for c in response if isinstance(c, dict) and c.get('type') == 'text'), '')
    if isinstance(response, str):
        try:
            response = json.loads(response)
        except ValueError:
            return {}
    return response if isinstance(response, dict) else {}


if event.get('tool_name', '').endswith('show_conflicts'):
    # 되돌림(시안 10/16)은 서버가 결과의 revert로 알려 준다
    revert = result_of(response).get('revert')
    message = screens.conflicts_screen(args['kind'], args['request'], args.get('conflicts') or [], revert)
else:
    message = screens.preview_screen(args)
print(json.dumps({'systemMessage': message}, ensure_ascii=False))
