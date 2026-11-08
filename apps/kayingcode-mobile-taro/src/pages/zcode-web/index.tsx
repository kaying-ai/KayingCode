import { useEffect, useRef, useState } from "react";
import { View, Text, Button, WebView } from "@tarojs/components";
import Taro, { usePullDownRefresh, useRouter } from "@tarojs/taro";
import { findMobileAccount } from "@kayingcode/mobile-client-core";
import {
  getZcodeWebUrl,
  readZcodeWebAccountId,
  readZcodeWebProjectParams,
} from "../../flow/zcodeWeb";
import { openZcodeInBrowser } from "../../ports/zcodeWebBrowser";
import { webviewEntryUrl } from "../../flow/projectNavigation";
import { rememberProject } from "../../flow/recentProjects";
import { goBack } from "../../ui/navigation";
import { useTheme } from "../../ui/theme";
import "./index.css";

export default function ZcodeWebPage() {
  const theme = useTheme();
  const router = useRouter();
  const accountId = readZcodeWebAccountId(router.params);
  const account = accountId ? findMobileAccount(accountId) : null;
  const rawUrl = getZcodeWebUrl(account);
  const url = rawUrl
    ? webviewEntryUrl(rawUrl, {
        kayingShell: "1",
        kayingPlatform: process.env.TARO_ENV === "weapp" ? "weapp" : undefined,
        ...readZcodeWebProjectParams(router.params),
        kayingParentOrigin: process.env.TARO_ENV === "h5" ? window.location.origin : undefined,
      })
    : null;
  useEffect(() => {
    if (process.env.TARO_ENV !== "h5" || !url || !accountId) return;
    const receive = (event: MessageEvent) => {
      const frame = document.querySelector("iframe");
      if (event.origin !== new URL(url).origin || event.source !== frame?.contentWindow) return;
      void rememberProject(accountId, event.data).catch(() => {
        void Taro.showToast({ title: "最近项目保存失败", icon: "none" });
      });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [url, accountId]);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = () => {
    generation.current++;
    setFailed(false);
    setLoading(true);
    setVersion(generation.current);
  };
  usePullDownRefresh(() => {
    refresh();
    void Taro.stopPullDownRefresh();
  });
  const finish = (error: boolean) => {
    if (!mounted.current || generation.current !== version) return;
    // 错误会卸载旧 WebView，令其迟到的 load 失效，避免把错误页重新切回旧容器。
    if (error) generation.current++;
    setLoading(false);
    setFailed(error);
  };
  const copy = () => {
    if (!url) return;
    void Taro.setClipboardData({ data: url }).catch(() => {
      void Taro.showToast({ title: "复制失败，请重试", icon: "none" });
    });
  };
  const showWebActions = async () => {
    if (!url) return;
    const choice = await Taro.showActionSheet({
      itemList: ["在浏览器打开", "复制链接"],
    }).catch(() => undefined);
    if (choice?.tapIndex === 0) openZcodeInBrowser(url);
    if (choice?.tapIndex === 1) copy();
  };

  const webview =
    url && !failed ? (
      <WebView
        key={version}
        src={url}
        onMessage={(event) => {
          if (process.env.TARO_ENV !== "weapp" || !accountId) return;
          for (const message of event.detail.data)
            void rememberProject(accountId, message).catch(() => {
              void Taro.showToast({ title: "最近项目保存失败", icon: "none" });
            });
        }}
        onLoad={() => finish(false)}
        onError={() => finish(true)}
      />
    ) : null;

  // 微信的原生 WebView 会铺满页面。直接挂在根节点，避免 H5 的内嵌布局和加载提示
  // 在原生容器尚未显示时持续占据整个页面。错误时回到下方的小程序壳重试。
  if (process.env.TARO_ENV === "weapp" && webview) return webview;

  return (
    <View className={`${theme.className} zcode-web-page`}>
      <View className="screen zcode-web-toolbar">
        <Text className="zcode-web-title">{account?.label ?? "KayingCode 工作台"}</Text>
        {url ? (
          <Button className="action action-ghost" onClick={refresh}>
            刷新
          </Button>
        ) : null}
        {url && process.env.TARO_ENV === "h5" ? (
          <Button className="action action-ghost" onClick={() => void showWebActions()}>
            更多
          </Button>
        ) : null}
        {url && process.env.TARO_ENV === "weapp" ? (
          <Button className="action action-ghost" onClick={copy}>
            复制链接
          </Button>
        ) : null}
        {/* 网页内返回任务目录；关闭只退出外壳，避免同时显示两个返回入口。 */}
        <Button className="action action-ghost" onClick={() => goBack()}>
          关闭
        </Button>
      </View>
      {!webview ? (
        <View className="screen zcode-web-error">
          <Text className="screen-title">{url ? "网页未能加载" : "连接信息已失效"}</Text>
          <Text className="empty">
            {!url
              ? "请返回 Bot 列表，重新添加有效的连接链接。"
              : process.env.TARO_ENV === "weapp"
                ? "请检查网络和小程序业务域名配置，或复制链接到浏览器继续。"
                : "请检查网络后刷新，也可以在浏览器中继续。"}
          </Text>
          {url ? (
            <Button className="action action-primary full-action" onClick={refresh}>
              重新加载
            </Button>
          ) : null}
        </View>
      ) : (
        <View className="zcode-web-content">
          {loading ? <Text className="zcode-web-loading">正在加载网页…</Text> : null}
          {webview}
        </View>
      )}
    </View>
  );
}
