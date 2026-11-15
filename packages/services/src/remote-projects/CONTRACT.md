# 远端项目成员与线路预留

`prepareRemoteServerConnection` 在 probe 前按地址写入本机成员预留，握手成功后才把地址行改名为设备行；线路删除或改址必须归还这份预留。

`releaseRemoteProjectProfileHost` 是 admission 的对称释放：未识别线路（无 `sourceServerId`）删除或改址后，若没有其他未归档线路映射到同一地址、且地址行没有侧栏入口，移除该预留行。已识别线路属于设备行，只经 `removeSourceServer` 移除；有入口的旧迁移行保留，由用户显式移除连接。

`remoteProjectHostIdForProfile` 用于 admission，地址不能构成成员身份时抛错并拒绝连接；`findRemoteProjectHostIdForProfile` 用于按线路枚举成员行（释放、连接状态投影、`connectHost` 选线），身份无效时返回 `null`，表示该线路不拥有成员行。枚举不能使用抛错版本，否则一条无效线路会让整个枚举失败。

Host 在 `removeProfile` / `updateProfile` 成功后调用释放端口；设置写入失败时线路仍保留，下一次 add 连接会重建预留。
