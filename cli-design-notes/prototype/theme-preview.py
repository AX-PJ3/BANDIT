"""시안 상세 화면을 어두운/밝은 터미널로 나란히 그린다. (scratchpad 전용 확인 도구)

Claude Code 동작 근사: hooks 글 전체를 회색으로 감싸고, 혼자 쓴 39(글자색 끄기)는 회색으로 되돌리며,
39;49처럼 묶어 쓴 코드는 회색을 풀어 터미널 기본 글자색으로 만든다.
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.join(HERE, 'notify-prototype', 'proto')
sys.path.insert(0, PROTO)
import notice  # noqa: E402

THEMES = {
    'dark': {'name': '어두운 터미널 (맥 기본 터미널 근사)', 'bg': '#1e2227', 'fg': '#f2f2f2', 'gray': '#9da3ad',
             'ansi': {'30': '#000000', '32': '#5fb36b', '33': '#d7ba5c', '43': '#c7c400'}},
    'light': {'name': '밝은 터미널 (Orca Tango Light 근사)', 'bg': '#ffffff', 'fg': '#2e3436', 'gray': '#6b6f76',
              'ansi': {'30': '#2e3436', '32': '#4e9a06', '33': '#c4a000', '43': '#c4a000'}},
}


def to_html(text, t):
    out = []
    st = {'fg': 'gray', 'bg': None, 'b': False, 'd': False, 'r': False}
    for part in re.split(r'(\033\[[0-9;]*m)', text):
        m = re.fullmatch(r'\033\[([0-9;]*)m', part)
        if m:
            codes = m.group(1).split(';')
            if codes == ['39']:
                st['fg'] = 'gray'                    # 혼자 쓴 39 → Claude Code 회색으로
            for c in codes:
                if c == '1': st['b'] = True
                elif c == '2': st['d'] = True
                elif c == '22': st['b'] = st['d'] = False
                elif c == '7': st['r'] = True
                elif c == '27': st['r'] = False
                elif c == '49': st['bg'] = None
                elif c == '30' or c in ('32', '33'): st['fg'] = t['ansi'][c]
                elif c == '43': st['bg'] = t['ansi']['43']
            if codes == ['39', '49']:
                st['fg'] = t['fg']                   # 묶어 쓴 39;49 → 터미널 기본 글자색
            continue
        if not part:
            continue
        fg = t['gray'] if st['fg'] == 'gray' else st['fg']
        bg = st['bg']
        if st['r']:
            fg, bg = (bg or t['bg']), fg
        style = (f'color:{fg};' + (f'background:{bg};' if bg else '')
                 + ('font-weight:700;' if st['b'] else '') + ('opacity:.55;' if st['d'] else ''))
        out.append(f'<span style="{style}">{html.escape(part)}</span>')
    return ''.join(out)


real = json.load(open(os.path.join(PROTO, 'changes.json')))['changes']
def with_state(answers, flow, make):
    """answers.json, .flow.json을 건드리지 않고 그 상태일 때의 화면 글을 만든다."""
    keep = notice.load_answers, notice.load_flow
    notice.load_answers, notice.load_flow = (lambda: answers), (lambda: flow)
    try:
        return make()
    finally:
        notice.load_answers, notice.load_flow = keep


def choice(issue, key):
    """Claude Code 선택 화면 근사. 실제 모양은 Claude Code가 정하고, 글만 우리가 넘긴다."""
    q = notice.QUESTIONS[key]
    rows = [f'\033[7m {issue} \033[27m', '', f'\033[1m{q["question"]}\033[22m', '']
    for i, (label, desc) in enumerate(q['options'], 1):
        rows += [f'{"❯" if i == 1 else " "} {i}. {label}', f'     {desc}']
    rows += [f'  {len(q["options"]) + 1}. Type something.', '', '  Chat about this']
    return '\n' + '\n'.join(rows)


A1 = {'relation': '관계있다', 'knew': '몰랐다', 'reason': None, 'note': None}
A2 = {'relation': '관계없다', 'knew': None, 'reason': '내 작업 범위가 아니에요', 'note': None}
FLOW = {'session': 's1', 'total': 2, 'recall': False}
screens = [('① 켤 때', 'SessionStart:startup', notice.session_notice(real)),
           ('② 첫 작업 입력: 상세', 'UserPromptSubmit', notice.detail_screen(real[0], 1, 2)),
           ('②-1 관계 질문 (선택 화면 근사)', None, choice('SIL-34', 'relation')),
           ('②-2 관계있다 → 알았나 (선택 화면 근사)', None, choice('SIL-34', 'knew')),
           ('③ 기록 뒤: 내가 한 답 + 다음 상세', 'PostToolUse:mcp__notice__respond says',
            with_state({real[0]['id']: A1}, FLOW, lambda: notice.after_answer(real[0]['id']))),
           ('③-1 관계없다 → 이유 (선택 화면 근사)', None, choice('SIL-35', 'reason')),
           ('④ 마지막 기록 뒤', 'PostToolUse:mcp__notice__respond says',
            with_state({real[0]['id']: A1, real[1]['id']: A2}, FLOW, lambda: notice.after_answer(real[1]['id']))),
           ('⑤ 닫고 넘어간 뒤 작업마다', 'UserPromptSubmit', notice.skipped_reminder(2)),
           ('⑥ "결정 사항 확인"인데 0건', 'UserPromptSubmit', notice.nothing_left())]
cols = []
for key, t in THEMES.items():
    blocks = []
    for step, event, msg in screens:
        body = '\n'.join(to_html(l, t) for l in msg.split('\n')[1:])
        head = f'<span style="color:{t["gray"]}">⎿ {event}{"" if event.endswith("says") else " says"}:</span>\n' if event else ''
        blocks.append(f'<div class="step">{step}</div><pre style="background:{t["bg"]}">{head}{body}</pre>')
    cols.append(f'<div><div class="col">{t["name"]}</div>{"".join(blocks)}</div>')

page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>테마별 미리보기</title>
<style>
body {{ background:#e9ebee; color:#222; font-family:-apple-system, sans-serif; margin:0; padding:24px 16px; }}
main {{ max-width:1500px; margin:0 auto; }} h1 {{ font-size:18px; margin:0 0 4px; }}
p.sub {{ color:#666; font-size:13px; margin:0 0 8px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(680px, 1fr)); gap:16px; }}
.step {{ color:#555; font-size:12px; margin:12px 0 6px; }}
.col {{ font-weight:600; font-size:14px; margin:8px 0 0; }}
pre {{ margin:0 0 10px; padding:14px 16px; border-radius:8px; border:1px solid #c9ced4; font:14px/1.6 "D2Coding","SF Mono",Menlo,monospace; white-space:pre; overflow-x:auto; }}
</style></head><body><main>
<h1>질문과 답 · 테마별 미리보기</h1>
<p class="sub">hooks가 실제로 내보내는 글을 그대로 그렸어요. 회색과 팔레트는 스크린샷 기준 근사값이에요. 선택 화면(근사)은 Claude Code가 직접 그려서 실제 모양과 다를 수 있어요. 글만 우리가 넘겨요.</p>
<div class="grid">{"".join(cols)}</div></main></body></html>'''
out = os.path.join(HERE, 'theme-preview.html')
open(out, 'w').write(page)
print(out)
