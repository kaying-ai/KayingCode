# TapTap 日报数据源规范

状态：2026-11-16 已验证可用；v1 默认使用公开 Web API。

## 1. 边界

日报只采集 TapTap 公开页面/公开 Web API 的市场信息：

- 不登录、不携带用户 Cookie、不读取私有预约/收入/后台数据。
- 不做高频轮询；单次日报请求量约 50 次，请求间隔不低于 350ms。
- 不绕过验证码、风控或访问控制；接口失效时失败并告警，或改走人工导入。
- 接口是 TapTap Web 站内部接口，不是承诺稳定的开放平台 API；字段和路径变更必须通过 fixture 和解析阈值暴露。

随包的 `@taptap/instant-games-open-mcp` 只覆盖当前账号自有 App，不能提供全站榜单，不作为日报主数据源。

## 2. 通用请求

Base URL：`https://www.taptap.cn`

每个进程生成一个 UID，所有请求共享。`X-UA` 作为查询参数传递，值在 URL 中编码一次：

```text
V=1&PN=WebApp&LANG=zh_CN&VN_CODE=100000000&LOC=CN&PLT=PC&DS=Android&UID=<uuid>&OS=Linux&OSV=x86_64&DT=PC
```

必需请求头：

```text
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36
Referer: https://www.taptap.cn/top/download   # 日历请求用 /app-calendar
Accept: application/json
```

错误处理：

- HTTP 400 且 `error=invalid_xua`：换新 UID 重试一次。
- HTTP 429/5xx/网络错误：指数退避重试，最多 3 次。
- 其他 4xx：记录响应体后失败，不猜测字段。

### 2.1 Cloudflare Worker 代理（可选）

当报告服务器出口 IP 被 TapTap WAF 拦截时，collector 可以通过配套的 Cloudflare Worker 取数：

```sh
TAPTAP_PROXY_BASE_URL=https://taptap-proxy.opentaptap.dev
TAPTAP_PROXY_TOKEN=<与 Worker secret 一致>
```

请求形状：

```text
GET {TAPTAP_PROXY_BASE_URL}/fetch?path=<URL 编码的 TapTap path + query，含 X-UA>
Authorization: Bearer <TAPTAP_PROXY_TOKEN>
```

Worker 只允许：

- `/webapiv2/app-top/`
- `/webapiv2/calendar/`
- `/webapiv2/top/`

拒绝绝对 URL、`//host`、`..`、反斜杠、NUL 和非白名单路径。Worker 不转发 Cookie/登录态/请求体，不持久化数据，响应 `cache-control: no-store`。`workers_dev` 关闭，只暴露自定义域名，避免 `*.workers.dev` 在大陆被 DNS 污染。

snapshot 的 `source.proxyBaseUrl` 记录使用的代理域名；**token 不写入 snapshot、日志或报告**。401/400/403 直接失败；429/5xx/网络错误按原重试策略处理。Worker 不可用时仍可切回 `TAPTAP_DAILY_SOURCE=import` 人工兜底。

## 3. 三榜

路径：`/webapiv2/app-top/v2/hits`

| 榜单        | 参数                | 页面            |
| ----------- | ------------------- | --------------- |
| 下载/热门榜 | `type_name=hot`     | `/top/download` |
| 预约榜      | `type_name=reserve` | `/top/reserve`  |
| 热玩榜      | `type_name=pop`     | `/top/played`   |

分页：

- `limit` 最大 10；Top50 使用 `from=0,10,20,30,40` 五次请求。
- 响应 `data.total` 是总条数（热门榜当前为 150），`data.next_page` 可作分页提示，但采集器固定按 `from` 翻页，避免跟随可变 URL。

响应项：

```json
{
  "is_ad": false,
  "identification": "app:165287",
  "type": "app",
  "app": {
    "id": 165287,
    "identifier": "com.PigeonGames.Phigros",
    "title": "Phigros",
    "title_labels": ["测试"],
    "released_time": 1567220233,
    "tags": [{ "id": 632926, "value": "音游", "web_url": "/tag/%E9%9F%B3%E6%B8%B8" }],
    "stat": {
      "rating": { "score": "9.5" },
      "reserve_count": 49391,
      "hits_total": 57477110,
      "play_total": 140427,
      "review_count": 108673
    },
    "platform_info": { "supported_platforms": [{ "key": "android" }, { "key": "ios" }] },
    "icon": { "url": "..." },
    "description": { "text": "..." }
  }
}
```

采集器只保留日报需要的字段，不保存 `description`、`screenshots`、`banner` 等大字段。

## 4. 新游与发布事件（游戏日历）

路径：`/webapiv2/calendar/v1/event-list?day=<timestamp>`

`day` 是 `Date.UTC(reportDate)` 的秒级时间戳。例如 `2026-11-16` 使用 `1794787200`，与站点 SSR 的 `day` 参数一致。站点按北京时间的自然日归档事件，日期标签本身按 UTC 零点编码。

响应：

```json
{
  "data": {
    "game_total": 191,
    "list_a": [...],
    "list_b": [...],
    "list_c": [...]
  }
}
```

实测 2026-11-10 至 2026-11-16 每天 `game_total` 在 170–235 之间；`list_c` 承载绝大多数事件，采集器合并 `list_a/list_b/list_c`。

