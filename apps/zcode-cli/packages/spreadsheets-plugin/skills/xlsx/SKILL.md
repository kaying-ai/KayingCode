---
name: xlsx
description: "Spreadsheet production for XLSX: create, edit, analyze, chart, and convert workbooks with openpyxl — live formulas, styled tables, multiple sheets, charts, data validation, and format conversion (CSV/XLSX). Use when the user asks for an Excel/表格/记账表/统计表 deliverable, asks to fill in or modify an existing .xlsx, analyze spreadsheet data, or build a dashboard sheet. Not for PDF/Word deliverables."
---

# XLSX spreadsheet workbench

Create and edit real `.xlsx` workbooks with `openpyxl` (MIT). The bar: the workbook keeps working after the user edits it — live formulas instead of pasted numbers, styles that survive, zero error values on open.

## Environment

```bash
python3 -m pip install --quiet openpyxl
python3 -c "import openpyxl; print(openpyxl.__version__)"
```

## Principles (in priority order)

1. **Live formulas.** Totals, subtotals, ratios are formulas (`=SUM(...)`, `=SUMIF(...)`) referencing real ranges — never hardcoded results. A deliverable whose numbers can't survive a user edit is a failed deliverable.
2. **Zero error tolerance.** No `#REF!` / `#DIV/0!` / `#VALUE!` may appear on open. Wrap risky divisions: `=IFERROR(B2/C2, 0)` — or better, design ranges so they can't break.
3. **Compatibility first.** Stick to functions available across Excel/WPS/LibreOffice/Numbers (`SUM`, `SUMIF(S)`, `AVERAGE`, `COUNTIF(S)`, `IF`, `IFERROR`, `VLOOKUP`, `INDEX/MATCH`, `TEXT`, `DATE`, `EDATE`). Avoid dynamic-array-only functions (`XLOOKUP`, `LET`, spilling) unless the user confirmed the target app.
4. **Preserve on edit.** Editing an existing workbook: copy to `.work.xlsx` first; keep the user's sheets, names, and styles; add rather than rebuild.
5. **Language mirror.** Headers, sheet names, category names follow the user's language. (openpyxl always writes canonical English function names — localized apps translate them for display.)
6. **Original file preserved.** Deliver a new file or an explicitly named copy; never overwrite the user's upload in place.

## Creating a workbook

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, Reference
from openpyxl.worksheet.datavalidation import DataValidation

wb = Workbook()
ws = wb.active; ws.title = "收支明细"

headers = ["日期", "类型", "分类", "金额", "备注"]
ws.append(headers)
for col, w in zip("ABCDE", (12, 8, 12, 10, 24)):
    ws.column_dimensions[col].width = w

# 表头样式：加粗 + 底色 + 居中
head_fill = PatternFill("solid", fgColor="2F5597")
head_font = Font(color="FFFFFF", bold=True)
thin = Border(*[Side(style="thin", color="D9D9D9")] * 4)
for c in ws[1]:
    c.fill, c.font = head_fill, head_font
    c.alignment = Alignment(horizontal="center", vertical="center")

# 示例数据行 + 金额列数字格式
ws.append(["2026-10-01", "支出", "餐饮", 35.0, "示例数据，可删除"])
ws["D2"].number_format = "#,##0.00"

# 数据校验：类型列下拉
dv = DataValidation(type="list", formula1='"收入,支出"', allow_blank=True)
ws.add_data_validation(dv); dv.add("B2:B400")

# 汇总区：活公式
ws["G1"] = "总收入"; ws["H1"] = '=SUMIF(B:B,"收入",D:D)'
ws["G2"] = "总支出"; ws["H2"] = '=SUMIF(B:B,"支出",D:D)'
ws["G3"] = "结余";   ws["H3"] = "=H1-H2"

# 图表
chart = BarChart(); chart.title = "月度支出"
chart.add_data(Reference(ws, min_col=4, min_row=1, max_row=12), titles_from_data=True)
chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=12))
ws.add_chart(chart, "G5")

wb.save("budget.xlsx")
```

- **Freeze panes** on data sheets: `ws.freeze_panes = "A2"` (header row stays visible).
- **Number formats** for every money/date column (`#,##0.00`, `yyyy-mm-dd`) — plain floats display wrongly in every locale.
- **Multiple sheets** beat one wide sheet: 明细 / 汇总 / 说明. A 说明 sheet documents columns and how to extend ranges.
- **Formulas reference generous ranges** (`D2:D400` with validation) so appended rows are picked up; or recommend converting the range to a Table after opening.

## Editing an existing workbook

Inspect before mutating — values vs formulas, merged cells, existing styles:

```python
from openpyxl import load_workbook
wb = load_workbook("report.work.xlsx")          # 不加 data_only：保留公式
ws = wb["汇总"]
for row in ws.iter_rows(min_row=1, max_row=8, max_col=6):
    print([c.value for c in row], ws.merged_cells.ranges if row[0].row == 1 else "")
```

- `load_workbook(..., data_only=True)` reads cached results of formulas (for analysis only — saving that copy drops formulas).
- Merged cells: only the top-left cell holds a value; unmerge before restructuring a region.
- Keep the user's conditional formatting, names, and charts; append below the data with matching formats.

## Analysis requests ("帮我看这份表")

Read with `data_only=True`; if cached values are missing (file was generated programmatically and never opened), recompute critical figures in Python and say so. Report: structure, ranges, anomalies (blanks, outliers, error cells), and the direct answers with the cell references that back them.

## Conversions

- CSV → XLSX: always set column types explicitly on import (dates as dates, IDs as text) — CSV has no types and Excel guesses badly.
- XLSX → CSV: one sheet at a time; formulas export as their last cached value — recompute first if the file was never opened; warn the user that formatting and multiple sheets are lost.
- `.xls` (legacy): convert to `.xlsx` via LibreOffice (`soffice --headless --convert-to xlsx`) before processing; do not write `.xls`.

## Verify before delivery

```bash
soffice --headless --convert-to pdf budget.xlsx     # LibreOffice 会真实重算公式
pdftoppm -png -r 96 budget.pdf sheet                # 渲染验收图
```

1. Reopen the file with openpyxl and scan every cell for error strings (`#REF!`, `#DIV/0!`, ...) — must be zero.
2. Confirm totals: recomputed in Python vs the workbook's formulas agree.
3. Render to PNG and dispatch the plugin's `visual-judge` subagent (single gate, no pre-screening): clipped `####` columns, broken charts, bad print slices. One repair round, re-render, deliver.
