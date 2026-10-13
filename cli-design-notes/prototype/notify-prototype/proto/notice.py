"""시안용 공용 부품: 샘플 데이터 읽기, 답 저장, 화면 글 만들기.

값 비교 규칙과 글자 폭 계산은 cli-design-notes/t2-render-check.py에서 그대로 가져온다 (원본은 고치지 않음).
"""
import importlib.util
import json
import os
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, os.environ.get('NOTICE_DATA', 'changes') + '.json')   # NOTICE_DATA=changes-demo 처럼 바꿔 볼 수 있다
ANSWERS = os.path.join(HERE, '..', 'answers.json')
CLOSED = os.path.join(HERE, '..', 'closed.json')   # 서버가 답을 받기 전에 닫은 변경: {change_id: closedStatus}
# 사내 테스트 모드 (test_run.py가 켠다): 사건 시각을 남기고, 변경마다 답한 뒤 이해도를 묻는다
IS_TEST = bool(os.environ.get('NOTICE_TEST'))
EVENTS = os.path.join(HERE, '..', '.events.jsonl')
QUIZ = os.path.join(HERE, '..', 'quiz.json')
PUSH_LINES = int(os.environ.get('NOTICE_ROWS', '40'))   # 이해도를 묻기 전에 상세를 화면 위로 밀어낼 빈 줄 수
SRC ='/Users/bugeon/orca/projects/cli-design/cli-design-notes/t2-render-check.py'

spec = importlib.util.spec_from_file_location('t2', SRC)
t2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t2)

# 화면 용어: 위키 항목은 "결정 사항", 답할 항목은 "확인할 변경" (10/12 부건, 위키 copy.term.standard는 나중에 맞춤)
COLS = 76                      # Claude Code가 앞에 붙이는 들여쓰기를 감안한 너비
QUESTIONS = {
    'relation': {'question': '이 변경이 내 이슈와 관계가 있나요?', 'header': '관계',
                 'options': [('관계있다', '내 이슈 결과물이 이 변경에 맞춰 바뀌어야 해요'),
                             ('관계없다', '내 이슈와는 상관없는 변경이에요')]},
    # 같은 변경이 이슈 두 개에 걸리면 두 번째 화면에서 "방금 봤으니 알았다"로 답하기 쉬워서, 기준 시점을 "오늘 알림"으로 적는다
    'knew': {'question': '이 변경을 이미 알고 있었나요?', 'header': '알았나',
             'options': [('알았다', '오늘 알림을 보기 전에 알고 있었어요'),
                         ('몰랐다', '오늘 알림으로 처음 알았어요')]},
    'reason': {'question': '왜 관계없나요?', 'header': '이유',
               'options': [('내 작업 범위가 아니에요', '이 결정 사항이 다루는 화면·기능을 내가 맡고 있지 않아요'),
                           ('내 이슈와 연결이 잘못됐어요', '이 결정 사항이 내 이슈에 잘못 이어져 있어요'),
                           ('바뀐 부분은 내 작업에 안 쓰여요', '결정 사항은 내 작업과 이어져 있지만, 이번에 바뀐 부분은 영향이 없어요')]},
}
RELATIONS = ('관계있다', '관계없다')
KNEW = ('알았다', '몰랐다')
RECALL = '결정 사항 확인'        # 질문을 닫고 넘어간 뒤 다시 답하려고 입력하는 말 (입력 전체가 같을 때만)


def questions_for(c):
    """선택 화면 질문. 맨 위 이름표(header)는 이슈 코드라서, 같은 변경이 두 번 떠도 어느 이슈에 답하는지 보인다."""
    return {key: {**q, 'header': c['issue'],
                  'options': [{'label': label, 'description': desc} for label, desc in q['options']]}
            for key, q in QUESTIONS.items()}


def is_recall(prompt):
    return (prompt or '').strip().rstrip('.!?') == RECALL


def load_changes():
    with open(DATA) as f:
        return json.load(f)


