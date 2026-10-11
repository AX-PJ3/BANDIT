#!/usr/bin/env python3
"""팀 위키 형식 검사.

사용법: python3 check_wiki.py [team-wiki 폴더]   (기본: 현재 폴더)
오류가 하나라도 있으면 종료 코드 1을 돌려줘요. 경고는 통과시키되 보여 줘요.
기준 작성 원칙(기준-작성-원칙.md)의 규칙을 기계적으로 확인해요.
"""
import re
import sys
from pathlib import Path

AREAS = {
    "goal": "문제와-목표.md",
    "wiki": "기능-기준모으기.md",
    "detect": "기능-바뀐기준찾기.md",
    "notify": "기능-알리기.md",
    "app": "앱-화면.md",
    "data": "데이터-구조.md",
    "copy": "문구.md",
    "work": "일하는-방식.md",
}
NOT_STANDARD_FILES = {"INDEX.md", "CHANGELOG.md", "용어.md", "기준-작성-원칙.md", "README.md"}
REQUIRED = ["제목", "값", "이유", "항상 적용", "상태", "버전"]
ID_RE = re.compile(r"^[a-z]+\.[a-z0-9-]+\.[a-z0-9-]+$")
SCOPE_KINDS = ("코드:", "API:", "화면:", "문서:")
VAGUE = ["적절히", "적당히", "가능하면", "필요시", "필요 시", "등등"]
SOURCES = {"코드", "AI 대화", "Figma", "회의", "Slack", "문서"}
MAX_ALWAYS_ON = 10
MAX_TITLE = 40
MAX_PER_AREA = 25

errors, warnings = [], []


def err(where, msg):
    errors.append(f"[오류] {where}: {msg}")


def warn(where, msg):
    warnings.append(f"[경고] {where}: {msg}")


def parse_standards(path: Path):
    """### id 제목 아래의 '- 키: 값' 목록을 읽어요."""
    items, cur = [], None
    for no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        h = re.match(r"^###\s+(\S+)\s*$", line)
        if h:
            cur = {"id": h.group(1), "file": path.name, "line": no, "fields": {}}
            items.append(cur)
            continue
        if line.startswith("#"):
            cur = None
            continue
        f = re.match(r"^-\s*([^:]+?)\s*:\s*(.*)$", line)
        if cur is not None and f:
            cur["fields"][f.group(1).strip()] = f.group(2).strip()
    return items


def check_standard(s, all_ids):
    where = f"{s['file']}:{s['line']} {s['id']}"
    sid, f = s["id"], s["fields"]

    if not ID_RE.match(sid):
        err(where, "ID는 영역.주제.규칙 형식(영문 소문자, 숫자, 하이픈)이어야 해요")
    area = sid.split(".")[0]
    if area not in AREAS:
        err(where, f"알 수 없는 영역 '{area}'. 가능한 영역: {', '.join(AREAS)}")
    elif AREAS[area] != s["file"]:
        err(where, f"'{area}' 영역 기준은 {AREAS[area]}에 있어야 해요")

    for key in REQUIRED:
        if not f.get(key):
            err(where, f"'{key}' 칸이 비어 있어요")

    title = f.get("제목", "")
    if len(title) > MAX_TITLE:
        warn(where, f"제목이 {len(title)}자예요. {MAX_TITLE}자 이하로 줄여요")

    value = f.get("값", "")
    for word in ("그리고", "또한", "단,"):
        if word in value:
            warn(where, f"값에 '{word}'가 있어요. 규칙이 두 개라면 기준을 나눠요")
    for word in VAGUE:
        if word in value or word in title:
            warn(where, f"'{word}'는 확인할 수 없는 말이에요. 숫자나 조건으로 바꿔요")

    scope = f.get("적용 범위", "")
    if scope and not any(k in scope for k in SCOPE_KINDS):
        err(where, "적용 범위는 코드:/API:/화면:/문서: 중 하나 이상으로 시작해야 해요")
    for p in re.findall(r"코드:\s*(\S+)", scope):
        if re.fullmatch(r"[^/]*/?\*\*", p) or p in ("**", "*"):
            warn(where, f"적용 범위 '{p}'가 너무 넓어요")

    if f.get("항상 적용") and f["항상 적용"] not in ("예", "아니오"):
        err(where, "'항상 적용'은 예 또는 아니오예요")
    status = f.get("상태")
    if status and status not in ("사용", "폐기"):
        err(where, "'상태'는 사용 또는 폐기예요")
    if status == "폐기":
        rep = f.get("대체", "")
        if not rep:
            err(where, "폐기된 기준에는 '대체' 칸이 있어야 해요")
        else:
            for r in re.split(r"[,\s]+", rep):
                if r and r not in all_ids:
                    err(where, f"대체 ID '{r}'가 위키에 없어요")
    if f.get("버전") and not re.fullmatch(r"[1-9]\d*", f["버전"]):
        err(where, "'버전'은 1 이상의 정수예요")
    if f.get("잠금") and f["잠금"] not in ("예", "아니오"):
        err(where, "'잠금'은 예 또는 아니오예요")


