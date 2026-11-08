# 运行时闭环：KayingCode 远端优先，本地 runtime 只兜底

**这一页是整条流程里最容易被跳过、也最贵的一步——所以更不能天天跑。**

> **先分清两种模式**（细节见 SKILL.md 0.0.1）：
>
> - **代码转换（默认）**：阶段内连续写码/转数据，廉价检查（`t3m lint`、纯逻辑 wasmoon/Node 对拍）随时做；
> - **阶段性验证**：只在 first-publish 基线、新 API 探针、步骤完成标志要画面/运行时证据、最终验收
>   这些检查点跑完整闭环（publish → prepare → 双 guest → compare + 远端 rlog）。
>
> 把闭环当成“改一处就验一次”的开发循环会白白烧掉大量时间。阶段验证失败时批量修根因，再进入下一轮。

实测代价：一次 frog-crossing 转写通过了 LSP 静态检查（0 error）、`t3m lint`（0 高危）、
远端构建（成功）、关卡逐位一致、绕序/包围盒数值自检——然后游戏**一启动就崩**，
连着修了 6 个"一启动/逐帧崩"级别的 bug 才真正跑起来，之后画面又来回修了 3 轮。
这些 bug 静态检查**一个都看不见**，因为它们全是运行时的 nil 调用、渲染路径错误与 API 语义错误。

> 结论：**没有同 revision 的真实运行时日志和画面，就没有验收资格。** KayingCode 中这些证据默认来自
> 官方 Maker publication、publication runtime log 和右侧双 guest；本地 runtime 只是远端证据不足时的兜底。

## 0 先选运行时路径

KayingCode Desktop 本地工作区同时有 `prepare_visual_comparison` 与 Browser Use 时，直接选
`kayingcode-side-pane`；不执行下面的本地 preview 安装、启动、刷新、日志查找或窗口截图。只有 publish、prepare、
精确 guest pair 或 guest 加载明确失败，且远端错误与 publication runtime log 不足以定位时，才记录
`visual_review_mode=local-runtime-fallback` 并进入本地流程。

“转写对比”与“TapTap 游戏预览”不是两个可互换入口：本页服务于网页游戏转写，所以只使用“转写对比”。
“TapTap 游戏预览”只用于没有原版 source 基准的普通 Maker 开发、QA 和视觉修复；转写时即使它已打开也不得选择。

## 1 降级时检查本机 runtime

```bash
t3m doctor
```

会打印：本机 `~/.taptap-maker/mcp-runtime/<版本>/dist/maker.js`、是否支持 `preview` 命令族、
`maker-lua-lsp`、ImageMagick、node/curl。`preview` 命令族需要 **maker 0.0.34+**（0.0.33 只有远端构建）。

## 2 降级时把游戏跑起来

```bash
M="$HOME/.taptap-maker/mcp-runtime/0.0.34/dist/maker.js"      # 用 t3m doctor 打印的真实路径
node "$M" preview install --target-dir <dest>     # 首次：准备 runtime（之后可跳过）
node "$M" preview start   --target-dir <dest>     # 启动本地 runtime
node "$M" preview logs    --target-dir <dest>     # 拉日志（也可以直接读文件，见下）
node "$M" preview check   --target-dir <dest>     # 进程级健康检查
node "$M" preview stop    --target-dir <dest>
```

- Git Bash 下把路径写成 `C:/Users/...` 形式，不要用 `/c/Users/...`。
- `--json` 给结构化输出，便于脚本判定。
- `preview check` 的 `result` 会把**引擎级**缺失（`Cube/Day/DaySpecularHDR.dds`、`themis_x64.dll`）
  算成 failure —— 任何工程都这样，别当成自己的 bug。
- `preview refresh` 会重启 runtime，偶发把刚起来的进程收尾杀掉（`status` 变 failed、日志停在首帧着色器编译）。
  不确定时用 `stop` → 等几秒确认无残留 → `start`。

## 3 日志在哪

| 场景     | 路径                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 本地预览 | `~/.taptap-maker/preview/<hash>/sessions/<session>/<reload>/runtime.log` |
| 远端构建 | `<dest>/.maker/logs/runtime/runtime.log`                                 |

`<hash>` 不要猜：读该目录下的 `session.json`，里面的 `project_realpath` 就是工程路径。
日志行有两种形态：纯文本 `[时间][帧号] LEVEL: 消息`，或包了一层的 `{"cursor":N,"text":"..."}`。

## 4 日志分类：`t3m rlog`

