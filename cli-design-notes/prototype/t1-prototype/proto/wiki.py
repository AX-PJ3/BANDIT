"""T1 시안용 결정 사항 저장소. 정민님이 만든 search_standards / get_standard / save_standard를 흉내만 낸다.

처음 데이터는 standards.json, 등록한 새 버전은 saved.json에 쌓는다 (reset.sh로 지움).
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, 'standards.json')
SAVED_PATH = os.path.join(HERE, '..', 'saved.json')
AUTHOR = os.environ.get('T1_USER', '부건')      # 지금 대화하는 사람 = 바꾼 사람
ALWAYS_ON_MAX = 10                               # wiki.always-on.max-ten
ID_PATTERN = re.compile(r'^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$')   # data.standard.id-format
REQUIRED = ['id', 'title', 'value', 'reason', 'always_on']        # SIL-73 필수 5개


def load_data():
    with open(DATA_PATH, encoding='utf-8') as f:
        return json.load(f)


def load_saved():
    if not os.path.exists(SAVED_PATH):
        return []
    with open(SAVED_PATH, encoding='utf-8') as f:
        return json.load(f)


def current_standards():
    """처음 데이터 위에 등록한 새 버전을 덮어써서 지금 버전만 돌려준다."""
    by_id = {s['id']: dict(s) for s in load_data()['standards']}
    for s in load_saved():
        by_id[s['id']] = {k: s[k] for k in ('id', 'title', 'value', 'reason', 'always_on', 'version')}
    return by_id


def always_on_count():
    base = load_data()
    start = {s['id'] for s in base['standards'] if s['always_on']}
    now = {s['id'] for s in current_standards().values() if s['always_on']}
    return base['always_on_count'] - len(start - now) + len(now - start)


def linked_issues(standard_id):
    return [i for i in load_data()['issues'] if standard_id in i['links']]


def notify_targets(standard_id):
    """알림을 받을 이슈: 바꾼 본인과 담당자가 없는 이슈는 뺀다 (notify.target.skip-author, notify.pending.no-owner)."""
    return [i for i in linked_issues(standard_id) if i['owner'] and i['owner'] != AUTHOR]


def with_issues(s):
    issues = [{'number': i['number'], 'title': i['title'], 'owner': i['owner'] or None, 'status': i['status'],
               'linked_standards': i['links']}
              for i in linked_issues(s['id'])]
    return {**s, 'linked_issues': issues, 'notify_count': len(notify_targets(s['id']))}


def search(query):
    if os.environ.get('T1_FAIL') == 'search':      # 예외 3 시험용: 조사 실패를 흉내 낸다
        raise ValueError('결정 사항 서버에 연결하지 못해서 결정 사항을 불러오지 못했어요.')
    words = [w for w in re.split(r'\s+', (query or '').strip()) if w]
    found = []
    for s in current_standards().values():
        text = ' '.join([s['id'], s['title'], s['value']])
        if any(w in text for w in words):
            found.append(with_issues(s))
    return {'count': len(found), 'standards': found, 'always_on_count': always_on_count(), 'always_on_max': ALWAYS_ON_MAX}


def get(standard_id):
    s = current_standards().get(standard_id)
    if not s:
        raise ValueError(f'없는 결정 사항이에요: {standard_id}')
    return {**with_issues(s), 'always_on_count': always_on_count(), 'always_on_max': ALWAYS_ON_MAX}


def save(args):
    missing = [k for k in REQUIRED if args.get(k) in (None, '')]
    if missing:
        raise ValueError(f'빠진 칸이 있어서 저장하지 않았어요: {", ".join(missing)}. 이유는 지어내지 말고 사람에게 물어본 뒤 다시 저장해 주세요.')
    if not ID_PATTERN.match(args['id']):
        raise ValueError('결정 사항 ID는 영역.주제.규칙 형식(영문 소문자·숫자·하이픈)이어야 해요.')
    now = current_standards().get(args['id'])
    base = args.get('base_version')
    if now and base != now['version']:
        raise ValueError(f'그 사이 결정 사항이 v{now["version"]}로 바뀌었어요. 다시 조사해 주세요.')
    if not now and base not in (None, 0):
        raise ValueError('새 결정 사항은 base_version 없이 저장해요.')
    if args['always_on'] and not (now and now['always_on']) and always_on_count() >= ALWAYS_ON_MAX:
        raise ValueError(f'항상 적용 결정 사항이 이미 {ALWAYS_ON_MAX}개라 더 넣을 수 없어요.')
    record = {
        'id': args['id'], 'title': args['title'], 'value': args['value'], 'reason': args['reason'],
        'always_on': bool(args['always_on']), 'version': (now['version'] + 1) if now else 1,
        'previous_value': now['value'] if now else None, 'changed_by': AUTHOR, 'source': 'AI 대화', 'ai_found': False,
    }
    saved = load_saved()
    saved.append(record)
    with open(SAVED_PATH, 'w', encoding='utf-8') as f:
        json.dump(saved, f, ensure_ascii=False, indent=2)
    targets = notify_targets(args['id'])
    return {'saved': True, 'version': record['version'], 'notified': [{'issue': i['number'], 'owner': i['owner']} for i in targets]}


def check_conflicts(args):
    """①② 화면에 띄울 다른 결정 사항 목록을 확인한다. 화면은 hooks가 그린다."""
    if args.get('kind') not in ('작업', '요청'):
        raise ValueError('kind는 "작업"(Claude가 알아챔) 또는 "요청"(사람이 바꿔 달라고 함)이에요.')
    if not args.get('request'):
        raise ValueError('request(부탁하신 작업이나 요청을 한 줄로)가 비어 있어요.')
    known = current_standards()
    for c in args.get('conflicts') or []:
        if c.get('id') not in known:
            raise ValueError(f'없는 결정 사항이에요: {c.get("id")}. search_standards 결과의 ID를 그대로 써 주세요.')
        if c.get('kind') not in ('변경', '어긋남') or not c.get('why'):
            raise ValueError('다른 결정 사항마다 kind(변경/어긋남)와 why(왜 그렇게 판단했는지 한 문장)가 있어야 해요.')
    if args['kind'] == '작업' and not args.get('conflicts'):
        raise ValueError('Claude가 알아챈 경우(작업)는 다른 결정 사항이 1개 이상 있어야 해요.')
    return {'shown': True, 'count': len(args.get('conflicts') or [])}


def check_preview(args):
    """③ 등록될 모습을 확인한다. 저장하지 않는다. 화면은 hooks가 그린다."""
    missing = [k for k in REQUIRED if args.get(k) in (None, '')]
    if missing:
        raise ValueError(f'빠진 칸이 있어요: {", ".join(missing)}. 이유를 유추할 수 없으면 사람에게 물어본 뒤 다시 불러 주세요.')
    if not ID_PATTERN.match(args['id']):
        raise ValueError('결정 사항 ID는 영역.주제.규칙 형식(영문 소문자·숫자·하이픈)이어야 해요.')
    too_long = [f'{k} {n}자' for k, n in (('title', 40), ('value', 120), ('reason', 120)) if len(args[k]) > n]
    if too_long:
        raise ValueError(f'글자 수가 넘어요: {", ".join(too_long)}. 줄여서 다시 불러 주세요.')
    now = current_standards().get(args['id'])
    if args['always_on'] and not (now and now['always_on']) and always_on_count() >= ALWAYS_ON_MAX:
        raise ValueError(f'항상 적용 결정 사항이 이미 {ALWAYS_ON_MAX}개라 더 넣을 수 없어요.')
    targets = notify_targets(args['id']) if now else []
    return {'shown': True, 'version_now': now['version'] if now else None, 'notify_count': len(targets)}


# ---------- ④ 등록 완료 (hooks가 띄움) ----------
# Claude Code는 hooks 글을 회색으로 감싼다. 끄는 코드는 하나씩 따로 쓴다 (notify-prototype/proto/notice.py와 같은 규칙).

def esc(codes):
    return f'\033[{codes}m'


STRONG = '39;49'    # 회색을 풀고 터미널 기본 글자색


def done_message():
    saved = load_saved()
    if not saved:
        return None
    r = saved[-1]
    area = r['id'].split('.')[0]
    always = '항상 적용 ' + ('예' if r['always_on'] else '아니오')
    tag = f'새 결정 사항 · {always}' if r['version'] == 1 else always    # 고칠 때는 버전을 보여 주지 않아요 (10/12)
    targets = notify_targets(r['id'])
    if targets:
        sent = f'연결된 이슈 {len(targets)}개의 담당자에게 확인할 변경을 보냈어요.'
    else:
        sent = '연결된 이슈가 없어서 알림을 받는 사람은 없어요.'
    return '\n'.join([
        '',
        f'{esc("32")}✓ 결정 사항을 등록했어요.{esc("39")}',    # 첫 줄 전체 녹색 (10/13 부건)
        f'  {esc(STRONG)}[{area}] {r["title"]}{esc("39")}  {tag}',
        f'  {sent}',
    ])
