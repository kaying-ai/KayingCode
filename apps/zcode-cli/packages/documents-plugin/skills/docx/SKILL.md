---
name: docx
description: "Word document production for DOCX: create, edit, format, review, and comment on editable .docx files. Use when the user asks for a Word/DOCX deliverable (proposal, report, resume, contract, letter, academic paper), asks to modify or review an existing .docx, extract or replace its content, add a TOC/headers/footers/tables, or needs tracked comments. Also use when the user mentions .docx explicitly or asks for 'an editable Word document' rather than a PDF."
---

# DOCX creation, editing, and review

Produce and edit real `.docx` files (Office Open XML) with Python and `python-docx`, then verify the result visually before delivering. The bar: an editable, correctly styled Word document that opens cleanly in Word/WPS/Pages — not an exported lookalike.

## Environment

Run once per workspace, then reuse the interpreter:

```bash
python3 -m pip install --quiet python-docx
python3 -c "import docx; print(docx.__version__)"
```

No network is needed after install. If `pip` is restricted, prefer a virtualenv: `python3 -m venv .venv-docx && .venv-docx/bin/pip install python-docx`.

## Core rules

1. **Preserve the original.** Never edit the user's file in place. Copy it to a working name (`cp report.docx report.work.docx`), edit the copy, and only at the end replace/renamedeliver. If the task is review-only, do not write any .docx at all.
2. **Styles over direct formatting.** Set paragraph styles (`Heading 1`, `List Bullet`, `Quote`) instead of hand-tuning font size on every paragraph. Styled documents survive user edits; hand-formatted ones fall apart.
3. **Language mirror.** Match the user's language for content; keep UI words of Word itself (e.g., heading style names in code) in English.
4. **Editable means editable.** Text stays text (no screenshots of text), tables stay tables, headings stay heading styles so the navigation pane and TOC work.

## Creating a document

```python
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
# 页面与页边距（中文文档常用 A4）
section = doc.sections[0]
section.page_width, section.page_height = Cm(21.0), Cm(29.7)
section.top_margin = section.bottom_margin = Cm(2.54)

doc.core_properties.title = "项目方案"
doc.core_properties.author = "KayingCode"

h = doc.add_heading("项目方案", level=0)          # level 0 = Title
doc.add_paragraph("一、背景与目标", style="Heading 1")
p = doc.add_paragraph("正文段落。中文字体建议显式设置 east asia 字体，避免回退。")
run = p.runs[0]
run.font.name = "Calibri"
run._element.rPr.rFonts.set(
    __import__("docx").oxml.ns.qn("w:eastAsia"), "宋体")  # 中文字形
doc.add_page_break()

table = doc.add_table(rows=3, cols=3)
table.style = "Light Grid Accent 1"              # 内置表样式，跨平台安全
doc.save("proposal.docx")
```

Checklist while writing:

- **Headings** use `Heading 1..3`; one `Title`/`Heading 1` per topic, never skip levels for visual size.
- **Lists** use `List Bullet` / `List Number` styles; do not type literal `1.` prefixes.
- **Tables**: set a built-in table style; keep header row bold; avoid empty filler columns.
- **TOC**: insert a TOC field so Word computes it:

```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def add_toc(doc):
    p = doc.add_paragraph()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), 'TOC \\o "1-3" \\h \\z \\u')
    p._p.append(fld)
```

  Word shows "update this field" on open; LibreOffice/WPS render it after F9. Say this in the delivery note, and never hand-fake page numbers.

- **Headers/footers/page numbers**: use `section.header/footer`; page numbers need a `PAGE` field (same `fldSimple` trick with `PAGE`).
- **Images**: `doc.add_picture("chart.png", width=Cm(14))` — set explicit width, never let a wide image overflow the text column.
- **Math**: `python-docx` has no OMML API; for formulas, write them as OMML XML or deliver a note asking the user to insert them. Do not ship fake images of formulas unless requested.

## Editing an existing document

1. Read structure first — never blind-edit:

```python
from docx import Document
doc = Document("report.work.docx")
for i, p in enumerate(doc.paragraphs[:80]):
    if p.text.strip():
        print(i, p.style.name, "|", p.text[:60])
```

2. Edit by locating the paragraph/table, then mutate runs in place so surrounding formatting survives. Replacing `paragraph.text` wipes run formatting — prefer `run.text = new` on the first run and clear the rest.
3. Deleting content: `p._p.getparent().remove(p._p)` for paragraphs, `tbl._tbl.getparent().remove(tbl._tbl)` for tables.
4. Comments (review workflow): `python-docx` ≥ 1.1.2 supports comments via `paragraph.add_comment()`; if unavailable, produce a review memo (findings list referencing heading text) instead of corrupting the file with unsupported XML.
5. Content extraction for analysis: iterate `doc.paragraphs` and `doc.tables` (cells via `table.rows[i].cells[j].text`).

## Review checklist before delivery

Run through this list, fixing what it flags:

- Heading hierarchy is continuous (no H1→H3 jumps); every heading uses a heading style.
- No literal fake numbering/bullets typed as text.
- Tables have a style, a header row, and fit the page width.
- TOC (if present) is a real field; no hand-typed page numbers.
- Images have explicit widths and captions where the text references them.
- East-Asian font set for CJK runs; document opens without font-substitution warnings.
- Core properties (title/author) filled; no leftover `.work.docx` copies referenced in the delivery.

## Visual acceptance (render to PNG, then dispatch visual-judge)

For deliverable-quality output, render and judge before handing over:

```bash
soffice --headless --convert-to pdf proposal.docx        # LibreOffice; Word/WPS 也可
pdftoppm -png -r 96 proposal.pdf page                     # page-1.png, page-2.png, ...
```

Then spawn the plugin's `visual-judge` subagent with the page PNGs (one gate, don't pre-screen the images yourself) and fix what it flags: pagination artifacts, orphaned headings, broken tables, blank renders. Re-render once after repairs; stop after one repair round unless the judge still fails a page.
