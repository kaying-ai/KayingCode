# 旧移动接入退役

仅保留当前 V2 链接与上游工作台：自建 KayingCode 授权链接直接打开 Web，由 Web 单次领取邀请；原生 ZCode V2 使用现有账号与 ws2。移除旧 KayingcodeAdapter、配对/审核 REST、双腿 attachment、设备旧凭据与旧 HMAC proof。旧 origin#id#secret、v1 fragment 与 hash/t URL 明确拒绝，不回退旧后端。

设备档案只保存当前 V2 URL；Web 账号以 origin+device SID 去重，新邀请替换同设备链接，不能覆盖同服务器另一台电脑。档案导出不包含原生 V2 OAuth JWT，旧设备凭据不再读取或迁移。已有记录保留供用户删除/重新添加，不因升级清空存储。

AppSession 仍唯一拥有原生连接的代数、取消及工作区桥；旧 KayingCode 原生重连与配对意图退出，不能删除 ZCode V2 的 stale/generation 保护。全局 SDK 与 .fvmrc 不变。验收覆盖新链接与旧链接拒绝、档案去重、V2 token/秒级帧/角色和 SID 门禁、桥恢复；SDK 校验后运行 analyze 和现有测试，不把构建或替身测试写成真机通过。

构建入口同步移除已退役的原生 KayingCode Dart define 与 APK -native 分支。传入旧 --native-kayingcode 参数时在 SDK/文件操作之前明确拒绝；Android、上游固定 SDK wrapper 与鸿蒙独立 wrapper 均遵循同一规则。Node CLI 回归无需 Flutter SDK 验证拒绝路径。
