---
name: pptx
description: "Presentation production for PPTX: create and edit slide decks (titles, bullet layouts, cards, images, charts, speaker notes) with python-pptx, and rehearse/verify them by rendering slides to images. Use when the user asks for a 演示文稿/slides/deck/PPT, asks to modify an existing .pptx, or wants slides exported to PDF/PNG for review. Not for Word documents or PDFs themselves."
---

# PPTX presentation production

Build and edit real `.pptx` decks with `python-pptx` (MIT), then render and visually judge the slides before delivering. The bar: each slide lands in one glance at presentation distance — clear hierarchy, no collisions, consistent style across slides.

## Environment

```bash
python3 -m pip install --quiet python-pptx
python3 -c "import pptx; print(pptx.__version__)"
soffice --v 2>/dev/null | head -1    # LibreOffice：渲染验收用；缺失时用用户提供的导出件
```

## Design rules (apply before writing any slide)

1. **One message per slide.** The title states the takeaway ("转化率提升 32%"), not the section name ("数据").
2. **Decide three things first**: audience & distance (projected = bigger type), deck palette (1 primary + 1 accent + neutral grays; reuse across every slide), and per-slide layout (title+body / two-column / full-bleed image + caption).
3. **Layout grid**: margins ≥ 5% of slide width on every side; title top-left; content never touches slide edges. 16:9 (13.33×7.5 in) unless told otherwise.
4. **Type**: body ≥ 18pt, captions ≥ 12pt, one font family deck-wide; CJK decks pick a font that exists on the target machine (e.g., 思源黑体/微软雅黑) — set both latin and East-Asian names on the run.
5. **Diagrams over prose**: flow/chart relationship → shapes + connectors; numbers → a chart object, not a screenshot of a chart.
6. **Images**: insert at native aspect ratio (`add_picture` with width only), no stretching; add a thin caption when the image carries meaning.
7. **Avoid the "AI-generated" look**: no default-bullet walls, no rainbow text colors, no decorative gradients behind text, no 5+ levels of indentation.
8. **Speaker notes**: put the narration in `slide.notes_slide` — slides carry headlines, notes carry sentences.

## Creating a deck

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)

layout = prs.slide_layouts[6]               # blank：布局自己画，可控性最好
s = prs.slides.add_slide(layout)

title = s.shapes.add_textbox(Inches(0.6), Inches(0.5), Inches(12.1), Inches(1.1))
tf = title.text_frame; tf.word_wrap = True
r = tf.paragraphs[0].add_run(); r.text = "转化率提升 32%"
r.font.size = Pt(36); r.font.bold = True

body = s.shapes.add_textbox(Inches(0.9), Inches(2.0), Inches(6.4), Inches(4.6))
p = body.text_frame.paragraphs[0]; p.text = "首句是结论，不是铺垫"
p.font.size = Pt(20)

s.notes_slide.notes_text_frame.text = "讲稿：先讲结论，再展开两个证据。"
prs.save("deck.pptx")
```

- Cards/panels: rounded rectangles (`MSO_SHAPE.ROUNDED_RECTANGLE`) with fill + 1pt outline; keep equal padding inside every card on a slide.
- Charts: `slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, ...)` with `chart_data` — set axis fonts ≥ 12pt and a legend only when >1 series.
- Flowcharts: `add_shape` + `add_connector`; route connectors orthogonally, never diagonally across text.

## Editing an existing deck

Read structure before touching anything — shape inventory with positions:

```python
from pptx import Presentation
from pptx.util import Emu
prs = Presentation("deck.work.pptx")
for i, s in enumerate(prs.slides, 1):
    for sh in s.shapes:
        print(i, sh.shape_type, sh.name,
              round(Emu(sh.left or 0).inches, 2), round(Emu(sh.top or 0).inches, 2),
              "|", (sh.text_frame.text[:40] if sh.has_text_frame else ""))
```

- Preserve the deck's own layout/master: add slides from `prs.slide_layouts`, restyle via runs — do not reformat every run by hand.
- Text edits: mutate `run.text` on the existing run (keeps formatting); adding a paragraph inherits the previous paragraph's style.
- Never let a repaired textbox silently overflow: after text edits re-check the render (below).

## Render and judge before delivery

```bash
soffice --headless --convert-to pdf deck.pptx
pdftoppm -png -r 96 deck.pdf slide          # slide-01.png, slide-02.png, ...
```

Spawn the plugin's `visual-judge` subagent with the slide PNGs — one gate, no pre-screening — and fix what it flags: collisions, half-empty containers, unreadable labels, cross-slide drift. One repair round, re-render, deliver when it passes.

## Delivery checklist

- Slide size consistent (16:9), title hierarchy consistent, palette reused deck-wide.
- Every slide passes the one-glance test: headline takeaway, ≤ 1 idea block group, no walls of bullets.
- Charts are native chart objects with legible axis labels; images undistorted with captions.
- Speaker notes present for content slides; file opens with no missing-font substitutions.
