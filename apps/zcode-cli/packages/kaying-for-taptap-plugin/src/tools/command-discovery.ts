/** Weighted natural-language discovery shared by executable and pipeline command catalogs. */

interface DiscoveryFields {
  id: string;
  domain: string;
  description: string;
}

interface RankedEntry<T> {
  entry: T;
  score: number;
}

const CONCEPT_ALIASES: Array<{ signals: string[]; terms: string[] }> = [
  { signals: ["素材", "资源", "asset", "texture", "sprite"], terms: ["asset", "image"] },
  { signals: ["场景", "关卡", "scene", "level"], terms: ["scene", "world"] },
  {
    signals: ["角色", "玩家", "敌人", "物体", "player", "enemy"],
    terms: ["gameobject", "gameplay"],
  },
  { signals: ["界面", "按钮", "菜单", "摇杆", "ui", "hud", "joystick"], terms: ["ui"] },
  {
    signals: ["碰撞", "刚体", "跳跃", "physics", "collision"],
    terms: ["physics", "collider", "rigidbody"],
  },
  { signals: ["动画", "animation", "timeline"], terms: ["animation"] },
  { signals: ["声音", "音乐", "音效", "audio", "music"], terms: ["audio"] },
  { signals: ["特效", "粒子", "vfx", "particle"], terms: ["vfx"] },
  { signals: ["地图", "地形", "tile", "terrain", "world"], terms: ["world"] },
  { signals: ["存档", "配置", "本地化", "save", "config", "locale"], terms: ["data"] },
  { signals: ["网络", "联机", "多人", "network", "multiplayer"], terms: ["network"] },
  { signals: ["游戏", "状态机", "任务", "对话", "玩法", "gameplay", "quest"], terms: ["gameplay"] },
  { signals: ["预览", "截图", "capture", "preview"], terms: ["capture", "runtime"] },
  { signals: ["诊断", "报错", "性能", "debug", "profile"], terms: ["debug"] },
  { signals: ["构建", "发布", "build", "publish"], terms: ["build", "maker"] },
];

export function rankDiscovery<T>(
  entries: T[],
  query: string | undefined,
  fields: (entry: T) => DiscoveryFields,
): T[] {
  const normalizedQuery = normalize(query ?? "");
  if (!normalizedQuery) return entries;
  const terms = expandTerms(normalizedQuery);
  return entries
    .map(
      (entry): RankedEntry<T> => ({
        entry,
        score: scoreEntry(fields(entry), normalizedQuery, terms),
      }),
    )
    .filter((ranked) => ranked.score > 0)
    .sort((a, b) => b.score - a.score || fields(a.entry).id.localeCompare(fields(b.entry).id))
    .map((ranked) => ranked.entry);
}

function scoreEntry(fields: DiscoveryFields, query: string, terms: string[]): number {
  const id = normalize(fields.id);
  const domain = normalize(fields.domain);
  const description = normalize(fields.description);
  let score = id === query ? 200 : id.includes(query) ? 80 : 0;
  let matched = 0;
  for (const term of terms) {
    let termScore = 0;
    if (id.split(" ").includes(term)) termScore = 30;
    else if (id.includes(term)) termScore = 20;
    if (domain === term) termScore = Math.max(termScore, 24);
    else if (domain.includes(term)) termScore = Math.max(termScore, 14);
    if (description.includes(term)) termScore = Math.max(termScore, 6);
    if (termScore > 0) matched += 1;
    score += termScore;
  }
  if (matched > 1) score += matched * 5;
  return score;
}

function expandTerms(query: string): string[] {
  const terms = query.split(" ").filter((term) => /^[a-z0-9]+$/.test(term) && term.length > 1);
  for (const concept of CONCEPT_ALIASES) {
    if (concept.signals.some((signal) => query.includes(normalize(signal)))) {
      terms.push(...concept.terms);
    }
  }
  return [...new Set(terms)];
}

function normalize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
