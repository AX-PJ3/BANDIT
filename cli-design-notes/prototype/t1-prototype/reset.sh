#!/bin/bash
# 등록한 결정 사항과 고친 작업 파일을 처음 상태로 되돌린다
cd "$(dirname "$0")" && rm -f saved.json && cp proto/notify-title.original.ts src/notify-title.ts && echo "처음 상태로 되돌렸어요. 다시 claude를 켜면 처음부터 볼 수 있어요."
