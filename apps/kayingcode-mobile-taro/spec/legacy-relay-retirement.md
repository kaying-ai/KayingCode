# 当前 V2 接入边界

自托管 KayingCode 档案只接受 HTTPS `/remote/v4?sid=…#authorize=…`，在 WebView 中原样打开；容器不请求旧配置发现、不 claim、不建立自有 socket。不兼容旧配对码、审核码、fragment v1 或 hash/t。删除旧 pair 页面及 Node attachment 编排。

H5 的上游 ZCode 档案同样打开完整 Web URL；微信小程序保留上游 V2 OAuth/ws2 原生渠道。flow/store 只保留当前连接和页面线索，不持有业务事实。当前 Web 导航唯一在途；刷新或错误重试只保留一个 WebView，旧 load/error 不覆盖新实例。Web 自己拥有授权、会话和恢复。

档案由 mobile-client-core 管理：自托管同 origin+SID 的新邀请更新原档案，其他 SID 独立；旧档案不自动删除，重新添加有效 V2 链接。验证包括 core/parser、导航单元测试、H5 三入口/刷新/重试/迟到事件 E2E；微信真实域名与授权联调需独立验收。

首启与设备页的添加说明统一要求桌面生成的完整 V2 授权链接，不再提示旧配对字段或电脑审批流程。H5 E2E 验证这两个入口的说明与占位符。`pairing` 仍表示上游原生 ZCode 的 waiting 授权阶段，不能因旧 KayingCode 配对退役而删除。