```bash
t3m rlog <dest>            # 默认找最新一次本地预览的日志
t3m rlog <dest> --json
t3m rlog <dest> --dir <会话目录或某个 runtime.log>   # 排查历史记录时用
t3m rlog <dest> --dir <dest>/.maker/logs/runtime/runtime.log # KayingCode 默认：显式分类远端发布日志
```

它把每一行分成三类，并给出裁决：

- **Lua errors（必须 0）**：`attempt to …`、`.lua:<行号>:`、stack traceback、PANIC；
- **missing project resources（必须 0）**：`Could not find resource <工程 assets 下该有的路径>`；
- **engine-package noise（忽略）**：`Cube/Day/…`、`themis_x64.dll`、`<official-res>/…`、`<engine-res>/…`。

另外：**日志比代码旧 → 判失败**（说明改完没重跑）。退出码 1 = 不通过，可以当 CI 门禁。

## 5 KayingCode 的阶段性验证循环（只在检查点跑）

**触发前提**：已到达 SKILL.md 0.0.1 的某一检查点（first-publish / 新 API 探针 / 步骤完成标志 / 卡住定位 / 最终验收）。
阶段内日常转写**不**走本循环——只做廉价检查，把改动攒到检查点。

1. **批量改完一类根因**（几何 / 光照 / UI / 输入），阶段内可连做多类修改；验证失败先集中修根因，不要逐次微调重试。
2. `t3m lint <dest>` → 高风险 0。
3. 用官方 Maker MCP 发布，立即调用 `prepare_visual_comparison`。
4. 读取该 publication 返回的 `runtime_logs.local_file`，用 `t3m rlog <dest> --dir <远端 runtime.log>` 分类；这不会启动本地 runtime。
5. 在右侧 source/target guest 进入同一检查点，串行截图并执行 `t3m compare`。
6. 每步 `t3m mark project-info.json <阶段>`，别攒到最后；通过后回到代码转换推进下一步。

**观测手段**：需要知道"代码跑到哪了"就 `print("[阶段] xxx")`（日志里能看到）；需要知道"某个值对不对"
就打印一次数值。别用"改完猜、猜完再改"的方式调画面。

## 6 本地 runtime 兜底

在 KayingCode Desktop 中，只要工具清单存在 `prepare_visual_comparison` 和 Browser Use，就先选择
`kayingcode-side-pane`，并按 [visual-compare.md](visual-compare.md) 使用双预览 guest。原版与 TapTap 使用 receipt
的同一 viewport 串行截图，再交给 `t3m compare`。这条路径会保留原始 PNG、diff 与 metrics，比系统全屏截图更可复核。

每次阶段性验证的 Maker publish 成功后，下一项外部动作都必须是 `prepare_visual_comparison`。如果面板仍绑定旧
comparison receipt，先 prepare 当前 publication revision；旧 receipt、旧 guest、旧截图都不得验证新代码，旧 receipt
也不得触发 LocalRuntime。

第一次发布由客观门禁触发：绑定文件存在、原版 playable URL 已确认、`t3m lint dest` PASS。源码本地化后
立即创建空项目并打开对比面板，空骨架即满足门禁时就发布，不要等内容铺完。这一门禁
不依赖本地 preview 或 `t3m rlog`。三项成立后，下一组外部动作必须连续执行 publish → prepare；receipt 成功前
不得继续普通探针或功能实现，画面尚未完整不是延后理由。高风险清单与修复取舍自动推进，非必要不人工确认。
此时不要通过 `osascript`、PowerShell、ImageMagick 或其他系统截图工具触发或观察本地 runtime。

comparison receipt 成功且双 guest 可用后，**阶段性验证检查点**固定执行修改 → Maker publish → `prepare_visual_comparison` → 双 guest 取证。
（修改可批量；阶段内不要逐次发布。）不得再执行本地 `preview stop/start`、`t3m rlog` 或本地窗口截图。只有远端 publish/preview 明确失败且远端错误不足以定位，且 publication runtime log 也不足以定位时，
才按下面的系统截图流程降级，记录失败原因，并明确标记；官方工具报错时不得绕过插件读取 PAT 再直接调用 Maker CLI；不得复制 `pat.json`、`tap-auth.json`。
`visual_review_mode=local-runtime-fallback` 与“双预览未执行”。能力恢复后下一轮回到 side-pane。
也就是说，双 guest/发布明确失败且远端证据不足时才允许进入降级分支，不能把本地 runtime 当作首次或每轮默认验证。

