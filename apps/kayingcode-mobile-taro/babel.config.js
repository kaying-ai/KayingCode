// 微信开发者工具保持 ES6 转换关闭，预览直接解析 Taro 产物。Babel 默认目标原本也是
// iOS 9 / Android 5，但显式钉住可防止未来 browserslist 变化把小程序语法目标放宽。
const weappTargets = process.env.TARO_ENV === "weapp" ? { android: "5", ios: "9" } : undefined;

module.exports = {
  presets: [
    [
      "taro",
      {
        framework: "react",
        ts: true,
        ...(weappTargets ? { targets: weappTargets } : {}),
      },
    ],
  ],
};
