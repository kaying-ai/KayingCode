// 轻量弹层：文本输入与确认。用页面内联的受控组件实现，不依赖 Taro.showModal
// 的 editable 分支（各端支持程度不一致，且 weapp 旧基础库缺该能力）。
import { useState } from "react";
import { View, Text, Input, Textarea, Button } from "@tarojs/components";

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <View className="dialog-overlay">
      <View className="dialog-card">{children}</View>
    </View>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Overlay>
      <Text className="dialog-title">{title}</Text>
      <Text className="dialog-message">{message}</Text>
      <View className="dialog-actions">
        <Button className="action action-ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          className={`action ${danger ? "action-danger" : "action-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </View>
    </Overlay>
  );
}

export function PromptDialog({
  title,
  message,
  initial = "",
  placeholder = "",
  confirmLabel = "确定",
  multiline = false,
  onScan,
  onCancel,
  onSubmit,
}: {
  title: string;
  message?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  onScan?: () => void;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };
  return (
    <Overlay>
      <Text className="dialog-title">{title}</Text>
      {message ? <Text className="dialog-message">{message}</Text> : null}
      {onScan ? (
        <Button className="action action-secondary full-action" onClick={onScan}>
          扫码添加
        </Button>
      ) : null}
      {multiline ? (
        <Textarea
          className="control dialog-input dialog-input-multiline"
          value={value}
          maxlength={-1}
          placeholder={placeholder}
          onInput={(event) => setValue(event.detail.value)}
        />
      ) : (
        <Input
          className="control dialog-input"
          value={value}
          placeholder={placeholder}
          onInput={(event) => setValue(event.detail.value)}
        />
      )}
      <View className="dialog-actions">
        <Button className="action action-ghost" onClick={onCancel}>
          取消
        </Button>
        <Button
          className="action action-primary"
          disabled={value.trim().length === 0}
          onClick={submit}
        >
          {confirmLabel}
        </Button>
      </View>
    </Overlay>
  );
}