事件字段：

```json
{
  "id": 354592,
  "game_id": 802014,
  "event_type": 2,
  "sub_event_type": 4,
  "sub_event_type_title": "限量测试",
  "start_time": 1794798000,
  "end_time": 1795057200,
  "has_reservation": false,
  "reservation_type": 0,
  "landing_page_uri": "/app/802014",
  "app_card_info": {
    "id": 802014,
    "title": "代号：Closet",
    "title_labels": [],
    "tags": [{ "value": "换装" }, { "value": "模拟" }],
    "developers": [{ "type": "developer", "label": "厂商", "name": "船岛游戏" }],
    "released_time": 0,
    "expected_launch_time": "27年Q2",
    "stat": { "rating": { "score": "9.7" }, "reserve_count": 0 },
    "platform_info": { "supported_platforms": [{ "key": "android" }] },
    "icon": { "url": "..." }
  }
}
```

已观察到的 `sub_event_type_title` 与 `(event_type, sub_event_type)`：

| 标题       | 类型元组 | 日报分类        |
| ---------- | -------- | --------------- |
| 首发       | `(1,2)`  | release         |
| 预下载     | `(1,14)` | release-preload |
| 不限量测试 | `(2,6)`  | test            |
| 限量测试   | `(2,4)`  | test            |
| 测试招募   | `(2,3)`  | test            |
| 新游预约   | `(3,7)`  | reservation     |
| 新版本更新 | `(4,9)`  | update          |
| 折扣       | `(5,16)` | discount        |

分类采用标题关键字兜底：包含“首发/公测/上线”归为 release；包含“预约”归为 reservation；包含“测试/招募”归为 test；包含“更新/版本”归为 update；包含“折扣”归为 discount；其余为 other。

窗口：

- 新游发现：最近 7 个自然日（含报告日）内的 release 与 reservation 事件。
- 赛道发布供给：最近 30 个自然日内的 release 事件。
- 新开预约：最近 7 个自然日内的 reservation 事件。
- 同一游戏在同一窗口内只计一次；优先选择最早的 release 事件，没有 release 时使用最早的 reservation 事件。

补充接口：`/webapiv2/calendar/v1/top-events` 返回当前主推事件，可用于交叉核对，不作为统计口径。

## 5. 题材赛道

v1 使用固定 12 个赛道，标签多标签归并：

| 赛道 id     | 展示名       | 标签示例                                              |
| ----------- | ------------ | ----------------------------------------------------- |
| acgn        | 二次元       | 二次元、动漫、日系、美少女、抽卡、ACGN                |
| strategy    | 策略/SLG     | 策略、SLG、战棋、塔防、自走棋                         |
| card        | 卡牌         | 卡牌、集换式卡牌、CCG                                 |
| mmo         | MMO          | MMO、大型多人在线、多人在线、社交                     |
| management  | 模拟经营     | 模拟经营、经营、模拟、种田、建造                      |
| casual      | 休闲/益智    | 休闲、益智、解谜、消除、音乐、节奏、跑酷、派对        |
| shooter     | 射击         | 射击、FPS、TPS、枪战、战术竞技、搜打撤                |
| multiplayer | 竞技/MOBA    | 竞技、MOBA、多人对战、对战、大逃杀                    |
| open_world  | 开放世界/RPG | 开放世界、RPG、角色扮演、冒险、动作、ARPG、沙盒、生存 |
| independent | 独立游戏     | 独立游戏、独立、Roguelike、像素、单机                 |
| minigame    | 小游戏       | 小游戏、小程序、TapTap制造、网页游戏                  |
| other       | 其他         | 未命中以上任何标签                                    |

匹配规则：先匹配更具体的赛道（如“二次元”优先于“角色扮演”），一个游戏可命中多个赛道；多标签会同时计入多个赛道的供给。未命中任何标签计入 `other`。映射表版本随插件版本发布。

## 6. 人工导入

目录：`data/daily/<date>/import/`

- `boards.json`：`{ "download": [...], "reserve": [...], "pop": [...] }`，数组元素至少包含 `appId/title/tags/rank`。
- `calendar.json`：`{ "events": [...] }` 或事件数组，元素字段与 `event-list` 采集后的规范化事件一致。
- 也支持 `boards.csv` 与 `calendar.csv`；CSV 使用逗号分隔、双引号转义，`tags`/`developers` 用 `|` 分隔。

导入模式必须显式指定 `--source import`；不会在采集失败时自动回退，避免把旧数据伪装成当日数据。

## 7. 证据与质量

每条榜单项与日历事件记录：

- `sourceUrl`：`https://www.taptap.cn/app/<appId>`。
- `eventId`（日历）或榜单名+名次（榜单）。
- `capturedAt`。
- 原始响应的相对路径与 SHA-256（`raw/`）。

质量阈值：

- 三榜全部失败：本轮失败。
- 单榜少于 30 条：标记 degraded，报告展示缺失说明。
- 日历可用天数少于 20 天（30 日窗口）：标记 degraded；少于 7 天：本轮失败。
- 任一来源解析异常率超过 10%：本轮失败。
- 所有数字必须来自 snapshot；禁止用模型补全缺失数字。
