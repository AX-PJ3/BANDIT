#!/usr/bin/env python3
"""사내 테스트 진행 스크립트: 참가자 정보 → 시안(Claude Code) → 수고 설문 → 결과 저장.

    ./test_run.py

시안은 테스트 모드(NOTICE_TEST=1)로 켜져서, 변경마다 답한 뒤 이해도를 묻고 사건 시각을 .events.jsonl에 남긴다.
결과는 results/에만 남는다 (GitHub에 올리지 않음). 설계: cli-design-notes/SIL-68-사내테스트-자동화-설계.md
"""
import csv
import json
import os
import re
import shlex
import shutil
import subprocess
import time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, 'results')
DATA_NAME = 'changes-test'
CLAUDE_CMD = os.environ.get('TEST_CLAUDE_CMD', 'claude')     # 스크립트만 시험할 때 다른 명령으로 바꾼다
END_DELAY_SEC = 3                                             # 마지막 변경을 답한 뒤 마무리 문구를 읽을 시간
STATE_FILES = ['answers.json', 'quiz.json', '.flow.json', '.events.jsonl']
WORK_FILE = os.path.join(HERE, 'login-screen.md')            # 참가자가 시킨 작업이 고칠 수 있는 파일. 끝나면 되돌린다
# 진행자가 볼 안내: 참가자에게 넘기기 전에 지킬 것 (진행 대본 5장)
HOST_GUIDE = """
진행자가 지킬 것
  - 도구가 무엇을 하는지, 답이 무엇을 뜻하는지 설명하지 않아요.
  - 참가자가 물으면 "어떻게 생각하세요?"라고 되물어요. 틀려도 고쳐 주지 않아요.
  - 참가자가 소리 내어 말한 것, 멈칫한 곳을 적어 두세요. 시간은 자동으로 재요.
"""
# 참가자가 Claude Code를 켜기 전에 읽는 안내. 진행 순서와 할 일만 알려 주고, 답 이름과 도구 설명은 넣지 않는다.
# 24줄 터미널 한 화면에 들어가게 21줄 안으로 쓴다
PARTICIPANT_GUIDE = """=== 터미널 알림 테스트 안내 ===
5분쯤 걸려요. 잘하고 못하고는 없어요. 막히면 그건 화면 탓이에요.

[상황] 당신은 아래 두 이슈를 맡고 있어요.
  #6 터미널 알림 상세 화면 만들기
  #7 앱 알림과 나에게 온 변경 화면
  오늘 Claude Code를 켜서 평소처럼 일을 시작하려고 해요.

[진행 순서]
  1. Enter를 누르면 Claude Code가 켜져요.
  2. 평소처럼 아무 작업이나 입력해요. (예: 로그인 화면 문구 고쳐 줘)
  3. 화면에 뜨는 내용을 읽고, 아래에 뜨는 질문에 답해요.
  4. 하나를 끝낼 때마다 방금 본 내용에 대한 질문 3개가 이어져요.
     위로 스크롤하지 말고 기억나는 대로 답해 주세요.
  5. 모두 답하면 자동으로 마지막 질문 5개로 넘어가요.

[답하는 법] 화살표(↑↓)로 고르고 Enter
  직접 쓰려면 "Type something."을 골라 입력해요. 그만하려면 /exit

생각나는 게 있으면 소리 내어 말해 주세요.
"""
CSV_FIELDS = ['파일', '이름', '직군', '사일로', '테마', '세로 줄', '가로 칸', '전체 초', '변경당 판단 평균 초', '이해도 평균 초',
              '답한 변경', '관계 정답', '무엇이 정답', '왜 정답', '닫은 뒤 알림', '다시 부름',
              '쉬웠나(1~7)', '다시 답할까(1~5)', '시간 느낌', '헷갈린 말', '하고 싶은 말']


# ---------- 터미널에서 묻기 ----------

def ask_text(prompt, is_required=True):
    while True:
        value = input(f'{prompt}\n> ').strip()
        if value or not is_required:
            return value
        print('  한 글자 이상 써 주세요.')


def ask_choice(prompt, options):
    print(prompt)
    for i, option in enumerate(options, 1):
        print(f'  {i}) {option}')
    while True:
        value = input('> ').strip()
        if value.isdigit() and 1 <= int(value) <= len(options):
            return options[int(value) - 1]
        print(f'  1~{len(options)} 중 숫자 하나를 써 주세요.')


def ask_scale(prompt, low, high):
    while True:
        value = input(f'{prompt}\n> ').strip()
        if value.isdigit() and low <= int(value) <= high:
            return int(value)
        print(f'  {low}~{high} 중 숫자 하나를 써 주세요.')


