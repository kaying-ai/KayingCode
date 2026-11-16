import type { BoardItem, BoardSnapshot, Evidence, Warning } from "../types.js";
import { BOARDS } from "../types.js";
import { TapTapHttpClient } from "./httpTransport.js";
import { normalizeApp, type RawHitsData } from "./normalize.js";

export type BoardDefinition = (typeof BOARDS)[number];

export interface BoardFetchResult {
  snapshot: BoardSnapshot;
  evidence: Evidence[];
  warnings: Warning[];
}

const PAGE_SIZE = 10;

export async function fetchBoard(
  client: TapTapHttpClient,
  board: BoardDefinition,
  limit: number,
  capturedAt: string,
): Promise<BoardFetchResult> {
  const items: BoardItem[] = [];
  const evidence: Evidence[] = [];
  const warnings: Warning[] = [];
  const seen = new Set<number>();
  let total: number | null = null;
  let rank = 1;

  for (let from = 0; from < limit; from += PAGE_SIZE) {
    let response;
    try {
      response = await client.getJson<RawHitsData>(
        "/webapiv2/app-top/v2/hits",
        { type_name: board.typeName, from, limit: PAGE_SIZE },
        board.referer,
      );
    } catch (error) {
      warnings.push({
        code: "board_page_failed",
        message: `${board.label} 第 ${from / PAGE_SIZE + 1} 页采集失败`,
        details: { board: board.id, from, error: String(error) },
      });
      break;
    }

    if (total === null && typeof response.data.total === "number") {
      total = response.data.total;
    }
    const list = response.data.list ?? [];
    if (list.length === 0) break;

    for (const rawItem of list) {
      if (rawItem.is_ad) continue;
      if (rawItem.type && rawItem.type !== "app") {
        warnings.push({
          code: "board_item_not_app",
          message: `${board.label} 出现非 app 条目，已跳过`,
          details: { board: board.id, type: rawItem.type, identification: rawItem.identification },
        });
        continue;
      }
      const record = normalizeApp(rawItem.app);
      if (!record) {
        warnings.push({
          code: "board_item_invalid",
          message: `${board.label} 存在缺少 id/title 的条目，已跳过`,
          details: { board: board.id, identification: rawItem.identification },
        });
        continue;
      }
      if (seen.has(record.appId)) continue;
      seen.add(record.appId);
      items.push({ ...record, rank, rankChange: null, isAd: false });
      evidence.push({
        id: `app:${record.appId}`,
        url: record.sourceUrl,
        capturedAt,
        kind: "board",
        ...(response.rawFile ? { rawFile: response.rawFile } : {}),
        rawSha256: response.rawSha256,
      });
      rank += 1;
      if (items.length >= limit) break;
    }
    if (items.length >= limit || list.length < PAGE_SIZE) break;
  }

  const degraded = items.length < 30;
  if (degraded) {
    warnings.push({
      code: "board_degraded",
      message: `${board.label} 仅采集到 ${items.length} 条`,
      details: { board: board.id, count: items.length },
    });
  }

  return {
    snapshot: {
      id: board.id,
      label: board.label,
      total,
      degraded,
      items,
    },
    evidence,
    warnings,
  };
}
