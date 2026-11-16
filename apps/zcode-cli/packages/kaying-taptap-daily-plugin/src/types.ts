export const REPORT_TIMEZONE = "Asia/Shanghai" as const;
export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const METRICS_SCHEMA_VERSION = 1 as const;

export const BOARDS = [
  {
    id: "download",
    label: "下载/热门榜",
    typeName: "hot",
    webPath: "/top/download",
    referer: "https://www.taptap.cn/top/download",
  },
  {
    id: "reserve",
    label: "预约榜",
    typeName: "reserve",
    webPath: "/top/reserve",
    referer: "https://www.taptap.cn/top/reserve",
  },
  {
    id: "pop",
    label: "热玩榜",
    typeName: "pop",
    webPath: "/top/played",
    referer: "https://www.taptap.cn/top/played",
  },
] as const;

export type BoardId = (typeof BOARDS)[number]["id"];

export const BOARD_LABELS: Record<BoardId, string> = {
  download: "下载/热门榜",
  reserve: "预约榜",
  pop: "热玩榜",
};

export type EventCategory =
  | "release"
  | "release-preload"
  | "test"
  | "reservation"
  | "update"
  | "discount"
  | "other";

export interface TapTapTag {
  id?: number;
  value: string;
  webUrl?: string;
}

export interface GameRecord {
  appId: number;
  identifier: string | null;
  title: string;
  tags: string[];
  developers: string[];
  rating: number | null;
  reserveCount: number;
  hitsTotal: number;
  playTotal: number;
  releasedTime: number | null;
  expectedLaunchTime: string | null;
  iconUrl: string | null;
  platforms: string[];
  sourceUrl: string;
}

export interface BoardItem extends GameRecord {
  rank: number;
  rankChange: number | null;
  isAd: boolean;
}

export interface BoardSnapshot {
  id: BoardId;
  label: string;
  total: number | null;
  degraded: boolean;
  items: BoardItem[];
}

export interface CalendarEvent extends GameRecord {
  eventId: number;
  eventDate: string;
  eventType: number;
  subEventType: number;
  subEventTypeTitle: string;
  category: EventCategory;
  startTime: number | null;
  endTime: number | null;
  evidenceId: string;
}

export interface Evidence {
  id: string;
  url: string;
  capturedAt: string;
  kind: "board" | "calendar";
  rawFile?: string;
  rawSha256?: string;
}

export interface Warning {
  code: string;
  message: string;
  details?: unknown;
}

export interface Snapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  reportDate: string;
  capturedAt: string;
  timezone: typeof REPORT_TIMEZONE;
  source: {
    kind: "web" | "import";
    adapter: "http" | "import";
    baseUrl: string;
    capturedAt: string;
    /** Cloudflare Worker proxy origin when the server's direct egress is blocked. */
    proxyBaseUrl?: string;
  };
  boards: Record<BoardId, BoardSnapshot>;
  calendar: {
    windowDays: number;
    fromDate: string;
    toDate: string;
    daysAvailable: number;
    gameTotal: number;
    degraded: boolean;
    events: CalendarEvent[];
  };
  warnings: Warning[];
  evidence: Evidence[];
  contentHash: string;
}

export interface BoardMembership {
  board: BoardId;
  rank: number;
  rankChange: number | null;
}

export interface BoardUnionItem extends GameRecord {
  boards: BoardMembership[];
}

export interface GenreTrack {
  id: string;
  label: string;
  keywords: string[];
}

