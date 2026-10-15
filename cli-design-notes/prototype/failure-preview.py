"""터미널 알림 연결 실패 화면 제안 페이지 (failure-preview.html). 실행: python3 failure-preview.py

- 화면 글: notice.py의 failed_* 함수(제안)와 팀 코드 haribo-hook.mjs의 FAILED_NOTICE(지금)를 그대로 그린다.
- 그리는 규칙: theme-preview.py와 같다. hooks 글은 회색으로 감싸고, 혼자 쓴 39는 회색, 39;49는 터미널 기본 글자색.
- 터미널 색은 웹 프로토타입과 같은 근사값(어두움: 맥 기본 터미널, 밝음: Tango Light).
- 만든 뒤 포맷: npx prettier --write failure-preview.html
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'notify-prototype', 'proto'))
os.environ.setdefault('NOTICE_DATA', 'changes-v2')
import notice as n  # noqa: E402

esc = n.esc

# 지금 팀 코드: apps/mcp-server/hooks-client/haribo-hook.mjs FAILED_NOTICE (= @sil/notify connectionFailedNotice)
TEAM_NOW = '\n'.join([
    '',
    f'{esc("39;49")}● 서버에 연결하지 못해서 확인할 변경을 불러오지 못했어요.{esc("39")}',
    f'  {esc("1")}"결정 사항 확인"{esc("22")}을 입력하면 다시 시작해요.',
])
TEAM_NOW_SETUP = TEAM_NOW + '\n  (config.json이 없어요. pnpm mcp:register를 다시 실행해 주세요)'


def to_html(text):
    """ANSI → span. 색은 CSS 변수(터미널 테마)로 남겨서 어두움·밝음을 페이지에서 바꾼다."""
    out = []
    st = {'fg': 'gray', 'b': False, 'd': False, 'r': False}
    for part in re.split(r'(\033\[[0-9;]*m)', text):
        m = re.fullmatch(r'\033\[([0-9;]*)m', part)
        if m:
            codes = m.group(1).split(';')
            if codes == ['39']:
                st['fg'] = 'gray'
            for c in codes:
                if c == '1': st['b'] = True
                elif c == '2': st['d'] = True
                elif c == '22': st['b'] = st['d'] = False
                elif c == '7': st['r'] = True
                elif c == '27': st['r'] = False
                elif c in ('31', '32', '33', '36'): st['fg'] = {'31': 'red', '32': 'green', '33': 'yellow', '36': 'cyan'}[c]
            if codes == ['39', '49']:
                st['fg'] = 'fg'
            continue
        if not part:
            continue
        cls = [('r-' if st['r'] else 'f-') + st['fg']] + (['b'] if st['b'] else []) + (['d'] if st['d'] else [])
        out.append(f'<span class="{" ".join(cls)}">{html.escape(part)}</span>')
    return ''.join(out)


def hook(event, msg):
    rows = msg.split('\n')
    if rows and rows[0] == '':
        rows = rows[1:]
    return [f'<span class="f-gray">⎿ {html.escape(event)} says:</span>'] + ['  ' + to_html(r) for r in rows]


def prompt(text):
    return [f'<span class="prompt">&gt; {html.escape(text)}</span>']


def claude(text):
    return [f'<span class="f-fg">● {html.escape(text)}</span>']


def gray(text):
    return [f'<span class="f-gray">{html.escape(text)}</span>']


def term(lines):
    body = ''.join(f'<div class="ln">{l}</div>' for l in lines)   # div가 줄을 나누므로 줄바꿈 글자는 넣지 않는다
    return f'<div class="term"><pre>{body}</pre></div>'


CLAUDE_WORK = claude('작업을 시작할게요.')
BANNER = gray('✻ Welcome to Claude Code!')

COMPARE = {
    'now': term(BANNER + [''] + hook('SessionStart:startup', TEAM_NOW)),
    'new': term(BANNER + [''] + hook('SessionStart:startup', n.failed_load())),
    'now_prompt': term(prompt('버튼 색 바꿔 줘') + hook('UserPromptSubmit', TEAM_NOW) + [''] + CLAUDE_WORK),
    'new_prompt': term(prompt('버튼 색 바꿔 줘') + hook('UserPromptSubmit', n.failed_load()) + [''] + CLAUDE_WORK),
}

# (키, 이름, 언제, 화면, 그다음, 상태, 메모)
CASES = [
    ('load', '확인할 변경을 못 불러옴', 'Claude Code를 켤 때 · 작업을 입력할 때 · "결정 사항 확인"을 입력했을 때 (모두 같은 글)',
     term(prompt('버튼 색 바꿔 줘') + hook('UserPromptSubmit', n.failed_load()) + [''] + CLAUDE_WORK),
     '작업은 막지 않고 그대로 진행해요(no-block-retry). 상황마다 둘째 줄을 다르게 하면 경우가 너무 많아져서 한 가지 글로 둬요. 서버 주소가 틀림·꺼짐·느림은 구분할 수 없어서 원인을 짐작하지 않고 다음 할 일과 담당자만 알려요.',
     'decided', '팀 코드에 있음 · 빨간 막대, "못해", 셋째 줄(T1 예외 3과 같은 말)을 바꿈 (10/15)'),
    ('record', '답을 기록하지 못함', '관계·알았나를 고른 뒤 respond가 실패했을 때',
     term(gray("● User answered Claude's questions:") + gray('  ⎿  · 이 변경을 이미 알고 있었나요? → 몰랐다') + ['']
          + hook('PostToolUse:mcp__haribo__respond', n.failed_record()) + [''] + CLAUDE_WORK),
     '그 변경은 대기로 남아요. 서버가 안 되면 다음 기록도 실패해서 남은 변경은 더 묻지 않고 작업으로 넘어가요.',
     'check', '지금은 기록 뒤 단계에서 실패하면 아무것도 안 띄워요. 실패한 도구 뒤에 hooks 글을 띄울 수 있는지 민수님 확인'),
    ('reflect', '이슈 반영을 등록하지 못함', '"이슈 반영"에서 고른 뒤 mark_reflected가 실패했을 때',
     term(gray("● User answered Claude's questions:") + gray('  ⎿  · 어느 변경을 이슈에 반영했나요? → #7 앱 알림 제목은 32자 이하로 쓴다') + ['']
          + hook('PostToolUse:mcp__haribo__mark_reflected', n.failed_reflect())),
     '아무것도 등록되지 않아요. 고른 변경은 그대로 이슈 반영할 변경으로 남아요.',
     'check', '새 흐름이라 지금 코드에 없어요. 띄울 자리는 기록 실패와 같이 정해요'),
    ('setup', '설정이 완료되지 않음', '설정 파일(config.json)이 없거나 서버가 팀 토큰·이름을 거절(401)했을 때',
     term(prompt('버튼 색 바꿔 줘') + hook('UserPromptSubmit', n.failed_setup()) + [''] + CLAUDE_WORK),
     '둘 다 pnpm mcp:register를 다시 돌리면 고쳐져서 한 가지 글로 묶어요. 서버 주소가 틀린 것은 응답이 없어 구분할 수 없어서 위 "못 불러옴" 글이 떠요.',
     'decided', '지금은 설정 파일 없음은 괄호 셋째 줄, 토큰 거절은 서버 거절 문장이 괄호로 붙어요. 바꾸려면 hook.mjs를 고쳐요'),
    ('mcp', 'hooks는 되는데 MCP 도구만 안 붙음', 'Claude Code에 haribo MCP 서버가 연결되지 않았을 때',
     term(prompt('버튼 색 바꿔 줘') + hook('UserPromptSubmit', n.detail_screen(n.load_changes()['changes'][0], 1, 1))[:4]
          + gray('  … (변경 상세)') + ['']
          + claude(n.MCP_MISSING_TEXT.split('. ')[0] + '.')
          + gray('  ' + n.MCP_MISSING_TEXT.split('. ')[1]) + [''] + CLAUDE_WORK),
     '지금은 상세만 뜨고 Claude가 아무 말 없이 작업으로 넘어가요. hooks가 입력할 때마다 Claude에게 보내는 안내에 "haribo 도구가 없으면 이 문장을 쓰고 작업을 이어가라"를 넣어요. MCP 서버 안내문은 끊기면 안 와서 안 돼요.',
     'todo', '이 글은 hooks가 아니라 Claude가 쓰는 문장이라 글자가 조금 달라질 수 있어요(근사). 넣을 곳: notify-hooks.ts의 hooks 안내'),
]

STATUS = {'decided': ('정함', 'ok'), 'todo': ('정함 · 민수님 구현', 'ok'), 'proposal': ('제안', 'new'),
          'check': ('확인 필요', 'warn')}

cases_html = []
for key, name, when, screen, after, status, memo in CASES:
    label, cls = STATUS[status]
    cases_html.append(f'''
      <article class="case" id="case-{key}">
        <div class="case-meta">
          <span class="chip {cls}">{label}</span>
          <h3>{html.escape(name)}</h3>
          <dl>
            <dt>언제</dt><dd>{html.escape(when)}</dd>
            <dt>그다음</dt><dd>{html.escape(after)}</dd>
            <dt>메모</dt><dd>{html.escape(memo)}</dd>
          </dl>
        </div>
        <div class="case-screen">{screen}</div>
      </article>''')

template = open(os.path.join(HERE, 'failure-preview.template.html'), encoding='utf-8').read()
page = (template.replace('<!--COMPARE_NOW-->', COMPARE['now'])
        .replace('<!--COMPARE_NEW-->', COMPARE['new'])
        .replace('<!--COMPARE_NOW_PROMPT-->', COMPARE['now_prompt'])
        .replace('<!--COMPARE_NEW_PROMPT-->', COMPARE['new_prompt'])
        .replace('<!--CASES-->', ''.join(cases_html)))
out = os.path.join(HERE, 'failure-preview.html')
open(out, 'w', encoding='utf-8').write(page)
print(out)
