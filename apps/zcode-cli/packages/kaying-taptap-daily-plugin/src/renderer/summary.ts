import type { RenderContext } from "./context.js";
import { crowdingLabel } from "./format.js";

export function resolveSummary(ctx: RenderContext): string[] {
  if (ctx.insights.summary.length > 0) return ctx.insights.summary;
  const { metrics } = ctx;
  const topBoard = metrics.boards.download.items.slice(0, 3).map((item) => item.title);
  const topTrack = [...metrics.genres]
    .filter((genre) => genre.crowding.score !== null)
    .sort((a, b) => (b.crowding.score ?? 0) - (a.crowding.score ?? 0))[0];
  return [
    `近 7 日 TapTap 首发 ${metrics.newGames.releases7d} 款，新开预约 ${metrics.newGames.reservations7d} 款，测试 ${metrics.newGames.tests7d} 款。`,
    topBoard.length > 0
      ? `下载/热门榜前三：${topBoard.join("、")}。`
      : "下载/热门榜本轮无可用数据。",
    topTrack
      ? `赛道拥挤度最高：${topTrack.label}（${topTrack.crowding.score}，${crowdingLabel(topTrack.crowding.level)}）。`
      : "赛道拥挤度数据不足。",
  ];
}
