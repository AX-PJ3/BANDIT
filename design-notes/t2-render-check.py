#!/usr/bin/env python3
"""T2 터미널 목업을 실제 터미널에 찍어 보는 확인용 스크립트.

터미널과 글꼴을 바꿔 가며 실행해서, 목업이 의도대로 보이는지 확인해요.
- 기호(↳ ● … ✓)가 보이는지
- 80칸에서 줄이 꺾이지 않는지
- 이전/지금 줄의 대괄호가 위아래 같은 칸에서 시작하는지
- 굵게/색이 어떻게 보이는지

사용법
  python3 design-notes/t2-render-check.py                 # 지금 터미널 너비로, 굵게 모드
  python3 design-notes/t2-render-check.py --style plain   # 꾸밈 없이
  python3 design-notes/t2-render-check.py --style color   # 굵게 + 색
  python3 design-notes/t2-render-check.py --width 80      # 내용만 80칸 기준으로 계산
  python3 design-notes/t2-render-check.py --wide          # 애매한 폭 기호를 2칸으로 계산 (한국어 터미널 설정)

줄이 꺾이는지 보려면 --width 대신 터미널 창 자체를 80칸으로 줄여서 실행하세요.
외부 패키지 없이 Python 3만 있으면 돼요.

규칙은 design-notes/T2-첫줄-결정기록.md, T2-본문-결정기록.md 를 따라요.
"""

import argparse
import os
import shutil
import sys
import unicodedata

# ---------- 규칙 값 ----------

AREA_ORDER = ['goal', 'wiki', 'detect', 'notify', 'app', 'data', 'copy', 'work']  # 위키 목차 순서
MAX_AREAS = 3
LARGE_CHANGE_RATIO = 0.5   # 바뀐 부분이 값의 절반을 넘으면 대괄호 없이 값을 그대로 보여 줘요
TAGS = {'new': '신규', 'deprecated': '폐기', 'revert': '되돌림'}
MIN_COLS = 80

# ---------- 예시 데이터 ----------
# kind: change(일반) / revert(되돌림) / new(신규) / deprecated(폐기)

SHORT = {
    'label': '짧은 예시', 'kind': 'change', 'area': 'app', 'issue': 'SIL-67',
    'title': '앱 알림 제목은 32자 이하로 쓴다',
    'old': '공백 포함 40자 이하', 'new': '공백 포함 32자 이하',
}
LONG = {
    'label': '긴 예시', 'kind': 'change', 'area': 'notify', 'issue': 'SIL-1234',
    'title': '같은 이슈에 확인하지 않은 이전 버전이 있으면 새 버전으로 대체한다',
    'old': '같은 이슈에 같은 결정 사항의 확인하지 않은 이전 버전이 있으면, '
           '이전 것은 새 버전으로 대체됨으로 닫고 새 버전 하나만 남긴다',
    'new': '같은 이슈에 같은 결정 사항의 확인하지 않은 이전 버전이 있으면, '
           '이전 것은 새 버전으로 대체됨으로 닫고 최신 변경 하나만 보여 준다',
}
LARGE = {
    'label': '바뀐 부분이 큰 경우', 'kind': 'change', 'area': 'notify', 'issue': 'SIL-68',
    'title': '변경이 3개 이상이면 터미널에 목록을 먼저 보여 준다',
    'old': '확인할 변경이 여러 개면 한 화면에 하나만 보여 주고, 답하면 다음 변경으로 넘어간다',
    'new': '확인할 변경이 3개 이상이면 목록을 먼저 보여 주고, 고른 변경부터 하나씩 보여 준다',
}
REMOVED = {
    'label': '단어를 지운 경우', 'kind': 'change', 'area': 'notify', 'issue': 'SIL-68',
    'title': '알림에는 이전 값, 지금 값, 이유, 영향받는 이슈를 보여 준다',
    'old': '변경마다 기준 제목, 이전 값, 지금 값, 이유, 근거, 바꾼 사람과 시간, 영향받는 이슈를 보여 준다',
    'new': '변경마다 기준 제목, 이전 값, 지금 값, 이유, 바꾼 사람과 시간, 영향받는 이슈를 보여 준다',
}
NEW = {
    'label': '신규', 'kind': 'new', 'area': 'notify', 'issue': 'SIL-67',
    'title': '같은 변경은 세 번까지만 넘길 수 있다', 'old': None,
    'new': '같은 변경을 세 번 넘기면 네 번째부터는 넘기기 없이 답해야 한다',
}
DEPRECATED = {
    'label': '폐기', 'kind': 'deprecated', 'area': 'work', 'issue': 'SIL-66',
    'title': '리뷰 요청은 4시간 안에 본다',
    'old': '코드 리뷰 요청은 4시간 안에 보고, 못 보면 못 본다고 남긴다', 'new': None,
}
REVERT = {
    'label': '되돌림', 'kind': 'revert', 'area': 'app', 'issue': 'SIL-67',
    'title': '앱 알림 제목은 40자 이하로 쓴다',
    'old': '공백 포함 32자 이하', 'new': '공백 포함 40자 이하',
}
SINGLE_CASES = [SHORT, LONG, LARGE, REMOVED, NEW, DEPRECATED, REVERT]
MANY_CASE = [REMOVED, DEPRECATED, SHORT]   # 영역이 다른 3건

