#!/usr/bin/env python3
"""답을 기록한 직후: 내가 한 답이 담긴 기록 줄과 다음 변경 상세(또는 마무리 한 줄)를 직접 띄운다."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import notice  # noqa: E402

event = json.load(sys.stdin)
message = notice.after_answer((event.get('tool_input') or {}).get('change_id'))
if message:
    print(json.dumps({'systemMessage': message}, ensure_ascii=False))
