import { join } from "node:path";
import { confined, loadSession } from "./io.mjs";
import { applyReview } from "./session-updates.mjs";
import { generateReport } from "./report.mjs";

export async function reportSession(runtime, args, ws, session, directory) {
  if (args.reportKind) session.reportKind = args.reportKind;
  if (args.review) applyReview(session, args.review, args.reviewMode ?? "merge", runtime.now());
  const related = [];
  const ids = args.relatedSessionIds ?? session.relatedSessionIds ?? [];
  for (const id of new Set(ids)) {
    if (id === session.id) throw new Error("Cannot relate session to itself");
    const { session: other } = await loadSession(ws, id);
    related.push({
      sessionId: other.id,
      title: other.title,
      createdAt: other.createdAt,
      source: other.source,
      apkSha256: other.apk?.sha256 ?? null,
      device: other.device,
      actions: other.actions.length,
      events: other.events.length,
      reportPath: `../${id}/report.html`,
      caveat: "仅关联历史来源，不合并评分或把旧证据计入本轮。设备、版本、进度可能不同。",
    });
  }
  session.relatedSessionIds = [...new Set(ids)];
  for (const item of session.artifacts) await confined(directory, join(directory, item.path));
  await runtime.save(directory, session);
  return generateReport(directory, session, runtime.now(), related);
}
