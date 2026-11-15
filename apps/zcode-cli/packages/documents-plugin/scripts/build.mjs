// 官方预览器构建入口：bootstrap 只接受插件根目录内的脚本路径，
// 实际构建仍复用共享的 office-runtime，避免四份构建清单漂移。
await import("../../office-runtime/scripts/build.mjs");
