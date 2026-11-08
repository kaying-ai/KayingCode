# 移动 WebView 外壳合同

移动产品仅接受 KayingCode V2 Web 授权链接。AccountStore / mobile-client-core 拥有设备档案；网页独自拥有鉴权、连接、工作区、会话、终端与恢复，外壳不建立原生连接。ZCode 产品连接入口、扫码、粘贴、导入与旧档案打开均被移除；共享协议代码不属于产品入口。

三个 Tab 为会话列表、项目列表、我的。会话列表提供工作台及连接管理入口；最近项目只保存由当前可信网页成功打开的项目元数据，按 accountId、deviceSid 与 workspaceIdentity.trim() || workspacePath 隔离。项目导航由网页通过现有 Host 重新核验，不能重用旧 session 或 lease。删除设备后其项目不再显示。

消息合同与时序、平台投递和验收见 [WebView 导航规范](spec/mobile-webview-tabs.md)。微信在返回时批量投递消息，H5 验证 iframe source 与 origin；Flutter WebView channel 验证当前 origin。桌面 continuous 和手机 replayable 语义不变。
