#!/bin/bash
# 답을 지워서 처음 상태로 되돌린다
rm -f "$(dirname "$0")/answers.json" "$(dirname "$0")/.flow.json" && echo "답을 지웠어요. 다시 claude를 켜면 처음부터 볼 수 있어요."
