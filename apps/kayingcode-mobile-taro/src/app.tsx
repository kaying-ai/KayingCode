// 应用入口：先补运行时全局、再注入平台端口（MOB-P-002 阶段一），然后走 Taro 生命周期。
// core 的端口消费全部惰性解析（currentRelayPlatformPorts），因此本文件的
// configure 调用时序先于任何页面触发的端口消费，不受 ESM import 求值顺序影响。
//
// 第一个 import 必须是 zod 的预置开关：zod 的 JIT 判定在 schema 构造时快照，本仓库的
// schema 都在 import 求值时构造，事后再调 z.config() 已经来不及（详见该模块注释）。
import "@zcode/shared/zod-jitless";
import { configureRelayPlatformPorts } from "@kayingcode/mobile-client-core";
import type { MobileAppShellProps } from "./contract";
import { installRuntimeGlobals } from "./ports/runtimeGlobals";
import { taroPlatformPorts } from "./ports/taroPlatform";
import { taroRandomSource } from "./ports/taroRandomSource";
import "./app.css";
import "./ui/shell.css";
import "./ui/icons/material-icons.css";
import "./ui/icons/icon.css";
import "./ui/chat/chat.css";

// 小程序没有 TextEncoder/TextDecoder/btoa/atob/crypto.getRandomValues，而 wire 层
// 每帧都要用它们；必须在任何页面或协议代码之前补齐（幂等，H5 有原生实现时跳过）。
installRuntimeGlobals(taroRandomSource());
configureRelayPlatformPorts(taroPlatformPorts);

function App({ children }: MobileAppShellProps) {
  return children;
}

export default App;
