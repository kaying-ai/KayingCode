//! The transcription knowledge base.
//!
//! Every row is a difference between the browser/three.js world and the
//! TapTap Maker (UrhoX Lua) runtime that was *verified while transcribing the
//! reference game*. `pattern` is matched against the fetched web sources; the
//! report turns matches into a work list so nobody rediscovers them at runtime.

pub struct Feature {
    pub id: &'static str,
    /// Substring looked up in the fetched sources.
    pub pattern: &'static str,
    pub title: &'static str,
    /// What to use in the Maker/UrhoX project.
    pub maker: &'static str,
    /// high = will visibly break or hang if missed; medium = visible差 ; low = polish.
    pub risk: &'static str,
    /// The exact trap, phrased as the fix.
    pub pitfall: &'static str,
}

pub fn features() -> Vec<Feature> {
    vec![
        Feature {
            id: "stack-three",
            pattern: "from \"three\"",
            title: "three.js 渲染栈",
            maker: "Scene + Octree + Camera + Viewport；几何用程序化 API，材质用 PBRNoTexture/PBRDiff",
            risk: "high",
            pitfall: "不要把 three.js 的渲染管线照搬；本引擎没有 WebGLRenderer/canvas，改用 Scene/Viewport 与 urhox-libs/UI 两套系统。",
        },
        Feature {
            id: "webgl-renderer",
            pattern: "WebGLRenderer",
            title: "WebGLRenderer 与 canvas",
            maker: "renderer:SetViewport(0, Viewport:new(scene, camera))；UI 用 urhox-libs/UI",
            risk: "high",
            pitfall: "canvas 相关设置（setPixelRatio / setClearColor / outputColorSpace）没有对应项，屏幕信息改用 graphics:GetWidth/GetHeight/GetDPR。",
        },
        Feature {
            id: "perspective-camera",
            pattern: "PerspectiveCamera",
            title: "透视相机与取景",
            maker: "Camera 组件，fov 语义一致（垂直视场角），stage.js 的 frame() 取景公式可整段转写",
            risk: "medium",
            pitfall: "取景模式必须按用途传参：把「玩法/菜单」混用会让棋盘缩小并偏移（实测 dist 从 9.6 变 16.3 且横移 3.78 格）。",
        },
        Feature {
            id: "hemisphere-light",
            pattern: "HemisphereLight",
            title: "半球环境光",
            maker: "zone.ambientSource = AMBIENT_COLOR + zone.ambientColor",
            risk: "high",
            pitfall: "默认 AMBIENT_PREBAKED/SKYBOX 模式下 ambientColor 是 no-op，环境光完全不参与照明（实测画面暗 2.5 倍）。",
        },
        Feature {
            id: "directional-light",
            pattern: "DirectionalLight",
            title: "平行光",
            maker: "Light + lightType = LIGHT_DIRECTIONAL + brightness",
            risk: "medium",
            pitfall: "本引擎 PBR 漫反射项除以 π，原版强度可直接沿用（2.3 × NdotL 0.83 / π ≈ 0.61）；环境光与太阳要一起标定。",
        },
        Feature {
            id: "tone-mapping",
            pattern: "toneMapping",
            title: "ACES 色调映射 / 曝光",
            maker: "引擎无 ACES；用固定曝光重新标定，或开 zone.autoExposureEnabled（会自适应、与原版固定曲线不同）",
            risk: "high",
            pitfall: "照搬原版强度会过曝洗白；用截图像素统计（棋盘区域中位亮度）对齐，别凭肉眼。",
        },
        Feature {
            id: "shadow-map",
            pattern: "shadowMap",
            title: "阴影",
            maker: "light.castShadows + model.castShadows",
            risk: "low",
            pitfall: "PCFSoft 的柔和度没有等价开关；接触阴影（贴图渐隐平面）在引擎里未必按透明混合生效，实测会渲染成亮面板。",
        },
        Feature {
            id: "standard-material",
            pattern: "MeshStandardMaterial",
            title: "PBR 材质",
            maker: "SetTechnique(PBRNoTexture/PBRDiff) + MatDiffColor/MatSpecColor/Metallic/Roughness",
            risk: "high",
            pitfall: "three.js 非金属的镜面 F0 默认 0.04；本引擎要显式给 MatSpecColor，写成 0.45 会让掠射角的地面与台座整片泛白。",
        },
        Feature {
            id: "emissive",
            pattern: "emissive",
            title: "自发光",
            maker: "MatEmissiveColor（可用 >1 的强度）",
            risk: "low",
            pitfall: "emissiveIntensity 要折算进颜色分量，引擎没有单独的强度参数。",
        },
        Feature {
            id: "transparent",
            pattern: "transparent",
            title: "透明/半透明材质",
            maker: "Techniques/PBR/PBRNoTextureAlpha.xml + MatDiffColor 的 alpha",
            risk: "high",
            pitfall: "不要假设 alpha 混合与 three.js 一致：先用一个已知 alpha 的平面验证，否则会出现「应该变暗却变亮」的面板。",
        },
        Feature {
            id: "canvas-texture",
            pattern: "CanvasTexture",
            title: "Canvas 手绘纹理",
            maker: "按绘制逻辑转写为 Image:SetSize/SetPixel + Texture2D:SetData（CKTex 模式）",
            risk: "high",
            pitfall: "引擎没有 canvas 2D；把 fillRect/arc/line/gradient 逐个映射到像素写入，并保持同一 PRNG 种子以便复现。",
        },
        Feature {
            id: "texture-repeat",
            pattern: "repeat",
            title: "纹理平铺（repeat / RepeatWrapping）",
            maker: "纹理 UV 固定 0..1；改为在纹理内部画更多份图案，或用更小的几何体",
            risk: "medium",
            pitfall: "没有 UV 缩放接口，原版靠 repeat 30 铺出的地面细缝在高分辨率贴图上也补不回来（属引擎能力边界，需在验收里说明）。",
        },
        Feature {
            id: "instanced-mesh",
            pattern: "InstancedMesh",
            title: "实例化网格与逐实例染色",
            maker: "每格一个节点 + 共享 Model；逐实例颜色用 MatDiffColor 乘贴图复现",
            risk: "high",
            pitfall: "漏掉 setColorAt 的染色会整体偏暗：原版给墙顶盖板 1.25~1.45 倍提亮，地板/墙为 0.9~1.02。",
        },
        Feature {
            id: "box-geometry",
            pattern: "BoxGeometry",
            title: "立方体几何",
            maker: "BoxGeometry / RoundedBoxGeometry（three.js 同名同参）:ToModel()",
            risk: "medium",
            pitfall: "内置 Models/Box.mdl 的 UV 布局与 three.js 不同，贴图会被旋转 90°；需要同源 UV 就用程序化几何体。",
        },
        Feature {
            id: "lathe-geometry",
            pattern: "LatheGeometry",
            title: "旋转体/圆柱/圆环等参数化形体",
            maker: "同名 API（LatheGeometry 收 Vector2 表、TorusGeometry、ConeGeometry…）+ :ToModel()",
            risk: "low",
            pitfall: "数组类参数传 Lua 表；线几何（Edges/Wireframe）必须用无光照材质否则发黑。",
        },
        Feature {
            id: "group-node",
            pattern: "new THREE.Group",
            title: "节点树",
            maker: "parent:CreateChild(name)（引擎没有独立的 Node 构造函数）",
            risk: "high",
            pitfall: "调用 Node() 会得到 nil 并中断脚本；所有节点都必须由父节点创建。",
        },
        Feature {
            id: "visible-flag",
            pattern: "visible =",
            title: "显隐切换",
            maker: "node:SetEnabled(false/true)",
            risk: "high",
            pitfall: "Node 没有 SetVisible 方法，误用会在运行时抛错并让该帧逻辑中断。",
        },
        Feature {
            id: "raycaster",
            pattern: "Raycaster",
            title: "屏幕拾取",
            maker: "Camera:GetScreenRay(x, y)，x/y 是 0..1 归一化坐标",
            risk: "high",
            pitfall: "传像素坐标会得到完全错误的射线；与 y=0 平面求交后要用与建棋盘相同的镜像映射还原格子索引。",
        },
        Feature {
            id: "animation-frame",
            pattern: "requestAnimationFrame",
            title: "主循环",
            maker: "SubscribeToEvent(\"Update\") 里用 eventData:GetFloat(\"TimeStep\")",
            risk: "low",
            pitfall: "不要自己攒帧时间；dt 由引擎给出，动画队列与规则推进都用它。",
        },
        Feature {
            id: "dom-events",
            pattern: "addEventListener",
            title: "DOM 输入",
            maker: "input:GetKeyDown/GetKeyPress、MouseButtonDown/Up、TouchBegin/End；UI 控件自带 onPointer*/onClick",
            risk: "medium",
            pitfall: "非玩法界面也要绑确认键（Enter/Space），否则键盘在标题屏毫无反应，看起来像卡死。",
        },
        Feature {
            id: "dom-ui",
            pattern: "innerHTML",
            title: "DOM/CSS 界面",
            maker: "urhox-libs/UI（Yoga + NanoVG）声明式控件；CSS 的颜色/尺寸/位置/圆角可直接换算成 props（直译表见 references/ui-parity.md）",
            risk: "high",
            pitfall: "UI 是规格：先用 t3m ui 出控件清单，再按清单 1:1 转——控件个数、位置尺寸、点击动作、显隐条件都要对得上；不要新增原版没有的常驻控件，也不要把锚定弹窗改成常驻栏。换屏必须在 UI 派发之外进行：在按钮回调里销毁/替换根控件会让库访问已释放控件并自旋死锁；改为延迟到下一帧。",
        },
        Feature {
            id: "css-sky",
            pattern: "--sky",
            title: "CSS 天空渐变",
            maker: "zone.fogColor = 天空底色 + UI 根面板 backgroundGradient（同一组色标）",
            risk: "low",
            pitfall: "3D 场景没有天空盒时，背景就是清除色；菜单屏要用渐变面板才与原版观感一致。",
        },
        Feature {
            id: "webaudio",
            pattern: "AudioContext",
            title: "WebAudio 合成音效",
            maker: "用 text_to_sound_effect / text_to_music 生成音频文件，再 SoundSource:Play(sound, 0, gain)",
            risk: "medium",
            pitfall: "生成的文件要按代码约定命名并确认非静音（1 秒档常出现全静音占位文件，用文件头/时长校验）。",
        },
        Feature {
            id: "storage",
            pattern: "localStorage",
            title: "本地存档",
            maker: "File(\"name.json\", FILE_WRITE) 相对路径（引擎按项目+用户隔离）",
            risk: "high",
            pitfall: "FileSystem:GetProgramDir() 在沙箱里返回空串；存档解析不要用 load()（沙箱已移除），按已知结构做字符串解析。",
        },
        Feature {
            id: "level-data",
            pattern: "const DATA",
            title: "关卡/配置数据",
            maker: "转写为 Lua 表（t3m levels 可直接转换 {w,h,t,c,p,par} 这类结构）",
            risk: "medium",
            pitfall: "数据用 0 基索引时，Lua 侧要按同一套 0 基语义处理（例如格子索引与邻居表），只把字符串切片改成 1 基。",
        },
        Feature {
            id: "solver-bfs",
            pattern: "BFS",
            title: "求解器（提示/校验）",
            maker: "同算法转写为 Lua；给状态数上限并在超限时返回 nil",
            risk: "medium",
            pitfall: "提示求解要限制状态数（原版 18 万~25 万），否则一次提示可能卡住主线程。",
        },
        Feature {
            id: "pointer-coarse",
            pattern: "pointer: coarse",
            title: "触屏判定",
            maker: "订阅 TouchBegin/End，首次触摸后切换 UI 布局（触屏显示方向键盘、桌面显示按键提示）",
            risk: "low",
            pitfall: "桌面预览下触屏控件应隐藏，否则会挡住画面且与原版布局不符。",
        },
        Feature {
            id: "canvas-2d",
            pattern: "createLinearGradient",
            title: "渐变/圆形裁剪等 canvas 效果",
            maker: "转写为逐像素插值（线性/径向）或改用几何体近似",
            risk: "medium",
            pitfall: "canvas 2D 的 path/曲线没有等价 API；贝塞尔纹理噪点可采样成折线绘制，视觉差异需在验收时对照截图。",
        },
    ]
}

