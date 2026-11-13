# 引擎差异映射表（three.js / Web → TapTap Maker / UrhoX Lua）

> 这张表由实测得出，`t3m analyze` 会按它扫描源码并生成工作清单；`t3m knowledge` 可打印工具内置的当前版本。

## 渲染栈

| 原版                                        | Maker / UrhoX                                                 | 风险 |
| ------------------------------------------- | ------------------------------------------------------------- | ---- |
| `WebGLRenderer` + `<canvas>`                | `Scene` + `Octree` + `Camera` + `Viewport:new(scene, camera)` | 高   |
| `graphics:SetMode(...)`                     | 已禁用；用 `graphics:GetWidth()/GetHeight()/GetDPR()`         | 高   |
| `PerspectiveCamera.fov`                     | `Camera.fov`（同为垂直视场角），取景公式可整段转写            | 中   |
| `renderer.outputColorSpace` / `toneMapping` | 无对应；ACES 曲线缺失需重新标定亮度                           | 高   |
| `scene.fog = Fog(color, near, far)`         | `zone.fogColor/fogStart/fogEnd`（雾距按相机距离算）           | 低   |
| OrbitControls / 自定义相机                  | 相机自己算；关注 `LookAt(target, up, TS_WORLD)`               | 低   |

## 光照

| 原版                                 | Maker                                                                   | 风险 |
| ------------------------------------ | ----------------------------------------------------------------------- | ---- |
| `HemisphereLight`                    | `zone.ambientSource = AMBIENT_COLOR` + `zone.ambientColor`              | 高   |
| `AmbientLight`                       | 同上（合并进环境光）                                                    | 高   |
| `DirectionalLight(color, intensity)` | `Light` + `LIGHT_DIRECTIONAL` + `brightness`；PBR 漫反射除以 π          | 中   |
| `PointLight/SpotLight`               | `LIGHT_POINT/LIGHT_SPOT` + `range`；高亮度需 `zone.autoExposureEnabled` | 中   |
| `castShadow` / `shadowMap`           | `light.castShadows` + `model.castShadows`；柔和度无等价开关             | 低   |
| 接触阴影（半透明贴图平面）           | 不保证按 transparent 混合，实测会渲染成亮面板 → 用真实阴影代替          | 高   |

## 材质与纹理

| 原版                                                  | Maker                                                                   | 风险 |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ---- |
| `MeshStandardMaterial({color, roughness, metalness})` | `PBRNoTexture.xml` + `MatDiffColor`/`Roughness`/`Metallic`              | 中   |
| （未设置，F0 = 0.04）                                 | `MatSpecColor = Color(0.04, 0.04, 0.04, 1)`                             | 高   |
| `emissive` + `emissiveIntensity`                      | `MatEmissiveColor`（可用 >1 表示强度）                                  | 低   |
| `material.map`                                        | `Techniques/PBR/PBRDiff.xml` + `SetTexture(TU_DIFFUSE, tex)`            | 中   |
| `transparent: true` + `opacity`                       | `PBRNoTextureAlpha.xml` + `MatDiffColor` 的 alpha（**先验证混合行为**） | 高   |
| `CanvasTexture`（canvas 2D 手绘）                     | 按绘制逻辑转写为 `Image:SetSize/SetPixel` + `Texture2D:SetData`         | 高   |
| `texture.repeat` / `RepeatWrapping`                   | UV 固定 0..1；改在纹理内部画多份，或缩小几何体                          | 中   |
| `InstancedMesh` + `setColorAt()`                      | 每格一个节点 + 共享 Model；逐实例色用 `MatDiffColor` 乘贴图复现         | 高   |
| 无光照材质（`MeshBasicMaterial`）                     | `NoTextureUnlit.xml`                                                    | 低   |
| `material.onBeforeCompile` / `ShaderMaterial`         | 没有直接对应物；移植为 surface shader / 材质注入，或烘焙近似            | 高   |
| `customProgramCacheKey` / `onBeforeRender`            | 运行时逻辑，需在 Lua 侧重建；不要假设材质 XML 能表达                    | 高   |
| `KHR_materials_clearcoat`                             | 目标材质 XML 无 clearcoat；需自定义 shader 或接受近似                   | 高   |
| `KHR_materials_emissive_strength > 1`                 | `MatEmissiveColor` 只有颜色；HDR 强度需 shader/后处理，不能只写颜色     | 高   |
| `doubleSided: true`                                   | 材质需 `cull="none"`；否则薄片/眼睛/尾内侧可能被剔除、露黑面            | 高   |
| `COLOR_0` 顶点色（glTF 常与 baseColor 相乘）          | 目标 technique 必须支持顶点色（如 `DiffVCol`），否则颜色丢失            | 高   |
| glTF 模型分支/feature flag（`?char=old` 等）          | 没有自动映射；先做 `source/audit/control-flow.md`，再决定目标模型       | 高   |

