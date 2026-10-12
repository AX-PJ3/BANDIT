"""시안 hooks가 내보내는 글을 색까지 살려 HTML 미리보기로 그린다. (scratchpad 전용 확인 도구)"""
import html
import json
import os
import re
import sys

PROTO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notify-prototype', 'proto')
sys.path.insert(0, PROTO)
import notice  # noqa: E402

GRAY = '#9da3ad'   # Claude Code가 hooks 글에 입히는 회색 (스크린샷 기준 근사값)
FG = {'31': '#e06c6c', '32': '#5fb36b', '33': '#d7ba5c', '97': '#ffffff', '90': '#6b7a86', '37': '#e5e5e5', '30': '#000000'}


def xterm256(n):
    base = ['#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
            '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff']
    if n < 16:
        return base[n]
    if n < 232:
        n -= 16
        f = lambda v: 0 if v == 0 else 55 + v * 40
        return f'#{f(n // 36):02x}{f((n // 6) % 6):02x}{f(n % 6):02x}'
    v = 8 + (n - 232) * 10
    return f'#{v:02x}{v:02x}{v:02x}'


def to_html(text):
    out, st = [], {'fg': None, 'bg': None, 'b': False, 'd': False, 'u': False, 's': False}
    for part in re.split(r'(\033\[[0-9;]*m)', text):
        m = re.fullmatch(r'\033\[([0-9;]*)m', part)
        if m:
            codes, i = m.group(1).split(';'), 0
            while i < len(codes):
                c = codes[i]
                if c == '1': st['b'] = True
                elif c == '2': st['d'] = True
                elif c == '22': st['b'] = st['d'] = False
                elif c == '4': st['u'] = True
                elif c == '24': st['u'] = False
                elif c == '9': st['s'] = True
                elif c == '29': st['s'] = False
                elif c == '39': st['fg'] = None
                elif c == '49': st['bg'] = None
                elif c == '48' and codes[i + 1] == '5':
                    st['bg'] = xterm256(int(codes[i + 2]))
                    i += 2
                elif c in FG: st['fg'] = FG[c]
                i += 1
            continue
        if not part:
            continue
        deco = ' '.join(x for x, on in (('underline', st['u']), ('line-through', st['s'])) if on)
        style = (f'color:{st["fg"] or GRAY};' + (f'background:{st["bg"]};' if st['bg'] else '')
                 + ('font-weight:700;' if st['b'] else '') + ('opacity:.55;' if st['d'] else '')
                 + (f'text-decoration:{deco};' if deco else ''))
        out.append(f'<span style="{style}">{html.escape(part)}</span>')
    return ''.join(out)


def pre(lines, event=None):
    head = f'<span style="color:{GRAY}">⎿ {event} says:</span>\n' if event else ''
    return f'<pre>{head}' + '\n'.join(to_html(l) for l in lines) + '</pre>'


STYLES = [('github', 'A. GitHub 비교'), ('track', 'B. 문서 제안 모드'), ('summary', 'E. 요약 + 지금 값')]
real = json.load(open(os.path.join(PROTO, 'changes.json')))['changes']
sample = json.load(open(os.path.join(PROTO, 'changes-sample.json')))['changes']
large = dict(notice.t2.LARGE, who='호윤', when='오후 1:00', source='AI 대화에서 바꿈', found_by_ai=False)
cases = [('실제: 근거 지움 (SIL-64)', real[0]), ('숫자 바꿈 (40자 → 32자)', sample[0]),
         ('폐기 (리뷰 규칙)', sample[1]), ('크게 바뀜 (문장 통째로)', large)]

parts = ['<h2>1. 실제 변경 하나를 화면 전체로</h2><div class="grid">']
for key, name in STYLES:
    notice.DIFF_STYLE = key
    screen = notice.detail_screen(real[0], 1, 2).split('\n')[1:]
    parts.append(f'<div><div class="step">{name}</div>{pre(screen, "UserPromptSubmit")}</div>')
parts.append('</div><h2>2. 경우별로 값 부분만</h2>')
for label, c in cases:
    parts.append(f'<div class="step case">{html.escape(label)}</div><div class="grid">')
    for key, name in STYLES:
        notice.DIFF_STYLE = key
        parts.append(f'<div><div class="step">{name}</div>{pre(notice.value_lines(c))}</div>')
    parts.append('</div>')

page = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>비교 방식 미리보기</title>
<style>
:root {{ --bg:#1e2227; --panel:#262b31; --text:#d7dce2; --muted:#8a929c; }}
body {{ background:var(--bg); color:var(--text); font-family:-apple-system, sans-serif; margin:0; padding:24px 16px; }}
main {{ max-width:1500px; margin:0 auto; }}
h1 {{ font-size:18px; margin:0 0 4px; }} h2 {{ font-size:15px; margin:28px 0 4px; }}
p.sub {{ color:var(--muted); font-size:13px; margin:0 0 8px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(700px, 1fr)); gap:12px; }}
.step {{ color:var(--muted); font-size:12px; margin:12px 0 6px; }} .step.case {{ color:var(--text); font-size:13px; margin-top:22px; }}
pre {{ background:var(--panel); margin:0; padding:14px 16px; border-radius:8px; font:14px/1.6 "D2Coding","SF Mono",Menlo,monospace; white-space:pre; overflow-x:auto; }}
</style></head><body><main>
<h1>비교 방식 미리보기 · A / B / E</h1>
<p class="sub">시안 hooks가 실제로 내보내는 글을 그대로 그렸어요. 회색 바탕과 글꼴 폭은 근사값이라 최종 확인은 Claude Code에서 해 주세요. 취소선은 터미널마다 지원이 달라요.</p>
{"".join(parts)}
</main></body></html>'''
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'diff-preview.html')
open(out, 'w').write(page)
print(out)
