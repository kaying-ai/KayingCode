# 验收清单与量化方法

## 一、量化对齐（不要靠肉眼）

在 KayingCode 中，从首个可发布视觉检查点开始就优先使用 [visual-compare.md](visual-compare.md) 的双 WebView
与 `t3m compare` 证据链，并读取同 revision 的远端 publication runtime log。side-pane 可用时不启动本地 runtime。
只有 publish/prepare/guest 明确失败，且远端错误与 publication runtime log 不足以定位时，才允许记录原因与
`visual_review_mode=local-runtime-fallback` 后启动本地 runtime；系统截图仅在双预览明确失败后兜底并记录原因。
下面的 Python 片段只保留为旧环境的亮度诊断手段，不能替代同尺寸原始 PNG、diff 与结构化 metrics。

画面"差不多"和"对上了"的区别，靠像素统计判定：

```python
# 对比原版截图与转写版截图（裁剪掉 UI 条带，只比棋盘区域）
from PIL import Image
def stats(path):
    im = Image.open(path).convert("RGB"); W, H = im.size
    px = list(im.crop((int(W*.15), int(H*.25), int(W*.85), int(H*.80))).getdata())
    n = len(px)
    mr = sum(p[0] for p in px)/n; mg = sum(p[1] for p in px)/n; mb = sum(p[2] for p in px)/n
    lum = sorted(0.2126*p[0]+0.7152*p[1]+0.0722*p[2] for p in px)
    print(f"mean=({mr:.1f},{mg:.1f},{mb:.1f}) L p50={lum[int(n*.5)]:.1f}")
```

判定标准（实测校准过）：

| 指标           | 合格                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| 均值 RGB       | 与原版每通道差距 < 15%                                                                            |
| 中位亮度 L p50 | 差距 < 15%                                                                                        |
| 色相           | 三通道**比例**一致（例：原版 `(166,106,58)`，转写 `(147,94,57)` 属合格；`(67,42,25)` 属明显偏暗） |

偏暗/偏亮时段在哪一层：

1. 先导出**纹理像素**（`Image:SavePNG`）确认贴图内容正确；
2. 再打印**材质取值**（`MatDiffColor/MatSpecColor/Metallic/Roughness`）确认材质正确；
3. 两者都对 → 问题在**光照标定**（环境光是否生效、镜面 F0、色调映射差异）。

这三步能把"画面不对"收敛到一个明确层，避免乱调。

## 二、逐条走查（17 项）

- [ ] **启动干净**：日志只有引擎层提示（HDR 贴图/dll），无 Lua 报错
- [ ] **布局同向**：第 1 关玩家在左、目标在右（与原版一致）
- [ ] **手感正确**：按右往右走，滑动方向一致；角色朝向与行进方向一致
- [ ] **亮度对齐**：棋盘区域中位亮度与原版差距 < 15%
- [ ] **镜面正常**：掠射角的地面/台板不泛白（`MatSpecColor ≈ 0.04`）
- [ ] **环境光生效**：把太阳亮度调 0 后画面仍有均匀底光（`ambientSource = AMBIENT_COLOR`）
- [ ] **贴图方向正确**：箱面图案不旋转（UV 同源），木板/砖缝可见
- [ ] **五种机关**：冰面滑行、压力板闸门、滑槽传送、坑填埋、传送带各跑一关
- [ ] **核心循环**：推箱、无限撤销、重开、提示（求解器）、过关星级与金币
- [ ] **所有换屏不卡死**：开始 / 下一关 / 再玩 / 关卡地图 / 暂停 / 设置 / 工坊 / 每日
- [ ] **触屏布局**：首次触摸后出现方向键盘与撤销重开，桌面按键提示隐藏
- [ ] **界面文字不裁不压**：每个界面 × 每个状态（禁用 / 冷却倒计时 / 最长数字 / 中英切换）
      文字都完整落在控件内，没有半截字与被压出的面板；宽度用 `UI.MeasureTextWidth` 量出来，
      **不靠肉眼**（症状与量法见 [pitfalls.md](pitfalls.md) F1~F5，`t3m lint` 有
      `ui-button-newline` / `ui-text-width-hardcoded` / `ui-overflow-check-off` 三条规则）
- [ ] **控件逐条对齐**：`source/UI_INVENTORY.md` 第七节的每一行都填了「Maker 实现」；
      控件个数与原版一致（没有漏转、没有新增原版没有的常驻控件），位置与尺寸按 CSS 值对得上，
      每个控件的点击动作与原版是同一个动作（见 [ui-parity.md](ui-parity.md)）；
      **没有 data-\* 锚点的骨架件也要对**（钱包 chip、右上角按钮、菜单列与行、页脚）——
      首页/菜单屏"差很多"基本都是漏了这些
- [ ] **文案无原始 key**：界面上没有 `paints` 这类未定义 key（`t3m lint` 的 `i18n-missing-key` 为 0），
      也没有把可翻译文案写成字面量的地方（`hardcoded-ui-text`）
- [ ] **流程与触发一致**：屏幕集合一致；每个换屏的触发方式一致（按钮/按键/自动）；
      键盘层逐条按过（Space 开波、F 速度、Q 技能…）；**第一波由谁开始与原版一致**（原版手动就不要加自动开始）
- [ ] **节奏节点一致**：速度档位与持久化、波次按钮的显隐条件与提前召唤奖励、波次/关卡横幅、
      教程提示时序、暂停菜单项、过关结算卡在正常玩法里可达（见 ui-parity.md 第 3 节）
