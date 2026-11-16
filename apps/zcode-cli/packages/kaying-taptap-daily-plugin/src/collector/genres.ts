import { GENRE_TRACKS, type GenreId, type GenreTrack } from "../types.js";

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "");
}

export function trackKeywords(track: GenreTrack): string[] {
  return track.keywords.map(normalizeTag).filter(Boolean);
}

/**
 * 标签多标签归并：先匹配更具体的赛道，一个游戏可命中多个赛道。
 * 未命中任何标签时归入 other；other 的 keywords 为空，单独兜底。
 */
export function classifyGenres(tags: string[]): GenreId[] {
  const normalized = tags.map(normalizeTag).filter(Boolean);
  const matched: GenreId[] = [];
  for (const track of GENRE_TRACKS) {
    if (track.id === "other") continue;
    const keywords = trackKeywords(track);
    if (keywords.some((keyword) => normalized.some((tag) => tag.includes(keyword)))) {
      matched.push(track.id as GenreId);
    }
  }
  return matched.length > 0 ? matched : ["other"];
}

export function genreLabel(id: string): string {
  return GENRE_TRACKS.find((track) => track.id === id)?.label ?? id;
}

export function genreIdSet(): GenreId[] {
  return GENRE_TRACKS.map((track) => track.id as GenreId);
}
