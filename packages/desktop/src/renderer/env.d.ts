/// <reference types="vite/client" />

// Renderer 复用 Client 的公开 preload 声明，避免另定义一份桥接接口。
import "@zcode/client/globals";