# ---------- 글자 폭 ----------

IS_WIDE_AMBIGUOUS = False


def char_width(ch):
    kind = unicodedata.east_asian_width(ch)
    if kind in ('W', 'F'):
        return 2
    if kind == 'A':
        return 2 if IS_WIDE_AMBIGUOUS else 1
    return 1


def text_width(text):
    return sum(char_width(ch) for ch in text)


def cut_end(text, budget):
    """뒤를 잘라 budget 칸에 맞춘다."""
    if text_width(text) <= budget:
        return text
    out = ''
    for ch in text:
        if text_width(out + ch + '…') > budget:
            break
        out += ch
    return out.rstrip() + '…'


def cut_start(text, budget):
    """앞을 잘라 budget 칸에 맞춘다. 바뀐 곳에 가까운 뒤쪽을 남긴다."""
    if text_width(text) <= budget:
        return text
    out = ''
    for ch in reversed(text):
        if text_width('…' + ch + out) > budget:
            break
        out = ch + out
    return '…' + out.lstrip()


# ---------- 바뀐 부분 찾기 ----------

def common_prefix_len(a, b):
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n


def find_change(old, new):
    """(앞 공통, 이전에서 바뀐 곳, 지금에서 바뀐 곳, 뒤 공통)을 돌려준다.

    단어 단위로 앞뒤 공통 부분을 걷어낸다. 바뀐 곳이 양쪽 모두 한 단어뿐이면
    그 단어 안에서 글자 단위로 한 번 더 좁힌다 (40자 → [40]자).
    """
    old_words, new_words = old.split(' '), new.split(' ')
    p = common_prefix_len(old_words, new_words)
    s = common_prefix_len(old_words[p:][::-1], new_words[p:][::-1])
    pre = ' '.join(old_words[:p])
    suf = ' '.join(old_words[len(old_words) - s:]) if s else ''
    old_mid = ' '.join(old_words[p:len(old_words) - s])
    new_mid = ' '.join(new_words[p:len(new_words) - s])
    pre_sep = ' ' if pre else ''
    suf_sep = ' ' if suf else ''

    if ' ' not in old_mid and ' ' not in new_mid and old_mid and new_mid:
        cp = common_prefix_len(old_mid, new_mid)
        cs = common_prefix_len(old_mid[cp:][::-1], new_mid[cp:][::-1])
        pre = pre + pre_sep + old_mid[:cp]
        suf = old_mid[len(old_mid) - cs:] + suf_sep + suf
        old_mid = old_mid[cp:len(old_mid) - cs]
        new_mid = new_mid[cp:len(new_mid) - cs]
        return pre, old_mid, new_mid, suf

    return pre + pre_sep, old_mid, new_mid, suf_sep + suf


def is_large_change(old, new, old_mid, new_mid):
    return (len(old_mid) + len(new_mid)) > LARGE_CHANGE_RATIO * (len(old) + len(new))


