import { defineConfig } from "@tarojs/cli";
import devConfig from "./dev";
import prodConfig from "./prod";

/**
 * 平台公共的 webpack 定制（mini/h5 各自生效；Taro 不读顶层 webpackChain）：
 * 1. react/react-dom 钉到 app 本地副本——workspace 是 hoisted 布局且全局 override
 *    钉 react 19（桌面/web），Taro 4.3 需要 react 18；pnpm parent 选择器已让本 app
 *    嵌套 react@18.3.1，但 taro 运行时自身的裸 `import "react-dom"` 位于根
 *    node_modules，会解析到 19。alias 保证整个 bundle 单一 react 实例。
 * 2. extensionAlias：workspace 包以 TS 源码发布、内部用 NodeNext 的 ".js → .ts"
 *    相对导入，webpack 需要它才能把 ./x.js 解析到 ./x.ts。
 */
function platformWebpackChain(chain: {
  resolve: {
    alias: { set(name: string, target: string): void };
    set(key: string, value: unknown): void;
  };
}): void {
  // 钉到包目录（不是 index.js）：react/jsx-runtime、react-dom/client 等子路径也必须走同一实例。
  const pkgRoot = (name: string) => {
    const indexFile = require.resolve(name, { paths: [__dirname, ".."] });
    return indexFile.replace(/[\\/]index\.(js|mjs|cjs)$/, "");
  };
  chain.resolve.alias.set("react", pkgRoot("react"));
  chain.resolve.alias.set("react-dom", pkgRoot("react-dom"));
  chain.resolve.set("extensionAlias", {
    ".js": [".ts", ".tsx", ".js"],
    ".mjs": [".mts", ".mjs"],
    ".cjs": [".cts", ".cjs"],
  });
}

/**
 * @kayingcode 包以 TS 源码发布（exports 直指 src，同 web/desktop 由消费方编译的约定），
 * babel 默认只处理 sourceDir + taro 自身；注意 webpack 会解析软链到真实路径
 * packages/<name>，匹配不能只看 node_modules/@kayingcode 字样。
 */
// 覆盖整个 workspace 包源码树（未进入依赖图的文件不会成为模块，匹配过宽无害）：
// shared → model-option-map 等传递依赖都会进 bundle。
const kayingcodeSourceInclude = [
  (filename: string) => /[\\/]packages[\\/][^\\/]+[\\/]src[\\/]/.test(filename),
];

// Taro 默认不让 node_modules 经过 Babel。Zod 是 4.x ESM 产物，含 ?. 和 ??；
// 微信开发者工具关闭 ES6 转换时会直接报 Unexpected token，因此只把 Zod
// 纳入小程序编译范围，H5 继续使用依赖自带的现代语法产物。
const zodSourceInclude = [(filename: string) => /[\\/]node_modules[\\/]zod[\\/]/.test(filename)];

// Taro 多端工程（MOB-P-001，计划 §6.1）：weapp（微信小程序）+ h5（Capacitor 壳的底座）。
// 业务事实与连接状态全部在 @kayingcode/mobile-client-core；本工程只做平台壳与页面绑定。
export default defineConfig(async (merge) => {
  const baseConfig = {
    projectName: "kayingcode-mobile",
    date: "2026-10-7",
    // 375 设计宽：样式按 iPhone 逻辑像素书写，pxtransform 直接换算 rpx。
    designWidth: 375,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 375: 2, 828: 1.81 / 2 },
    sourceRoot: "src",
    outputRoot: `dist/${process.env.TARO_ENV}`,
    plugins: [],
    defineConstants: {},
    copy: { patterns: [], options: {} },
    framework: "react",
    compiler: "webpack5",
    mini: {
      // 小程序产物根不是仓库约定的 sourceRoot 子路径，静态文件要显式列出。
      // sitemap.json 必须出现在产物根（与 app.json 的 sitemapLocation 对齐），而
      // Taro 不会自动拷贝 src 下的非入口 json。
      copy: {
        patterns: [{ from: "src/sitemap.json", to: `dist/${process.env.TARO_ENV}/sitemap.json` }],
        options: {},
      },
      webpackChain: platformWebpackChain,
      compile: {
        include: [...kayingcodeSourceInclude, ...zodSourceInclude],
      },
      postcss: {
        autoprefixer: { enable: true },
        cssModules: { enable: false },
      },
    },
    h5: {
      // 静态托管根相对路径；自托管/局域网联调场景（计划 §10.1）不依赖 CDN。
      publicPath: "/",
      staticDirectory: "static",
      outputRoot: "dist/h5",
      router: { mode: "browser" },
      webpackChain: platformWebpackChain,
      compile: {
        include: kayingcodeSourceInclude,
      },
      postcss: {
        autoprefixer: { enable: true },
        cssModules: { enable: false },
      },
    },
  };

  if (process.env.NODE_ENV === "development") {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
