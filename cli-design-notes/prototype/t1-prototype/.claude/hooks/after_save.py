#!/usr/bin/env python3
"""④ 등록 완료: save_standard가 저장한 직후 등록 완료 글을 직접 띄운다. 저장이 안 됐으면(오류) 아무것도 안 띄운다."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import wiki  # noqa: E402

event = json.load(sys.stdin)
response = event.get('tool_response')
text = json.dumps(response, ensure_ascii=False) if not isinstance(response, str) else response
if '"saved": true' in text or '\\"saved\\": true' in text:
    message = wiki.done_message()
    if message:
        print(json.dumps({'systemMessage': message}, ensure_ascii=False))