/// The order that kept the reference transcription debuggable.
pub fn pipeline() -> Vec<(&'static str, &'static str)> {
    vec![
        ("0 取证", "t3m fetch 抓取 index.html + 模块图 + CSS；确认渲染栈与模块划分"),
        ("1 数据", "关卡/配置/词典 → Lua（t3m levels）；对齐 0 基/1 基索引语义"),
        ("2 规则", "纯逻辑先转写（移动/机关/求解器），无渲染依赖，可离线自检"),
        ("3 棋盘", "场景/相机/光照/材质/机关表现；用原版数值而非目测"),
        ("4 角色", "角色与动画队列；朝向表要跟着坐标镜像一起改"),
        ("5 装饰", "道具/背景/粒子；背景墙与货架决定整体氛围"),
        ("6 界面", "先 t3m ui 出控件清单；按清单 1:1 转（位置尺寸直译 CSS、功能与显隐条件不变、弹窗锚定不改成常驻栏）；节奏节点（开波/速度/暂停/教程/结算）逐条对齐"),
        ("7 音频", "音效与 BGM 生成并接入；校验文件非静音"),
        ("8 验收", "本地预览 + 真机；像素统计对齐亮度，逐条走查玩法与界面"),
    ]
}

/// Acceptance checks that caught real regressions during the reference run.
pub fn acceptance() -> Vec<&'static str> {
    vec![
        "启动无 Lua 报错（日志只允许引擎层的 HDR/dll 提示）",
        "棋盘布局与原版同向：关卡 1 的玩家在左、目标在右",
        "方向键与滑动的手感正确：按右就往右走，角色朝向与行进方向一致",
        "亮度量化对齐：截取棋盘区域，中位亮度与原版差距 <15%",
        "镜面：掠射角的地面/台座不泛白（MatSpecColor ≈ 0.04）",
        "环境光生效：关闭太阳后画面仍有均匀底光（ambientSource = AMBIENT_COLOR）",
        "贴图方向正确（箱面箭头朝上）；木板/砖缝可见",
        "五种机关各跑一关：冰面滑行、压力板闸门、滑槽传送、坑填埋、传送带",
        "无限撤销、重开、提示（求解器）、过关星级与金币结算",
        "所有换屏路径点击不卡死：开始/下一关/再玩/关卡地图/暂停/设置/工坊/每日",
        "触屏布局：首次触摸后出现方向键盘与撤销重开，按键提示隐藏",
        "界面文字都在控件内：每个界面 × 每个状态（禁用/冷却倒计时/长数字/中英切换）都不裁字、不压边——宽度按 UI.MeasureTextWidth 量出来，不靠肉眼",
        "文案无原始 key：界面上没有未定义 key（如 paints）漏出，也没有把可翻译文案写成字面量",
        "控件逐条对齐：原版控件清单每一行都有对应实现，个数一致（不合并/不新增常驻控件）、位置尺寸按 CSS 直译、点击动作是同一个动作；无 data-* 锚点的骨架件（钱包 chip、右上角按钮、菜单列、页脚）也照转",
        "流程与触发一致：屏幕集合、每个换屏的触发方式、键盘层、以及谁开始第一波（原版手动就不要加自动开始）",
        "节奏节点一致：速度档位与持久化、波次按钮显隐与提前召唤奖励、波次横幅、教程提示时序、暂停菜单项、结算卡在正常玩法里可达",
        "存档：退出重进后解锁进度、金币、服装与箱面保留",
    ]
}

