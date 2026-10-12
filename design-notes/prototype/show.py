import json, sys, re
sys.path.insert(0, 'proto')
import notice
m = json.load(sys.stdin)['systemMessage']
for l in m.split('\n'):
    p = re.sub(r'\033\[1;33m(.*?)\033\[22;[0-9]+m', r'«\1»', l)
    p = re.sub(r'\033\[[0-9;]*m', '', p)
    print(f"{notice.t2.text_width(p.replace('«', '').replace('»', '')):3} | {p}")
