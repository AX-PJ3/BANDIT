#!/usr/bin/env python3
"""① 켤 때: 답하지 않은 변경이 있으면 회색 알림을 띄운다. 없으면 아무것도 안 보여 준다."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), 'proto'))
import notice  # noqa: E402

items = notice.pending()
if items:
    print(json.dumps({'systemMessage': notice.session_notice(items)}, ensure_ascii=False))