export const GENRE_TRACKS: GenreTrack[] = [
  {
    id: "acgn",
    label: "二次元",
    keywords: ["二次元", "动漫", "日系", "美少女", "抽卡", "acgn", "galgame", "乙女"],
  },
  {
    id: "strategy",
    label: "策略/SLG",
    keywords: ["策略", "slg", "战棋", "塔防", "自走棋", "即时战略", "rts", "4x"],
  },
  {
    id: "card",
    label: "卡牌",
    keywords: ["卡牌", "集换式卡牌", "ccg", "tcg", "构筑"],
  },
  {
    id: "mmo",
    label: "MMO",
    keywords: ["mmo", "大型多人在线", "多人在线", "社交", "帮会", "国战"],
  },
  {
    id: "management",
    label: "模拟经营",
    keywords: ["模拟经营", "经营", "模拟", "种田", "建造", "家园", "农场"],
  },
  {
    id: "casual",
    label: "休闲/益智",
    keywords: ["休闲", "益智", "解谜", "消除", "音乐", "节奏", "跑酷", "派对", "拼图", "合成"],
  },
  {
    id: "shooter",
    label: "射击",
    keywords: ["射击", "fps", "tps", "枪战", "战术竞技", "搜打撤", "弹幕"],
  },
  {
    id: "multiplayer",
    label: "竞技/MOBA",
    keywords: ["竞技", "moba", "多人对战", "对战", "大逃杀", "吃鸡", "非对称对抗"],
  },
  {
    id: "open_world",
    label: "开放世界/RPG",
    keywords: ["开放世界", "rpg", "角色扮演", "冒险", "动作", "arpg", "沙盒", "生存", "地牢"],
  },
  {
    id: "independent",
    label: "独立游戏",
    keywords: ["独立游戏", "独立", "roguelike", "rogue", "像素", "单机", "叙事"],
  },
  {
    id: "minigame",
    label: "小游戏",
    keywords: ["小游戏", "小程序", "taptap制造", "网页游戏", "h5", "云游戏"],
  },
  {
    id: "other",
    label: "其他",
    keywords: [],
  },
];

export type GenreId = (typeof GENRE_TRACKS)[number]["id"];

export interface CrowdingComponents {
  supply: number | null;
  list: number | null;
  reservation: number | null;
}

export interface Crowding {
  score: number | null;
  level: "low" | "medium" | "high" | "unknown";
  components: CrowdingComponents;
  note?: string;
}

export interface GenreTopGame {
  appId: number;
  title: string;
  eventDate: string;
  category: EventCategory;
  reserveCount: number;
  rating: number | null;
  sourceUrl: string;
  evidenceId: string;
}

export interface GenreBoardGame {
  appId: number;
  title: string;
  rank: number;
  rankChange: number | null;
  sourceUrl: string;
}

export interface GenreMetric {
  id: GenreId;
  label: string;
  newGames7d: number;
  newGames30d: number;
  newReservations7d: number;
  boardCount: number;
  boardShare: number;
  crowding: Crowding;
  topNewGames: GenreTopGame[];
  boardTopGames: GenreBoardGame[];
}

export interface NewGameSummary {
  releases7d: number;
  reservations7d: number;
  tests7d: number;
  uniqueGames7d: number;
  topReleases: CalendarEvent[];
  topReservations: CalendarEvent[];
}

export interface Metrics {
  schemaVersion: typeof METRICS_SCHEMA_VERSION;
  reportDate: string;
  generatedAt: string;
  snapshotHash: string;
  boards: Record<BoardId, BoardSnapshot>;
  boardUnion: BoardUnionItem[];
  newGames: NewGameSummary;
  genres: GenreMetric[];
  counts: {
    release7d: number;
    release30d: number;
    reservation7d: number;
    test7d: number;
    update7d: number;
    discount7d: number;
  };
  previousReportDate: string | null;
  warnings: Warning[];
  dataQuality: "ok" | "degraded";
}

export interface NewGameInsight {
  appId: number;
  title: string;
  oneLiner: string;
  audience: string;
  comparables: { title: string; reason: string }[];
  signals: { label: string; value: string; evidenceIds: string[] }[];
  risks: string[];
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
}

export interface BoardInsight {
  board: BoardId;
  summary: string;
  movers: string[];
  crossBoard: string[];
  evidenceIds: string[];
}

export interface TrackInsight {
  genreId: string;
  crowdingLevel: "low" | "medium" | "high" | "unknown";
  rationale: string;
  notableGames: { appId: number; title: string; reason: string; evidenceIds: string[] }[];
  opportunities: string[];
  risks: string[];
  evidenceIds: string[];
}

export interface Opportunity {
  text: string;
  kind: "fact" | "inference";
  evidenceIds: string[];
}

export interface InsightsDraft {
  summary: string[];
  newGames: NewGameInsight[];
  boards: BoardInsight[];
  tracks: TrackInsight[];
  opportunities: Opportunity[];
  risks: Opportunity[];
  dataNotes: string[];
}

export interface Insights extends InsightsDraft {
  schemaVersion: 1;
  generatedAt: string;
}

export interface Verdict {
  id: string;
  holds: boolean;
  note: string;
}
