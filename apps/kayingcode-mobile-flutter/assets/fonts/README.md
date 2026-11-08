# 字体

更纱黑体(Sarasa Gothic SC)子集,来源 https://github.com/be5invis/Sarasa-Gothic,
母版固定为上游 **1.0.41 unhinted**(与子集内 version/族名一致),许可 SIL Open Font
License 1.1(全文见同目录 OFL.txt)。
- Zflow-UI-Regular.ttf / -Bold.ttf → family "Sarasa UI SC"(界面)
- Zflow-Term-Regular.ttf → family "Sarasa Term SC"(代码/diff/终端)

子集范围:GB2312 ∪ Big5 ∪ Big5-HKSCS ∪ `lib/l10n/tables/` 三语文案实际用字
+ ASCII + 中英标点,用于同时覆盖简体与繁体界面;仍未覆盖的字符回退系统字体。
字形遵循 Sarasa SC 变体的简体字形标准(共享汉字);如需台湾字形需另挂 TC 子集。

再生成(母版不随仓库分发,按 `tool/subset_fonts.py` 顶部注释下载到
`build/font-work/master/`,该目录已被 gitignore):

```sh
python3 -m venv build/font-work/venv
build/font-work/venv/bin/pip install fonttools py7zr
build/font-work/venv/bin/python tool/subset_fonts.py --master-dir build/font-work/master
```

脚本会同时重建 `subset-chars.txt`;新增三语文案后应重跑并提交三个 TTF 与字符表。