def load_answers():
    try:
        with open(ANSWERS) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def load_closed():
    try:
        with open(CLOSED) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def pending():
    done = {**load_answers(), **load_closed()}
    return [c for c in load_changes()['changes'] if c['id'] not in done]


def close_on_respond(change_id):
    """상세를 보는 사이 서버가 닫은 변경이면 그 상태(auto_closed 등)를 돌려준다. 아니면 None.
    시안은 데이터의 closes_while_open 값으로 "보는 사이 되돌려짐"을 흉내 낸다 (SIL-77 DRI 결정 8, PR #15의 closedStatus)."""
    closed = load_closed()
    if change_id in closed:
        return closed[change_id]
    c = find_change(change_id)
    status = c.get('closes_while_open') if c else None
    if not status or change_id in load_answers():
        return None
    closed[change_id] = status
    with open(CLOSED, 'w') as f:
        json.dump(closed, f, ensure_ascii=False, indent=2)
    log_event('closed', change_id, status=status)
    return status


def check_answer(relation, knew=None, reason=None):
    """지표를 바로 셀 수 있게 관계·알았나는 보기 중 하나만 받는다. 직접 쓴 글은 note로 따로 남긴다."""
    if relation not in RELATIONS:
        return '관계는 관계있다 / 관계없다 중 하나만 기록해요. 쓴 글은 note에 넣고 같은 질문을 다시 물어 주세요.'
    if relation == '관계있다' and knew not in KNEW:
        return '알았나는 알았다 / 몰랐다 중 하나만 기록해요. 쓴 글은 note에 넣고 같은 질문을 다시 물어 주세요.'
    if relation == '관계없다' and not (reason or '').strip():
        return '관계없다일 때는 이유가 있어야 해요. 이유 질문을 물어 주세요.'
    return None


def save_answer(change_id, relation, knew=None, reason=None, note=None):
    answers = load_answers()
    answers[change_id] = {'relation': relation, 'knew': knew if relation == '관계있다' else None,
                          'reason': reason if relation == '관계없다' else None, 'note': note or None,
                          'place': '터미널', 'at': datetime.now().strftime('%Y-%m-%d %H:%M')}
    with open(ANSWERS, 'w') as f:
        json.dump(answers, f, ensure_ascii=False, indent=2)
    log_event('answered', change_id, relation=relation)


# ---------- 사내 테스트: 사건 시각과 이해도 ----------

