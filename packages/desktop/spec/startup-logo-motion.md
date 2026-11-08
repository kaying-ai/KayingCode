# Desktop 启动炫光

HTML 首屏遵循 [共享启动 Logo 规则](../../ui/spec/startup-logo-motion.md)。
独立内联 CSS 保证 React/CSS bundle 加载前即可显示；不依赖 npm 动画组件。
启动门禁仍由本页弹入完成与 kayingcode-react-startup-ready 事件持有；
伪元素的循环动画不参与完成条件，减少动态效果沿用原有立即完成语义。
验收包含首屏动态边框、减少动态效果，以及 React ready 后遮罩正常移除。
