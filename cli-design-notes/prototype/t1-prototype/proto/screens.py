"""T1 화면 글을 만드는 곳 (B: hooks가 직접 띄움). 문구·순서·칸 너비는 여기서 고쳐요.

Claude Code는 hooks 글 앞에 2칸을 들여 쓰므로 한 줄은 76칸까지 써요(80칸 터미널에서 78칸 안).
꾸밈 규칙은 notify-prototype/proto/notice.py와 같아요: 끄는 코드는 하나씩 따로 쓴다.
"""
import unicodedata

import wiki

COLS = 76
ARROW = '⭢'          # 어디서나 1칸
STRONG = '39;49'      # Claude Code 회색을 풀고 터미널 기본 글자색
ID_MAX = 24    # 결정 사항 ID가 이보다 길면 가운데(주제)를 줄여요: notify.app-title.from-standard → notify.….from-standard


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


def short_id(standard_id, cols=ID_MAX):
    """영역과 규칙은 남기고 가운데 주제를 …로 줄인다. 그래도 길면 끝을 줄인다."""
    if width(standard_id) <= cols:
        return standard_id
    parts = standard_id.split('.')
    if len(parts) == 3:
        head = f'{parts[0]}.….'
        return head + cut_end(parts[2], cols - width(head))
    return cut_end(standard_id, cols)


def area_of(standard_id):
    return standard_id.split('.')[0]


# ---------- ①② 충돌 (한 단계로 합침) ----------

KIND_COL, ID_COL = 8, 26
REASON_COL = COLS - 2 - KIND_COL - ID_COL
RED = '31'    # 충돌: 기본 16색 빨강 (부건 지정, 10/12)


def red(text):
    return f'{esc("1")}{esc(RED)}{text}{esc("39")}{esc("22")}'


def conflicts_screen(kind, request, conflicts):
    """kind: '작업'(경우 1, Claude가 알아챔) / '요청'(경우 2, 사람이 바꿔 달라고 함)."""
    if not conflicts:
        return '\n'.join([
            '',
            strong('관련 결정 사항을 찾아봤어요. 충돌하는 결정 사항이 없어요.', True),
            f'  {kind}  {cut_end(request, COLS - 8)}',
        ])
    head = '부탁하신 작업이 기존 결정 사항과 충돌해요.' if kind == '작업' else '요청하신 변경이 기존 결정 사항과 충돌해요.'
    lines = ['', red(head), f'  {kind}  {cut_end(request, COLS - 8)}', '']
    lines.append('  ' + dim(pad('구분', KIND_COL) + pad('충돌하는 이유', REASON_COL) + '결정 사항 ID'))
    lines.append('  ' + dim(pad('─' * 6, KIND_COL) + pad('─' * (REASON_COL - 2), REASON_COL) + '─' * ID_COL))
    for c in conflicts:
        reason = wrap(c['why'], REASON_COL - 2)
        for i, r in enumerate(reason):
            k = pad(c['kind'] if i == 0 else '', KIND_COL)
            sid = strong(short_id(c['id'])) if i == 0 else ''
            lines.append(('  ' + k + pad(r, REASON_COL) + sid).rstrip())
    return '\n'.join(lines)


# ---------- ③ 등록될 모습 ----------

def preview_screen(p):
    now = wiki.current_standards().get(p['id'])
    version = '' if now else '새 결정 사항'    # 고칠 때는 버전을 보여 주지 않아요 (10/12)
    title = f'[{area_of(p["id"])}] {p["title"]}'
    lines = ['', strong('결정 사항을 이렇게 등록할까요?', True), '']
    if not version:
        lines.append('  ' + strong(title, True))
    elif width(title) + 2 + width(version) <= COLS - 2:
        lines.append('  ' + strong(title, True) + ' ' * (COLS - 2 - width(title) - width(version)) + version)
    else:
        lines += ['  ' + strong(title, True), ' ' * (COLS - width(version)) + version]
    for label, text in (('값', p['value']), ('이유', p['reason'])):
        body = wrap(text, COLS - 10)
        lines.append(f'    {pad(label, 6)}{body[0]}')
        lines += [' ' * 10 + more for more in body[1:]]
    lines.append('')
    lines.append(f'    {bold("항상 적용")}  {strong("예" if p["always_on"] else "아니오", True)}')
    lines.append('')
    targets = wiki.notify_targets(p['id']) if now else []
    if not targets:
        lines.append('  연결된 이슈가 없어서 알림을 받는 사람은 없어요.')
        return '\n'.join(lines)
    id_col, issue_col, owner_col = 5, 32, 8
    links_col = COLS - 2 - id_col - issue_col - owner_col
    lines.append('  ' + dim(pad('ID', id_col) + pad('이슈', issue_col) + pad('담당자', owner_col) + '근거 결정 사항'))
    lines.append('  ' + dim(pad('───', id_col) + pad('─' * (issue_col - 2), issue_col) + pad('─' * 6, owner_col) + '─' * links_col))
    for i in targets:
        others = len([x for x in i['links'] if x != p['id']])
        links = short_id(p['id'], links_col - (5 if others else 0)) + (f' 외 {others}' if others else '')
        lines.append('  ' + pad(i['number'], id_col) + pad(cut_end(i['title'], issue_col - 2), issue_col)
                     + pad(i['owner'], owner_col) + links)
    return '\n'.join(lines)
