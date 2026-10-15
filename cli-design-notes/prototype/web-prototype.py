"""터미널 알림 v2 워킹 프로토타입 (웹). notice.py가 만든 hooks 글(색 코드 포함)을 그대로 담고,
흐름은 .claude/hooks와 같은 규칙으로 브라우저에서 돌린다. 실행: python3 web-prototype.py → web-prototype.html

- 화면 글: notice.py가 만든다. 이 파일은 글을 고치지 않고 모아서 넘긴다.
- 흐름: prompt_submit.py(작업 입력), after_respond.py(답 기록 뒤), after_work.py(작업을 마친 뒤 Stop)와 같은 조건으로 띄운다.
- 흉내인 것: Claude Code 선택 화면 모양, Claude 글과 작업, 생각하는 시간, Stop 머리줄.
- 만든 뒤 포맷: npx prettier --write web-prototype.html (저장소 포맷 검사에 맞춤)
"""
import itertools
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault('NOTICE_DATA', 'changes-v2')
sys.path.insert(0, os.path.join(HERE, 'notify-prototype', 'proto'))
import notice as n  # noqa: E402

CHANGES = n.load_changes()['changes']
BY_ID = {c['id']: c for c in CHANGES}
DATASETS = {
    'v2': {'name': '5건 (변경·신규·되돌림·폐기·크게 바뀐 변경)', 'ids': [c['id'] for c in CHANGES]},
    'one': {'name': '1건 (칩 없는 머리표)', 'ids': [CHANGES[0]['id']]},
    # 이슈 반영 해 보기 (10/15): 이미 답한 상태로 시작한다. answered는 브라우저가 답으로 넣는다
    'reflect-many': {'name': '이슈 반영 · 관계있다 3건 답함', 'ids': [CHANGES[i]['id'] for i in (0, 1, 2, 4)],
                     'answered': {CHANGES[0]['id']: '관계있다', CHANGES[1]['id']: '관계있다',
                                  CHANGES[2]['id']: '관계있다', CHANGES[4]['id']: '관계없다'}},
    'reflect-five': {'name': '이슈 반영 · 관계있다 5건 답함 (탭으로 나눔)', 'ids': [c['id'] for c in CHANGES],
                     'answered': {c['id']: '관계있다' for c in CHANGES}},
    'reflect-one': {'name': '이슈 반영 · 관계있다 1건 답함', 'ids': [CHANGES[0]['id'], CHANGES[4]['id']],
                    'answered': {CHANGES[0]['id']: '관계있다', CHANGES[4]['id']: '관계없다'}},
}
REASONS = [label for label, _ in n.QUESTIONS['reason']['options']]
CUSTOM = '§'          # 직접 쓴 이유 자리. 브라우저가 칸 수에 맞춰 줄여 넣는다


def recorded(c, relation, second):
    """notice.recorded_lines로 만든다 (answers.json 없이)."""
    answer = {'relation': relation, 'knew': second if relation == '관계있다' else None,
              'reason': second if relation == '관계없다' else None}
    return '\n'.join(n.recorded_lines(c, answer))




frag = {'session': {}, 'detail': {}, 'recorded': {}, 'done': {}, 'reminder': {}, 'nothing': n.nothing_left(),
        'unsure': n.unsure_line(), 'reflectNone': n.nothing_to_reflect(), 'reflectList': {}, 'reflected': {},
        'reflectReminder': n.reflect_reminder()}
for ds in DATASETS.values():
    ids = ds['ids']
    for r in range(1, len(ids) + 1):
        for sub in itertools.combinations(ids, r):
            frag['session']['|'.join(sub)] = n.session_notice([BY_ID[i] for i in sub])
for cid, c in BY_ID.items():
    for total in range(1, len(CHANGES) + 1):
        for index in range(1, total + 1):
            for recall in (False, True):
                frag['detail'][f'{cid}|{index}|{total}|{int(recall)}'] = n.detail_screen(c, index, total, recall)
    for second in n.KNEW:
        frag['recorded'][f'{cid}|관계있다|{second}'] = recorded(c, '관계있다', second)
    for second in REASONS + [CUSTOM]:
        frag['recorded'][f'{cid}|관계없다|{second}'] = recorded(c, '관계없다', second)
for total in range(1, len(CHANGES) + 1):
    for answered in range(0, total + 1):     # 잘 모르겠다로 남긴 변경이 있으면 답한 건수만 말한다 (notice.done_text)
        for recall in (False, True):
            frag['done'][f'{total}|{answered}|{int(recall)}'] = n.bold(n.done_text(total, answered, recall))
    frag['reminder'][str(total)] = n.skipped_reminder(total)

# 이슈 반영: 관계있다로 답한 변경 2건 이상의 목록 (데이터 순서 그대로), 표시한 뒤 한 줄
for ds in DATASETS.values():
    for r in range(2, len(ds['ids']) + 1):
        for sub in itertools.combinations(ds['ids'], r):
            frag['reflectList']['|'.join(sub)] = n.reflect_screen([BY_ID[i] for i in sub])
for cid, c in BY_ID.items():
    frag['reflected'][cid] = n.reflected_line(c)

DATA = {
    'frag': frag,
    'datasets': DATASETS,
    'changes': {cid: {'issue': c['issue'], 'reflectOption': n.reflect_option(c)} for cid, c in BY_ID.items()},
    'questions': {k: {'question': q['question'], 'options': q['options']} for k, q in n.QUESTIONS.items()},
    'recall': n.RECALL,
    'reflect': n.REFLECT,
    'reflectQuestion': {f'{i}|{k}': n.reflect_question(i, k) for k in range(1, 5) for i in range(1, k + 1)},
    'reflectGroups': {str(c): n.reflect_groups(c) for c in range(2, 17)},
    'unsure': n.UNSURE,
    'answerBudget': n.COLS - 16,
}
data_json = json.dumps(DATA, ensure_ascii=False).replace('</', '<\\/')

template = open(os.path.join(HERE, 'web-prototype.template.html'), encoding='utf-8').read()
out = os.path.join(HERE, 'web-prototype.html')
open(out, 'w', encoding='utf-8').write(template.replace('/*__DATA__*/ null', data_json))
print(out)
