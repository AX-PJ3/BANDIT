"""T1 화면 글을 만드는 곳 (B: hooks가 직접 띄움). 문구·순서·칸 너비는 여기서 고쳐요.

Claude Code는 hooks 글 앞에 2칸을 들여 쓰므로 한 줄은 76칸까지 써요(80칸 터미널에서 78칸 안).
꾸밈 규칙은 notify-prototype/proto/notice.py와 같아요: 끄는 코드는 하나씩 따로 쓴다.
"""
import re
import unicodedata

import wiki

COLS = 76
ARROW = '⭢'          # 어디서나 1칸
STRONG = '39;49'      # Claude Code 회색을 풀고 터미널 기본 글자색


def esc(codes):
    return f'\033[{codes}m'


def bold(text):
    return f'{esc("1")}{text}{esc("22")}'


def dim(text):
    return f'{esc("2")}{text}{esc("22")}'


def strong(text, is_bold=False):
    on = (esc('1') if is_bold else '') + esc(STRONG)
    off = esc('39') + (esc('22') if is_bold else '')
    return f'{on}{text}{off}'


def width(text):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in text)


def pad(text, cols):
    return text + ' ' * max(cols - width(text), 0)


def cut_end(text, cols):
    if width(text) <= cols:
        return text
    out = ''
    for c in text:
        if width(out + c) > cols - 1:
            break
        out += c
    return out + '…'


def wrap(text, cols):
    """띄어쓰기 단위로 줄을 바꾼다. 한 낱말이 너무 길면 글자 단위로 자른다."""
    lines, line = [], ''
    for word in text.split(' '):
        candidate = f'{line} {word}' if line else word
        if width(candidate) <= cols:
            line = candidate
            continue
        if line:
            lines.append(line)
        while width(word) > cols:
            part = ''
            for c in word:
                if width(part + c) > cols:
                    break
                part += c
            lines.append(part)
            word = word[len(part):]
        line = word
    if line:
        lines.append(line)
    return lines or ['']


def area_of(standard_id):
    return standard_id.split('.')[0]


# ---------- 위아래 선 (T2~T5 v2와 같은 틀, 10/13) ----------
# 위 선 안에 머리표를 넣고 아래 선으로 닫는다. 선은 어디서나 1칸인 영문 하이픈
# (상자 선 ─ 는 한국어 코딩 글꼴에서 2칸, T2-본문 결정기록 3-7)
RULE = '-'


def rule_top(head_text):
    """head_text는 이미 꾸민 글. 칸 수는 꾸밈을 뺀 글로 센다.
    왼쪽 --는 꾸미지 않고(hooks 기본 회색), 머리표 글자도 굵게 하지 않아요 (10/13 부건)."""
    plain = re.sub(r'\033\[[0-9;]*m', '', head_text)
    head_width = width(f'{RULE * 2} {plain} ')
    fill = RULE * max(2, COLS - head_width)
    return f'{RULE * 2} {head_text}{strong(" " + fill)}'


def rule_bottom():
    return strong(RULE * COLS)


# ---------- ①② 다른 결정 사항 확인 (한 단계로 합침) ----------
# 글 첫 줄(''을 맨 앞에 둔 이유): Claude Code가 hooks 글 위에 `PostToolUse:도구 이름 says:` 머리글을 붙여요(바꿀 수 없어요, 10/14).
# 첫 줄을 비워 두면 그 머리글 바로 아래 줄에서 우리 글이 시작해요. 머리글은 별도 한 줄이라 칸 수(COLS)에 넣지 않아요.
# "충돌"은 위키 용어집에서 동시 수정(detect.conflict.hold)을 뜻해서 T1은 "달라요"를 써요 (10/13)

KIND_COL = 8
YELLOW = '33'  # 다른 결정 사항이 있을 때 머리표: 기본 16색 노랑 (10/13 부건, 처음엔 빨강)
GREEN = '32'   # 다른 결정 사항이 없을 때 한 줄: 기본 16색 초록 (10/13)
PURPLE = '35'  # 되돌림: 기본 16색 자주. 되돌림만 있고 어긋나는 결정 사항이 없을 때 머리표, 그리고 되돌림 줄의 구분 (시안 10/16 부건)


def color_bar(color, text):
    """그 색을 반전한 칸 하나 + 빈칸 + 같은 색 글자. T2~T5 상태 줄의 노란 막대와 같은 모양 (10/13 부건)"""
    return f'{esc(color)}{esc("7")} {esc("27")} {text}{esc("39")}'