/// Engine API landmines: the ones that cost the most time because the failure is
/// silent (clean log, valid data) or looks like something else entirely.
/// Every row was reproduced on a real local runtime run.
pub struct Landmine {
    pub id: &'static str,
    /// What the developer sees — including the part that misleads.
    pub symptom: &'static str,
    /// The verified fix.
    pub fix: &'static str,
}

pub fn landmines() -> Vec<Landmine> {
    vec![
        Landmine {
            id: "geom-no-index-buffer",
            symptom: "程序合并出来的网格画成一堆碎片/棍子；地面格线还能看到，其余面全是乱三角",
            fix: "CustomGeometry 没有索引缓冲，按 DefineVertex 顺序组 TRIANGLE_LIST：照索引表每三角形发 3 个顶点。顶点数 = 3×三角形数，仍受 16 位索引上限（~65k）约束——超限不报错，只是面消失，所以大网格要按块切多个节点",
        },
        Landmine {
            id: "geom-missing-bbox",
            symptom: "运行时生成的网格完全不画，日志干净；StaticModel.inView 还是 true，几何/材质/变换全都正常",
            fix: "FillModel() 留下的包围盒不覆盖几何，渲染器按包围盒做视锥剔除 → 必须显式 model:SetBoundingBox(BoundingBox(min, max))，并按顶点位移量（sway/风）留 0.1~0.2 余量",
        },
        Landmine {
            id: "model-built-in-node-subtree",
            symptom: "同一套几何挂在场景根下能画，挂在角色子树下不画；inView、GetNumVertices、材质绑定全部正常",
            fix: "别在即将持有该 StaticModel 的节点（或其子树）上建临时 CustomGeometry：换一个子树之外的 scratch 节点建 Model；角色这类每帧动的小网格干脆直接用 CustomGeometry 直挂（FillCustomGeometry 路径）",
        },
        Landmine {
            id: "vector-value-semantics",
            symptom: "相机/节点的取景函数用出参写回 Vector3，调用后目标纹丝不动（相机留在原点、看进地形内部）",
            fix: "Vector2/Vector3 是 Lua 原生值类型，传参是值拷贝：不要写出参 API，直接返回多个标量（x, y, z）",
        },
        Landmine {
            id: "engine-global-shadowed",
            symptom: "启动第一步就崩：attempt to call a nil value (method 'GetResource')；该文件里所有 cache:调用全失效",
            fix: "引擎全局（audio/cache/console/context/engine/fileSystem/graphics/input/localization/log/network/renderer/time/ui）注入在 Lua 环境里：任何同名局部变量都会遮蔽它。局部缓存改名（cache → shaderCache），t3m lint 有 engine-global-shadow 规则",
        },
        Landmine {
            id: "ui-root-opaque",
            symptom: "点开始后整个 3D 场景被一块浅色板糊住（UI 在，画面没了）",
            fix: "UI 根面板默认不透明；原版 CSS 里 #ui/.screen 没有背景色，3D 就是底 → 根面板与容器面板都要显式透明（只给需要的地方上色）",
        },
        Landmine {
            id: "renderer-no-render",
            symptom: "main.lua: attempt to call a nil value (method 'Render')",
            fix: "引擎没有 Renderer:Render；设置好 Viewport 后每帧由引擎自己渲染。脚手架只调 renderer:SetViewport(0, Viewport:new(scene, camera))，照抄",
        },
        Landmine {
            id: "shader-stage-builtins",
            symptom: "shader 编译失败 Unknown identifier in expression: 'INSTANCE_COLOR'，并级联成整屏不渲染（一个 shader 失败打断 Start()）",
            fix: "INSTANCE_COLOR/VERTEXCOLOR 之类内建量只在 vertex() 可用：用 varying 带进 fragment()。另外材质创建要能回落（失败时给一个红色 PBR 材质并继续），否则单点失败会拖垮整个启动",
        },
        Landmine {
            id: "ui-module-metatable",
            symptom: "所有 ui:xxx() 调用都是 attempt to call a nil value (method 'xxx')",
            fix: "UI 的方法定义在模块表上：setmetatable({}, {__index = M}) 要指向真正持有方法的表（helper 表 vs 实例方法表别搞混）",
        },
        Landmine {
            id: "quat-euler-returns-vector",
            symptom: "local rx, ry, rz = q:EulerAngles() 拿到 rx=向量、ry/rz=nil，随后逐帧 attempt to perform arithmetic on a nil value",
            fix: "EulerAngles() 返回一个 Vector3（且欧拉顺序是 Ry·Rx·Rz、角度制）；用标量自己记录姿态，别从四元数反读",
        },
        Landmine {
            id: "missing-resource-logs-error",
            symptom: "玩家日志里刷 Could not find resource audio/xxx.mp3",
            fix: "只请求随包发布的资源（ResourceCache 对缺失路径会记 ERROR）。没有给 Lua 的 manifest 探测接口——cache:Exists 只看磁盘文件，对 manifest 资源一律 false，用它探测会静音全部音效；正确做法是把要播的文件登记在表里，文件不存在就不请求",
        },
        Landmine {
            id: "daytime-lightgroup",
            symptom: "画面被两盏太阳照（对比原版整体偏亮），并报缺 Cube/Day/...dds 的 IBL 立方图",
            fix: "不要加载 LightGroup/Daytime.xml：它自带一盏平行光，还引用引擎包里没有的 IBL。太阳自己建（Light + LIGHT_DIRECTIONAL），环境光用 zone.ambientSource = AMBIENT_COLOR + zone.ambientColor",
        },
        Landmine {
            id: "ambient-1-over-pi",
            symptom: "环境光/间接光按 three.js 数值照搬后整体亮约 3 倍（或反之，暗 2.5 倍）",
            fix: "three.js 的间接光会乘 BRDF_Lambert(1/π)，本引擎 cAmbientColor 是直接相加：按 1/π 折算；环境光与太阳要一起标定，别只改其中一个",
        },
        Landmine {
            id: "ui-text-clip",
            symptom: "按钮/面板上的文字被裁到半个字（中文字形左右各切一半），或者按英文量好的尺寸在中文下全部溢出；没有报错，日志干净",
            fix: "urhox-libs/UI 的 Button 用单行 nvgText 绘制：没有换行、没有省略号，超出边框就被 scissor 裁掉（\\n 会被当成普通字符画在同一行）；文字也不会自动缩小——只有 UI.defaultAutoFitText=true（即引擎 i18n 模块启用）时才缩，且下限 minFontSize=8pt。所以宽度必须量出来：UI.MeasureTextWidth(text, Theme.FontSize(字号), 字体, 字距) + 左右 padding（Button 默认 16/边）；两行内容（名称+费用）用 Panel + 两个 Label，不要往 Button 的 text 里塞 \\n。t3m lint 有 ui-button-newline / ui-text-width-hardcoded 规则",
        },
        Landmine {
            id: "ui-overflow-check-off",
            symptom: "关掉 UI 库的布局溢出警告后界面看起来正常，但装不下子控件的面板（选择面板、底部操作栏）在别的分辨率或长字符串下开始压边",
            fix: "UI 库每次 Layout 后的 CheckOverflow 是转写期唯一的机械布局体检，报的是 children 超出 container 的真实尺寸（参考工程里就有 344px 子控件塞进 320px 面板）。它抛错说明某个控件的 box 是 NaN/inf（按未设置尺寸、0 缩放算出的 left/top，或 100% 尺寸的父面板），这是真 bug 的信号——去查那个控件，而不是 UI.SetOverflowWarnings(false)。t3m lint 有 ui-overflow-check-off 规则",
        },
        Landmine {
            id: "local-wrapper-shadows-method",
            symptom: "界面上的数字（金币/波次/得分/倒计时）永远停在初始值：没有报错、没有 nil、lint 与远端构建全绿，只是界面不更新",
            fix: "`local function setText(w, t) … setText(w, t) … end` 里的 setText 就是这个 local 函数（不是控件方法），调用它等于递归回自己，永远到不了 widget:SetText → 改成 widget:SetText(t)。任何与控件方法同名的 local 包装都有这个坑（SetVisible/SetStyle…）。t3m lint 有 self-call-shadows-method 规则",
        },
        Landmine {
            id: "ui-invented-layout",
            symptom: "界面能用、日志干净、lint 与构建全绿，但控件的位置/形态/功能跟原版对不上：常驻工具条取代了原版点格子弹出的菜单、图标按钮变成了文字按钮、选择面板从塔上搬到了固定角落、目标模式之类的小控件整块消失",
            fix: "UI 是规格不是风格：动手前先 t3m ui source/game/ --out source/UI_INVENTORY.md，把第七节对齐表逐行填满（t3m mark ui 会在没填时拒绝），再按清单逐条实现——控件 1:1（不合并/不新增常驻控件）、位置尺寸按 CSS px 直译、点击动作对应原版同一个动作、hidden/on/poor/lock/sel/ready 这些显隐条件一起转、原版锚定弹窗的不要改成常驻栏。收尾用 t3m ui source/game/ --check dest 做下限检查（缺失控件 → 退出码 1）。形态/位置之外的判据见 references/ui-parity.md",
        },
        Landmine {
            id: "flow-node-drift",
            symptom: "界面都在，但游戏节奏变了：第一波自己开始了、速度多了一档且退出不记住、波次按钮只变灰不隐藏、教程提示没有、暂停菜单换了项、结算卡正常玩法走不到",
            fix: "流程与节奏节点要和控件一起转：谁开始第一波（原版手动就没有自动倒计时）、波次按钮的显隐条件与提前召唤奖励、速度档位与其持久化、暂停菜单项集合、教程提示时序、波次横幅、过关结算的可达性。逐条写进进关流程，并在验收里按 ui-parity.md 第 3 节走一遍",
        },
        Landmine {
            id: "button-not-container",
            symptom: "想给按钮做两行文案/图标+文字，往 Button 里 AddChild 子控件，真帧上所有子 label 叠画在同一点；回退后刷新代码还在写两行文本、注释还是旧方案，界面看着像没修",
            fix: "Button 只有单行文字且（本引擎版本）子控件不参与布局。组合控件用 Panel + onClick（Widget:OnClick 对任意控件生效，子控件正常布局）；Button+children 只有 minWidth 无 text 的用法可能可行，先探针验证。t3m lint 有 button-addchild 规则；进度环用进度条近似，冷却/进度信息必须保留（见 references/ui-parity.md 第 2.5 节）",
        },
        Landmine {
            id: "dev-switch-shipped",
            symptom: "改完 UI 交付，用户说「几乎看不到变化」：预览里游戏自己跑完了一关、停在结算后的画面上，标题屏和正常流程没出现过",
            fix: "开发自测开关（DEV_SMOKE 这类）被一起提交了：它接管启动流程、自驱跑关。交付前全部关掉，harness 挪到 verify/；t3m lint 的 dev-switch-on（高风险）会拦模块级开关，t3m mark accept 也会警告。另外每轮修复要收尾：lint → rlog → 重新截图 → t3m note（截图比代码旧会被警告）",
        },
        Landmine {
            id: "i18n-raw-key",
            symptom: "界面上的按钮写着小写英文 key（例如 paints），统计行写着 kills：玩家看到的是变量名而不是文案；不报错，日志干净",
            fix: "t(key) 查不到时原样返回 key（两份参考实现都这样），所以词表漏条目只会「把 key 原样显示出来」。转写新增界面（工坊/涂装/结算统计）最容易漏词条：对照原版词典逐条搬。t3m lint 的 i18n-missing-key（高风险，按字面量查）会列出用了但没定义的 key；界面文案写成字面量的问题由 hardcoded-ui-text（中风险）点出",
        },
        Landmine {
            id: "menu-screen-skeleton",
            symptom: "标题/菜单屏的主按钮都在，但整屏观感与原版差很多：左上角钱包 chip、右上角齿轮、页脚版权行都没有，菜单列各是各的宽度，行内按钮没有图标",
            fix: "菜单屏一半是没有 data-* 锚点的容器与静态件（.wallet/.corner/.credit/.tmenu/.trow）。t3m ui 的清单第三节会列出「布局骨架」（模板里的 class + CSS 盒子模型），对齐表也逐行要求填；转写时按 CSS 原值——绝对定位钉同一个角、等宽行用 flexGrow=1（别用固定 140px）、图标在上文字在下用 Panel+两 Label（Button 只有一行）。见 references/ui-parity.md 2.7",
        },
        Landmine {
            id: "engine-package-noise",
            symptom: "本地预览日志恒定报 Cube/Day/DaySpecularHDR.dds 与 themis_x64.dll 缺失，看起来像自己的错",
            fix: "这两条是引擎包/宿主自己的缺口（任何工程都一样），不是游戏代码问题：用 t3m rlog 分类，只对 Lua 报错与项目资源缺失负责",
        },
    ]
}
