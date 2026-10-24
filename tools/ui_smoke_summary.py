#!/usr/bin/env python3
"""Markdown summary (app × screen size) of nova-selftest --ui-smoke results."""
import json
import sys
from pathlib import Path

MARK = {'pass': '✅', 'warn': '⚠️', 'fail': '❌', 'info': 'ℹ️'}


def table(report: dict) -> str:
    cells, columns = {}, []
    for c in report.get('checks', []):
        parts = c['id'].split(':')
        if len(parts) != 3:
            continue
        _, app, column = parts
        if column not in columns:
            columns.append(column)
        cells[(app, column)] = c
    apps = sorted({a for a, _ in cells})
    out = ['## NOVA UI smoke test', '',
           '| Приложение | ' + ' | '.join(columns) + ' |',
           '|---|' + '---|' * len(columns)]
    for app in apps:
        row = [MARK.get(cells.get((app, col), {}).get('status'), '—') for col in columns]
        out.append(f'| {app} | ' + ' | '.join(row) + ' |')
    s = report.get('summary', {})
    out += ['', f"Итог: {s.get('verdict', '?')} — ✅ {s.get('pass', 0)}, ⚠️ {s.get('warn', 0)}, ❌ {s.get('fail', 0)}", '']
    problems = [c for c in report.get('checks', []) if c['status'] in ('warn', 'fail')]
    if problems:
        out.append('<details><summary>Замечания</summary>\n')
        out += [f"- {MARK[c['status']]} `{c['id']}` — {c['detail']}" for c in problems[:80]]
        out.append('\n</details>')
    return '\n'.join(out) + '\n'


if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/ui-smoke/ui-report.json')
    try:
        print(table(json.loads(path.read_text(encoding='utf-8'))))
    except (OSError, ValueError) as exc:
        print(f'## NOVA UI smoke test\n\nОтчёт не найден: {exc}\n')
