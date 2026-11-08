import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  resolveKayingCodeEndpointOrigin,
  pickProductEndpointEnv,
} from "@zcode/shared/kayingcodeEndpoint";
import { pdfJsCMapsPlugin } from "../../packages/ui/vite/pdfJsCMapsPlugin.js";
import { getBuildMetadata } from "./scripts/build-metadata.mjs";
import { resolveDesktopProductFlavor } from "./scripts/desktop-product-identity.mjs";
import { readUpstreamBaseVersion } from "../../scripts/upstream-version.mjs";

const buildMetadata = getBuildMetadata();
const desktopRequire = createRequire(import.meta.url);

interface IstanbulInstrumenter {
  instrumentSync(sourceCode: string, filename: string): string;
  lastFileCoverage(): unknown;
  lastSourceMap(): object | null;
}

interface IstanbulLibInstrument {
  createInstrumenter(options: {
    autoWrap: boolean;
    compact: boolean;
    coverageGlobalScope: string;
    coverageGlobalScopeFunc: boolean;
    esModules: boolean;
    parserPlugins: string[];
    preserveComments: boolean;
    produceSourceMap: boolean;
  }): IstanbulInstrumenter;
}

const { createInstrumenter } = desktopRequire("istanbul-lib-instrument") as IstanbulLibInstrument;

function resolveInstalledPackageRoot(packageName: string): string {
  return dirname(desktopRequire.resolve(`${packageName}/package.json`));
}

export const desktopRendererDependencyAliases = {
  // pnpm hoisted/package-local 布局会随安装配置变化；硬编码 node_modules 子路径
  // 会让 Rolldown 依赖优化把 react/jsx-runtime 等入口解析到不存在的位置。
  // 通过 Node 解析真实安装根目录，既保留单 React runtime，又兼容不同 node-linker。
  react: resolveInstalledPackageRoot("react"),
  "react-dom": resolveInstalledPackageRoot("react-dom"),
  "lucide-react": resolveInstalledPackageRoot("lucide-react"),
} as const;

function resolveKayingCodeEnv(value: string | undefined): "test" | "production" {
  return value?.trim().toLowerCase() === "production" ? "production" : "test";
}

function createE2EUIRendererCoveragePlugin(repoRoot: string): Plugin {
  const sourceRoots = [
    resolve(repoRoot, "packages/ui/src"),
    resolve(repoRoot, "packages/desktop/src/renderer"),
  ].map(normalizePathForVite);
  const instrumenter = createInstrumenter({
    autoWrap: true,
    compact: false,
    coverageGlobalScope: "globalThis",
    coverageGlobalScopeFunc: false,
    esModules: true,
    parserPlugins: ["typescript", "jsx"],
    preserveComments: true,
    produceSourceMap: true,
  });
  const baselineCoverage: Record<string, unknown> = {};
  const baselinePath = resolve(
    repoRoot,
    "packages/desktop/out/renderer/e2e-coverage-baseline.json",
  );

  return {
    name: "kayingcode:e2e-ui-source-coverage",
    enforce: "pre",
    transform(sourceCode, id, options) {
      if (options?.ssr || id.startsWith("\0")) {
        return null;
      }
      const filename = stripViteRequestQuery(id);
      const absoluteFilename = isAbsolute(filename) ? filename : resolve(repoRoot, filename);
      const normalizedFilename = normalizePathForVite(absoluteFilename);
      if (!shouldInstrumentE2EUISource(normalizedFilename, sourceRoots)) {
        return null;
      }

      // post-transform 插桩依赖 Vite/React/esbuild 的合并 sourcemap，
      // 会把生成后的 JS 覆盖点反投影到 import、interface 等 TS 源码行上。
      // 这里先对原始 TS/TSX AST 插桩，再交给 Vite 编译，保证 coverage map 只包含真实运行时代码。
      const code = instrumenter.instrumentSync(sourceCode, normalizedFilename);
      baselineCoverage[normalizedFilename] = JSON.parse(
        JSON.stringify(instrumenter.lastFileCoverage()),
      );
      return {
        code,
        map: instrumenter.lastSourceMap(),
      };
    },
    closeBundle() {
      // 只读取页面 __coverage__ 会让从未加载的 lazy chunk 消失，分母被缩小。
      // coverage build 将完整 renderer graph 的零命中 map 留给 suite reporter 合并。
      mkdirSync(dirname(baselinePath), { recursive: true });
      writeFileSync(baselinePath, `${JSON.stringify(baselineCoverage, null, 2)}\n`, "utf-8");
    },
  };
}

