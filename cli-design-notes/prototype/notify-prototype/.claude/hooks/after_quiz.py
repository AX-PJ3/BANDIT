#!/usr/bin/env python3
"""사내 테스트 모드에서 이해도를 기록한 직후: 다음 변경 상세(또는 마무리 한 줄)를 직접 띄운다.
마지막 변경이면 Claude가 원래 작업을 시작하지 않게 멈춘다. Claude Code는 test_run.py가 닫는다."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import notice  # noqa: E402

event = json.load(sys.stdin)
message = notice.after_quiz((event.get('tool_input') or {}).get('change_id'))
if message:
    output = {'systemMessage': message}
    if not notice.pending():
        output['continue'] = False
    print(json.dumps(output, ensure_ascii=False))