def conflicts_screen(kind, request, conflicts, revert=None):
    """kind: '작업'(경우 1, Claude가 알아챔) / '요청'(경우 2, 사람이 바꿔 달라고 함).
    다른 결정 사항마다 구분 · [영역] 제목, 그 아래에 왜 그렇게 판단했는지 (ID는 보여 주지 않아요, 10/13).
    revert: 서버가 알려 준 되돌림(show_conflicts 결과의 revert). 있으면 되돌아가는 예전 결정 사항을 맨 아래에 보여 줘요 (시안 10/16)."""
    if not conflicts:
        # 없을 때는 요청 줄 없이 녹색 막대 한 줄만 (10/13 부건)
        return '\n'.join(['', color_bar(GREEN, '요청하신 변경과 다른 결정 사항이 없어요')])
    ask = f'  {kind}  {cut_end(request, COLS - 8)}'
    others = [c for c in conflicts if not (revert and c['id'] == revert['id'] and c['kind'] == '변경')]
    if revert and not others:
        # 되돌림만 있고 어긋나는 다른 결정 사항이 없으면 보라 머리표. 경우 1·2 모두 (시안 10/16 부건)
        head = '부탁하신 작업이 이전 결정 사항과 동일해요' if kind == '작업' else '요청하신 변경이 이전 결정 사항과 동일해요'
        head_line = color_bar(PURPLE, head)
    else:
        head = '부탁하신 작업이 기존 결정 사항과 달라요' if kind == '작업' else '요청하신 변경이 기존 결정 사항과 달라요'
        # 이 화면은 위아래 선 없이 노란 막대 머리표로 시작해요 (10/13 부건)
        head_line = color_bar(YELLOW, head)
    lines = ['', head_line]
    if revert:
        # 되돌림이 들어가면 머리표 아래에 기존 결정 사항 한 줄. 제목은 굵게 하지 않고, 버전은 제목 오른쪽 (시안 10/16)
        now_title = f'[{area_of(revert["id"])}] {revert["now_title"]}'
        lines.append(f'  기존  {strong(cut_end(now_title, COLS - 8 - 5))}  v{revert["now_version"]}')
    lines += [ask, '']
    now = wiki.current_standards()
    body_col = COLS - 2 - KIND_COL
    for c in others:
        title = f'[{area_of(c["id"])}] {now[c["id"]]["title"]}' if c['id'] in now else c['id']
        for i, t in enumerate(wrap(title, body_col)):
            lines.append('  ' + pad(c['kind'] if i == 0 else '', KIND_COL) + strong(t, True))
        lines += [' ' * (2 + KIND_COL) + w for w in wrap(c['why'], body_col)]
    if revert:
        lines += revert_lines(revert, body_col, gap=bool(others))
    return '\n'.join(lines)


def revert_lines(r, body_col, gap):
    """되돌림 줄 (시안 10/16): 다른 결정 사항 맨 아래, 위와 한 줄 띄움. T2 상세처럼 제목 오른쪽에 버전,
    아래에 누가·언제 변경했는지, 이유 한 줄. 이유는 너비보다 길면 끝을 줄여요(터미널 너비에 따라 보이는 길이가 달라져요)."""
    ver = f'  v{r["version"]}'
    title = f'[{area_of(r["id"])}] {r["title"]}'
    kind = f'{esc(PURPLE)}되돌림{esc("39")}' + ' ' * (KIND_COL - width('되돌림'))
    who = f'{r["changed_by"]}님이 {r["changed_at"]}에 변경했어요.' if r.get('changed_by') else ''
    pad_col = ' ' * (2 + KIND_COL)
    rows = [''] if gap else []
    rows.append('  ' + kind + strong(cut_end(title, body_col - width(ver)), True) + ver)
    if who:
        rows.append(pad_col + who)
    rows.append(pad_col + pad('이유', 6) + strong(cut_end(r['reason'], body_col - 6)))
    return rows


# ---------- ③ 등록될 모습 ----------

CYAN = '36'   # ③ 제목: 기본 16색 청록 굵게. T2~T5 상세 제목과 같은 색 (10/13 부건, 처음엔 청록 막대)

def preview_screen(p):
    now = wiki.current_standards().get(p['id'])
    version = '' if now else '새 결정 사항'    # 고칠 때는 버전을 보여 주지 않아요 (10/12)
    title = f'[{area_of(p["id"])}] {p["title"]}'
    lines = ['', rule_top(strong('결정 사항을 이렇게 등록할까요'))]
    head = '  ' + bold(f'{esc(CYAN)}{title}{esc("39")}')
    if not version:
        lines.append(head)
    elif width(title) + 2 + width(version) <= COLS - 2:
        lines.append(head + ' ' * (COLS - 2 - width(title) - width(version)) + version)
    else:
        lines += [head, ' ' * (COLS - width(version)) + version]
    # 이름(값·이유·항상 적용)은 회색, 오른쪽 내용은 터미널 기본 글자색 (어두우면 흰색, 밝으면 검정. 10/13 부건)
    for label, text in (('값', p['value']), ('이유', p['reason'])):
        body = wrap(text, COLS - 10)
        lines.append(f'    {pad(label, 6)}{strong(body[0])}')
        lines += [' ' * 10 + strong(more) for more in body[1:]]
    lines.append('')
    # 값·이유와 같은 모양. 항상 적용이 예일 때만 줄 전체를 굵게 (10/13 부건)
    always = f'항상 적용  {strong("예" if p["always_on"] else "아니오")}'
    lines.append('    ' + (bold(always) if p['always_on'] else always))
    lines.append('')
    targets = wiki.notify_targets(p['id']) if now else []
    if not targets:
        lines += ['  연결된 이슈가 없어서 알림을 받는 사람은 없어요.', rule_bottom()]
        return '\n'.join(lines)
    # 누구에게 알리는지 보는 표. 모든 줄이 이번 결정 사항 때문에 받아서 "근거 결정 사항" 열은 뺐어요 (10/13)
    # 담당자를 이슈 앞에 둬서 긴 이슈 제목은 끝에서 줄여요
    id_col, owner_col = 5, 8
    issue_col = COLS - 2 - id_col - owner_col
    lines.append('  ' + dim(pad('ID', id_col) + pad('담당자', owner_col) + '이슈'))
    for i in targets:
        lines.append('  ' + pad(i['number'], id_col) + pad(i['owner'], owner_col) + cut_end(i['title'], issue_col))
    lines.append(rule_bottom())
    return '\n'.join(lines)
