// 设备管理页（对齐 Flutter DeviceManagementPage）：设备档案的增删改查与导入导出。
//
// 旧配对入口已退役；自托管档案只交给 Web，提示必须与 V2 URL 解析规则一致。
// 上游 ZCode 原生连接仍由会话 Tab 管理。
//
// 平台能力用等价实现（spec 允许）：扫码走 Taro.scanCode，H5 不支持时回落粘贴；
// 导入导出走剪贴板文本，不依赖各端不一致的文件选择器。
import { useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import {
  MOBILE_BACKEND_DISPLAY_NAME,
  describeMobileRemote,
  exportMobileAccounts,
  importMobileAccounts,
  mobileAccountParams,
  parseMobileConnection,
  removeMobileAccount,
  renameMobileAccount,
  type MobileAccount,
} from "@kayingcode/mobile-client-core";
import { addAccountFromInput, forceAddAccountFromInput } from "../../flow/session";
import { flow } from "../../flow/store";
import { useFlow } from "../../flow/useFlow";
import { ConfirmDialog, PromptDialog } from "../../ui/dialog";
import { Icon } from "../../ui/icons/Icon";
import { goBack } from "../../ui/navigation";
import { useTheme } from "../../ui/theme";
import { useConnectionScanner } from "../../ui/useConnectionScanner";
import { openZcodeWebsite } from "../../ui/zcodeWebsite";

import "./index.css";

export default function DevicePage() {
  const theme = useTheme();
  const state = useFlow();

  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MobileAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MobileAccount | null>(null);
  const [unknownUrl, setUnknownUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // 从配对页返回时刷新档案（档案由 core 落盘，本页只读快照）。
  useDidShow(() => {
    flow.refreshAccounts();
  });

  const commit = (rawUrl: string) => {
    const result = addAccountFromInput(rawUrl);
    if (result.status === "invalid") {
      setMessage("无法解析该连接信息");
      return;
    }
    if (result.status === "unknown-host") {
      setUnknownUrl(rawUrl);
      return;
    }
    setMessage("");
    flow.refreshAccounts();
    // 网页唯一拥有 claim；壳层只落档案并打开同一个容器入口。
    if (result.account.backendType === "kayingcode") {
      openZcodeWebsite(result.account);
      return;
    }
  };

  const scanner = useConnectionScanner(commit);
  const scan = () => {
    setAddOpen(false);
    scanner.scan();
  };

  const doExport = () => {
    setExportOpen(false);
    void Taro.setClipboardData({ data: exportMobileAccounts() }).then(() =>
      Taro.showToast({ title: "设备档案已复制到剪贴板", icon: "none" }),
    );
  };

  const doImport = (raw: string) => {
    setImportOpen(false);
    try {
      const decoded = JSON.parse(raw);
      const items = Array.isArray(decoded) ? decoded : decoded.accounts;
      if (!Array.isArray(items)) throw new Error("无效的设备档案");
      const filtered = items.filter(
        (item: { url?: string }) =>
          typeof item?.url === "string" &&
          parseMobileConnection(item.url)?.backendType === "kayingcode",
      );
      const added = importMobileAccounts(
        JSON.stringify(Array.isArray(decoded) ? filtered : { ...decoded, accounts: filtered }),
      );
      flow.refreshAccounts();
      setMessage(added > 0 ? `已导入 ${added} 台设备` : "没有新的设备可导入");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "导入失败");
    }
  };

  return (
    <View className={theme.className}>
      <View className="screen">
        <View className="topbar settings-topbar">
          <Icon className="icon-button" name="arrow_back" size={20} onClick={() => goBack()} />
          <View className="topbar-main">
            <Text className="screen-title">设备管理</Text>
            <Text className="topbar-subtitle">{state.accounts.length} 台设备</Text>
          </View>
          <Icon
            className="icon-button"
            name="settings_backup_restore"
            size={20}
            onClick={() => setImportOpen(true)}
          />
          <Icon
            className="icon-button"
            name="save_outlined"
            size={20}
            onClick={() => setExportOpen(true)}
          />
        </View>

        {state.accounts.map((account) => {
          const remote = describeMobileRemote(mobileAccountParams(account));
          const current = account.id === state.activeAccountId;
          return (
            <View key={account.id} className="surface-card device-card">
              <View className="device-card-head">
                <Text className="device-avatar">{account.label.slice(0, 1).toUpperCase()}</Text>
                <View className="list-main">
                  <Text className="list-title">{account.label}</Text>
                  <View className="bot-card-meta">
                    <Text className="bot-badge">
                      {MOBILE_BACKEND_DISPLAY_NAME[account.backendType]}
                    </Text>
                    {current ? <Text className="status status-running">当前</Text> : null}
                    {account.backendType === "kayingcode" ? (
                      <Text className="status">Web 工作台</Text>
                    ) : null}
                  </View>
                  <Text className="caption">{remote}</Text>
                </View>
              </View>
              <View className="device-card-actions">
                {account.backendType === "kayingcode" ? (
                  <Button
                    className="action action-primary device-action"
                    onClick={() => openZcodeWebsite(account)}
                  >
                    打开网页
                  </Button>
                ) : null}

                <Button
                  className="action action-secondary device-action"
                  onClick={() => setRenameTarget(account)}
                >
                  重命名
                </Button>
                <Button
                  className="action action-danger device-action"
                  onClick={() => setDeleteTarget(account)}
                >
                  删除
                </Button>
              </View>
            </View>
          );
        })}

        <View className="device-add" onClick={() => setAddOpen(true)}>
          <Text>
            <Icon name="add" size={14} /> 添加设备
          </Text>
        </View>
        {message ? <Text className="message">{message}</Text> : null}
      </View>

      {addOpen ? (
        <View className="dialog-overlay" onClick={() => setAddOpen(false)}>
          <View className="dialog-card">
            <Text className="dialog-title">添加设备</Text>
            <View className="list-card device-add-choice" onClick={() => void scan()}>
              <View className="list-main">
                <Text className="list-title">扫码添加</Text>
                <Text className="list-subtitle">扫描电脑端生成的二维码</Text>
              </View>
              <Icon name="chevron_right" size={18} className="muted" />
            </View>
            <View
              className="list-card device-add-choice"
              onClick={() => {
                setAddOpen(false);
                setPasteOpen(true);
              }}
            >
              <View className="list-main">
                <Text className="list-title">粘贴链接添加</Text>
                <Text className="list-subtitle">粘贴桌面生成的完整授权链接</Text>
              </View>
              <Icon name="chevron_right" size={18} className="muted" />
            </View>
            <View className="dialog-actions">
              <Text className="action action-ghost" onClick={() => setAddOpen(false)}>
                取消
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {pasteOpen ? (
        <PromptDialog
          title="粘贴连接信息"
          message="粘贴桌面生成的完整 V2 授权链接。"
          placeholder="https://…/remote/v4?sid=…#authorize=…"
          multiline
          confirmLabel="添加"
          onCancel={() => setPasteOpen(false)}
          onSubmit={(value) => {
            setPasteOpen(false);
            commit(value);
          }}
        />
      ) : null}

      {importOpen ? (
        <PromptDialog
          title="导入设备"
          message="粘贴之前导出的设备档案（JSON 文本）。已存在的服务器会被跳过。"
          placeholder='{"app":"kayingcode",...}'
          multiline
          confirmLabel="导入"
          onCancel={() => setImportOpen(false)}
          onSubmit={doImport}
        />
      ) : null}

      {exportOpen ? (
        <ConfirmDialog
          title="导出设备档案？"
          message="导出内容包含连接信息，连接地址含授权信息。请只保存在可信位置，不要公开转发。导出后会复制到剪贴板。"
          confirmLabel="复制到剪贴板"
          onCancel={() => setExportOpen(false)}
          onConfirm={doExport}
        />
      ) : null}

      {renameTarget ? (
        <PromptDialog
          title="修改本地名称"
          initial={renameTarget.label}
          confirmLabel="保存"
          onCancel={() => setRenameTarget(null)}
          onSubmit={(value) => {
            renameMobileAccount(renameTarget.id, value);
            setRenameTarget(null);
            flow.refreshAccounts();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="删除这台设备？"
          message={
            deleteTarget.backendType === "kayingcode"
              ? `将移除「${deleteTarget.label}」的连接信息并清除已保存的凭据。安装身份和其他服务器的连接不受影响。`
              : `将移除「${deleteTarget.label}」的连接信息。`
          }
          confirmLabel="删除"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target.id === state.activeAccountId) flow.resetConnection();
            removeMobileAccount(target.id);
            flow.refreshAccounts();
          }}
        />
      ) : null}

      {unknownUrl ? (
        <ConfirmDialog
          title="未知服务器"
          message={`该连接指向 ${
            parseMobileConnection(unknownUrl)?.host ?? "未知主机"
          }，不在已知服务器列表。连接后，你发送的所有对话内容都会经过这台服务器。仅在你确信来源可靠时继续。`}
          confirmLabel="仍要添加"
          onCancel={() => setUnknownUrl(null)}
          onConfirm={() => {
            const url = unknownUrl;
            setUnknownUrl(null);
            const account = url ? forceAddAccountFromInput(url) : null;
            flow.refreshAccounts();
            if (account?.backendType === "kayingcode") flow.setActiveAccount(account.id);
          }}
        />
      ) : null}
    </View>
  );
}