side-pane 模式中，未指定远端日志文件 `--dir <dest>/.maker/logs/runtime/runtime.log` 的 `t3m rlog <dest>` 可能命中
本地历史 session，禁止调用。未指定 `--dir` 的 rlog 即使报告 stale/缺日志，也不得作为降级证据；应先 prepare 当前
revision，并检查当前 publication 的显式远端 runtime log 与精确 guest pair。只有当前 revision 的 publish、prepare、
guest pair 或 guest 加载明确失败，且远端 runtime log 仍不足以定位时，才允许本地降级。降级记录必须包含失败的
operation/revision、失败步骤与具体原因。

本地基础预览常报 `screenshots_supported: false`（只能看进程与日志）。这时用系统截屏：

```bash
M="/c/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"

# 1) 先把游戏窗口切到前台，否则截到的是别的窗口（实测踩过）
powershell.exe -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::AppActivate((Get-Process UrhoXRuntime).Id)"

# 2) 全屏截图 + 裁到画布区域
"$M" screenshot: -crop 1272x792+8+8 +repage /tmp/now.png

# 3) 取点 / 区域统计（对齐亮度靠这个，不靠肉眼）
"$M" /tmp/now.png -format "%[pixel:p{700,400}]" info:
"$M" /tmp/now.png -crop 400x200+500+400 +repage -format "%[fx:mean]" info:

# 4) 找"某颜色到底有没有出现"（例如探针用的洋红）
"$M" /tmp/now.png -colorspace RGB -fx "(r>0.45&&g<0.45&&b>0.45)?1:0" -format "%[fx:mean]" info:
```

原版对照：用浏览器打开原版游戏页（游戏常在 iframe 里，等页面加载完再截），
按 [acceptance.md](acceptance.md) 的裁剪区域取中位亮度，与转写版比对（差 <15% 为合格）。

## 7 引擎 API 探针法（省时间的关键）

准备走一条**新的引擎 API 路径**时（自定义几何上传、surface shader、UI 根面板、逐实例染色、
灯组、拾取），先用 5~20 行最小探针在当前运行时路径里验证它；KayingCode 中就是新发布的 target guest 与 publication runtime log：

- 探针 = "挂一个肉眼可见/日志可查的东西"（一个洋红色方块、一次 `print`），
- 确认它在**画面**或日志里出现，再把这条路径铺到全项目。

为什么必须这样：这一类失败的模式是"**数据全对、画面全无**"——几何有效、包围盒有值、
`StaticModel.inView = true`、日志干净，但屏幕上什么都没有。历史上最贵的三个坑
（CustomGeometry 三角形顺序、FillModel 包围盒、Model 建在目标子树里，见 pitfalls D）都是这个形态，
靠读代码是读不出来的。

## 8 需要交互的路径：让代码自己跑到那一步

"点开始→进关→过关→换屏"这类路径不要等人点：

- 临时在 `Start()` 或 `Update` 里直接调用（进关、连续换屏 title→play→map→shop→title），
- 或用合成输入驱动（`input` 事件 / UI 按钮回调直接调），
- 验完删掉探针：`grep -rn "TEMP" scripts/` 自查干净再交付。

## 9 纯逻辑先用真 Lua 验（不依赖画面）

把不依赖渲染的模块（关卡、规则、求解器）丢进 wasmoon（真 Lua 5.4）跑，与**原版 JS 在 Node 里跑**
的结果做逐字段 diff。这一步能在没有任何画面的情况下证明"规则对等"，把逻辑问题和渲染问题分开定位。
实测：120 关 + 200 行无尽逐位一致；之后画面出问题时，可以放心排除"规则转写错了"。

## 10 交付前的运行时底线

- [ ] KayingCode 中同 revision 的远端 publication runtime log 经 `t3m rlog <dest> --dir <remote-log>` 分类后 PASS
- [ ] `t3m lint <dest>` → 高风险 0
- [ ] KayingCode 中至少一组右侧双 guest 同 viewport 截图并与原版做过像素统计；只有明确降级时才接受本机 runtime 系统截图
- [ ] 记录产物：远端 `runtime_log`、target guest `screenshot`、`pixel_stats`；KayingCode 双预览还要记录五个 `compare_*` artifact
- [ ] `t3m mark project-info.json accept`（缺 runtime_log / maker_url 会被拒绝，这是有意的）
- [ ] 探针与临时代码已清除（`grep TEMP` / 检查 `Start()` 里的自驱代码）