# ---------- 기록 읽기 ----------

def read_json(name, default):
    try:
        with open(os.path.join(HERE, name)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def read_events():
    try:
        with open(os.path.join(HERE, '.events.jsonl')) as f:
            return [json.loads(line) for line in f if line.strip()]
    except FileNotFoundError:
        return []


def clear_state():
    for name in STATE_FILES:
        path = os.path.join(HERE, name)
        if os.path.exists(path):
            os.remove(path)


def seconds_between(start, end):
    return round((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds(), 1)


# ---------- 숫자 계산 ----------

def measure_changes(changes, events, answers, quiz):
    """변경마다: 판단 시간(마지막으로 상세를 띄운 때 → 답 기록), 이해도 시간(답 기록 → 이해도 기록), 정답 여부."""
    rows = []
    for c in changes:
        shown_at = answered_at = quiz_at = None
        for e in events:
            if e.get('change_id') != c['id']:
                continue
            if e['event'] == 'detail_shown' and not answered_at:
                shown_at = e['at']
            elif e['event'] == 'answered':
                answered_at = e['at']
            elif e['event'] == 'quiz_saved':
                quiz_at = e['at']
        answer = answers.get(c['id'])
        q = quiz.get(c['id'], {})
        rows.append({
            'change_id': c['id'],
            'title': c['title'],
            'relation': answer and answer['relation'],
            'knew': answer and answer['knew'],
            'reason': answer and answer['reason'],
            'note': answer and answer['note'],
            'expected': c.get('expected'),
            'relation_correct': (answer['relation'] == c['expected']) if answer and c.get('expected') else None,
            'decide_sec': seconds_between(shown_at, answered_at) if shown_at and answered_at else None,
            'quiz_sec': seconds_between(answered_at, quiz_at) if answered_at and quiz_at else None,
            'written': q.get('written'),
            'what': q.get('what'),
            'what_correct': q.get('what_correct'),
            'why': q.get('why'),
            'why_correct': q.get('why_correct'),
        })
    return rows


def average(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 1) if values else None


def summarize(rows, events, started, ended):
    graded = [r for r in rows if r['expected']]
    return {
        'total_sec': seconds_between(started, ended),
        'decide_avg_sec': average([r['decide_sec'] for r in rows]),
        'quiz_avg_sec': average([r['quiz_sec'] for r in rows]),
        'answered': f'{sum(1 for r in rows if r["relation"])}/{len(rows)}',
        'relation_correct': f'{sum(1 for r in graded if r["relation_correct"])}/{len(graded)}',
        'what_correct': f'{sum(1 for r in rows if r["what_correct"])}/{len(rows)}',
        'why_correct': f'{sum(1 for r in rows if r["why_correct"])}/{len(rows)}',
        'reminders': sum(1 for e in events if e['event'] == 'reminder'),
        'recalled': any(e['event'] == 'detail_shown' and e.get('recall') for e in events),
    }


# ---------- 저장 ----------

def save(record, path):
    os.makedirs(RESULTS, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(record, f, ensure_ascii=False, indent=2)


def append_csv(record, path):
    csv_path = os.path.join(RESULTS, 'summary.csv')
    is_new = not os.path.exists(csv_path)
    p, m, s = record['participant'], record['metrics'], record.get('survey', {})
    row = [os.path.basename(path), p['name'], p['role'], p['silo'], p['theme'], p['rows'], p['cols'],
           m['total_sec'], m['decide_avg_sec'], m['quiz_avg_sec'], m['answered'], m['relation_correct'],
           m['what_correct'], m['why_correct'], m['reminders'], '예' if m['recalled'] else '아니오',
           s.get('ease'), s.get('again'), s.get('time_feel'), s.get('confusing'), s.get('comment')]
    with open(csv_path, 'a', newline='', encoding='utf-8-sig' if is_new else 'utf-8') as f:   # 엑셀에서 한글이 깨지지 않게 처음에만 BOM
        writer = csv.writer(f)
        if is_new:
            writer.writerow(CSV_FIELDS)
        writer.writerow(row)
    return csv_path


def build_record(participant, started, ended):
    changes = read_json(os.path.join('proto', f'{DATA_NAME}.json'), {'changes': []})['changes']
    events, answers, quiz = read_events(), read_json('answers.json', {}), read_json('quiz.json', {})
    rows = measure_changes(changes, events, answers, quiz)
    return {'participant': participant, 'data': DATA_NAME, 'started': started, 'ended': ended,
            'metrics': summarize(rows, events, started, ended), 'changes': rows, 'events': events}


# ---------- 진행 ----------

def is_all_done():
    return any(e['event'] == 'all_done' for e in read_events())


def run_claude(env):
    """Claude Code를 켜고, 참가자가 마지막 변경까지 답하면(all_done) 잠시 뒤 닫는다. /exit로 닫아도 된다."""
    proc = subprocess.Popen(shlex.split(CLAUDE_CMD), cwd=HERE, env=env)
    while proc.poll() is None:
        if is_all_done():
            time.sleep(END_DELAY_SEC)
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            break
        time.sleep(0.5)
    subprocess.run(['stty', 'sane'], stderr=subprocess.DEVNULL)     # Claude Code를 밖에서 닫으면 터미널 입력 설정이 남을 수 있다


def main():
    print('\n=== 터미널 알림 사내 테스트 ===\n진행자가 입력해요.\n')
    size = shutil.get_terminal_size()
    participant = {
        'name': ask_text('참가자 이름'),
        'role': ask_choice('직군', ['개발', '디자인', '기타']),
        'silo': ask_choice('이 작업(사일로)을 미리 알았나요?', ['사일로', '아님']),
        'theme': ask_choice('터미널 테마', ['어두움', '밝음']),
        'rows': size.lines,
        'cols': size.columns,
    }
    clear_state()
    with open(WORK_FILE) as f:
        work_file_before = f.read()

    print(f'\n준비됐어요. (터미널 {size.columns}칸 × {size.lines}줄)')
    print(HOST_GUIDE)
    input('참가자에게 자리를 넘겨 주세요. 넘겼으면 Enter를 누르세요.')
    print('\033[2J\033[H' + PARTICIPANT_GUIDE)
    input('다 읽었으면 Enter를 눌러 시작해요.')

    env = {**os.environ, 'NOTICE_DATA': DATA_NAME, 'NOTICE_TEST': '1', 'NOTICE_ROWS': str(size.lines)}
    started = datetime.now().isoformat(timespec='milliseconds')
    run_claude(env)
    ended = datetime.now().isoformat(timespec='milliseconds')

    with open(WORK_FILE, 'w') as f:
        f.write(work_file_before)

    stamp = datetime.now().strftime('%Y%m%d-%H%M')
    safe_name = re.sub(r'[^\w가-힣-]', '', participant['name']) or 'participant'
    path = os.path.join(RESULTS, f'{stamp}-{safe_name}.json')
    record = build_record(participant, started, ended)
    save(record, path)                    # 설문 중에 끊겨도 진행 기록은 남도록 먼저 한 번 저장

    print('\033[2J\033[H\n=== 마지막 질문 5개 ===\n')
    try:
        record['survey'] = {
            'ease': ask_scale('1. 알림에 답하는 게 얼마나 쉬웠나요? (1 아주 어려웠다 ~ 7 아주 쉬웠다)', 1, 7),
            'again': ask_scale('2. 다음에도 이 알림이 오면 답할 것 같나요? (1 전혀 아니다 ~ 5 꼭 답한다)', 1, 5),
            'time_feel': ask_choice('3. 답하는 데 걸린 시간은 어땠나요?', ['짧았다', '적당했다', '길었다']),
            'confusing': ask_text('4. 헷갈린 말이나 화면이 있었나요? (없으면 Enter)', is_required=False),
            'comment': ask_text('5. 하고 싶은 말이 있나요? (없으면 Enter)', is_required=False),
        }
    except (KeyboardInterrupt, EOFError):
        print(f'\n\n설문을 멈췄어요. 진행 기록은 저장했어요: {os.path.relpath(path, HERE)}')
        return
    save(record, path)
    csv_path = append_csv(record, path)

    m = record['metrics']
    print('\n고마워요! 테스트가 끝났어요.\n')
    print(f'전체 {m["total_sec"]}초 · 변경당 판단 평균 {m["decide_avg_sec"]}초 · 이해도 평균 {m["quiz_avg_sec"]}초')
    print(f'답한 변경 {m["answered"]} · 관계 정답 {m["relation_correct"]} · 무엇이 {m["what_correct"]} · 왜 {m["why_correct"]}')
    print(f'닫은 뒤 알림 {m["reminders"]}번 · 다시 부름 {"예" if m["recalled"] else "아니오"}')
    print(f'\n저장: {os.path.relpath(path, HERE)}, {os.path.relpath(csv_path, HERE)}')


if __name__ == '__main__':
    main()
