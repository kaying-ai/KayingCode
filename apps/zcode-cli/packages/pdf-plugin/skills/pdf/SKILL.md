---
name: pdf
description: "PDF production and processing: generate shareable PDFs (reports, resumes, posters, covers) and process existing ones (merge, split, extract text/tables, rotate, compress, stamp pages). Use when the user asks for 'a PDF', a fixed-layout deliverable, or asks to combine/split/extract pages or text from PDF files. Not for editable Word documents — use the documents (docx) skill when the user needs to keep editing."
---

# PDF production workbench

Two very different jobs live under "PDF" — **generate** a fixed-layout deliverable, or **process** existing files. Route first, then work. The bar: a shareable PDF whose pagination, margins, and figures look intentional.

## Environment

```bash
python3 -m pip install --quiet pypdf reportlab
pdftoppm -v 2>&1 | head -1        # poppler-utils，用于渲染验收；缺失时可用 soffice 转 PNG
```

- `pypdf` (BSD) — merge/split/rotate/extract/metadata.
- `reportlab` (BSD) — programmatic generation (tables, flowing text, precise canvas).
- HTML→PDF: prefer headless Chrome/Chromium (`chrome --headless --print-to-pdf=out.pdf file.html`) or the workspace's built-in browser print pipeline; use reportlab when a browser is unavailable. Do not pull heavyweight typesetting toolchains (LaTeX/Weasy) unless the user asked for them.

## Route the request

| 用户要什么 | 路线 |
| --- | --- |
| 报告/简历/海报/封面等"生成一份 PDF" | **Generate**（§1） |
| 合并、拆分、抽取页面或文本、旋转、加密、压缩 | **Process**（§2） |
| "把这份 docx/html 转成 PDF" | Convert: `soffice --headless --convert-to pdf x.docx` 或 Chrome 打印 |
| 批注/审阅内容 | 用 §2 抽取文本后按普通审阅输出意见；不要写回 PDF 除非用户要 |

## 1. Generating a PDF

Pick the smallest tool that holds the layout:

- **Flowing document** (report, resume): HTML + CSS print styles → headless Chrome `--print-to-pdf`. Set `@page { size: A4; margin: 18mm }`, `page-break-inside: avoid` on cards/figures, and embed images with absolute workspace paths or data URLs (Chrome blocks `file://` subresources when the HTML itself is loaded from file — same-directory relative paths are fine).
- **Precise layout** (poster, cover, badge): reportlab canvas — absolute coordinates, grid first:

```python
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
c = canvas.Canvas("poster.pdf", pagesize=A4)
w, h = A4
c.setFont("Helvetica-Bold", 28)
c.drawString(40, h - 70, "海报标题")
c.drawImage("figure.png", 40, h - 420, width=w - 80, preserveAspectRatio=True, mask="auto")
c.showPage(); c.save()
```

- **Long tables/data**: reportlab `platypus` (`SimpleDocTemplate`, `Table`, `Paragraph`) so rows flow across pages with repeated headers.

Content rules:

- Figures are **block-level**: one figure per "line", centered, captioned (`图 1：……`), never floated into a text column.
- Charts embedded as PNG: render at 2× (e.g., 1600px wide) so print stays sharp; never screenshot at 1×.
- Fonts: reportlab's built-ins lack CJK — register a TTF/OTF (`pdfmetrics.registerFont(TTFont("NotoSansSC", path))`) for Chinese text, or generate via the HTML route where system fonts apply.
- Every generated file gets `setTitle` metadata and consistent margins; page numbers via canvas `drawString` per page or CSS `@page` counters in the HTML route.

## 2. Processing existing PDFs

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("in.pdf")
writer = PdfWriter()

# 合并
for name in ["a.pdf", "b.pdf"]:
    writer.append(name)

# 拆分（每 10 页一个文件）
for start in range(0, len(reader.pages), 10):
    part = PdfWriter()
    for page in reader.pages[start:start + 10]:
        part.add_page(page)
    part.write(f"part-{start // 10 + 1}.pdf")

# 抽取文本（无文本层 → 如实报告“扫描件，无文本层”，不要 OCR 编造）
print(reader.pages[0].extract_text())
writer.write("out.pdf")
```

Guardrails: rotated pages need `page.transfer_rotation_to_content()` before stamping; compression goes through `writer.compress_identical_objects()` / content-stream compression — never re-encode images down without saying so; encrypted files ask for the password, not brute force.

## Delivery checklist

- Page size and margins consistent on every page; no content crossing the margin.
- Figures block-level, sharp (2×), captioned, and exactly matching the claims in surrounding text.
- CJK text renders as glyphs, not tofu; fonts embedded (Chrome/reportlab embed automatically; check with `pdffonts out.pdf` when available).
- No near-blank pages, no orphaned headings/captions at page bottoms.

## Visual acceptance (render to PNG, then dispatch visual-judge)

```bash
pdftoppm -png -r 96 out.pdf page        # page-1.png, page-2.png, ...
```

Spawn the plugin's `visual-judge` subagent with the page PNGs (single gate; don't pre-screen yourself) and repair what it flags — crowding, bad breaks, clipped charts, tofu. One repair round, re-render, stop when it passes or only stylistic notes remain.
