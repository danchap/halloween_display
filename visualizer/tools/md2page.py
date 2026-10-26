#!/usr/bin/env python3
"""Convert a markdown document to one self-contained HTML page.

Usage:
  python3 md2page.py input.md output.html --title "..." [--subtitle "..."]
                     [--date YYYY-MM-DD] [--no-toc]

Python 3 standard library only. The page has inline CSS and no external
resources: it reads the same on screen (max width 860 px) and in print
(A4, 14 mm margins, a page break before every second-level heading except
the first, table rows never split, table headers repeated on every page,
links printed as plain text).

The markdown subset:
  - ATX headings # to #### (a heading's id is a slug of its text; the
    table of contents lists the ## headings)
  - paragraphs (consecutive lines; a blank line ends one)
  - bullet lists (-, * or +) and numbered lists (1. or 1)), nested one
    level by indenting the nested item by two or more spaces
  - pipe tables: a header row, an alignment row (|---|:---:|---:|), then
    body rows; a column with --- is left-aligned, or right-aligned when
    most of its body cells look like numbers (the first column stays left)
  - **bold**, *italic*, `code`, [text](url), ![alt](path)
  - horizontal rules (--- alone on a line), fenced code blocks (```)
  - an image alone in a paragraph becomes a figure with the alt text as
    its caption; a path ending in .svg is read relative to the markdown
    file and its <svg> element is put in the page itself, so a printed
    PDF keeps the drawing as vectors; other image types become <img>
    tags with the path as given
  - a first line "# Title" is the document title when --title is absent,
    and is not repeated in the body in either case

Not supported (left as text): raw HTML, blockquotes, setext headings,
reference links, footnotes, backslash escapes, lists nested more than
one level, line breaks from trailing spaces. All text is HTML-escaped.
"""

import argparse
import datetime
import html
import os
import re
import sys
import unicodedata

FENCE_RE = re.compile(r'^(`{3,}|~{3,})\s*(\S*)\s*$')
HEADING_RE = re.compile(r'^(#{1,6})\s+(.*?)\s*#*\s*$')
HR_RE = re.compile(r'^\s{0,3}([-*_])(\s*\1){2,}\s*$')
LIST_RE = re.compile(r'^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$')
ALIGN_RE = re.compile(r'^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$')
TABLE_LINE_RE = re.compile(r'^\s*\|')
IMAGE_ONLY_RE = re.compile(r'^!\[([^\]]*)\]\(([^)\s]+)\)\s*$')
CODE_SPAN_RE = re.compile(r'(`+)(.+?)\1')
IMG_RE = re.compile(r'!\[([^\]]*)\]\(([^)\s]+)\)')
LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)\s]+)\)')
BOLD_RE = re.compile(r'\*\*(?=\S)(.+?)(?<=\S)\*\*')
ITALIC_RE = re.compile(r'(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\w)')
NUMERIC_RE = re.compile(
    r'^[-+−≈~]?\s*\d[\d\s,]*(?:[.,]\d+)?'
    r'\s*(?:°|%|€|mm|cm|m|kg|g|s|min|h|°C|x|×)?\s*$')
EMPTY_CELL = {'', '-', '–', '—', 'n/a', '...'}


def esc(text):
    return html.escape(text, quote=True)