## 几何

| 原版                                                               | Maker                                                                                                                               | 风险            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `BoxGeometry`                                                      | `BoxGeometry(...):ToModel()`（同名同参）                                                                                            | 低              |
| `roundBox()`（自定义圆角盒）                                       | `RoundedBoxGeometry(w,h,d,seg,r):ToModel()`                                                                                         | 高（UV 一致性） |
| 内置 `Models/Box.mdl`                                              | 能用，但 **UV 与 three.js 不同**（贴图可能旋转 90°）                                                                                | 高              |
| `Sphere/Cylinder/Cone/Torus/Circle/Plane/Lathe/Tube/Extrude/Shape` | 同名 API + `:ToModel()`；数组参数传 Lua 表                                                                                          | 低              |
| `EdgesGeometry/WireframeGeometry`                                  | 可用，但材质必须无光照否则发黑                                                                                                      | 中              |
| `new THREE.Group()`                                                | `parent:CreateChild(name)`（**没有全局 Node 构造函数**）                                                                            | 高              |
| `object.visible = false`                                           | `node:SetEnabled(false)`（`SetVisible` 只属于 UI 控件）                                                                             | 高              |
| 自建 `BufferGeometry` + 顶点索引（`mergeGeometries`）              | 引擎的程序化几何**拿不到顶点数据**：合并要在 Lua 侧自己做，再用 `CustomGeometry` 上传，且**按索引逐三角形发顶点**（它没有索引缓冲） | 高              |
| 多基本体合并成一个 draw call                                       | 合并后每三角形 3 顶点 → 受 16 位索引上限（~65k 顶点 ≈ 21k 三角）约束，超限静默掉面 → 按块切多个网格节点                             | 高              |
| 运行时生成的多边形网格                                             | `Model` 必须显式 `SetBoundingBox`，否则被视锥剔除、**静默不画**（`inView` 仍为 true、日志干净）                                     | 高              |
| 关节角色（每部件独立旋转/换色）                                    | 每部件一个节点 + `CustomGeometry` 直挂；共享 `Model` 只在**子树之外的 scratch 节点**上构建                                          | 高              |

## 引擎 API 语义（不是"映射"，是"不能想当然"）