def log_event(event, change_id=None, **extra):
    """테스트 모드일 때만 사건을 초 단위(밀리초까지) 시각과 함께 한 줄씩 남긴다. test_run.py가 이걸로 시간을 잰다."""
    if not IS_TEST:
        return
    row = {'at': datetime.now().isoformat(timespec='milliseconds'), 'event': event}
    if change_id:
        row['change_id'] = change_id
    row.update(extra)
    with open(EVENTS, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')


def find_change(change_id):
    return next((c for c in load_changes()['changes'] if c['id'] == change_id), None)


def has_quiz(change_id):
    c = find_change(change_id)
    return IS_TEST and bool(c and c.get('quiz'))


def load_quiz():
    try:
        with open(QUIZ) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


# 첫 문항은 직접 쓰는 문항이다. 선택 화면은 보기가 2개 이상 있어야 해서 "모를 때" 보기 2개를 둔다
WRITE_OPTIONS = [('기억나지 않아요', '무엇이 바뀌었는지 떠오르지 않아요'),
                 ('제대로 안 읽었어요', '상세를 꼼꼼히 보지 않고 넘어갔어요')]


def quiz_questions(change_id):
    """이해도 3문항: 직접 쓰기 → 무엇이(객관식) → 왜(객관식). 선택 화면 한 번에 그대로 넘긴다."""
    q = find_change(change_id)['quiz']

    def choices(texts):
        return [{'label': t, 'description': ''} for t in texts]

    return [
        {'question': '방금 본 변경에서 무엇이 무엇으로 바뀌었나요? 아래 "Type something."에 한 줄로 써 주세요.',
         'header': '이해 1/3', 'multiSelect': False,
         'options': [{'label': label, 'description': desc} for label, desc in WRITE_OPTIONS]},
        {'question': '무엇이 바뀌었나요?', 'header': '이해 2/3', 'multiSelect': False, 'options': choices(q['what'])},
        {'question': '왜 바뀌었나요?', 'header': '이해 3/3', 'multiSelect': False, 'options': choices(q['why'])},
    ]


def check_quiz(change_id, what, why):
    q = find_change(change_id)['quiz']
    if what not in q['what']:
        return '"무엇이 바뀌었나요?"는 보기 중 하나만 기록해요. 같은 질문을 다시 물어 주세요.'
    if why not in q['why']:
        return '"왜 바뀌었나요?"는 보기 중 하나만 기록해요. 같은 질문을 다시 물어 주세요.'
    return None


def save_quiz(change_id, written, what, why):
    q = find_change(change_id)['quiz']
    quiz = load_quiz()
    quiz[change_id] = {
        'written': written,
        'what': what, 'what_correct': q['what'].index(what) + 1 == q['what_answer'],
        'why': why, 'why_correct': q['why'].index(why) + 1 == q['why_answer'],
        'at': datetime.now().isoformat(timespec='seconds'),
    }
    with open(QUIZ, 'w') as f:
        json.dump(quiz, f, ensure_ascii=False, indent=2)
    log_event('quiz_saved', change_id)


def _case(c):
    return {'kind': c['kind'], 'title': c['title'], 'old': c['old'], 'new': c['new'],
            'area': c['area'], 'issue': c['issue']}


# ---------- 꾸밈 ----------
# Claude Code는 hooks 글을 회색으로 감싸고, 글 안의 "글자색 끄기(39)"를 만나면 회색을 다시 입힌다.
# 단, 끄는 코드가 혼자 있을 때만 알아본다. "22;39"처럼 묶으면 회색이 풀려 흰색이 되므로 끄는 코드는 하나씩 따로 쓴다.

def esc(codes):
    return f'\033[{codes}m'


def bold(text):
    return f'{esc("1")}{text}{esc("22")}'


def dim(text):
    return f'{esc("2")}{text}{esc("22")}'


# 테마에 맞춰 터미널이 알아서 바꾸는 색만 쓴다. (hooks는 터미널 배경색을 물어볼 수 없어서 흰색·검정을 직접 고르지 않음)
# - 강조 글자: "39;49"를 묶어 쓰면 Claude Code 회색이 풀리고 터미널 기본 글자색(어두우면 흰색, 밝으면 검정)이 된다
# - 색: 터미널 테마가 정한 기본 16색(노랑 33, 초록 32)만 쓴다
STRONG = '39;49'
PALETTE = {'done': '32'}

# 지금 값 줄 앞 화살표. 어느 설정에서나 1칸인 ⭢ (→ 는 한국어 설정에서 2칸이 될 수 있음)
ARROW = os.environ.get('NOTICE_ARROW', '⭢')
OLD_COLOR = '39'    # 이전 값과 바꾼 사람·시간: 따로 칠하지 않음 (이유 글과 같은 Claude Code 기본 회색)
NEW_COLOR = STRONG    # 제목·지금 값: 터미널 기본 글자색


def color_line(text, color):
    return f'{esc(color)}{text}{esc("39")}'


def paint(text, color, is_bold=False, back_to=None):
    """글자색(과 굵게)을 입히고 끄는 코드는 하나씩 따로 쓴다. back_to가 있으면 그 줄 색으로 돌아간다."""
    if not text:
        return ''
    on = (esc('1') if is_bold else '') + esc(color)
    off = esc('39') + (esc('22') if is_bold else '') + (esc(back_to) if back_to and back_to != '39' else '')
    return on + text + off


def highlight(text, line_color):
    """바뀐 부분: 형광펜(노란 배경 + 검정 글자). 서로 대비를 만들어서 터미널 배경이 희든 검든 보인다."""
    if not text:
        return ''
    back = esc(line_color) if line_color != '39' else ''
    return f'{esc("43")}{esc("30")}{text}{esc("39")}{esc("49")}{back}'


def join_parts(pre, mid, suf):
    """바뀐 부분이 비면(지운 경우) 앞뒤 빈칸이 겹치지 않게 붙인다."""
    if mid:
        return pre, suf
    if pre.endswith(' ') and suf.startswith(' '):
        return pre, suf[1:]
    return pre, suf


DIFF_STYLE = os.environ.get('NOTICE_DIFF', 'summary')   # github: 줄 배경 + -/+ / track: 제안 모드 / summary: 요약 / color: 글자색만
DIFF_BG = {'old': ('48;5;52', '48;5;88'), 'new': ('48;5;22', '48;5;28')}   # (줄 배경, 바뀐 부분 배경)


def diff_row(kind, head, mid, tail, line_color):
    """GitHub처럼 한 줄 전체에 배경을 깔고, 바뀐 부분만 더 진한 배경으로."""
    line_bg, word_bg = DIFF_BG[kind]
    sign = '-' if kind == 'old' else '+'
    gutter = f' {sign} '
    budget = COLS - t2.text_width(gutter)
    if t2.text_width(head + mid + tail) > budget:
        tail = t2.cut_end(tail, max(1, budget - t2.text_width(head + mid)))
    body = head + (f'{esc(word_bg)}{mid}{esc(line_bg)}' if mid else '') + tail
    pad = ' ' * max(0, budget - t2.text_width(head + mid + tail))
    color_on = esc(line_color) if line_color != '39' else ''
    return f'{esc(line_bg)}{color_on}{gutter}{body}{pad}{esc("39")}{esc("49")}'


def github_lines(c):
    old, new = c['old'], c['new']
    budget = COLS - 3
    if c['kind'] == 'deprecated' or new is None:
        return [diff_row('old', t2.cut_end(old, budget), '', '', OLD_COLOR)]
    if c['kind'] == 'new' or old is None:
        return [diff_row('new', t2.cut_end(new, budget), '', '', NEW_COLOR)]
    pre, old_mid, new_mid, suf = t2.find_change(old, new)
    if t2.is_large_change(old, new, old_mid, new_mid):
        return [diff_row('old', t2.cut_end(old, budget), '', '', OLD_COLOR),
                diff_row('new', t2.cut_end(new, budget), '', '', NEW_COLOR)]
    widest = max(t2.text_width(old_mid), t2.text_width(new_mid))
    left = t2.cut_start(pre, max(8, budget - widest - t2.text_width(suf)))
    rows = []
    for kind, mid, color in (('old', old_mid, OLD_COLOR), ('new', new_mid, NEW_COLOR)):
        head, tail = join_parts(left, mid, suf)
        rows.append(diff_row(kind, head, mid, tail, color))
    return rows


RED, GREEN = '31', '32'


def struck(text):          # 지운 글: 빨강 취소선
    return f'{esc(RED)}{esc("9")}{text}{esc("29")}{esc("39")}' if text else ''


def inserted(text):        # 넣은 글: 초록 밑줄
    return f'{esc(GREEN)}{esc("4")}{text}{esc("24")}{esc("39")}' if text else ''


def track_lines(c):
    """B. 문서 제안 모드: 한 줄 안에 지운 글은 빨강 취소선, 넣은 글은 초록 밑줄."""
    old, new = c['old'], c['new']
    mark = '    '
    if c['kind'] == 'deprecated' or new is None:
        return [mark + struck(t2.cut_end(old, COLS - 4))]
    if c['kind'] == 'new' or old is None:
        return [mark + inserted(t2.cut_end(new, COLS - 4))]
    pre, old_mid, new_mid, suf = t2.find_change(old, new)
    if t2.is_large_change(old, new, old_mid, new_mid):
        return [mark + struck(t2.cut_end(old, COLS - 4)),
                color_line(mark + inserted(t2.cut_end(new, COLS - 4)), NEW_COLOR)]
    room = COLS - 4 - t2.text_width(old_mid + new_mid)
    left = t2.cut_start(pre, max(8, room - t2.text_width(suf)))
    tail = t2.cut_end(suf, max(1, room - t2.text_width(left)))
    return [color_line(mark + left + struck(old_mid) + esc(NEW_COLOR) + inserted(new_mid) + esc(NEW_COLOR) + tail, NEW_COLOR)]


def changed_words(old, new):
    """앞뒤 공통 단어를 걷어낸 가운데 단어들 (40자 → 32자, 근거, → 없음)."""
    a, b = old.split(' '), new.split(' ')
    p = t2.common_prefix_len(a, b)
    q = t2.common_prefix_len(a[p:][::-1], b[p:][::-1])
    return ' '.join(a[p:len(a) - q]), ' '.join(b[p:len(b) - q])


def redo_line(c):
    """지난번 버전에 "관계있다"로 답한 사람에게만: 지난번 변경(32자)을 반영하셨다면 다시 고쳐야 해요.
    상세가 15줄 한도에 꽉 차서 빈 줄 자리에 넣는다 (SIL-77 DRI 결정 9). 서버는 list_pending의 previousAnswer로 준다.
    괄호 안은 지난번 값에서 바뀐 낱말, 크게 바뀌어 낱말로 못 줄이면 지난번 값을 줄여 쓴다. 색은 아직 정하지 않았다."""
    if not (c.get('previous_answer') or {}).get('affected') or not c['old'] or not c['new']:
        return ''
    old_w, _ = changed_words(c['old'], c['new'])
    prev = t2.cut_end(old_w or c['old'], 20)
    return ' ' * 8 + f'지난번 변경({prev})을 반영하셨다면 다시 고쳐야 해요.'


def summary_lines(c):
    """E. 바뀐 부분만 요약하고, 그 아래는 빈 줄 하나. 이름표는 아래 이유·이슈·출처와 같은 모양.
    "지금" 줄은 두지 않는다: 새 제목이 지금 값의 핵심을 담고 있어서다 (10/12 부건, 위키 notify.terminal.show-fields와 다름).
    바뀐 부분은 배경 없이 굵게만 강조한다 (10/12 부건, 형광펜에서 바꿈)."""
    old, new = c['old'], c['new']
    label = lambda name: f'  {name}  '
    gap = redo_line(c)             # 이유 위를 한 줄 띄운다. 지난번에 관계있다로 답했으면 그 자리에 안내
    if c['kind'] == 'deprecated' or new is None:
        return [label('변경') + '결정 사항을 폐기했어요', label('이전') + t2.cut_end(old, COLS - 8), gap]
    if c['kind'] == 'new' or old is None:
        return [label('변경') + '새로 생긴 결정 사항이에요', gap]
    pre, old_mid, new_mid, suf = t2.find_change(old, new)
    if t2.is_large_change(old, new, old_mid, new_mid):
        return [label('변경') + '문장을 새로 썼어요', label('이전') + t2.cut_end(old, COLS - 8), gap]
    old_w, new_w = changed_words(old, new)
    if old_w and new_w:
        what = f'{dim(old_w)} {ARROW} {bold(new_w)}'   # 일대일로 바뀌면 이전 텍스트는 흐리게 (10/12 부건)
    elif old_w:
        what = f'"{bold(old_w)}" 삭제'
    else:
        what = f'"{bold(new_w)}" 추가'
    return [label('변경') + what, gap]


def value_lines(c):
    if DIFF_STYLE == 'github':
        return github_lines(c)
    if DIFF_STYLE == 'track':
        return track_lines(c)
    if DIFF_STYLE == 'summary':
        return summary_lines(c)
    return color_lines(c)


def color_lines(c):
    """이전 값 줄(기본 회색)과 지금 값 줄(흰색). 대괄호 없이 바뀐 부분만 노랗게 칠한다."""
    old, new = c['old'], c['new']
    old_mark, new_mark = '    ', f'  {ARROW} '
    if c['kind'] == 'deprecated' or new is None:
        return [color_line(t2.cut_end(old_mark + old, COLS), OLD_COLOR)]
    if c['kind'] == 'new' or old is None:
        return [color_line(t2.cut_end(new_mark + new, COLS), NEW_COLOR)]

    pre, old_mid, new_mid, suf = t2.find_change(old, new)
    if t2.is_large_change(old, new, old_mid, new_mid):
        return [color_line(t2.cut_end(old_mark + old, COLS), OLD_COLOR),
                color_line(t2.cut_end(new_mark + new, COLS), NEW_COLOR)]

    widest = max(t2.text_width(old_mid), t2.text_width(new_mid))
    left = t2.cut_start(pre, max(8, COLS - 4 - widest - t2.text_width(suf)))
    rows = []
    for mark, mid, color in ((old_mark, old_mid, OLD_COLOR), (new_mark, new_mid, NEW_COLOR)):
        head, tail = join_parts(left, mid, suf)
        room = COLS - t2.text_width(mark + head + mid)
        tail = t2.cut_end(tail, room) if room > 1 else ''
        rows.append(color_line(mark + head + highlight(mid, color) + tail, color))
    return rows


SOURCE_TEXT = {                 # (출처, AI가 찾았나) → 화면 글  ※ 시안, 경하님 확인 필요
    ('AI 대화', False): 'AI 대화',
    ('코드', True): 'PR · AI가 찾음',
    ('코드', False): '코드',
}


def source_text(c):
    """출처는 이유·이슈 줄과 같은 글자색(꾸밈 없음)으로 쓴다."""
    origin = 'AI 대화' if c['source'].startswith('AI 대화') else '코드'
    return SOURCE_TEXT[(origin, c['found_by_ai'])]


def area_label(changes):
    """영역 이름을 대괄호 하나에 쉼표로 (결정기록 첫 줄 규칙: 3개까지, 넘으면 …)."""
    areas = []
    for c in sorted(changes, key=lambda c: t2.AREA_ORDER.index(c['area'])):
        if c['area'] not in areas:
            areas.append(c['area'])
    shown = areas[:t2.MAX_AREAS] + (['…'] if len(areas) > t2.MAX_AREAS else [])
    return f"[{', '.join(shown)}]"


DONE_COLOR = PALETTE['done']   # 완료된 이슈 표시: 초록 글자


def issue_text(c):
    done = f' {esc(DONE_COLOR)}[완료]{esc("39")}' if c.get('issue_status') == '완료' else ''
    return t2.cut_end(f'{c["issue"]} {c["issue_title"]}', COLS - 8 - (7 if done else 0)) + done


# ---------- ① 켤 때: 회색 알림 (SessionStart hooks) ----------

# 건수 숫자: 노랑은 "주의해서 볼 대기 중인 것"이라는 뜻이라 답하지 않은 변경 수에 맞는다. 굵게를 함께 써서 숫자 한 글자도 눈에 띄게.
# 밝은 터미널에서 흐리면 NOTICE_COUNT_COLOR=36(청록)처럼 바꿔 본다.
COUNT_COLOR = os.environ.get('NOTICE_COUNT_COLOR', '33')


def count_text(count):
    """줄은 터미널 기본 글자색이라, 숫자 뒤에는 39;49를 묶어 써서 회색이 아니라 기본 글자색으로 돌아간다."""
    return f'{esc("1")}{esc(COUNT_COLOR)}{count}{esc(STRONG)}{esc("22")}'


def session_notice(changes):
    count = len(changes)
    total = '총 ' if count > 1 else ''
    # 첫 줄은 터미널 기본 글자색, 숫자만 노란 굵은 글자
    first = color_line(f'● {area_label(changes)} 결정 사항이 {total}{count_text(count)}건 변경되었어요.', NEW_COLOR)
    return '\n'.join(['', first,
                      '  작업을 시작하면 변경 내역을 상세히 볼 수 있어요.'])


# ---------- ② 작업 시작 때: 변경 상세 (UserPromptSubmit / PostToolUse hooks) ----------

def progress(index, total, recall=False):
    """맨 위 안내: 처음에는 전체 건수, 다음부터는 남은 건수(지금 보는 것 포함)를 문장으로.
    "결정 사항 확인"으로 다시 부른 경우에는 기다리는 작업이 없어서 "작업 전에"를 뺀다."""
    if index == 1:
        return bold(f'{"" if recall else "작업 전에 "}확인할 변경이 {total}건 있어요.')
    return bold(f'확인할 변경이 {total - index + 1}건 남았어요.')


def count_chip(index, total):
    """몇 번째 변경인지: 글자색·배경색을 뒤집은 칩(반전). 어느 테마에서도 대비가 생긴다."""
    return f'{esc(STRONG)}{esc("7")} {index}/{total} {esc("27")}{esc("39")}'


def detail_screen(c, index, total, recall=False):
    """진행 표시 → 제목 → 바꾼 사람·시간(회색) → 바뀐 값 → 이유 · 이슈 · 출처."""
    tag = t2.TAGS.get(c['kind'])
    tag_text = dim(f' ({tag})') if tag else ''
    tag_width = (t2.text_width(tag) + 3) if tag else 0
    head_width = t2.text_width(c['area']) + 2 + 1          # [영역] + 빈칸
    title = t2.cut_end(c['title'], COLS - head_width - tag_width)
    return '\n'.join([
        '',
        progress(index, total, recall),
        '',
        *([count_chip(index, total)] if total > 1 else []),
        color_line(f'[{c["area"]}] {bold(title)}{tag_text}', NEW_COLOR),
        ' ' * head_width + color_line(f'{c["who"]}님이 {c["when"]}에 변경했어요.', OLD_COLOR),
        *value_lines(c),          # 15줄 안에 들어가도록 값·이유 묶음은 빈 줄 없이 붙인다 (기록 뒤 화면 14줄, 문장을 새로 쓴 변경 15줄)
        f'  이유  ' + t2.cut_end(c['reason'], COLS - 8),
        f'  이슈  ' + issue_text(c),
        f'  출처  {source_text(c)}',
    ])


FLOW = os.path.join(HERE, '..', '.flow.json')   # 이번 답하기: 세션, 시작할 때의 전체 건수, 다시 부른 것인지


def load_flow():
    try:
        with open(FLOW) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def start_flow(session_id=None, recall=False):
    """작업을 입력했을 때: 이번 세션에서 질문을 띄웠다고 적어 두고 첫 변경 상세를 돌려준다."""
    items = pending()
    with open(FLOW, 'w') as f:
        json.dump({'session': session_id, 'total': len(items), 'recall': recall}, f)
    log_event('detail_shown', items[0]['id'], recall=recall)
    return detail_screen(items[0], 1, len(items), recall)


def was_skipped(session_id):
    """이번 세션에서 이미 질문을 띄웠는데 답하지 않은 변경이 남았으면, 사용자가 닫고 넘어간 것으로 본다.
    (hooks는 Esc를 알아챌 수 없어서 이렇게 구분한다. Claude Code를 다시 켜면 세션이 바뀌어 처음처럼 묻는다.)"""
    return bool(session_id) and load_flow().get('session') == session_id


def skipped_reminder(count):
    """닫고 넘어간 뒤 작업을 입력할 때마다 띄우는 한 줄. 켤 때 알림 첫 줄과 같은 모양에, 입력할 말은 굵게."""
    recall = bold(f'"{RECALL}"')
    return '\n'.join(['', color_line(f'● 확인할 변경 {count_text(count)}건 · {recall}을 입력하면 변경 내역을 볼 수 있어요.', NEW_COLOR)])


def nothing_left():
    """"결정 사항 확인"을 입력했는데 답할 변경이 없을 때. 직접 불렀는데 반응이 없으면 고장으로 보인다 (T2-첫줄 결정기록 5장)."""
    return '\n'.join(['', f'{esc("32")}✓{esc("39")} 확인할 변경이 없어요.'])


def answer_text(c, answer):
    """기록 줄에 보여 줄 내 답: 이슈 · 관계 · 알았나(또는 이유). 넘치면 끝을 줄인다."""
    second = answer['knew'] if answer['relation'] == '관계있다' else answer['reason']
    return t2.cut_end(' · '.join([c['issue'], answer['relation'], second or '']), COLS - 16)


def recorded_line(change_id):
    """✓ 기록했어요  SIL-34 · 관계있다 · 몰랐다 (+ 관계있다면 다음 작업부터 따른다는 둘째 줄)."""
    c = next(c for c in load_changes()['changes'] if c['id'] == change_id)
    answer = load_answers()[change_id]
    lines = [f'{esc("32")}✓{esc("39")} 기록했어요  {color_line(answer_text(c, answer), NEW_COLOR)}']
    if answer['relation'] == '관계있다':
        lines.append('  다음 작업부터 바뀐 결정 사항을 따라요.')     # 위키 notify.answer.next-run-context "다음 실행부터"에 맞춤 (착수 문서 T5 문구에서 바꿈)
    return lines


def closed_line(change_id):
    """상세를 보는 사이 되돌려져 자동으로 닫혔을 때, 답을 누른 뒤 띄우는 한 줄 (SIL-77 DRI 결정 8).
    터미널은 이미 띄운 상세를 고칠 수 없어서 답을 누른 뒤에 나온다. 앞 기호와 색은 아직 정하지 않았다."""
    c = find_change(change_id)
    return f'{color_line(c["issue"], NEW_COLOR)} 변경이 되돌려졌어요. 하려던 작업을 계속 진행하시면 돼요.'


def next_screen():
    """다음 변경 상세, 또는 남은 변경이 없으면 마무리 한 줄."""
    items = pending()
    flow = load_flow()
    total_at_start = flow.get('total', len(items))
    if not items:
        log_event('all_done')
        count = f' {total_at_start}건' if total_at_start > 1 else ''     # 1건에 "1건을 모두"는 어색해서 뺀다
        if IS_TEST:     # 테스트는 여기서 끝난다. test_run.py가 Claude Code를 닫고 마지막 질문으로 넘어간다
            return ['', bold(f'확인할 변경{count}을 모두 답했어요.'), '  테스트가 끝났어요. 잠시 뒤 마지막 질문으로 넘어가요.']
        start_work = '' if flow.get('recall') else ' 이제 작업을 시작할게요.'
        return ['', bold(f'확인할 변경{count}을 모두 답했어요.{start_work}')]
    log_event('detail_shown', items[0]['id'])
    return [detail_screen(items[0], total_at_start - len(items) + 1, total_at_start, flow.get('recall'))]


def push_away():
    """이해도를 묻기 전에 방금 본 상세를 화면 위로 밀어낸다. 빈 줄은 줄어들 수 있어서 꾸밈 끄기 코드 하나씩을 넣는다."""
    return [esc('22')] * PUSH_LINES


def after_answer(change_id):
    """답을 기록한 뒤: 기록 줄 + 다음 변경 상세, 또는 마무리 한 줄. 기록되지 않았으면(보기 밖의 답) 아무것도 띄우지 않는다.
    테스트 모드에서는 상세를 밀어내고 기록 줄만 띄운다. 다음 상세는 이해도를 기록한 뒤(after_quiz) 띄운다.
    보는 사이 되돌려져 닫혔으면 기록 줄 대신 되돌려졌다는 한 줄 + 다음 변경. 대체됨·이미 답함(B1)은 문장이 미정이라 띄우지 않는다."""
    status = load_closed().get(change_id)
    if status == 'auto_closed':
        return '\n'.join(['', closed_line(change_id), *next_screen()])
    if status or change_id not in load_answers():
        return None
    done = recorded_line(change_id)
    if has_quiz(change_id):
        return '\n'.join([*push_away(), '', *done])
    return '\n'.join(['', *done, *next_screen()])


def after_quiz(change_id):
    """이해도를 기록한 뒤: 다음 변경 상세, 또는 마무리 한 줄."""
    if change_id not in load_quiz():
        return None
    return '\n'.join(next_screen())