class Converter:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.ids = {}
        self.toc = []          # (id, html text) of the ## headings
        self.h2_count = 0
        self.warnings = []

    # ------------------------------------------------------------ inline

    def inline(self, text):
        """Inline formatting: code spans are protected, then the rest is
        escaped and marked up."""
        out = []
        pos = 0
        for m in CODE_SPAN_RE.finditer(text):
            out.append(self.fmt(text[pos:m.start()]))
            out.append('<code>' + esc(m.group(2).strip()) + '</code>')
            pos = m.end()
        out.append(self.fmt(text[pos:]))
        return ''.join(out)

    def fmt(self, s):
        s = esc(s)
        s = IMG_RE.sub(lambda m: self.image_html(m.group(1), m.group(2), inline=True), s)
        s = LINK_RE.sub(r'<a href="\2">\1</a>', s)
        s = BOLD_RE.sub(r'<strong>\1</strong>', s)
        s = ITALIC_RE.sub(r'<em>\1</em>', s)
        return s

    def image_html(self, alt, src, inline=False):
        """An <svg> element read from the file for .svg paths, an <img> tag
        otherwise. alt and src arrive HTML-escaped."""
        path = html.unescape(src)
        if path.lower().endswith('.svg') and not re.match(r'^[a-z]+:', path):
            full = os.path.join(self.base_dir, path)
            try:
                with open(full, encoding='utf-8') as f:
                    data = f.read()
            except OSError as e:
                self.warnings.append(f'image not read: {full}: {e}')
                return f'<img src="{src}" alt="{alt}">'
            m = re.search(r'<svg\b.*</svg>', data, re.S)
            if not m:
                self.warnings.append(f'no <svg> element in {full}')
                return f'<img src="{src}" alt="{alt}">'
            svg = m.group(0)
            if alt and 'role=' not in svg[:200]:
                svg = svg.replace('<svg', f'<svg role="img" aria-label="{alt}"', 1)
            return svg
        return f'<img src="{src}" alt="{alt}">'

    # ------------------------------------------------------------ blocks

    def heading_id(self, text):
        plain = re.sub(r'<[^>]+>', '', text)
        plain = unicodedata.normalize('NFKD', html.unescape(plain))
        plain = plain.encode('ascii', 'ignore').decode('ascii').lower()
        slug = re.sub(r'[^a-z0-9]+', '-', plain).strip('-') or 'section'
        n = self.ids.get(slug, 0) + 1
        self.ids[slug] = n
        return slug if n == 1 else f'{slug}-{n}'

    def render_heading(self, level, text):
        inner = self.inline(text)
        hid = self.heading_id(inner)
        cls = ''
        if level == 2:
            self.h2_count += 1
            self.toc.append((hid, inner))
            if self.h2_count == 1:
                cls = ' class="first"'
        return f'<h{level} id="{hid}"{cls}>{inner}</h{level}>\n'

    def render_table(self, header, aligns, rows):
        ncol = max([len(header)] + [len(r) for r in rows])
        header = header + [''] * (ncol - len(header))
        rows = [r + [''] * (ncol - len(r)) for r in rows]
        aligns = (aligns + ['auto'] * ncol)[:ncol]
        classes = []
        for c in range(ncol):
            a = aligns[c]
            if a == 'auto':
                a = 'left'
                if c > 0:
                    cells = [r[c].strip() for r in rows]
                    cells = [x for x in cells if x.lower() not in EMPTY_CELL]
                    numeric = [x for x in cells if NUMERIC_RE.match(x)]
                    if cells and len(numeric) * 2 >= len(cells):
                        a = 'right'
            classes.append({'left': '', 'right': ' class="num"', 'center': ' class="ctr"'}[a])
        out = ['<table>\n<thead>\n<tr>']
        for c, cell in enumerate(header):
            out.append(f'<th{classes[c]}>{self.inline(cell)}</th>')
        out.append('</tr>\n</thead>\n<tbody>\n')
        for r in rows:
            out.append('<tr>')
            for c, cell in enumerate(r):
                out.append(f'<td{classes[c]}>{self.inline(cell)}</td>')
            out.append('</tr>\n')
        out.append('</tbody>\n</table>\n')
        return ''.join(out)

    def render_list(self, items):
        """items: list of (ordered, number, text, children) at the top
        level; children are (ordered, number, text) tuples."""
        ordered = items[0][0]
        tag = 'ol' if ordered else 'ul'
        start = ''
        if ordered and items[0][1] not in (None, 1):
            start = f' start="{items[0][1]}"'
        out = [f'<{tag}{start}>\n']
        for _, _, text, children in items:
            out.append(f'<li>{self.inline(text)}')
            if children:
                sub_ordered = children[0][0]
                sub_tag = 'ol' if sub_ordered else 'ul'
                sub_start = ''
                if sub_ordered and children[0][1] not in (None, 1):
                    sub_start = f' start="{children[0][1]}"'
                out.append(f'\n<{sub_tag}{sub_start}>\n')
                for _, _, t in children:
                    out.append(f'<li>{self.inline(t)}</li>\n')
                out.append(f'</{sub_tag}>\n')
            out.append('</li>\n')
        out.append(f'</{tag}>\n')
        return ''.join(out)

    def render_paragraph(self, lines):
        text = '\n'.join(lines).strip()
        m = IMAGE_ONLY_RE.match(text)
        if m:
            alt, src = m.group(1), m.group(2)
            body = self.image_html(esc(alt), esc(src))
            cap = f'<figcaption>{self.inline(alt)}</figcaption>' if alt else ''
            return f'<figure>{body}{cap}</figure>\n'
        return f'<p>{self.inline(text)}</p>\n'

    # ------------------------------------------------------------ parser

    def convert(self, lines):
        out = []
        i = 0
        n = len(lines)

        def is_block_start(k):
            """A line that ends a paragraph and starts another block."""
            line = lines[k]
            if FENCE_RE.match(line) or HEADING_RE.match(line) or HR_RE.match(line):
                return True
            if TABLE_LINE_RE.match(line) and k + 1 < n and ALIGN_RE.match(lines[k + 1]):
                return True
            return bool(LIST_RE.match(line))

        while i < n:
            line = lines[i]
            if not line.strip():
                i += 1
                continue
            m = FENCE_RE.match(line)
            if m:
                fence = m.group(1)
                code = []
                j = i + 1
                while j < n and not (lines[j].startswith(fence[0] * 3) and lines[j].strip(fence[0]).strip() == ''):
                    code.append(lines[j])
                    j += 1
                out.append('<pre><code>' + esc('\n'.join(code)) + '</code></pre>\n')
                i = j + 1
                continue
            m = HEADING_RE.match(line)
            if m:
                out.append(self.render_heading(len(m.group(1)), m.group(2)))
                i += 1
                continue
            if HR_RE.match(line):
                out.append('<hr>\n')
                i += 1
                continue
            if TABLE_LINE_RE.match(line) and i + 1 < n and ALIGN_RE.match(lines[i + 1]):
                header = split_row(line)
                aligns = parse_align(lines[i + 1])
                rows = []
                j = i + 2
                while j < n and TABLE_LINE_RE.match(lines[j]):
                    rows.append(split_row(lines[j]))
                    j += 1
                out.append(self.render_table(header, aligns, rows))
                i = j
                continue
            m = LIST_RE.match(line)
            if m:
                items, i = self.parse_list(lines, i)
                out.append(self.render_list(items))
                continue
            para = [line]
            j = i + 1
            while j < n and lines[j].strip() and not is_block_start(j):
                para.append(lines[j])
                j += 1
            out.append(self.render_paragraph(para))
            i = j
        return ''.join(out)

    def parse_list(self, lines, i):
        """Collect one list starting at line i. Returns (items, next line)."""
        n = len(lines)
        items = []
        while i < n:
            line = lines[i]
            if not line.strip():
                # a blank line keeps the list only if a list item or an
                # indented line follows
                j = i + 1
                while j < n and not lines[j].strip():
                    j += 1
                if j < n and (LIST_RE.match(lines[j]) or lines[j].startswith('  ')):
                    i = j
                    continue
                break
            m = LIST_RE.match(line)
            if m:
                indent = len(m.group(1).expandtabs(4))
                marker = m.group(2)
                ordered = marker[0].isdigit()
                number = int(marker[:-1]) if ordered else None
                text = m.group(3)
                if indent >= 2 and items:
                    items[-1][3].append((ordered, number, text))
                else:
                    if items and items[0][0] != ordered:
                        break       # a change of marker type starts a new list
                    items.append((ordered, number, text, []))
                i += 1
                continue
            if HEADING_RE.match(line) or FENCE_RE.match(line) or HR_RE.match(line):
                break
            if TABLE_LINE_RE.match(line) and i + 1 < n and ALIGN_RE.match(lines[i + 1]):
                break
            # a continuation line of the last item (indented or lazy)
            if items:
                if items[-1][3]:
                    o, num, t = items[-1][3][-1]
                    items[-1][3][-1] = (o, num, t + ' ' + line.strip())
                else:
                    o, num, t, ch = items[-1]
                    items[-1] = (o, num, t + ' ' + line.strip(), ch)
                i += 1
                continue
            break
        return items, i


