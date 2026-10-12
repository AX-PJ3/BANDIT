#!/bin/bash
# 답을 지워서 처음 상태로 되돌린다 (사내 테스트의 이해도·사건 기록도 함께)
cd "$(dirname "$0")" && rm -f answers.json .flow.json quiz.json .events.jsonl && echo "답을 지웠어요. 다시 claude를 켜면 처음부터 볼 수 있어요."
