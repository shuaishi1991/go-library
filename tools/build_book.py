#!/usr/bin/env python3
"""Scan an SGF directory tree and generate static JSON data for the site.

Usage:
    python3 tools/build_book.py <sgf_root> <book_id> <book_title>

Example:
    python3 tools/build_book.py ../常型解析/sgf changxing 新编围棋常型技巧大全

Output:
    books/<book_id>/book.json            book metadata + chapter list
    books/<book_id>/data/<chapter>.json  per-chapter patterns/figures
    books/index.json                     site-wide book registry (merged)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = ROOT / "books"

COORD = "abcdefghijklmnopqrs"


def parse_sgf(text):
    """Parse a single-line SGF (no branches) into nodes: list of dict prop->[values]."""
    nodes = []
    cur = None
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == ";":
            cur = {}
            nodes.append(cur)
            i += 1
        elif ch.isupper():
            j = i
            while j < n and text[j].isupper():
                j += 1
            prop = text[i:j]
            vals = []
            while j < n and text[j] == "[":
                j += 1
                buf = []
                while j < n and text[j] != "]":
                    if text[j] == "\\" and j + 1 < n:
                        j += 1
                    buf.append(text[j])
                    j += 1
                j += 1
                vals.append("".join(buf))
            if cur is not None and vals:
                cur.setdefault(prop, []).extend(vals)
            i = j
        else:
            i += 1
    return nodes


def pt(s):
    return [COORD.index(s[0]), COORD.index(s[1])]


def strip_meta(comment):
    """Drop the leading metadata line (e.g. '图1 扫描0023（书第3页）')."""
    lines = comment.split("\n")
    if lines and re.search(r"扫描\d+", lines[0]):
        lines = lines[1:]
    return "\n".join(lines).strip()


def figure_sort_key(name):
    m = re.match(r"图(\d+)(?:-(\d+))?$", name)
    if name == "基本图":
        return (0, 0, 0)
    if m:
        return (1, int(m.group(1)), int(m.group(2) or 0))
    return (2, 0, 0)


def parse_figure(path):
    nodes = parse_sgf(path.read_text(encoding="utf-8"))
    fig = {
        "label": path.stem,
        "title": "",
        "comment": "",
        "setupB": [],
        "setupW": [],
        "marks": [],
        "tris": [],
        "moves": [],
    }
    name_prop = None
    for node in nodes:
        if "N" in node:
            name_prop = node["N"][0]
        if "AB" in node:
            fig["setupB"] += [pt(v) for v in node["AB"]]
        if "AW" in node:
            fig["setupW"] += [pt(v) for v in node["AW"]]
        if "LB" in node:
            for v in node["LB"]:
                p, _, label = v.partition(":")
                fig["marks"].append({"pt": pt(p), "label": label})
        if "TR" in node:
            fig["tris"] += [pt(v) for v in node["TR"]]
        for color in ("B", "W"):
            if color in node and len(node[color][0]) >= 2:
                fig["moves"].append({"c": color, "pt": pt(node[color][0])})
    if name_prop:
        m = re.search(r"[（(](.+?)[）)]", name_prop)
        fig["title"] = m.group(1) if m else ""
    for node in reversed(nodes):
        if "C" in node:
            fig["comment"] = strip_meta(node["C"][0])
            break
    fig["inherit"] = not fig["setupB"] and not fig["setupW"] and not fig["moves"]
    return fig


def main():
    sgf_root = Path(sys.argv[1])
    book_id = sys.argv[2]
    book_title = sys.argv[3]

    book_dir = BOOKS_DIR / book_id
    data_dir = book_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    chapters = []
    for chap_dir in sorted(p for p in sgf_root.iterdir() if p.is_dir()):
        m = re.match(r"(\d+)-([上下]册)-(.+)", chap_dir.name)
        if not m:
            continue
        chap_id, volume, chap_name = m.groups()
        chap_title = chap_name.replace("-", " ", 1)
        patterns = []
        for pat_dir in sorted(p for p in chap_dir.iterdir() if p.is_dir()):
            pm = re.match(r"第(\d+)型", pat_dir.name)
            if not pm:
                continue
            figures = [
                parse_figure(f)
                for f in sorted(pat_dir.glob("*.sgf"), key=lambda f: figure_sort_key(f.stem))
            ]
            if figures:
                patterns.append({"title": f"第{int(pm.group(1))}型", "figures": figures})
        if not patterns:
            continue
        payload = {
            "id": chap_id,
            "volume": volume,
            "title": chap_title,
            "patterns": patterns,
        }
        (data_dir / f"{chap_id}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        chapters.append({
            "id": chap_id,
            "volume": volume,
            "title": chap_title,
            "patterns": len(patterns),
            "figures": sum(len(p["figures"]) for p in patterns),
        })

    book_meta = {
        "id": book_id,
        "title": book_title,
        "chapters": chapters,
        "stats": {
            "chapters": len(chapters),
            "patterns": sum(c["patterns"] for c in chapters),
            "figures": sum(c["figures"] for c in chapters),
        },
    }
    book_dir.mkdir(exist_ok=True)
    (book_dir / "book.json").write_text(
        json.dumps(book_meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    index_path = BOOKS_DIR / "index.json"
    index = []
    if index_path.exists():
        index = json.loads(index_path.read_text(encoding="utf-8"))
    index = [b for b in index if b["id"] != book_id]
    index.append({
        "id": book_id,
        "title": book_title,
        "description": f"共 {book_meta['stats']['chapters']} 章 · "
                       f"{book_meta['stats']['patterns']} 型 · "
                       f"{book_meta['stats']['figures']} 图",
    })
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(chapters)} chapters, {book_meta['stats']['patterns']} patterns, "
          f"{book_meta['stats']['figures']} figures")


if __name__ == "__main__":
    main()
