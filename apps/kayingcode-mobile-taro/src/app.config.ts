// 移动壳（对齐 Flutter RootShell）：壳首页内切换 会话列表 / 项目列表 / 我的三个 Tab；
// 设备管理、聊天详情、设置二级、配对、自动化都从壳首页 push 出去。
export default {
  // connectSocket 失败必须尽快回到可重试错误态，不能让首次打开工作区无限等待。
  networkTimeout: {
    connectSocket: 15_000,
  },
  pages: [
    "pages/home/index",
    "pages/device/index",
    "pages/chat/index",
    "pages/settings/index",
    "pages/automation/index",
    "pages/zcode-web/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#161616",
    navigationBarTitleText: "KayingCode",
    navigationBarTextStyle: "white",
  },
  // 由 config/index.ts 的 mini.copy 拷进产物根；显式声明可避免开发者工具的
  // 「未找到 sitemap.json」告警，并让索引策略随包发布。
  sitemapLocation: "sitemap.json",
};
