// 离线报告复用 DESIGN.md 的语义色与 UI 字号角色，无应用运行时依赖。
export const STYLE = `
:root{color-scheme:light dark;--ui-font-size:14px;--color-background:#fafafa;--color-card:#fff;--color-foreground:#252525;--color-foreground-subtle:#666;--color-border:#ddd;--color-icon-blue:#2563eb}
@media(prefers-color-scheme:dark){:root{--color-background:#181818;--color-card:#222;--color-foreground:#eee;--color-foreground-subtle:#aaa;--color-border:#444;--color-icon-blue:#93b4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--color-background);color:var(--color-foreground);font-family:system-ui,sans-serif;line-height:1.65}
.text-ui-base{font-size:var(--ui-font-size)}.text-ui-caption{font-size:calc(var(--ui-font-size) - 1px);color:var(--color-foreground-subtle)}
main{max-width:72rem;margin:auto;padding:2rem}h1{font-size:calc(var(--ui-font-size) + 4px)}h2{font-size:calc(var(--ui-font-size) + 2px)}h3{font-size:var(--ui-font-size)}
header,section,.chapter,.appendix{background:var(--color-card);padding:1.25rem;margin-bottom:1rem;border:1px solid var(--color-border);border-radius:.5rem}nav{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0}
.lede{max-width:58ch;line-height:1.9}.curated{margin:1rem 0}.appendix>summary{font-weight:600}.appendix[open]>summary{margin-bottom:1rem}
.intro-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(12rem,18rem);gap:1.25rem;align-items:start}.intro-layout .gallery{margin:0}
summary{cursor:pointer}summary:focus-visible,a:focus-visible{outline:2px solid var(--color-icon-blue);outline-offset:3px}.chapter>summary{font-weight:600}.chapter[open]>summary{margin-bottom:.75rem}a{color:var(--color-icon-blue);overflow-wrap:anywhere}p,li,td{overflow-wrap:anywhere}.prose{white-space:pre-wrap}pre{overflow:auto;white-space:pre-wrap;word-break:break-word}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.5rem;border-bottom:1px solid var(--color-border);vertical-align:top}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:1rem}figure{margin:0}img,video{width:100%;max-height:32rem;object-fit:contain;background:var(--color-background)}figcaption{font-size:calc(var(--ui-font-size) - 1px)}
@media(max-width:600px){main{padding:.75rem}section,header,.appendix{padding:.75rem}table{display:block;overflow:auto}.intro-layout{grid-template-columns:minmax(0,1fr)}}@media print{nav{display:none}section{break-inside:avoid}video{display:none}}
`;
