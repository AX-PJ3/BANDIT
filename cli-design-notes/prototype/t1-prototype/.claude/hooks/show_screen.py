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
if event.get('tool_name', '').endswith('show_conflicts'):
    message = screens.conflicts_screen(args['kind'], args['request'], args.get('conflicts') or [])
else:
    message = screens.preview_screen(args)
print(json.dumps({'systemMessage': message}, ensure_ascii=False))