function shouldInstrumentE2EUISource(filename: string, sourceRoots: string[]) {
  return (
    isCoverageSourceFile(filename) &&
    !filename.includes("/node_modules/") &&
    !isDeclarationFile(filename) &&
    !isTestSourceFile(filename) &&
    sourceRoots.some((sourceRoot) => isInsidePath(filename, sourceRoot))
  );
}

function isCoverageSourceFile(filename: string) {
  return [".cts", ".cjs", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].includes(extname(filename));
}

function isDeclarationFile(filename: string) {
  return /\.d\.[cm]?ts$/u.test(filename);
}

function isTestSourceFile(filename: string) {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(filename);
}

function isInsidePath(filename: string, directory: string) {
  return filename === directory || filename.startsWith(`${directory}/`);
}

function normalizePathForVite(path: string) {
  return path.replaceAll("\\", "/");
}

function stripViteRequestQuery(id: string) {
  return id.split("?")[0] ?? id;
}

function createReactScanDevPlugin(): Plugin {
  const scriptPath = normalizePathForVite(desktopRequire.resolve("react-scan/dist/auto.global.js"));
  return {
    name: "kayingcode:react-scan",
    apply: "serve",
    transformIndexHtml: {
      order: "post",
      handler(_html, context) {
        if (context.path !== "/index.html") return [];
        // Scan 必须先安装 hook，再加载 React；普通 head script 保证顺序，避免异步导入漏掉首次挂载。
        return [{ tag: "script", attrs: { src: `/@fs/${scriptPath}` }, injectTo: "head-prepend" }];
      },
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // `.env*` 只提供链接常量；当前产品环境由启动脚本或 CI 注入 KAYINGCODE_ENV。
  const env = loadEnv(mode, "../..", "");
  const repoRoot = resolve(__dirname, "../..");
  const upstreamZcodeVersion = readUpstreamBaseVersion(repoRoot);
  const kayingcodeEnv = resolveKayingCodeEnv(env.KAYINGCODE_ENV);
  // 安装包身份与后端环境分轴；renderer 用它决定是否展示更新入口。
  const kayingcodeProductFlavor = resolveDesktopProductFlavor({
    ...process.env,
    ...env,
    KAYINGCODE_ENV: kayingcodeEnv,
  });
  const e2eCoverageEnabled =
    env.KAYINGCODE_E2E_COVERAGE === "1" || process.env.KAYINGCODE_E2E_COVERAGE === "1";
  const e2eStoreBridgeEnabled =
    env.VITE_KAYINGCODE_E2E_STORE_BRIDGE === "1" ||
    process.env.VITE_KAYINGCODE_E2E_STORE_BRIDGE === "1";
  const kayingcodeEndpointOrigin = resolveKayingCodeEndpointOrigin({
    env: kayingcodeEnv,
    envBaseOrigin:
      env.KAYINGCODE_BASE_URL ??
      env.KAYINGCODE_ENDPOINT_ORIGIN ??
      (kayingcodeEnv === "production"
        ? env.KAYINGCODE_PRODUCTION_BASE_URL
        : env.KAYINGCODE_TEST_BASE_URL),
  });
  const plugins = [
    // 仅开发服务器装配，所有 build 都不注入；默认关闭，只有显式设置 KAYINGCODE_REACT_SCAN=1
    // 时才加载性能工具，避免日常开发被 FPS 工具条和额外渲染开销打扰。
    ...(command === "serve" && mode !== "production" && env.KAYINGCODE_REACT_SCAN === "1"
      ? [createReactScanDevPlugin()]
      : []),
    ...(e2eCoverageEnabled ? [createE2EUIRendererCoveragePlugin(repoRoot)] : []),
    pdfJsCMapsPlugin(),
    react(),
    tailwindcss(),
  ];

  return {
    root: "src/renderer",
    plugins,
    resolve: {
      alias: {
        // 修复 UI 组件库中的 @ 别名解析失败。
        // 问题原因：desktop 会直接打包 packages/ui 的源码，但当前 Vite 配置不知道 @ 应该指向 packages/ui/src，
        // 导致 spinner、alert 等组件里的内部导入在构建时全部失效。
        // 这里在消费端补齐别名，比逐个改组件导入更稳，也能和 web 端保持一致。
        "@": resolve(__dirname, "../../packages/ui/src"),
        // Local preview only: the services barrel also exposes node-only modules.
        // Reuse the web shims so the renderer can boot without Electron main code.
        "node:crypto": resolve(__dirname, "../web/src/shims/node-crypto.ts"),
        "node:fs/promises": resolve(__dirname, "../web/src/shims/node-fs-promises.ts"),
        "node:fs": resolve(__dirname, "../web/src/shims/node-fs.ts"),
        "node:module": resolve(__dirname, "../web/src/shims/node-module.ts"),
        "node:os": resolve(__dirname, "../web/src/shims/node-os.ts"),
        "node:path": resolve(__dirname, "../web/src/shims/node-path.ts"),
        "node:sqlite": resolve(__dirname, "../web/src/shims/node-sqlite.ts"),
        "node:v8": resolve(__dirname, "../web/src/shims/node-v8.ts"),
        ...desktopRendererDependencyAliases,
        // Recharts 通过 d3-shape 读取 d3-path 的 Path 导出；hoisted node_modules
        // 里可能残留 d3-shape/node_modules/d3-path@1.x，Vite 预构建会优先命中旧包并报 Missing export。
        // 这里把 d3-path 固定到根部 3.x 入口，确保桌面端依赖优化和运行时解析一致。
        "d3-path": resolve(__dirname, "../../node_modules/d3-path/src/index.js"),
      },
      dedupe: ["react", "react-dom", "lucide-react"],
    },
    // 构建后首次 dev 启动曾出现「闪屏/loading 完整重放两轮」：页面已运行后 Vite 才发现
    // 新依赖并重跑预构建（node_modules/.vite/deps 整批重写），触发
    // "optimized dependencies changed" → 整页 full-reload，整个启动序列
    // （HTML 闪屏壳 → 启动阻塞页 → workspace 恢复）被重放，用户看到工作区后又跳回 loading。
    optimizeDeps: {
      // 冷启动扫描同时覆盖两个 HTML 入口和 Worker 源文件：扫描器不会自动爬
      // `new Worker(new URL(...))` 的模块图，diffs Worker 专属的
      // @pierre/diffs/worker/worker.js 会到 Worker 池启动时才被请求发现（重放元凶）。
      // entries 会覆盖默认入口推断，Worker 文件以 packages/ui 为 importer 才能解析到
      // packages/ui/node_modules 下的 @pierre/diffs。
      entries: [
        "index.html",
        "resource-manager.html",
        "../../../../packages/ui/src/workers/diffs.worker.ts",
        "../../../../packages/ui/src/workspace-file-search/workspaceFileSearchFilter.worker.ts",
      ],
      // 只被懒 chunk / Worker 引用的 bare 入口不一定被冷启动扫描第一批发现，
      // 显式预声明让第一批预构建即为全集，运行期不再触发重优化与整页 reload。
      // 列表取自实际预构建产物的入口全集；新增这类第三方依赖入口时同步补进来。
      include: [
        "@aiden0z/pptx-renderer/browser",
        "@dnd-kit/core",
        "@dnd-kit/sortable",
        "@dnd-kit/utilities",
        "@extend-ai/react-docx",
        "@extend-ai/react-xlsx",
        "@lexical/react/LexicalComposer",
        "@lexical/react/LexicalComposerContext",
        "@lexical/react/LexicalContentEditable",
        "@lexical/react/LexicalHistoryPlugin",
        "@lexical/react/LexicalPlainTextPlugin",
        "@pierre/diffs",
        "@pierre/diffs/react",
        "@pierre/diffs/worker/worker.js",
        "@radix-ui/react-use-controllable-state",
        "@streamdown/cjk",
        "@streamdown/code",
        "@streamdown/math",
        "@streamdown/mermaid",
        "@tanstack/react-virtual",
        "@xterm/addon-clipboard",
        "@xterm/addon-fit",
        "@xterm/xterm",
        "border-beam",
        "class-variance-authority",
        "clsx",
        "cmdk",
        "croner",
        "docx-preview",
        "lexical",
        "lucide-react",
        "lucide-react/dynamic.mjs",
        "motion/react",
        "nanoid",
        "pinyin-pro",
        "qrcode",
        "radix-ui",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
        "react-pdf",
        "react-resizable-panels",
        "recharts",
        "remark-cjk-friendly-gfm-strikethrough",
        "shiki",
        "streamdown",
        "swr",
        "tailwind-merge",
        "tokenlens",
        "zod",
        "zustand",
        "zustand/react/shallow",
      ],
    },
    server: { port: 5174, strictPort: true },
    define: {
      __KAYINGCODE_VERSION__: JSON.stringify(buildMetadata.appVersion),
      __ZCODE_UPSTREAM_VERSION__: JSON.stringify(upstreamZcodeVersion),
      __KAYINGCODE_MIN_COMPATIBLE_VERSION__: JSON.stringify(buildMetadata.minCompatibleVersion),
      __KAYINGCODE_COMMIT__: JSON.stringify(buildMetadata.buildCommitId),
      __KAYINGCODE_BUILD_TIME__: JSON.stringify(buildMetadata.buildTime),
      __KAYINGCODE_ENV__: JSON.stringify(kayingcodeEnv),
      __KAYINGCODE_PRODUCT_FLAVOR__: JSON.stringify(kayingcodeProductFlavor),
      __KAYINGCODE_LOCAL_DEVELOPMENT_RUNTIME__: JSON.stringify(mode !== "production"),
      "import.meta.env.VITE_KAYINGCODE_BASE_URL": JSON.stringify(kayingcodeEndpointOrigin),
      // 兼容旧 renderer 读取名；新代码统一读 VITE_KAYINGCODE_BASE_URL。
      "import.meta.env.VITE_KAYINGCODE_ENDPOINT_ORIGIN": JSON.stringify(kayingcodeEndpointOrigin),
      "import.meta.env.VITE_CODING_PLAN_WEBVIEW_ORIGIN": JSON.stringify(""),
      "import.meta.env.VITE_REWARDS_WEBVIEW_ORIGIN": JSON.stringify(
        env.VITE_REWARDS_WEBVIEW_ORIGIN ?? process.env.VITE_REWARDS_WEBVIEW_ORIGIN ?? "",
      ),
      // E2E store bridge 只能由 WDIO 专用变量打开，避免把 KAYINGCODE_ENV=test 产品环境误当成测试运行态。
      "import.meta.env.VITE_KAYINGCODE_E2E_STORE_BRIDGE": JSON.stringify(
        e2eStoreBridgeEnabled ? "1" : "",
      ),
    },
    // Electron 用 file:// 协议加载页面，资源路径必须是相对路径，否则会 ERR_FILE_NOT_FOUND
    base: "./",
    worker: {
      rollupOptions: {
        // @pierre/diffs 的 worker 入口依赖 import 后注册 message 监听。
        // 它的 package sideEffects 漏声明会让生产 worker 子构建被摇成 0B；
        // 只关闭 worker 构建的摇树，避免影响主包。
        treeshake: false,
      },
    },
    build: {
      outDir: "../../out/renderer",
      emptyOutDir: true,
      // 生产包若直接暴露 sourceMappingURL，攻击者可在客户端侧还原业务源码。
      // 生产使用 hidden sourcemap：本地/发布流程保留 .map，不在产物里暴露映射入口。
      sourcemap: mode === "production" ? "hidden" : true,
      rollupOptions: {
        // 多入口：主窗口 + 进程监控
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          "resource-manager": resolve(__dirname, "src/renderer/resource-manager.html"),
          // 插件 UI 沙箱的受信 shell，经 kayingcode-sandbox:// 提供
          "plugin-sandbox": resolve(__dirname, "src/renderer/plugin-sandbox.html"),
        },
      },
    },
  };
});