- [ ] **存档**：退出重进后解锁进度、金币、服装与箱面保留

## 三、门禁（KayingCode 为静态 + 远端运行时）

```bash
t3m lint <Maker项目目录>        # 静态：高风险存在时退出码 1
t3m rlog <Maker项目目录> --dir <dest>/.maker/logs/runtime/runtime.log
                                      # KayingCode 远端运行时：Lua 报错 / 项目资源缺失 / 日志比代码旧 → 退出码 1
```

- `t3m lint` 默认只扫用户代码 `scripts/` 与 `assets/**/*.shader`；`--all` 才连引擎库一起扫（引擎库自身会命中规则，仅诊断用）。输出里每条都带修法。
- KayingCode 必须把发布工具返回的 `runtime_logs.local_file`（通常是 `<dest>/.maker/logs/runtime/runtime.log`）显式传给 `t3m rlog --dir`；不能省略 `--dir` 后去读本机预览。
  它把行分成 "Lua 报错 / 项目资源缺失 / 引擎包噪声" 三类，`Cube/Day/DaySpecularHDR.dds` 与
  `themis_x64.dll` 属引擎级噪声、任何工程都有，不算失败。跑法与截图/像素比对见 [runtime-loop.md](runtime-loop.md)。
- **静态全绿 ≠ 能跑**：实测过一次 LSP 0 error + lint 全绿 + 远端构建成功，游戏一启动就崩 6 处。
  两道门禁都要绿，且 `rlog` 用的日志必须比代码新（改完不重跑会被判失败）。

## 四、运行时底线（交付前必须留下证据）

- [ ] **启动干净**：同 revision 的远端 publication runtime log 经 `t3m rlog <dest> --dir <remote-log>` 分类后 PASS —— 无 Lua 报错、无项目资源缺失
- [ ] **实跑截图**：至少一张右侧 target guest 的截图；本地 runtime 系统截图只在已记录的 fallback 分支接受
- [ ] **像素对齐**：与原版同一区域的中位亮度差 <15%，并把数字记录下来
- [ ] **双预览取证**：KayingCode 本地工作区必须留下 source/target 同尺寸截图 + `t3m compare` 产物；
      只有 host 未暴露双 guest / 远程工作区时才可降级，且必须写清 `visual_review_mode` 与原因。
      **UI/装饰/材质仍在 known_gaps 时，禁止在无双预览截图的情况下 `t3m mark accept`。**
- [ ] **产物留痕**：远端 `runtime_log`、target guest `screenshot`、`pixel_stats`；KayingCode 双预览还要记录
      `compare_source` / `compare_target` / `compare_diff` / `compare_metrics` / `compare_operation`
- [ ] **界面文字**：`t3m lint <dest>` 不再报 `ui-button-newline` / `ui-text-width-hardcoded`，
      并有一张每个界面都走到的截图或自驱记录（见 [pitfalls.md](pitfalls.md) F5 的界面×状态矩阵）
- [ ] **探针/临时产物清理**：`grep -rn "TEMP" <dest>/scripts/` 为空，`Start()` 里没有自驱调试代码；
      **开发自测开关全部关闭**（`DEV_SMOKE`/`SMOKE`/`SELFTEST` 这类 `= true`——开着它预览会被自驱流程
      接管，用户看到的是假画面，`t3m lint` 的 `dev-switch-on` 会拦）；
      只为验证生成的 harness（自检数据表、dump 脚本）不要留在 `scripts/` 里随包发布 —— 要留就放到 `verify/`
- [ ] `t3m mark project-info.json accept`（缺 `runtime_log` / `maker_url` 会被拒绝，这是有意设计）

**未达标项怎么写**：任何一条走查/量化指标没达到（例：亮度差 16%、纹理平铺做不到），
要**同时**做三件事，不要用"基本一致"糊过去：

1. 把实测数字写进 `t3m note project-info.json pixel_stats "<数字 + 差距 + 判定>"`，写清"未达标"；
2. 在交付说明里列为**已知差异**（和"没做的功能"分开列）；
3. 说明**为什么停在这里**（引擎能力边界 / 尚未定位），便于下一轮接手。

`t3m mark accept` 对 runtime_log 与 maker_url 做硬门禁，并对 compare 文件缺失、metrics 比目标代码或
最新 TapTap publication 旧、以及 metrics verdict 未通过给出警告；它仍不会替你判断所有玩法与视觉语义。
`pixel_stats` 里写了"未达标"仍然会被接受 —— 这条判定由你负责，别让门禁替你背书。

## 五、远端验收

- `maker_build_current_directory` 构建成功后，读取 `runtime_logs.local_file`（`.maker/logs/runtime/runtime.log`）看真机/远端 Lua 日志，并用 `t3m rlog <dest> --dir <该文件>` 复查（同一套分类，不启动本地 runtime）。
- 需要手机体验时再生成测试二维码（用户明确要求时）。
- 交付时同时给出：maker_url、本次提交的文件清单、以及仍然存在的已知差异（例如纹理平铺受引擎限制）。
  已知差异要写具体：**没做的**（音效/音乐未接、某种语言未带、广告位未接）与**做了但不完全等价的**
  （纹理平铺丢失、过场遮罩用面板近似、圆角盒顶点数更高）分开列。
- 留下可复核的证据链：截图路径、像素统计数字、`t3m rlog` 的裁决、以及验收时用的原版对照来源（URL + 截图时间）。