# ---------- 꾸밈 (굵게/색) ----------

class Style:
    def __init__(self, mode):
        self.mode = mode

    def _wrap(self, text, codes):
        if self.mode == 'plain' or not text:
            return text
        return f'\033[{codes}m{text}\033[0m'

    def strong(self, text):      # 기준 제목
        return self._wrap(text, '1')

    def changed(self, text):     # 바뀐 부분: color 모드에서 굵게 + 노랑
        return self._wrap(text, '1;33' if self.mode == 'color' else '1')

    def quiet(self, text):       # 구분선, 태그: color 모드에서 흐리게
        return self._wrap(text, '2') if self.mode == 'color' else text


# ---------- 화면 만들기 ----------

def sort_by_index(cases):
    """위키 목차(영역) 순서로 정렬한다. 같은 영역 안에서는 들어온 순서를 지킨다."""
    return sorted(cases, key=lambda c: AREA_ORDER.index(c['area']) if c['area'] in AREA_ORDER else len(AREA_ORDER))


def first_line(cases):
    areas = []
    for c in sort_by_index(cases):
        if c['area'] not in areas:
            areas.append(c['area'])
    shown = areas[:MAX_AREAS] + (['…'] if len(areas) > MAX_AREAS else [])
    issues = []
    for c in sort_by_index(cases):
        if c['issue'] not in issues:
            issues.append(c['issue'])
    issue = issues[0] + (f' 외 {len(issues) - 1}개' if len(issues) > 1 else '')
    count = len(cases)
    total = '총 ' if count > 1 else ''
    return f"● [{', '.join(shown)}] {issue} 관련 기준 변경이 {total}{count}건 있어요."


def title_line(case, cols, style):
    tag = TAGS.get(case['kind'])
    tag_text = f' ({tag})' if tag else ''
    title = cut_end(case['title'], cols - 2 - text_width(tag_text))
    return '  ' + style.strong(title) + (style.quiet(tag_text) if tag else '')


def value_rows(case, cols, style):
    old, new = case.get('old'), case.get('new')
    if case['kind'] == 'deprecated':
        return [cut_end('    ' + old, cols)]
    if case['kind'] == 'new' or old is None:
        return [cut_end('  ↳ ' + new, cols)]

    pre, old_mid, new_mid, suf = find_change(old, new)
    if is_large_change(old, new, old_mid, new_mid):
        return [cut_end('    ' + old, cols), cut_end('  ↳ ' + new, cols)]

    widest = max(text_width(old_mid), text_width(new_mid)) + 2
    left = cut_start(pre, max(8, cols - 4 - widest - text_width(suf)))
    rows = []
    for mark, mid in (('    ', old_mid), ('  ↳ ', new_mid)):
        plain = cut_end(f'{mark}{left}[{mid}]{suf}', cols)
        bracket = f'[{mid}]'
        if bracket in plain:
            plain = plain.replace(bracket, '[' + style.changed(mid) + ']', 1)
        rows.append(plain)
    return rows


def change_block(case, cols, style):
    return [title_line(case, cols, style), *value_rows(case, cols, style)]


def render_t2(cases, cols, style):
    """1건이면 빈 줄로 나누고, 2건 이상이면 변경마다 구분선으로 나눈다."""
    if isinstance(cases, dict):
        cases = [cases]
    lines = [first_line(cases)]
    if len(cases) == 1:
        return lines + [''] + change_block(cases[0], cols, style)
    divider = '  ' + style.quiet('-' * (cols - 4))
    for case in sort_by_index(cases):
        lines += [divider] + change_block(case, cols, style)
    return lines + [divider]


# ---------- 확인용 부품 ----------

