# 启动 Logo 动画

## 产品规则与边界

- Desktop HTML 首屏与共享 React 启动徽章保持同一个 96px 深色圆角外框、73px KY 标志。
- 启动态沿圆角边框循环播放白色炫光，周期 2.2 秒；Logo 保留现有呼吸动画，Desktop 保留弹入。
- CSS 是唯一动画 owner，使用伪元素及渐变角度动画，不引入组件状态、尺寸监听或新依赖。
- animated=false 的 React 徽章和 prefers-reduced-motion: reduce 均不播放炫光；保留静态边框。
- HTML 与 React 各自拥有本阶段的视觉呈现；交接继续由原有 React-ready 与弹入完成门禁控制。炫光不触发或延迟交接，不人为延长启动。
- 不改变服务、持久化、协议或启动失败语义。Web 使用共享 React 徽章时遵循同样规则。

## 事件顺序

```text
HTML 启动壳显示 → 弹入与 CSS 炫光并行
  → 原有弹入完成 + React ready → 移除 HTML 启动壳
  → React 若仍阻塞则显示自身徽章 → 工作台就绪后卸载
```

## 验收

1. HTML 首屏、React 加载页都有沿边框移动的光段，中心内容不被遮挡。
2. 对比相隔 200ms 的渐变角度，普通模式应变化；减少动态效果时无边框动画。
3. animated=false 不播放炫光和呼吸。
4. HTML 交接继续等待原有弹入完成和 React ready；无限循环的伪元素动画不参与 animationend。
5. 明暗主题下外框保持深色、静态描边保持低对比，窗口尺寸变化不导致动画节点重建。

浏览器回归入口：`node packages/ui/test/startupBranding.e2e.mjs`（需要本机 Chrome）。
