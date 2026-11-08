import { useEffect, useRef, useState } from "react";
import { View, Text, Button } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
  ZcodeAuthError,
  type ZcodeAuthSession,
  type ZcodeLoginFlow,
  type ZcodeLoginProvider,
} from "@kayingcode/mobile-client-core";

export function ZcodeLogin({
  auth,
  onCancel,
  onReady,
}: {
  auth: ZcodeAuthSession;
  onCancel: () => void;
  onReady: () => void;
}) {
  const [flow, setFlow] = useState<ZcodeLoginFlow | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const starting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (!auth.signedIn) auth.cancelLogin();
    };
  }, [auth]);

  const check = async () => {
    try {
      const ready = await auth.poll();
      if (!alive.current) return;
      if (ready) {
        alive.current = false;
        onReady();
      } else setMessage("等待浏览器授权，请完成登录后返回。");
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ZcodeAuthError && error.reason !== "relay-unavailable") setFlow(null);
      setMessage("登录尚未完成或已过期，请重试。");
    }
  };
  useEffect(() => {
    if (!flow) return;
    const timer = setInterval(() => void check(), flow.pollIntervalMs);
    return () => clearInterval(timer);
  }, [flow, auth]);

  const start = async (provider: ZcodeLoginProvider) => {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setFlow(null);
    setMessage("");
    try {
      const next = await auth.begin(provider);
      if (!alive.current) return;
      setFlow(next);
      await Taro.setClipboardData({ data: next.authorizeUrl });
      if (alive.current) setMessage("登录链接已复制。在浏览器中打开并完成登录后返回。");
    } catch {
      if (alive.current) setMessage("无法开始登录或复制链接，请重试。");
    } finally {
      starting.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <View className="dialog-overlay">
      <View className="dialog-card">
        <Text className="dialog-title">登录 ZCode</Text>
        <Text className="dialog-message">请选择与电脑端相同的登录平台，并使用同一账号。</Text>
        <Button
          className="action action-primary full-action"
          disabled={busy}
          onClick={() => void start("zai")}
        >
          使用 Z.ai 登录
        </Button>
        <Button
          className="action action-secondary full-action"
          disabled={busy}
          onClick={() => void start("bigmodel")}
        >
          使用 BigModel 登录
        </Button>
        {flow ? (
          <Button
            className="action action-secondary full-action"
            onClick={() => void Taro.setClipboardData({ data: flow.authorizeUrl })}
          >
            复制登录链接
          </Button>
        ) : null}
        {message ? <Text className="dialog-message">{message}</Text> : null}
        <View className="dialog-actions">
          <Button
            className="action action-ghost"
            onClick={() => {
              alive.current = false;
              auth.cancelLogin();
              onCancel();
            }}
          >
            取消
          </Button>
          {flow ? (
            <Button className="action action-primary" onClick={() => void check()}>
              检查登录
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}
