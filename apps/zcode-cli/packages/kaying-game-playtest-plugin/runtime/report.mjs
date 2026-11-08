import { join } from "node:path";
import { atomicJson, atomicText, projections } from "./io.mjs";
import { reportData, STATUS_LABELS } from "./report-data.mjs";
export { reportData } from "./report-data.mjs";

const ORIGINS = {
  review: "Agent 评价",
  metadata: "自动整理",
  events: "观察记录",
  missing: "待补充",
};
const LABELS = { observed: "实际观察", inferred: "合理推断", unverified: "未验证" };
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const md = (value) => String(value).replace(/[\\`*_[\]<>#!|]/g, "\\$&");
const mediaUrl = (path) => path.split("/").map(encodeURIComponent).join("/");

export async function generateReport(directory, session, now, related = []) {
  const data = reportData(session, now, related);
  const artifactMap = new Map(data.artifacts.map((item) => [item.id, item]));
  const refsHtml = (ids) =>
    [...new Set(ids)]
      .map((id) => {
        const item = artifactMap.get(id);
        return `<a href="${esc(mediaUrl(item.path))}">${esc(item.label)}</a>`;
      })
      .join(" · ");
  const refsMd = (ids) =>
    [...new Set(ids)]
      .map((id) => {
        const item = artifactMap.get(id);
        return `[${md(item.label)}](${mediaUrl(item.path)})`;
      })
      .join(" · ");
  const diagnostic = data.reportKind === "diagnostic";
  // 旧模板把未评分显示为“覆盖 0%”，混淆游戏覆盖与评分；两种进度分别展示。
  const scoreText = diagnostic
    ? "运行诊断 · 不作综合游戏评分"
    : data.scoring.total === null
      ? "本轮未评分 · 已观察事实与目标进度见下方"
      : `${data.scoring.total} / 100 · 评分维度覆盖率 ${Math.round(data.scoring.coverage * 100)}% · 评分置信度 ${Math.round(data.scoring.confidence * 100)}%`;
  const progressText = data.goals.length
    ? `目标已验证 ${data.coverage.goals.verified}/${data.coverage.goals.applicable} · 部分验证 ${data.coverage.goals.partial} · 受阻 ${data.coverage.goals.blocked}`
    : "历史会话未配置验收目标；不能据此推断完成率。";
  const goalsHtml = data.goals
    .map(
      (g) =>
        `<tr><th>${esc(g.title)}</th><td>${esc(g.acceptance)}</td><td>${STATUS_LABELS[g.status]}</td><td>${esc(g.reason)}<br>${refsHtml(g.evidenceIds)}</td></tr>`,
    )
    .join("");
  const issuesHtml = data.issues
    .map(
      (item) =>
        `<article><h3>${esc(item.severity)} · ${esc(item.title)}</h3><ol>${item.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol><p>预期：${esc(item.expected)}<br>实际：${esc(item.actual)}<br>建议：${esc(item.recommendation)}</p>${refsHtml(item.evidenceIds)}</article>`,
    )
    .join("");
  const gallery = data.artifacts
    .map(
      (item) =>
        `<figure>${item.kind === "screenshot" ? `<img loading="lazy" src="${esc(mediaUrl(item.path))}" alt="${esc(item.label)}">` : ["recording", "highlight"].includes(item.kind) ? `<video controls preload="metadata" src="${esc(mediaUrl(item.path))}"></video>` : ""}<figcaption>${esc(item.kind)} · ${esc(item.offsetSeconds.toFixed(1))}s · <a href="${esc(mediaUrl(item.path))}">${esc(item.label)}</a>${item.durationSeconds ? ` · ${esc(item.durationSeconds.toFixed(1))}s 视频` : ""}${item.timebase === "unknown" ? " · 录制开始时间未提供" : ""}</figcaption></figure>`,
    )
    .join("");
  const eventHtml = data.events
    .map(
      (e) =>
        `<tr><td>${esc(e.at ?? "未记录")}</td><td>${esc(e.kind)}</td><td>${esc(e.summary)}<br>${refsHtml(e.evidenceIds)}</td></tr>`,
    )
    .join("");
  const curatedMediaHtml = (section) =>
    (section.media ?? [])
      .map((media) => {
        const item = artifactMap.get(media.artifactId);
        return `<figure>${item.kind === "screenshot" ? `<img loading="lazy" src="${esc(mediaUrl(item.path))}" alt="${esc(media.caption)}">` : `<video controls preload="metadata" src="${esc(mediaUrl(item.path))}"></video>`}<figcaption>${esc(media.caption)}</figcaption></figure>`;
      })
      .join("");
  const sectionsHtml = data.sections
    .map((section, i) => {
      // 逐章来源区块打断试玩阅读；追溯信息保留在 JSON 和附录，不重复插入正文。
      const narrative = section.text
        .split(/\n\n+/)
        .map((text) => `<p class="prose">${esc(text)}</p>`)
        .join("");
      const body = diagnostic
        ? `<p class="text-ui-caption">${LABELS[section.certainty]} · ${STATUS_LABELS[section.status]} · ${ORIGINS[section.origin]}</p>${narrative}${refsHtml(section.evidenceIds)}${section.key === "information" ? `<details><summary>环境原始数据</summary><pre>${esc(JSON.stringify({ source: data.source, apk: data.apk, device: data.device }, null, 2))}</pre></details>` : section.key === "coverage" ? `${data.goals.length ? `<table><thead><tr><th>目标</th><th>验收条件</th><th>状态</th><th>原因与证据</th></tr></thead><tbody>${goalsHtml}</tbody></table>` : ""}<table><thead><tr><th>时间</th><th>事件</th><th>观察与证据</th></tr></thead><tbody>${eventHtml}</tbody></table>` : section.key === "issues" ? issuesHtml : section.key === "evidence" ? `<div class="gallery">${gallery}</div>` : ""}`
        : `${section.key === "summary" && section.media?.length ? `<div class="intro-layout"><div>${narrative}</div><div class="gallery curated">${curatedMediaHtml(section)}</div></div>` : `${narrative}${section.media?.length ? `<div class="gallery curated">${curatedMediaHtml(section)}</div>` : ""}`}${section.key === "issues" ? issuesHtml : ""}`;
      const title = `${String(i + 1).padStart(2, "0")} ${section.title}`;
      return section.status === "not-tested" || section.status === "not-applicable"
        ? `<details class="chapter" id="${section.key}"><summary>${title} · ${STATUS_LABELS[section.status]}</summary>${body}</details>`
        : `<section id="${section.key}"><h2>${title}</h2>${body}</section>`;
    })
    .join("");
  const scoreHtml =
    diagnostic || !data.scoring.dimensions.some((d) => d.score !== null)
      ? ""
      : `<section><h2>评分与证据</h2><p>${esc(data.scoring.method)}</p><table><thead><tr><th>维度</th><th>评分 / 10</th><th>说明</th><th>证据</th></tr></thead><tbody>${data.scoring.dimensions.map((item) => `<tr><th>${esc(item.dimension)}</th><td>${item.score ?? "未评分"}</td><td>${esc(item.reason)}</td><td>${refsHtml(item.evidenceIds)}</td></tr>`).join("")}</tbody></table></section>`;
  const metricRows = Object.entries(data.metrics.actions)
    .map(
      ([key, value]) =>
        `<tr><th>${{ actionMs: "输入执行", observationMs: "后续观察", totalMs: "输入与观察合计" }[key]}</th><td>${value.count}</td><td>${value.mean ?? "—"}</td><td>${value.median ?? "—"}</td><td>${value.p95 ?? "—"}</td></tr>`,
    )
    .join("");
  const metricsHtml = `<section><h2>运行耗时</h2><p>总时长 ${(data.metrics.wallElapsedMs / 1000).toFixed(1)} 秒；${session.timingVersion ? `暂停 ${(data.metrics.pausedMs / 1000).toFixed(1)} 秒` : "历史暂停计时未采集"}；${data.metrics.timingSamples ? `已测工具 ${(data.metrics.measuredToolMs / 1000).toFixed(1)} 秒` : "工具总计时未采集"}；活跃期未归因 ${(data.metrics.unattributedActiveMs / 1000).toFixed(1)} 秒。</p><table><thead><tr><th>设备阶段</th><th>样本数</th><th>均值 ms</th><th>中位数 ms</th><th>p95 ms</th></tr></thead><tbody>${metricRows}</tbody></table><p class="text-ui-caption">${esc(data.metrics.caveat)}</p></section>`;
  const relatedHtml = related.length
    ? `<section><h2>关联试玩</h2>${related.map((r) => `<article><h3><a href="${esc(r.reportPath)}">${esc(r.title)}</a></h3><p>${esc(r.createdAt)} · ${r.actions} 次动作 · ${r.events} 条事件</p><p>${esc(r.caveat)}</p><details><summary>关联环境与版本标识</summary><pre>${esc(JSON.stringify({ source: r.source, apkSha256: r.apkSha256, device: r.device }, null, 2))}</pre></details></article>`).join("")}</section>`
    : "";
  const qualityHtml = data.qualityWarnings.length
    ? `<section><h2>分析完整性</h2><ul>${data.qualityWarnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></section>`
    : "";
  const { STYLE } = await import("./report-style.mjs");
  // 读者报告应先解释游戏；旧模板将设备验收和计时置顶，导致正文像自动化运行记录。
  const appendix = `<details id="technical-appendix" class="appendix"><summary>附录：体验范围、证据与运行记录</summary><p>${esc(progressText)}</p><p class="text-ui-caption">${esc(data.status)} · ${esc(data.generatedAt)} · ${esc(session.id)}</p>${qualityHtml}${scoreHtml}${metricsHtml}<section><h2>验收与事件记录</h2><table><thead><tr><th>目标</th><th>验收条件</th><th>状态</th><th>原因与证据</th></tr></thead><tbody>${goalsHtml}</tbody></table><table><thead><tr><th>时间</th><th>事件</th><th>观察与证据</th></tr></thead><tbody>${eventHtml}</tbody></table></section><section><h2>完整证据与原始环境</h2><pre>${esc(JSON.stringify({ source: data.source, apk: data.apk, device: data.device }, null, 2))}</pre><div class="gallery">${gallery}</div></section>${relatedHtml}<section><h2>采集限制</h2><ul>${data.limitations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section></details>`;
  const header = diagnostic
    ? `<p>${esc(scoreText)}</p><p>${esc(progressText)}</p><p class="text-ui-caption">${esc(data.status)} · ${esc(data.generatedAt)} · ${esc(session.id)}</p>`
    : `<p class="lede">${esc(data.lede)}</p>`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' file:; media-src 'self' file:; base-uri 'none'; form-action 'none'"><title>${esc(data.title)}</title><style>${STYLE}</style></head><body class="text-ui-base"><main><header><p class="text-ui-caption">${diagnostic ? "KAYING GAME PLAYTEST · 运行诊断" : "新游戏试玩报告 · KAYING GAME PLAYTEST"}</p><h1>${esc(data.title)}</h1>${header}</header><nav aria-label="报告目录">${data.sections.map((section) => `<a href="#${section.key}">${section.title}</a>`).join("")}</nav>${diagnostic ? metricsHtml + qualityHtml + scoreHtml + sectionsHtml + relatedHtml : sectionsHtml + appendix}${diagnostic ? `<section><h2>环境与采集限制</h2><ul>${data.limitations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>` : ""}</main></body></html>`;
  const markdown = [
    `# ${md(data.title)}`,
    ...(diagnostic ? [scoreText, progressText] : [md(data.lede)]),
    ...data.sections.map(
      (s) =>
        `## ${s.title}\n\n${diagnostic ? `${STATUS_LABELS[s.status]} · ${LABELS[s.certainty]}\n\n` : ""}${md(s.text)}\n\n${(
          s.media ?? []
        )
          .map((media) => {
            const item = artifactMap.get(media.artifactId);
            return `${item.kind === "screenshot" ? "!" : ""}[${md(media.caption)}](${mediaUrl(item.path)})`;
          })
          .join(
            "\n\n",
          )}${diagnostic ? `\n\n来源：${refsMd(s.evidenceIds) || "了解范围见附录"}` : ""}`,
    ),
    "## 附录：体验范围、证据与运行记录",
    progressText,
    `### 运行耗时\n\n\`\`\`json\n${JSON.stringify(data.metrics, null, 2)}\n\`\`\``,
    `### 分析完整性\n\n${data.qualityWarnings.map((w) => `- ${md(w)}`).join("\n") || "已检查"}`,
    "### 验收目标",
    ...data.goals.map(
      (g) =>
        `- ${md(g.title)}：${STATUS_LABELS[g.status]}。验收：${md(g.acceptance)}；原因：${md(g.reason)} ${refsMd(g.evidenceIds)}`,
    ),
    "## 事件时间线",
    ...data.events.map(
      (e) =>
        `- ${md(e.at ?? "未记录")} · ${md(e.kind)} · ${md(e.summary)} ${refsMd(e.evidenceIds)}`,
    ),
    ...(!diagnostic && data.scoring.dimensions.some((d) => d.score !== null)
      ? [
          "## 评分卡",
          ...data.scoring.dimensions.map(
            (d) =>
              `- ${d.dimension}: ${d.score ?? "未评分"} / 10；${md(d.reason)} ${refsMd(d.evidenceIds)}`,
          ),
        ]
      : []),
    "## 问题复现",
    ...data.issues.map(
      (item) =>
        `### ${md(item.severity)} ${md(item.title)}\n\n${item.steps.map((step, i) => `${i + 1}. ${md(step)}`).join("\n")}\n\n预期：${md(item.expected)}\n\n实际：${md(item.actual)}\n\n建议：${md(item.recommendation)}\n\n${refsMd(item.evidenceIds)}`,
    ),
    "## 媒体",
    ...data.artifacts.map(
      (item) =>
        `${item.kind === "screenshot" ? "!" : ""}[${md(item.label)}](${mediaUrl(item.path)})`,
    ),
    "## 环境原始数据",
    `\`\`\`json\n${JSON.stringify({ source: data.source, apk: data.apk, device: data.device }, null, 2)}\n\`\`\``,
    "## 关联试玩",
    ...related.map(
      (r) => `- [${md(r.title)}](${r.reportPath}) · ${md(r.createdAt)} · ${md(r.caveat)}`,
    ),
    "## 限制",
    ...data.limitations.map((item) => `- ${md(item)}`),
  ].join("\n\n");
  await projections(directory, session);
  await atomicJson(join(directory, "report.json"), data);
  await atomicText(join(directory, "report.html"), html);
  await atomicText(join(directory, "report.md"), markdown);
  return {
    directory,
    html: join(directory, "report.html"),
    markdown: join(directory, "report.md"),
    json: join(directory, "report.json"),
    scoring: data.scoring,
    qualityWarnings: data.qualityWarnings,
  };
}
