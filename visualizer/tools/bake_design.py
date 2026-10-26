#!/usr/bin/env python3
"""Write the legs of design.js's DEFAULT_DESIGN from a solve report's PARAMS
line, and set its part system.

    python3 tools/bake_design.py out/solve-v2-final.txt design.js alu40pvc50
"""
import json
import re
import sys


def main():
    report, design_js, system = sys.argv[1:4]
    params = None
    for line in open(report, encoding='utf-8'):
        if line.startswith('PARAMS '):
            params = json.loads(line[7:])
    if not params:
        sys.exit('no PARAMS line in ' + report)
    src = open(design_js, encoding='utf-8').read()
    rows = []
    for q in params['legs']:
        rows.append('      { ' + ', '.join(f'{k}: {q[k]}' for k in ('footAlong', 'footHeight', 'kneeAlong', 'kneeHeight', 'kneeOut')) + ' },')
    new_legs = '    legs: [\n' + '\n'.join(rows) + '\n    ],\n'
    src, n = re.subn(r'    legs: \[\n(?:      \{.*\},\n)+    \],\n', new_legs, src)
    if n != 1:
        sys.exit('legs block not found once: ' + str(n))
    src, n = re.subn(r"  system: '[^']*',", f"  system: '{system}',", src)
    if n != 1:
        sys.exit('system line not found once')
    open(design_js, 'w', encoding='utf-8').write(src)
    print('baked', len(rows), 'legs into', design_js, 'system', system)


if __name__ == '__main__':
    main()