def ruler(cols):
    tens = ''.join(str(c // 10 % 10) if c % 10 == 0 else ' ' for c in range(1, cols + 1))
    units = ''.join(str(c % 10) for c in range(1, cols + 1))
    return [tens, units]


def plain_width(line):
    """꾸밈 코드를 뺀 실제 칸 수."""
    out, skip = '', False
    for ch in line:
        if ch == '\033':
            skip = True
        elif skip and ch == 'm':
            skip = False
        elif not skip:
            out += ch
    return text_width(out)


def section(title):
    print()
    print(f'===== {title} =====')


def show(lines, cols):
    for line in ruler(cols):
        print(line)
    for line in lines:
        print(line)
    widest = max(plain_width(line) for line in lines)
    status = '안에 들어가요' if widest <= cols else '넘쳐요'
    print(f'→ {len(lines)}줄, 가장 넓은 줄 {widest}/{cols}칸 ({status})')


def main():
    global IS_WIDE_AMBIGUOUS
    parser = argparse.ArgumentParser(description='T2 터미널 목업 확인')
    parser.add_argument('--style', choices=['plain', 'bold', 'color'], default='bold')
    parser.add_argument('--width', type=int, default=0, help='내용을 계산할 너비 (기본: 지금 터미널 너비)')
    parser.add_argument('--wide', action='store_true', help='애매한 폭 기호를 2칸으로 계산')
    parser.add_argument('--force-style', action='store_true', help='출력이 화면이 아니어도 꾸밈 코드를 넣음')
    args = parser.parse_args()

    IS_WIDE_AMBIGUOUS = args.wide
    real_cols = shutil.get_terminal_size(fallback=(MIN_COLS, 24)).columns
    cols = args.width or real_cols
    mode = args.style
    if not args.force_style and (not sys.stdout.isatty() or os.environ.get('NO_COLOR')):
        mode = 'plain'
    style = Style(mode)

    section('1. 환경')
    for key in ('TERM_PROGRAM', 'TERM', 'COLORTERM', 'LANG', 'NO_COLOR'):
        print(f'{key:13}= {os.environ.get(key, "(없음)")}')
    print(f'터미널 너비   = {real_cols}칸 / 계산 너비 = {cols}칸 / 꾸밈 = {mode} / 애매한 폭 = {"2칸" if args.wide else "1칸"}')
    if real_cols < MIN_COLS:
        print(f'! 터미널이 {MIN_COLS}칸보다 좁아요. 목업은 {MIN_COLS}칸 이상을 기준으로 만들었어요.')
    if cols > real_cols:
        print('! 계산 너비가 실제 터미널보다 넓어서 줄이 꺾일 수 있어요.')

    section('2. 글자 폭 확인 (위아래 끝이 맞아야 해요)')
    print('12345678901234567890  ← 숫자 20칸')
    print('가나다라마바사아자차  ← 한글 10자 = 20칸')
    print('↳●…✓[]-  ← 기호 7개. 칸마다 하나씩 보이면 정상 (네모나 물음표로 보이면 글꼴에 없음)')
    print('1234567  ← 기호 7개 줄과 끝이 맞으면 모두 1칸')
    print(f"굵게 확인: {style.strong('굵게 보이나요? Bold ABC 123')} / 보통: 굵게 보이나요? Bold ABC 123")

    for case in SINGLE_CASES:
        section(f"3. T2 1건 · {case['label']}")
        show(render_t2(case, cols, style), cols)

    section('4. T2 여러 건 (구분선으로 나눔, 목차 순서)')
    show(render_t2(MANY_CASE, cols, style), cols)

    section('5. 0건 · 명령어를 직접 호출했을 때 (문구 미정)')
    show(['✓ 나에게 온 변경을 모두 확인했어요.'], cols)

    section('확인할 것')
    for item in (
        '- 2번: 숫자 줄과 한글 줄의 끝이 맞나요?',
        '- 2번: ↳ ● … ✓ 가 네모나 물음표 없이 보이나요?',
        '- 3번: 이전 줄과 ↳ 줄의 [ 가 같은 칸에서 시작하나요?',
        '- 3번: 줄이 다음 줄로 꺾이지 않았나요? (창을 80칸으로 줄여서도 확인)',
        '- 3번: 굵게/색이 의도대로 보이나요? (--style plain / bold / color 비교)',
        '- 한국어 설정(애매한 폭 2칸)을 켠 터미널이면 --wide 로 다시 실행해 보세요.',
    ):
        print(item)


if __name__ == '__main__':
    main()
