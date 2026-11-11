import '../string_table.dart';

/// 通知、连接错误与协议错误中直接呈现给用户的文案。
const AppStringTable runtimeStrings = AppStringTable(
  area: 'runtime',
  zhCN: <String, String>{
    'notify.completion.failed': '任务失败',
    'notify.completion.interrupted': '任务中断',
    'notify.completion.completed': '任务完成',
    'notify.permission.waiting': '权限请求等待批准',
    'notify.permission.withTool': '权限请求 · {tool}',
    'notify.attention.input': '等待你的输入',
    'notify.running': '{count} 个任务运行中',
    'device.unnamed': '未命名设备',
    'connect.invalidUrl': '无法解析连接 URL（需为 https 且包含 sid/hash/t 参数）',
    'connect.accountRemoved': '连接已被移除',
    'connect.cancelled': '连接已取消',
    'connect.cancelledDuringConnect': '连接已取消：设备在连接完成前已断开或移除',
    'connect.sessionInvalid': '凭据已失效：请在桌面 KayingCode 重新生成远程控制链接，删除本设备后重新添加',
    'connect.sessionConflict': '连接冲突：同一凭据已有其他远程客户端在线，请先关闭其他客户端或重新生成链接',
    'connect.desktopDisconnected': '桌面端未连接：请打开桌面 KayingCode 并确认远程控制已开启',
    'connect.notConfirmed': '桌面未在超时内确认本次连接：请确认桌面在线后重试，或重新生成链接',
    'connect.relayUnavailable': '无法连接中继服务器：请检查网络，或服务暂时不可用',
    'connect.kicked': '已被桌面端断开（kicked）',
    'connect.authMalformed': '配对协议异常（挑战帧格式变化）：桌面端协议可能已变更，请导出协议日志反馈',
    'connect.pairingTimeout': '配对超时：桌面未响应，凭据可能已失效，或桌面端协议已变更（请导出协议日志排查）',
    'connect.network': '网络错误：无法到达服务器（{error}）',
    'protocol.savedCredentialUnavailable': '已保存的配对凭据不可用，请添加新的桌面配对码',
    'protocol.reviewClaimFailed': '审核码领取失败',
    'protocol.pairingClaimFailed': '配对申请失败',
    'protocol.pairingStatusFailed': '查询配对状态失败',
    'protocol.nodeListFailed': '获取节点列表失败',
    'protocol.workspaceListFailed': '获取工作区列表失败',
    'protocol.attachmentFailed': 'Relay 附件申请失败',
    'protocol.credentialRefreshFailed': '设备凭据刷新失败',
    'protocol.credentialMissing': '设备凭据缺失，请重新配对',
    'protocol.credentialInvalid': '设备凭据已失效，请重新配对',
    'protocol.credentialRefreshUnknown': '设备凭据刷新结果未知，请重新配对',
    'protocol.deviceRevoked': '设备已被撤销，请重新配对',
    'protocol.credentialExpired': '设备凭据已过期，请重新配对',
    'protocol.credentialRefreshInvalid': '设备凭据刷新响应无效，请重新配对',
    'protocol.credentialSaveFailed': '新设备凭据未能安全保存，请重新配对',
    'protocol.grantUnavailable': '配对授权已不可用，请添加新的桌面配对码',
    'protocol.pairingTargetAmbiguous': '配对目标不明确，请更新 Relay 并添加新的桌面配对码',
    'protocol.connectionClosed': '设备连接已关闭',
    'protocol.workspaceGenerationChanged': '工作区恢复请求已换代',
  },
  zhTW: <String, String>{
    'notify.completion.failed': '任務失敗',
    'notify.completion.interrupted': '任務中斷',
    'notify.completion.completed': '任務完成',
    'notify.permission.waiting': '權限請求等待核准',
    'notify.permission.withTool': '權限請求 · {tool}',
    'notify.attention.input': '等待你的輸入',
    'notify.running': '{count} 個任務執行中',
    'device.unnamed': '未命名裝置',
    'connect.invalidUrl': '無法解析連線 URL（需為 https 且包含 sid/hash/t 參數）',
    'connect.accountRemoved': '連線已遭移除',
    'connect.cancelled': '連線已取消',
    'connect.cancelledDuringConnect': '連線已取消：裝置在連線完成前已中斷或移除',
    'connect.sessionInvalid': '憑證已失效：請在桌面 KayingCode 重新產生遠端控制連結，刪除本裝置後重新新增',
    'connect.sessionConflict': '連線衝突：同一憑證已有其他遠端用戶端在線，請先關閉其他用戶端或重新產生連結',
    'connect.desktopDisconnected': '桌面端未連線：請開啟桌面 KayingCode 並確認遠端控制已開啟',
    'connect.notConfirmed': '桌面未在逾時內確認本次連線：請確認桌面在線後重試，或重新產生連結',
    'connect.relayUnavailable': '無法連線中轉伺服器：請檢查網路，或服務暫時無法使用',
    'connect.kicked': '已被桌面端中斷（kicked）',
    'connect.authMalformed': '配對協定異常（挑戰幀格式變更）：桌面端協定可能已變更，請匯出協定日誌回報',
    'connect.pairingTimeout': '配對逾時：桌面未回應，憑證可能已失效，或桌面端協定已變更（請匯出協定日誌排查）',
    'connect.network': '網路錯誤：無法連線至伺服器（{error}）',
    'protocol.savedCredentialUnavailable': '已儲存的配對憑證無法使用，請新增新的桌面配對碼',
    'protocol.reviewClaimFailed': '審核碼領取失敗',
    'protocol.pairingClaimFailed': '配對申請失敗',
    'protocol.pairingStatusFailed': '查詢配對狀態失敗',
    'protocol.nodeListFailed': '取得節點清單失敗',
    'protocol.workspaceListFailed': '取得工作區清單失敗',
    'protocol.attachmentFailed': 'Relay 附件申請失敗',
    'protocol.credentialRefreshFailed': '裝置憑證更新失敗',
    'protocol.credentialMissing': '缺少裝置憑證，請重新配對',
    'protocol.credentialInvalid': '裝置憑證已失效，請重新配對',
    'protocol.credentialRefreshUnknown': '裝置憑證更新結果未知，請重新配對',
    'protocol.deviceRevoked': '裝置已遭撤銷，請重新配對',
    'protocol.credentialExpired': '裝置憑證已過期，請重新配對',
    'protocol.credentialRefreshInvalid': '裝置憑證更新回應無效，請重新配對',
    'protocol.credentialSaveFailed': '新裝置憑證未能安全儲存，請重新配對',
    'protocol.grantUnavailable': '配對授權已無法使用，請新增新的桌面配對碼',
    'protocol.pairingTargetAmbiguous': '配對目標不明確，請更新 Relay 並新增新的桌面配對碼',
    'protocol.connectionClosed': '裝置連線已關閉',
    'protocol.workspaceGenerationChanged': '工作區恢復請求已換代',
  },
  enUS: <String, String>{
    'notify.completion.failed': 'Task failed',
    'notify.completion.interrupted': 'Task interrupted',
    'notify.completion.completed': 'Task completed',
    'notify.permission.waiting': 'Permission request awaiting approval',
    'notify.permission.withTool': 'Permission request · {tool}',
    'notify.attention.input': 'Waiting for your input',
    'notify.running': '{count} tasks running',
    'device.unnamed': 'Unnamed device',
    'connect.invalidUrl':
        'Could not parse the connection URL (must be https and include sid/hash/t parameters)',
    'connect.accountRemoved': 'The connection was removed',
    'connect.cancelled': 'Connection cancelled',
    'connect.cancelledDuringConnect':
        'Connection cancelled: the device was disconnected or removed before connecting finished',
    'connect.sessionInvalid':
        'Credentials expired: regenerate the remote-control link in KayingCode Desktop, remove this device, then add it again',
    'connect.sessionConflict':
        'Connection conflict: another remote client is already online with the same credentials. Close the other client or regenerate the link.',
    'connect.desktopDisconnected':
        'Desktop not connected: open KayingCode Desktop and make sure remote control is enabled',
    'connect.notConfirmed':
        'Desktop did not confirm this connection before timing out: make sure the desktop is online and retry, or regenerate the link',
    'connect.relayUnavailable':
        'Could not reach the relay server: check your network, or the service may be temporarily unavailable',
    'connect.kicked': 'Disconnected by the desktop (kicked)',
    'connect.authMalformed':
        'Pairing protocol error (challenge frame format changed): the desktop protocol may have changed. Export protocol logs and report the issue.',
    'connect.pairingTimeout':
        'Pairing timed out: the desktop did not respond. The credentials may have expired, or the desktop protocol changed (export protocol logs to investigate).',
    'connect.network': 'Network error: could not reach the server ({error})',
    'protocol.savedCredentialUnavailable':
        'The saved pairing credential is unavailable. Add a new desktop pairing code.',
    'protocol.reviewClaimFailed': 'Failed to claim the review code',
    'protocol.pairingClaimFailed': 'Failed to request pairing',
    'protocol.pairingStatusFailed': 'Failed to check pairing status',
    'protocol.nodeListFailed': 'Failed to load the node list',
    'protocol.workspaceListFailed': 'Failed to load the workspace list',
    'protocol.attachmentFailed': 'Failed to request a Relay attachment',
    'protocol.credentialRefreshFailed': 'Failed to refresh device credentials',
    'protocol.credentialMissing': 'Device credentials are missing. Pair again.',
    'protocol.credentialInvalid':
        'Device credentials are no longer valid. Pair again.',
    'protocol.credentialRefreshUnknown':
        'The credential refresh result is unknown. Pair again.',
    'protocol.deviceRevoked': 'The device was revoked. Pair again.',
    'protocol.credentialExpired': 'Device credentials expired. Pair again.',
    'protocol.credentialRefreshInvalid':
        'The credential refresh response is invalid. Pair again.',
    'protocol.credentialSaveFailed':
        'The new device credentials could not be saved securely. Pair again.',
    'protocol.grantUnavailable':
        'The pairing grant is no longer available. Add a new desktop pairing code.',
    'protocol.pairingTargetAmbiguous':
        'The pairing target is ambiguous. Update Relay and add a new desktop pairing code.',
    'protocol.connectionClosed': 'The device connection is closed',
    'protocol.workspaceGenerationChanged':
        'The workspace restore request was superseded',
  },
  ruRU: <String, String>{
    'notify.completion.failed': 'Задача не выполнена',
    'notify.completion.interrupted': 'Задача прервана',
    'notify.completion.completed': 'Задача выполнена',
    'notify.permission.waiting': 'Запрос разрешения ожидает подтверждения',
    'notify.permission.withTool': 'Запрос разрешения · {tool}',
    'notify.attention.input': 'Ожидается ваш ответ',
    'notify.running': 'Выполняется задач: {count}',
    'device.unnamed': 'Безымянное устройство',
    'connect.invalidUrl':
        'Не удалось разобрать URL подключения (нужен https и параметры sid/hash/t)',
    'connect.accountRemoved': 'Подключение было удалено',
    'connect.cancelled': 'Подключение отменено',
    'connect.cancelledDuringConnect':
        'Подключение отменено: устройство отключилось или было удалено до завершения',
    'connect.sessionInvalid':
        'Учётные данные недействительны: создайте ссылку удалённого управления заново в настольном KayingCode, удалите это устройство и добавьте его снова',
    'connect.sessionConflict':
        'Конфликт подключения: с этими учётными данными уже работает другой удалённый клиент. Закройте его или создайте новую ссылку.',
    'connect.desktopDisconnected':
        'Компьютер не подключён: откройте настольный KayingCode и убедитесь, что удалённое управление включено',
    'connect.notConfirmed':
        'Компьютер не подтвердил подключение до истечения времени: убедитесь, что он в сети, и повторите или создайте новую ссылку',
    'connect.relayUnavailable':
        'Не удалось связаться с сервером-ретранслятором: проверьте сеть — возможно, сервис временно недоступен',
    'connect.kicked': 'Компьютер отключил это устройство (kicked)',
    'connect.authMalformed':
        'Ошибка протокола сопряжения (изменился формат кадра запроса): протокол компьютера мог обновиться. Экспортируйте журнал протокола и сообщите о проблеме.',
    'connect.pairingTimeout':
        'Время сопряжения истекло: компьютер не ответил. Учётные данные могли устареть или протокол изменился (экспортируйте журнал протокола для диагностики).',
    'connect.network': 'Ошибка сети: сервер недоступен ({error})',
    'protocol.savedCredentialUnavailable':
        'Сохранённые учётные данные сопряжения недоступны. Добавьте новый код сопряжения с компьютером.',
    'protocol.reviewClaimFailed': 'Не удалось получить код проверки',
    'protocol.pairingClaimFailed': 'Не удалось запросить сопряжение',
    'protocol.pairingStatusFailed': 'Не удалось проверить состояние сопряжения',
    'protocol.nodeListFailed': 'Не удалось загрузить список узлов',
    'protocol.workspaceListFailed':
        'Не удалось загрузить список рабочих областей',
    'protocol.attachmentFailed': 'Не удалось запросить вложение Relay',
    'protocol.credentialRefreshFailed':
        'Не удалось обновить учётные данные устройства',
    'protocol.credentialMissing':
        'Учётные данные устройства отсутствуют. Выполните сопряжение заново.',
    'protocol.credentialInvalid':
        'Учётные данные устройства недействительны. Выполните сопряжение заново.',
    'protocol.credentialRefreshUnknown':
        'Результат обновления учётных данных неизвестен. Выполните сопряжение заново.',
    'protocol.deviceRevoked':
        'Устройство отозвано. Выполните сопряжение заново.',
    'protocol.credentialExpired':
        'Срок действия учётных данных истёк. Выполните сопряжение заново.',
    'protocol.credentialRefreshInvalid':
        'Некорректный ответ на обновление учётных данных. Выполните сопряжение заново.',
    'protocol.credentialSaveFailed':
        'Не удалось безопасно сохранить новые учётные данные. Выполните сопряжение заново.',
    'protocol.grantUnavailable':
        'Разрешение на сопряжение больше недоступно. Добавьте новый код сопряжения с компьютером.',
    'protocol.pairingTargetAmbiguous':
        'Цель сопряжения неоднозначна. Обновите Relay и добавьте новый код сопряжения с компьютером.',
    'protocol.connectionClosed': 'Подключение к устройству закрыто',
    'protocol.workspaceGenerationChanged':
        'Запрос восстановления рабочей области устарел',
  },
);