| 你以为                             | 实际                                                                                                                                                                                                | 风险 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `Vector3` 是对象引用，可当出参写回 | `Vector2/Vector3` 是 **Lua 原生值类型**，传参复制 → 出参 API 完全无效                                                                                                                               | 高   |
| `q:EulerAngles()` 返回三个数       | 返回**一个 `Vector3`**；欧拉顺序 Ry·Rx·Rz、单位是度                                                                                                                                                 | 高   |
| `renderer:Render()` 每帧调用       | **没有这个方法**；设好 `SetViewport` 后引擎自己渲染                                                                                                                                                 | 高   |
| 局部变量随便起名                   | `audio cache console context engine fileSystem graphics input localization log network renderer time ui` 是**引擎注入的全局**，同名局部会遮蔽它（`local cache = {}` → 该文件所有 `cache:…` 变 nil） | 高   |
| `INSTANCE_COLOR` 是普通 uniform    | 它是**顶点阶段内建量**，片元里引用直接编译失败（并级联成全屏不渲染）→ 用 varying 带过去                                                                                                             | 高   |
| UI 面板默认透明                    | UI 根面板**默认不透明**，会把 3D 画面整块糊住（原版 CSS 里 `#ui` 没有背景色）                                                                                                                       | 高   |
| 缺失资源会被静默忽略               | `ResourceCache:GetResource()` 对缺失路径**逐次记 ERROR**；也没有给 Lua 的 manifest 探测接口（`cache:Exists` 只看磁盘文件，对打包资源一律 false）                                                    | 高   |
| 需要更多光就加载现成灯组           | `LightGroup/Daytime.xml` 自带一盏平行光（双太阳）并引用引擎包里没有的 IBL                                                                                                                           | 中   |
| 原版光照强度可以直接照搬           | three.js 间接光乘 `BRDF_Lambert(1/π)`，本引擎环境光是直接相加 → 环境光按 1/π 折算，并与太阳一起标定                                                                                                 | 高   |

## 输入与主循环

| 原版                              | Maker                                                                     | 风险 |
| --------------------------------- | ------------------------------------------------------------------------- | ---- |
| `requestAnimationFrame(loop)`     | `SubscribeToEvent("Update")` + `eventData:GetFloat("TimeStep")`           | 低   |
| `addEventListener("keydown")`     | `input:GetKeyDown/GetKeyPress(KEY_*)`                                     | 中   |
| `pointerdown/move/up`             | `MouseButtonDown/Up`、`TouchBegin/Move/End`、UI 控件 `onPointer*/onClick` | 中   |
| `Raycaster` + `intersectPlane`    | `Camera:GetScreenRay(x, y)`，**x/y 为 0..1**                              | 高   |
| `matchMedia("(pointer: coarse)")` | 订阅触摸事件，首次触摸后切换 UI 布局                                      | 低   |

## 界面与数据

| 原版                                        | Maker                                                                                  | 风险 |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| DOM + CSS（innerHTML/样式表）               | `urhox-libs/UI`（Yoga + NanoVG）声明式控件；CSS 颜色/尺寸可直译                        | 高   |
| 换屏（替换 `#screen` 内容）                 | 替换根控件，**必须延迟到 UI 派发之外**（否则死锁）                                     | 高   |
| CSS 背景渐变（天空）                        | `zone.fogColor` + UI 根 `backgroundGradient`（同色标）                                 | 低   |
| `localStorage` / 云存档 SDK                 | `File("save.json", FILE_WRITE)` 相对路径；`clientCloud` 用于跨设备                     | 高   |
| `FileSystem:GetProgramDir()`                | 沙箱返回空串 → 直接用相对路径                                                          | 高   |
| `load()` / `dofile()` / `io` / `os.execute` | 沙箱已移除 → 用 `require`、`File`、按已知结构字符串解析                                | 高   |
| 关卡/配置数组（JS 字面量）                  | Lua 表（`t3m levels` 转换）；保持原版索引语义                                          | 中   |
| WebAudio 合成音效                           | `text_to_sound_effect` / `text_to_music` 生成文件 + `SoundSource:Play(sound, 0, gain)` | 中   |
| BFS/求解器                                  | 同算法转写；给状态数上限，超限返回 nil                                                 | 中   |

## 坐标系与单位

| 项   | 说明                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 手系 | three.js **右手**（Y-up，−Z 向前）；本引擎 **左手**（Y-up，+Z 向前，同 Unity）          |
| 后果 | 相机在 +Z 看原点时世界 +X 落在屏幕左侧 → 画面镜像、左右键手感反转                       |
| 处理 | 把"格子 → 世界"的映射收口成一个函数并翻转 X（`(w-1)/2 - x`），位置/朝向/拾取/提示全走它 |
| 单位 | 引擎长度单位为米；原版若用 1 格 = 1 单位则直译                                          |