def split_row(line):
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|') and not s.endswith('\\|'):
        s = s[:-1]
    cells = re.split(r'(?<!\\)\|', s)
    return [c.replace('\\|', '|').strip() for c in cells]


def parse_align(line):
    aligns = []
    for c in split_row(line):
        c = c.strip()
        left, right = c.startswith(':'), c.endswith(':')
        if left and right:
            aligns.append('center')
        elif right:
            aligns.append('right')
        elif left:
            aligns.append('left')
        else:
            aligns.append('auto')
    return aligns


CSS = """
html { background: #fff; }
body {
  margin: 0 auto; max-width: 860px; padding: 32px 24px 64px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px; line-height: 1.5; color: #1a1a1a; background: #fff;
  font-variant-numeric: tabular-nums; -webkit-text-size-adjust: 100%;
}
header.doc { margin: 0 0 28px; padding: 0 0 14px; border-bottom: 2px solid #1a1a1a; }
header.doc h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.2; font-weight: 700; }
header.doc .subtitle { margin: 0 0 4px; font-size: 17px; color: #444; }
header.doc .meta { margin: 0; font-size: 13px; color: #666; }
nav.toc { margin: 0 0 28px; padding: 12px 18px; background: #f4f4f4; border-radius: 6px; }
nav.toc p { margin: 0 0 6px; font-weight: 650; }
nav.toc ol { margin: 0; padding-left: 24px; }
nav.toc li { margin: 2px 0; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.5em; font-weight: 650; }
h1 { font-size: 26px; }
h2 { font-size: 22px; padding-bottom: 4px; border-bottom: 1px solid #ccc; }
h3 { font-size: 18px; }
h4 { font-size: 15px; }
p { margin: 0 0 0.8em; }
ul, ol { margin: 0 0 0.8em; padding-left: 26px; }
li { margin: 0.15em 0; }
li > ul, li > ol { margin: 0.15em 0 0.3em; }
table { border-collapse: collapse; margin: 0.6em 0 1.2em; max-width: 100%; font-size: 14px; line-height: 1.35; }
th, td { padding: 4px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid #ddd; }
thead th { border-bottom: 2px solid #888; font-weight: 650; }
th.num, td.num { text-align: right; white-space: nowrap; }
th.ctr, td.ctr { text-align: center; }
code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size: 0.92em; background: #f2f2f2; padding: 1px 4px; border-radius: 3px; }
pre { background: #f5f5f5; padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
pre code { background: none; padding: 0; font-size: inherit; }
a { color: #0b57d0; }
hr { border: 0; border-top: 1px solid #ccc; margin: 1.5em 0; }
figure { margin: 1.2em 0; text-align: center; }
figure svg, figure img { max-width: 100%; height: auto; }
figcaption { font-size: 13px; color: #555; margin-top: 6px; }
strong { font-weight: 650; }
@page { size: A4; margin: 14mm; }
@media print {
  html, body { background: #fff; }
  body { max-width: none; padding: 0; margin: 0; }
  h2 { page-break-before: always; break-before: page; }
  h2.first { page-break-before: auto; break-before: auto; }
  h1, h2, h3, h4 { page-break-after: avoid; break-after: avoid; }
  tr, figure, pre { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  a { color: inherit; text-decoration: none; }
  nav.toc { background: none; padding: 10px 16px; border: 1px solid #bbb; }
  code, pre { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  figure svg, figure img { max-width: 100%; }
}
"""