def check_changelog(root: Path, all_ids):
    path = root / "CHANGELOG.md"
    if not path.exists():
        err("CHANGELOG.md", "파일이 없어요")
        return
    for no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not re.match(r"^\d{4}-\d{2}-\d{2}", line):
            continue
        parts = [p.strip() for p in line.split(" | ")]
        where = f"CHANGELOG.md:{no}"
        if len(parts) != 6:
            err(where, "'날짜 | 누가 | ID 버전 | 이전 → 새 값 | 이유 | 출처' 6칸이어야 해요")
            continue
        m = re.match(r"^(\S+)\s+(new|\d+)→(\d+)$", parts[2])
        if not m:
            err(where, "세 번째 칸은 '기준ID 이전버전→새버전' 형식이에요 (예: goal.metric.primary 1→2)")
        elif m.group(1) not in all_ids:
            warn(where, f"'{m.group(1)}'가 위키에 없어요")
        src = parts[5].replace("출처:", "").strip()
        if src not in SOURCES:
            err(where, f"출처 '{src}'는 {'/'.join(sorted(SOURCES))} 중 하나여야 해요")


def check_index(root: Path, by_file):
    path = root / "INDEX.md"
    if not path.exists():
        err("INDEX.md", "파일이 없어요")
        return
    text = path.read_text(encoding="utf-8")
    if len(text.splitlines()) > 40:
        warn("INDEX.md", "목차가 40줄을 넘어요. 짧게 유지해요")
    for area, fname in AREAS.items():
        if (root / fname).exists() and fname not in text:
            err("INDEX.md", f"{fname}가 목차에 없어요")
        row = re.search(rf"\|\s*{area}\s*\|\s*{re.escape(fname)}\s*\|[^|]*\|\s*(\d+)\s*\|", text)
        actual = len([s for s in by_file.get(fname, []) if s["fields"].get("상태") == "사용"])
        if row and int(row.group(1)) != actual:
            warn("INDEX.md", f"{fname} 기준 수가 {row.group(1)}로 적혀 있지만 실제로는 {actual}개예요")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    files = [p for p in sorted(root.glob("*.md")) if p.name not in NOT_STANDARD_FILES]
    by_file, all_items = {}, []
    for p in files:
        items = parse_standards(p)
        by_file[p.name] = items
        all_items.extend(items)

    all_ids = {s["id"] for s in all_items}
    seen = {}
    for s in all_items:
        if s["id"] in seen:
            err(f"{s['file']}:{s['line']}", f"ID '{s['id']}'가 {seen[s['id']]}에도 있어요")
        seen.setdefault(s["id"], f"{s['file']}:{s['line']}")
        check_standard(s, all_ids)

    always = [s["id"] for s in all_items
              if s["fields"].get("항상 적용") == "예" and s["fields"].get("상태") == "사용"]
    if len(always) > MAX_ALWAYS_ON:
        err("위키 전체", f"항상 적용되는 기준이 {len(always)}개예요. {MAX_ALWAYS_ON}개 이하로 줄여요")
    for fname, items in by_file.items():
        if len(items) > MAX_PER_AREA:
            warn(fname, f"기준이 {len(items)}개예요. 영역을 나눌지 검토해요")

    check_index(root, by_file)
    check_changelog(root, all_ids)

    for line in errors + warnings:
        print(line)
    active = len([s for s in all_items if s["fields"].get("상태") == "사용"])
    print(f"\n기준 {len(all_items)}개 (사용 {active}) · 항상 적용 {len(always)}개 · "
          f"오류 {len(errors)}개 · 경고 {len(warnings)}개")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
