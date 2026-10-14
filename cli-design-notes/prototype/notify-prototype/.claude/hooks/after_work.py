#!/usr/bin/env python3
"""Claude가 작업을 마쳤을 때(Stop): 이번 세션에서 질문을 닫고 넘어간 변경이 남아 있으면 입력 칸 바로 위에 한 줄 알림을 띄운다.
사용자가 다음에 칠 말을 고르는 자리라서 "결정 사항 확인"이 눈에 들어온다 (v2, 10/13 부건. v1은 작업 입력 때 띄웠다)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import notice  # noqa: E402

event = json.load(sys.stdin)
# 이번 세션에 잘 모르겠다로 남긴 변경은 건수에서 뺀다. 그것만 남았으면 띄우지 않는다 (10/13 부건)
items = notice.flow_pending(event.get('session_id'))
if items and notice.was_skipped(event.get('session_id')):
    notice.log_event('reminder', count=len(items))
    print(json.dumps({'systemMessage': notice.skipped_reminder(len(items))}, ensure_ascii=False))