def main():
    ap = argparse.ArgumentParser(description='Convert a markdown file to a self-contained HTML page.')
    ap.add_argument('input', help='the markdown file')
    ap.add_argument('output', help='the HTML file to write')
    ap.add_argument('--title', help='the document title (default: a leading "# Title" line, else the file name)')
    ap.add_argument('--subtitle', default='', help='one line under the title')
    ap.add_argument('--date', help='the date shown in the header, YYYY-MM-DD (default: today)')
    ap.add_argument('--no-toc', action='store_true', help='leave out the table of contents')
    args = ap.parse_args()

    with open(args.input, encoding='utf-8') as f:
        lines = f.read().split('\n')
    lines = [l.rstrip('\r') for l in lines]

    # A leading "# Title" line is the title, and is not repeated in the body.
    title = args.title
    k = 0
    while k < len(lines) and not lines[k].strip():
        k += 1
    if k < len(lines):
        m = HEADING_RE.match(lines[k])
        if m and len(m.group(1)) == 1:
            if not title:
                title = m.group(2)
            lines = lines[:k] + lines[k + 1:]
    if not title:
        title = os.path.splitext(os.path.basename(args.input))[0]
    date = args.date or datetime.date.today().isoformat()

    conv = Converter(os.path.dirname(os.path.abspath(args.input)))
    body = conv.convert(lines)

    toc = ''
    if conv.toc and not args.no_toc:
        toc = '<nav class="toc"><p>Contents</p>\n<ol>\n'
        for hid, text in conv.toc:
            toc += f'<li><a href="#{hid}">{text}</a></li>\n'
        toc += '</ol>\n</nav>\n'

    header = f'<header class="doc">\n<h1>{esc(title)}</h1>\n'
    if args.subtitle:
        header += f'<p class="subtitle">{esc(args.subtitle)}</p>\n'
    header += f'<p class="meta">{esc(date)}</p>\n</header>\n'

    page = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<title>{esc(title)}</title>\n<style>{CSS}</style>\n</head>\n<body>\n<main>\n'
        + header + toc + body + '</main>\n</body>\n</html>\n'
    )
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(page)
    for w in conv.warnings:
        print('md2page: ' + w, file=sys.stderr)
    print(f'{args.output}: {len(page)} bytes, {len(conv.toc)} sections')


if __name__ == '__main__':
    main()
